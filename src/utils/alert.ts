import type { AlertChannel, AlertComparator, AlertMetric, AlertRuleRow } from '../api/types'

/**
 * 告警规则的展示层文案与格式。
 *
 * 单独成文件而不是塞进 SettingsPage：**弹窗和表格都要用**
 * （下拉选项、条件文案、窗口格式），放页面里会逼着弹窗去 import 页面，
 * 那是循环依赖，也是"改一个文案要动两个文件"的开始。
 *
 * 注意这里全是**展示**逻辑；"阈值多少算触发"的权威定义在 schema 与 M6-3 的
 * 评估器里，前端只负责把用户填的东西原样送上去。
 */

/** 指标下拉项。unit 用于把阈值渲染成「> 10 次」这种可读条件 */
export const ALERT_METRIC_OPTIONS: Array<{
  value: AlertMetric
  label: string
  unit: string
  /** 阈值输入框后面的提示，不同指标的合理量级差很远 */
  hint: string
}> = [
  { value: 'events', label: '错误数', unit: '次', hint: '窗口内上报的事件条数' },
  { value: 'users', label: '影响用户数', unit: '人', hint: '窗口内受影响的去重用户数' },
  { value: 'new_issues', label: '新增问题数', unit: '个', hint: '窗口内首次出现的问题数' },
  { value: 'error_rate', label: '错误率', unit: '%', hint: '出过错的会话 / 总会话，填 0.05 表示 5%' },
  { value: 'lcp_p75', label: 'LCP P75', unit: 'ms', hint: '窗口内 LCP 的 75 分位数' },
]

export const ALERT_COMPARATOR_OPTIONS: Array<{ value: AlertComparator; label: string }> = [
  { value: 'gt', label: '高于' },
  { value: 'lt', label: '低于' },
]

export const ALERT_CHANNEL_OPTIONS: Array<{ value: AlertChannel; label: string }> = [
  { value: 'feishu', label: '飞书' },
  { value: 'dingtalk', label: '钉钉' },
  { value: 'slack', label: 'Slack' },
]

function metricMeta(metric: AlertMetric) {
  return ALERT_METRIC_OPTIONS.find((option) => option.value === metric)
}

export function metricLabel(metric: AlertMetric): string {
  return metricMeta(metric)?.label ?? metric
}

/**
 * 条件文案，例如「> 10 次」「< 5%」。
 *
 * error_rate 的阈值在库里是 0~1 的小数，直接显示会变成「> 0.05」——
 * 人读起来要想一下。所以只有它需要乘 100。
 */
export function formatCondition(
  rule: Pick<AlertRuleRow, 'metric' | 'comparator' | 'threshold'>,
): string {
  const symbol = rule.comparator === 'gt' ? '>' : '<'
  if (rule.metric === 'error_rate') {
    // 去掉多余的尾随 0：5% 而不是 5.00%
    const percent = Number((rule.threshold * 100).toFixed(2))
    return `${symbol} ${percent}%`
  }
  const unit = metricMeta(rule.metric)?.unit ?? ''
  return `${symbol} ${rule.threshold}${unit === '' ? '' : ` ${unit}`}`
}

/** 窗口/静默期：60 分钟以上折成小时，读起来比「1440 分钟」快 */
export function formatMinutes(minutes: number): string {
  if (minutes === 0) return '不静默'
  if (minutes % 60 === 0) return `${minutes / 60} 小时`
  return `${minutes} 分钟`
}

export function channelLabel(channel: AlertChannel): string {
  return ALERT_CHANNEL_OPTIONS.find((option) => option.value === channel)?.label ?? channel
}

/**
 * 历史里显示"当时算出来多少"。
 *
 * 与 `formatCondition` 的区别：那个拼的是"阈值 + 方向"，这个是"实测值"。
 * 两者单位必须一致，否则历史表里 "22 次" 旁边写着 "5%" 就成了笑话。
 *
 * metric 为 null 是老数据（快照列上线前写的），此时只能原样显示数字。
 */
export function formatMetricValue(metric: AlertMetric | null, value: number): string {
  if (metric === null) return String(value)
  if (metric === 'events') return `${Math.round(value)} 次`
  if (metric === 'users') return `${Math.round(value)} 个用户`
  if (metric === 'new_issues') return `${Math.round(value)} 个问题`
  if (metric === 'error_rate') return `${(value * 100).toFixed(2)}%`
  if (metric === 'lcp_p75') return `${Math.round(value)} ms`
  return String(value)
}
