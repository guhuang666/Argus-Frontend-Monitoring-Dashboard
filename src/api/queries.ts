import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchMe } from './auth'
import { request } from './client'
import type {
  ErrorEventRow,
  IssueDetail,
  IssueRow,
  IssueStatus,
  PageResult,
  PerformanceRow,
  ProjectListResult,
} from './types'

/**
 * 表格分页尺寸的合法取值。
 *
 * 上限必须是 100：后端两个控制器的 PageQueryDto 上写着 @Max(100)，
 * 传更大的值会被 ValidationPipe 直接打回 400，不是安静地截断。
 * 所以这里是"与后端契约对齐"的常量，不是随手写的 UI 偏好。
 */
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

/** 与后端 PageQueryDto 的默认值一致 */
export const DEFAULT_PAGE_SIZE = 20

/**
 * 当前登录用户（GET /api/v1/auth/me）。
 *
 * 只在已登录的布局里调用（RequireAuth 之后），所以不需要 enabled 判断。
 * 缓存 5 分钟：用户信息几乎不变，而它挂在最外层，每次导航都重拉一遍没意义。
 * 登录/登出时会 queryClient.clear()，所以换账号不会串。
 */
export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: fetchMe,
    staleTime: 5 * 60_000,
  })
}

/**
 * 项目列表（GET /api/v1/projects）。
 *
 * 这是 S3 的入口查询：切换器要它、路由要它判断"这个 projectId 存不存在"。
 * 缓存时间长一些（60 秒）：项目列表几乎不变，而它挂在每个页面的外层，
 * 每次导航都重拉一遍没有意义。真正的"变了"（新建项目）是一次用户主动动作，
 * 到那时手动 invalidate 比轮询便宜。
 */
export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => request<ProjectListResult>('/v1/projects'),
    staleTime: 60_000,
  })
}

/**
 * 租户作用域的四个查询都要带 projectId。
 *
 * ── 为什么 projectId 进 queryKey ────────────────────────────────────────
 * 忘了放进去是这个改动最危险的失误：切换项目后 React Query 认为"参数没变、
 * 缓存有效"，界面会**继续显示上一个项目的数据** —— 看起来完全正常，
 * 直到你发现两个项目的事件列表一模一样。所以它必须是 key 的第一项。
 *
 * ── 为什么参数叫 projectId 而不是 tenantId ───────────────────────────────
 * 与后端 TenantQueryDto 的字段名、路由参数名保持一致，避免三处各叫一个名字。
 */

/**
 * 异常事件分页查询。
 *
 * 两个刻意的写法：
 *   ① 页码与页大小进 queryKey —— 翻页即新查询，每页各自缓存，
 *      来回翻页不会重复请求
 *   ② placeholderData: keepPreviousData —— 新页数据到位前先显示上一页，
 *      表格不会闪成空骨架、高度也不跳。配套要用 isPlaceholderData 标记"这是旧数据"
 */
export function useErrorEvents(projectId: string, page: number, pageSize: number) {
  return useQuery({
    queryKey: ['error-events', projectId, page, pageSize],
    queryFn: () => request<PageResult<ErrorEventRow>>('/v1/error', { projectId, page, pageSize }),
    placeholderData: keepPreviousData,
    // projectId 为空时不发请求：路由还没解析出项目时请求必然 400，
    // 让它打出去只会在控制台留下一条假错误
    enabled: projectId !== '',
  })
}

/** 性能指标分页查询。与异常列表同构，只是换接口与行类型 */
export function usePerformanceMetrics(projectId: string, page: number, pageSize: number) {
  return useQuery({
    queryKey: ['performance-metrics', projectId, page, pageSize],
    queryFn: () =>
      request<PageResult<PerformanceRow>>('/v1/performance', { projectId, page, pageSize }),
    placeholderData: keepPreviousData,
    enabled: projectId !== '',
  })
}

/**
 * 问题列表分页查询（GET /api/v1/issues）。
 *
 * status 不传 = 不过滤（后端 ListIssuesQueryDto 的立场：默认不筛，
 * 避免"归并越成功、看板越空"）。
 *
 * ⚠ queryKey 里用 `status ?? 'all'` 而不是直接放 status：
 * 放 undefined 会让 ['issues',1,20,undefined] 与不带第四项的 key 指向
 * 两个不同缓存，切换"全部"时会白跑一次请求。
 *
 * ⚠ status 只是**过滤条件**，不进请求体。后端也只支持这一个过滤维度
 * （没有关键词、没有 level、没有时间范围），所以界面上不要多加控件。
 */
export function useIssues(projectId: string, page: number, pageSize: number, status?: IssueStatus) {
  return useQuery({
    queryKey: ['issues', projectId, page, pageSize, status ?? 'all'],
    queryFn: () =>
      request<PageResult<IssueRow>>('/v1/issues', {
        projectId,
        page,
        pageSize,
        ...(status ? { status } : {}),
      }),
    placeholderData: keepPreviousData,
    enabled: projectId !== '',
  })
}

/**
 * 问题详情 + 其下事件（GET /api/v1/issues/:id）。
 *
 * 一次请求同时拿到 issue 与 events，所以详情页不需要发两次请求，
 * 也就不会出现"问题信息到了、事件还在转圈"的半截界面。
 *
 * 这里也挂 placeholderData：详情页内部的事件翻页时要保留上一页，
 * 否则表格会闪成空骨架。跨问题跳转不受影响 —— 从 /issues 到
 * /issues/:id 是路由切换，IssueDetailPage 是重新挂载，新 observer
 * 没有"上一份数据"可用，keepPreviousData 自然不会串到别的问题上。
 *
 * projectId 同时承担两个作用：拼参数、以及让"别的项目的同名 id"查不到
 * （后端按 (id, projectId) 定位，跨租户一律 404，不会返回别人的数据）。
 */
export function useIssue(projectId: string, id: string, page: number, pageSize: number) {
  return useQuery({
    queryKey: ['issue', projectId, id, page, pageSize],
    queryFn: () => request<IssueDetail>(`/v1/issues/${id}`, { projectId, page, pageSize }),
    placeholderData: keepPreviousData,
    // id 为空时不发请求（详情页对非法地址做了兜底，不该让请求打到 /v1/issues/）
    enabled: projectId !== '' && id !== '',
  })
}
