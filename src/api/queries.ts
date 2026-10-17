import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { request } from './client'
import type {
  ErrorEventRow,
  IssueDetail,
  IssueRow,
  IssueStatus,
  PageResult,
  PerformanceRow,
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
 * 异常事件分页查询。
 *
 * 两个刻意的写法：
 *   ① 页码与页大小进 queryKey —— 翻页即新查询，每页各自缓存，
 *      来回翻页不会重复请求
 *   ② placeholderData: keepPreviousData —— 新页数据到位前先显示上一页，
 *      表格不会闪成空骨架、高度也不跳。配套要用 isPlaceholderData 标记"这是旧数据"
 */
export function useErrorEvents(page: number, pageSize: number) {
  return useQuery({
    queryKey: ['error-events', page, pageSize],
    queryFn: () => request<PageResult<ErrorEventRow>>('/v1/error', { page, pageSize }),
    placeholderData: keepPreviousData,
  })
}

/** 性能指标分页查询。与异常列表同构，只是换接口与行类型 */
export function usePerformanceMetrics(page: number, pageSize: number) {
  return useQuery({
    queryKey: ['performance-metrics', page, pageSize],
    queryFn: () => request<PageResult<PerformanceRow>>('/v1/performance', { page, pageSize }),
    placeholderData: keepPreviousData,
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
export function useIssues(page: number, pageSize: number, status?: IssueStatus) {
  return useQuery({
    queryKey: ['issues', page, pageSize, status ?? 'all'],
    queryFn: () =>
      request<PageResult<IssueRow>>(
        '/v1/issues',
        status ? { page, pageSize, status } : { page, pageSize },
      ),
    placeholderData: keepPreviousData,
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
 */
export function useIssue(id: string, page: number, pageSize: number) {
  return useQuery({
    queryKey: ['issue', id, page, pageSize],
    queryFn: () => request<IssueDetail>(`/v1/issues/${id}`, { page, pageSize }),
    placeholderData: keepPreviousData,
    // id 为空时不发请求（详情页对非法地址做了兜底，不该让请求打到 /v1/issues/）
    enabled: id !== '',
  })
}
