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
