/**
 * 问题的状态 / 级别 → 展示用文案与颜色。
 *
 * 单独成文件而不是写进 components/common.tsx：那个文件只导出组件，
 * 才能满足 react-refresh/only-export-components（同 utils/format.ts 的立场）。
 * 这里放的是纯数据，常量和映射都应该能脱离 React 被 import。
 *
 * ⚠ 所有映射都必须允许"未知 key"：后端 level / status 是 varchar 而非 enum，
 * 读接口不做校验。加新状态时不该让看板崩掉或显示成空白 ——
 * 所以每个查表处都有 ?? 兜底，渲染未知值时原样显示原始字符串。
 */

/** 状态 → 中文文案。key 与后端 ISSUE_STATUSES 一致 */
export const ISSUE_STATUS_LABELS: Record<string, string> = {
  unresolved: '未解决',
  resolved: '已解决',
  ignored: '已忽略',
  archived: '已归档',
}

/**
 * 状态 → Tag 颜色。
 *
 * unresolved 用红色是因为它是唯一"需要人动手"的状态；
 * archived 用收敛的紫色。ignored 刻意**不在表里**：
 * 它在语义上就是"已被降噪的普通条目"，让它落到无 color 的默认 Tag，
 * 与未来出现的新状态共享同一套兜底样式 —— 反而比硬塞一个 'default' 更稳
 * （antd 的 color="default" 会走自定义色分支，不是预设灰）。
 */
export const ISSUE_STATUS_COLORS: Record<string, string> = {
  unresolved: 'red',
  resolved: 'green',
  archived: 'purple',
}

/** 级别 → Tag 颜色。fatal 单独一档，它意味着"功能整体不可用" */
export const ISSUE_LEVEL_COLORS: Record<string, string> = {
  fatal: 'magenta',
  error: 'red',
  warning: 'gold',
  info: 'blue',
}

/** 状态过滤的下拉/分段选项。'all' 是前端概念，不会发给后端 */
export const ISSUE_STATUS_FILTER_OPTIONS = [
  { label: '全部', value: 'all' },
  { label: '未解决', value: 'unresolved' },
  { label: '已解决', value: 'resolved' },
  { label: '已忽略', value: 'ignored' },
  { label: '已归档', value: 'archived' },
]
