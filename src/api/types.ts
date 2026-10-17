/**
 * 后端接口的响应类型。
 *
 * 每个字段都对照 backend 的 toApiRow 逐个核对过（不是照 Prisma schema 猜的）：
 * 接口契约由 service 里的 toApiRow 决定，schema 只是它的来源。
 *
 * 三个必须遵守的类型事实：
 *   ① 时间字段（timestamp / received_at）经 JSON 序列化后是 ISO 8601 **字符串**，
 *      不是 Date。别写成 Date，否则格式化时会静默拿到 Invalid Date。
 *   ② 列名统一 snake_case，与 SDK 上报契约保持一致。
 *   ③ tags / extra / breadcrumbs / stacktrace_frames 是 jsonb 列，
 *      形状由 SDK 决定，后端不解释 —— 所以标成 unknown，
 *      渲染前必须做类型判断，不能直接 .map()。
 */

/** 分页信封。page / pageSize 与请求一致，total 是同一事务快照下的总数 */
export interface PageResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

/** 采集通道，与后端 Prisma 的 Mechanism enum 一一对应 */
export type Mechanism = 'onerror' | 'unhandledrejection' | 'resource'

/**
 * 一条异常事件（GET /api/v1/error 的 items 元素）。
 *
 * 可空字段列在下面 —— 后端 toApiRow 里没有默认值，SQL NULL 会原样变成 JSON null：
 *   stack / source / sdk_* / exception_* / stacktrace_* / user_id / session_id /
 *   release / environment / tags / extra / breadcrumbs
 * type 与 message 非空（schema 里是 NOT NULL）。
 */
export interface ErrorEventRow extends Record<string, unknown> {
  event_id: string
  mechanism: Mechanism
  type: string
  message: string
  stack: string | null
  source: string | null
  timestamp: string
  received_at: string
  url: string
  user_agent: string
  sdk_name: string | null
  sdk_version: string | null
  exception_type: string | null
  exception_value: string | null
  exception_mechanism: string | null
  stacktrace_raw: string | null
  stacktrace_frames: unknown
  user_id: string | null
  session_id: string | null
  release: string | null
  environment: string | null
  tags: unknown
  extra: unknown
  breadcrumbs: unknown
}

/**
 * 一条性能指标（GET /api/v1/performance 的 items 元素）。
 *
 * ⚠️ lcp / cls / inp 三个字段的 null 有专门语义：**「没测到」而不是「测得 0」**。
 * 后端 toRow 刻意用 `?? null` 而不是 `?? 0`：
 *   · LCP / INP 取不到值是常态（用户没交互就没有 INP）
 *   · CLS 合法值可能很小，用 0 兜底会把"没数据"和"稳定性完美"混为一谈
 * 所以渲染层必须把 null 显示成占位符，绝不能 Number(x) || 0。
 */
export interface PerformanceRow extends Record<string, unknown> {
  event_id: string
  timestamp: string
  received_at: string
  url: string
  user_agent: string
  sdk_name: string | null
  sdk_version: string | null
  /** Largest Contentful Paint，毫秒 */
  lcp: number | null
  /** Cumulative Layout Shift，无单位小数 */
  cls: number | null
  /** Interaction to Next Paint，毫秒 */
  inp: number | null
  lcp_element: string | null
  inp_target: string | null
  inp_element: string | null
  /** input-delay / processing / presentation，三段互斥 */
  inp_phase: string | null
  /** navigate / reload / back_forward */
  navigation_type: string | null
  device_viewport: string | null
  device_dpr: number | null
  connection: string | null
  user_id: string | null
  session_id: string | null
  release: string | null
  environment: string | null
}

/** 面包屑条目。SDK 的 Breadcrumb 契约，落库后原样读回 */
export interface Breadcrumb {
  timestamp: number
  category: string
  level?: string
  message: string
  data?: Record<string, unknown>
}

/**
 * 把 unknown 的 jsonb 字段收敛成面包屑数组。
 *
 * 不信任后端返回的形状：SDK 换版本、历史数据、人工改库都可能让这里不是数组。
 * 判定失败就返回空数组，让界面退化成"没有面包屑"，而不是整页崩掉。
 */
export function asBreadcrumbs(value: unknown): Breadcrumb[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (item): item is Breadcrumb =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as Breadcrumb).message === 'string',
  )
}

/** 问题的状态取值，与后端 issues/dto 里的 ISSUE_STATUSES 一一对应 */
export type IssueStatus = 'unresolved' | 'resolved' | 'ignored' | 'archived'

/**
 * 一个「问题」—— worker 按指纹归并后的实体（GET /api/v1/issues 的 items 元素）。
 *
 * 与 ErrorEventRow 的三点关键差异：
 *   ① 主键是 `id`（UUID）而不是 event_id，列表 rowKey 用它
 *   ② times_seen / users_seen 在库里是 BIGINT。后端 toIssueRow 已经用 Number()
 *      转成普通数字，前端拿到的就是 number —— 不会碰到 BigInt 序列化问题，
 *      所以这里可以放心标 number，不需要自己防御。
 *   ③ level / status 在库里是 varchar 而非 enum（SRS 的立场：取值集合是产品语义，
 *      不是数据完整性约束），读接口不做校验。因此这里**故意标成 string**：
 *      后端将来加新值时，联合类型会让 switch 静默漏分支；标 string 则强制
 *      渲染层写兜底分支（见 utils/issue.ts 的 ?? 回退）。
 */
export interface IssueRow extends Record<string, unknown> {
  id: string
  /** 指纹哈希 */
  fingerprint: string
  /** v1-raw / v2-symbolicated */
  grouping_version: string
  /** 归一化后的标题，库里是 VarChar(500) */
  title: string
  /** 疑似责任位置。可空：调用栈为空时算不出来 */
  culprit: string | null
  /** fatal / error / warning / info */
  level: string
  /** unresolved / resolved / ignored / archived */
  status: string
  /** 累计发生次数（BigInt 已由后端转 number） */
  times_seen: number
  /** 累计影响用户数（同上） */
  users_seen: number
  /** ISO 8601 字符串，不是 Date */
  first_seen: string
  /** 排序字段，列表按它倒序 */
  last_seen: string
  first_release: string | null
  last_release: string | null
  /** NULL 表示尚未解决；后端只在进入 resolved 时打点 */
  resolved_at: string | null
  /**
   * 实际挂在下面的明细条数。
   *
   * ⚠ 它**不等于** times_seen，不要当成归并准确性的硬指标：error_events 只保留
   * 30 天（AGENTS.md §3），过期清理后 event_count 必然小于累计次数。
   * 它真正的用途是"明细还在的时候，能快速发现归并与写库是否错位"。
   */
  event_count: number
}

/**
 * 问题详情页里的事件视图（GET /api/v1/issues/:id 的 events.items 元素）。
 *
 * ⚠ 这是 toDetailEventRow 的**精简版**，比 ErrorEventRow 少了
 * exception_type / exception_value / exception_mechanism / sdk_* / tags /
 * extra / user_id / session_id。照抄 AbnormalEventsPage 的字段清单会取到
 * undefined 并静默渲染成空 —— 所以为它单独定义类型，不复用 ErrorEventRow。
 */
export interface IssueDetailEventRow extends Record<string, unknown> {
  event_id: string
  mechanism: Mechanism
  type: string
  message: string
  timestamp: string
  received_at: string
  url: string
  user_agent: string
  source: string | null
  stack: string | null
  stacktrace_frames: unknown
  /** jsonb，形状由 SDK 决定；渲染前用 asBreadcrumbs 收敛 */
  breadcrumbs: unknown
  release: string | null
  environment: string | null
}

/** GET /api/v1/issues/:id 的完整响应：问题本身 + 它下面的事件（分页） */
export interface IssueDetail {
  issue: IssueRow
  events: PageResult<IssueDetailEventRow>
}
