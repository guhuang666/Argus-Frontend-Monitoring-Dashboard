import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchMe } from './auth'
import { deleteRequest, patchJson, postJson, request } from './client'
import type {
  AlertEventListResult,
  AlertRuleListResult,
  AlertRulePayload,
  AlertRuleRow,
  ErrorEventRow,
  IssueDetail,
  IssueFacets,
  IssueFilters,
  IssueRow,
  OverviewRange,
  OverviewResult,
  PageResult,
  PerfMetric,
  PerformanceRow,
  PerformanceTrendResult,
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
 * 问题列表分页查询（GET /api/v1/issues），支持六维筛选 + 排序（FR-8.3）。
 *
 * 不传任何筛选 = 不过滤（后端 ListIssuesQueryDto 的立场：默认不筛，
 * 避免"归并越成功、看板越空"）。
 *
 * ⚠ queryKey 里放整个 filters 对象，而不是逐项摊开：
 * TanStack 对 key 做的是**稳定序列化**（对象键排序后哈希），
 * 所以 `{status, level}` 与 `{level, status}` 指向同一个缓存 —— 这是安全的。
 * 但 undefined 与缺失必须归一：`status: undefined` 和"没有 status 这个键"
 * 在哈希上是两个 key，会造成"切回全部时白跑一次请求"。所以调用方
 * 传进来之前要清掉空值（见 IssuesPage 的 readFilters）。
 *
 * ⚠ 参数里不能带 undefined：client.ts 的 buildUrl 对每个 entry 都做
 * `String(value)`，于是 `status=undefined` 会被真的发出去，
 * 后端 class-validator 直接 400。所以这里统一过一遍 compact()。
 */
export function useIssues(
  projectId: string,
  page: number,
  pageSize: number,
  filters: IssueFilters = {},
) {
  return useQuery({
    queryKey: ['issues', projectId, page, pageSize, filters],
    queryFn: () =>
      request<PageResult<IssueRow>>(
        '/v1/issues',
        compact({ projectId, page, pageSize, ...filters }),
      ),
    placeholderData: keepPreviousData,
    enabled: projectId !== '',
  })
}

/**
 * 筛选栏的下拉数据（GET /api/v1/issues/facets）。
 *
 * 单独一个请求、单独的 key：版本与环境列表比问题列表变得慢得多，
 * 没必要每次翻页都跟着重新拉一遍。`staleTime` 给 5 分钟是有意的 ——
 * 新发版后最多 5 分钟就能在下拉里看到新版本。
 */
export function useIssueFacets(projectId: string) {
  return useQuery({
    queryKey: ['issue-facets', projectId],
    queryFn: () => request<IssueFacets>('/v1/issues/facets', { projectId }),
    staleTime: 5 * 60 * 1000,
    enabled: projectId !== '',
  })
}

/**
 * 去掉 undefined / null / 空串。
 *
 * 存在理由见 useIssues 的第二条注释：`String(undefined)` 会变成字符串
 * "undefined" 发出去。这个函数是"参数可选"与"序列化不留空"之间唯一的桥。
 */
function compact(values: Record<string, unknown>): Record<string, string | number> {
  const result: Record<string, string | number> = {}
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === '') continue
    result[key] = value as string | number
  }
  return result
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

/**
 * 概览统计（GET /api/v1/stats/overview）。
 *
 * range 必须进 queryKey：它和 projectId 一样是"决定这批数字属于谁"的参数，
 * 漏了就会出现"切到 7 天，图还是 24 小时那张"——而且不报错，最难发现。
 *
 * 挂 keepPreviousData：切换范围时先留着上一张图，新数据到位再替换，
 * 否则图表会先被卸载成空骨架、再重新长出来，视觉上闪一下。
 */
export function useOverview(projectId: string, range: OverviewRange) {
  return useQuery({
    queryKey: ['overview', projectId, range],
    queryFn: () => request<OverviewResult>('/v1/stats/overview', { projectId, range }),
    placeholderData: keepPreviousData,
    enabled: projectId !== '',
  })
}

/**
 * 性能分位趋势（GET /api/v1/stats/performance）。
 *
 * metric 与 range **都必须进 queryKey**，而且一个都不能少：
 * 漏掉任何一个，切换那个下拉框时 React Query 都会认为"参数没变、缓存有效"，
 * 图会原封不动地留在原地 —— 看起来完全正常，只是数据是上一次的。
 * 这是本项目里最难靠肉眼发现的一类 bug（与 projectId 漏进 key 同级）。
 *
 * 挂 keepPreviousData：切指标/切范围时先留着上一张图，新数据到位再替换。
 * 不挂的话图会先被卸载成骨架、再重新长出来，每次切换都闪一下。
 * 配套可以用 isPlaceholderData 区分"这是旧图"。
 *
 * 参数顺序按调用方的阅读习惯排：先决定"看哪个项目"（外层），
 * 再决定"看哪段时间"，最后才是"看哪个指标"（最内层）。
 */
export function usePerformanceTrend(
  projectId: string,
  range: OverviewRange,
  metric: PerfMetric,
) {
  return useQuery({
    queryKey: ['performance-trend', projectId, range, metric],
    queryFn: () =>
      request<PerformanceTrendResult>('/v1/stats/performance', { projectId, metric, range }),
    placeholderData: keepPreviousData,
    enabled: projectId !== '',
  })
}

/* ───────────────────────── 告警规则（M6-2）───────────────────────── */

/** 规则的 queryKey 工厂：失效、预取都只写一处，避免字符串拼错导致缓存不刷新 */
const alertRulesKey = (projectId: string) => ['alert-rules', projectId] as const

/**
 * 规则列表（GET /api/v1/alert-rules）。
 *
 * 规则是"配置"，变化只可能来自用户自己的操作，所以不做轮询、
 * staleTime 给足 30 秒；真正的时效性在评估器那边（M6-3），不在这个列表上。
 */
export function useAlertRules(projectId: string) {
  return useQuery({
    queryKey: alertRulesKey(projectId),
    queryFn: () => request<AlertRuleListResult>('/v1/alert-rules', { projectId }),
    staleTime: 30_000,
    enabled: projectId !== '',
  })
}

/**
 * 三个写操作放在一起，是因为它们共享同一套"成功之后要做什么"：
 * 让规则列表失效，重新拉一次。手写 `queryClient.invalidateQueries` 三次
 * 是最容易漏掉一处的地方 —— 漏掉的那一处表现为"保存成功，但列表没变"。
 *
 * 注意 projectId 拼进了 path 而不是 params：POST/PATCH/DELETE 的 send()
 * 不接受 params（只有 GET 需要），拼在 URL 上最直接。
 */
export function useCreateAlertRule(projectId: string) {
  const client = useQueryClient()

  return useMutation({
    mutationFn: (payload: AlertRulePayload) =>
      postJson<AlertRuleRow>(`/v1/alert-rules?projectId=${encodeURIComponent(projectId)}`, payload),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: alertRulesKey(projectId) })
    },
  })
}

export function useUpdateAlertRule(projectId: string) {
  const client = useQueryClient()

  return useMutation({
    mutationFn: (input: { id: string; patch: Partial<AlertRulePayload> }) =>
      patchJson<AlertRuleRow>(
        `/v1/alert-rules/${encodeURIComponent(input.id)}?projectId=${encodeURIComponent(projectId)}`,
        input.patch,
      ),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: alertRulesKey(projectId) })
    },
  })
}

export function useDeleteAlertRule(projectId: string) {
  const client = useQueryClient()

  return useMutation({
    mutationFn: (id: string) =>
      deleteRequest(
        `/v1/alert-rules/${encodeURIComponent(id)}?projectId=${encodeURIComponent(projectId)}`,
      ),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: alertRulesKey(projectId) })
    },
  })
}

/**
 * 触发历史（GET /api/v1/alert-events）。
 *
 * 四个筛选条件全部进 queryKey —— 漏一个的表现是"筛了但列表没变"，
 * 属于最难靠肉眼发现的一类（和 projectId 漏进 key 同级）。
 *
 * `delivered` 要转成字符串再发：request 的 QueryParams 只接受 string | number，
 * 而前端传过来的是布尔。后端用 @Transform 把它转回真正的布尔。
 */
export function useAlertEvents(
  projectId: string,
  params: {
    page: number
    pageSize: number
    ruleId?: string
    delivered?: boolean
  },
) {
  return useQuery({
    queryKey: [
      'alert-events',
      projectId,
      params.page,
      params.pageSize,
      params.ruleId ?? 'all',
      params.delivered === undefined ? 'all' : String(params.delivered),
    ],
    queryFn: () =>
      request<AlertEventListResult>('/v1/alert-events', {
        projectId,
        page: params.page,
        pageSize: params.pageSize,
        ...(params.ruleId === undefined ? {} : { ruleId: params.ruleId }),
        ...(params.delivered === undefined ? {} : { delivered: String(params.delivered) }),
      }),
    placeholderData: keepPreviousData,
    enabled: projectId !== '',
  })
}
