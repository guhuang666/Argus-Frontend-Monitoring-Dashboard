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

/**
 * 一个项目（GET /api/v1/projects 的 items 元素）。
 *
 * public_key 是**能公开**的那把钥匙：看板把它显示出来给人贴进代码。
 * 私钥不在此接口里，也永远拿不到（库里只有 sha256）。
 *
 * public_key 可能为 null：项目建好了但还没生成密钥（比如建到一半失败）。
 * 这种情况上报会 401，所以界面上要显眼地标出来，而不是显示成空白。
 */
export interface ProjectRow {
  id: string
  name: string
  platform: string
  sample_rate: number
  rate_limit_per_sec: number
  is_active: boolean
  created_at: string
  public_key: string | null
  issue_count: number
  event_count: number
  /**
   * 今天因限流被丢掉的条数（FR-6.4）。
   *
   * `null` 表示**查不到**（存计数的 Redis 不可用），与 `0`（确实没丢）是两件事。
   * 界面要分开显示，否则"Redis 挂了"看起来会像"一切正常"。
   */
  dropped_today: number | null
}

/** GET /api/v1/projects 的响应（不分页：一个组织下的项目数是十几个量级） */
export interface ProjectListResult {
  items: ProjectRow[]
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

/* ==========================================================================
 * Sourcemap 帧（M3）
 * ==========================================================================
 * stacktrace_frames 是 jsonb，**有两种形状**，由问题的 grouping_version 决定：
 *
 *   v1-raw          → RawFrame[]           只有压缩后的位置
 *   v2-symbolicated → SymbolicatedFrame[]  压缩位置 + 还原后的源码位置 + 源码上下文
 *
 * 判别方式：帧上带 `resolved` 字段就是 v2（v1 的帧从来没写过这个字段）。
 * 两个形状与后端 grouping/symbolicate.ts 的同名接口逐字段对应。
 * ========================================================================*/

/** 压缩后的位置。v1 落库的就是这个形状（后端 fingerprint.ts 的 Frame） */
export interface RawFrame {
  file: string
  /** 压缩后的函数名，通常是无意义的短名（r / e / t），匿名帧为 null */
  fn: string | null
  /** 压缩产物里的行号（1-based） */
  line: number
  /** 压缩产物里的列号（1-based） */
  col: number
}

/** 源码上下文（后端 symbolicate.ts 的 SourceContext） */
export interface SourceContext {
  /** 上下文各行的内容，不含行号前缀 */
  lines: string[]
  /** 出错行在 lines 里的下标（0-based） */
  errorIndex: number
  /** 出错行的绝对行号（1-based） */
  errorLine: number
  /** lines[0] 的绝对行号（1-based） */
  startLine: number
}

/** 还原后的帧（v2）。后端 symbolicate.ts 的 SymbolicatedFrame */
export interface SymbolicatedFrame extends RawFrame {
  /** 归一化后的产物路径，如 /assets/index-B3obYmGb.js */
  artifactPath: string | null
  /** 是否成功还原到源码位置 */
  resolved: boolean
  /** 源码文件，如 src/pages/OrderList.tsx */
  source: string | null
  /** 源码行号（1-based） */
  sourceLine: number | null
  /** 源码列号（1-based，后端已从 0-based 转回） */
  sourceCol: number | null
  /** 源码里的原始函数名 */
  name: string | null
  /** 源码上下文；map 没内嵌源码时为 null */
  context: SourceContext | null
}

/** 两种形状的并集：渲染层只关心"这一帧有没有源码信息" */
export type FrameRow = RawFrame | SymbolicatedFrame

/** 判别 v2：带 resolved 的一定是符号化后的帧 */
export function isSymbolicatedFrame(frame: FrameRow): frame is SymbolicatedFrame {
  return typeof (frame as SymbolicatedFrame).resolved === 'boolean'
}

/**
 * 把 unknown 的 jsonb 收敛成帧数组。
 *
 * 与 asBreadcrumbs 同一立场：不信任后端返回的形状（历史数据可能是旧版本写的、
 * 也可能被人工改过）。逐项检查最低限度的必要字段，坏项直接丢掉 ——
 * 让界面降级成"没有帧"，而不是整页白屏。
 */
export function asFrames(value: unknown): FrameRow[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (item): item is FrameRow =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as RawFrame).file === 'string' &&
      typeof (item as RawFrame).line === 'number',
  )
}

/**
 * 概览页支持的时间范围（与后端 OverviewQueryDto 的 OVERVIEW_RANGES 一一对应）。
 *
 * 没有 1h：趋势读的是小时聚合表，1 小时窗口只会有 1~2 个点。
 * 后端会直接 400 拒绝，所以前端的选项也必须与此严格一致。
 */
export type OverviewRange = '24h' | '7d' | '30d'

/** 趋势上的一个点。t 是桶起点（ISO 8601 UTC 字符串），events 是该桶内的事件数 */
export interface OverviewTrendPoint {
  t: string
  events: number
}

/** GET /api/v1/stats/overview 的响应 */
export interface OverviewResult {
  range: OverviewRange
  /** 窗口起点（含），ISO 8601 UTC */
  from: string
  /** 窗口终点（不含），ISO 8601 UTC */
  to: string
  /** 每个点代表多长时间，前端拿它决定 x 轴标签格式 */
  bucket: 'hour' | 'day'
  summary: {
    /** 窗口内事件条数 */
    events: number
    /** 窗口内出现过的问题数 */
    issues: number
    /** 窗口内首次出现的问题数 */
    new_issues: number
  }
  /** 等距补零后的趋势：没有事件的小时也会有一个 events=0 的点 */
  trend: OverviewTrendPoint[]
}
