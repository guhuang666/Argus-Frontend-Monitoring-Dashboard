import dayjs from 'dayjs'

/**
 * 纯格式化函数。
 *
 * 单独成文件而不是塞进 components/common.tsx：那个文件只导出组件，
 * 才能满足 react-refresh/only-export-components（否则改样式时热更新会整页刷新）。
 */

/** ISO 8601 → 本地时间。后端返回的是 UTC 字符串，dayjs 会自动转本地时区 */
export function formatTime(value: string | null | undefined): string {
  if (!value) return '—'
  const d = dayjs(value)
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm:ss') : String(value)
}

/** 千分位整数。非数字（含 null）一律返回占位符 */
export function formatInt(value: number | null | undefined): string {
  return typeof value === 'number' ? value.toLocaleString('zh-CN') : '—'
}
