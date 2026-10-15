import { Tag, Tooltip, Typography } from 'antd'
import dayjs from 'dayjs'
import { asBreadcrumbs } from '../api/types'
import type { Breadcrumb } from '../api/types'

const { Text } = Typography

/**
 * 指标数值渲染。
 *
 * ⚠️ null 必须显示成占位符。后端刻意用 `?? null` 而不是 `?? 0` 区分
 * 「没测到」和「测得 0」—— 这里如果写成 Number(x) || 0，
 * 就把后端费力保住的语义又抹平了，看板上会出现假的"性能完美"。
 */
export function MetricText({
  value,
  unit = '',
  digits,
}: {
  value: number | null | undefined
  unit?: string
  digits?: number
}) {
  if (typeof value !== 'number' || Number.isNaN(value)) return <EmptyValue />
  const text = digits === undefined ? String(value) : value.toFixed(digits)
  return (
    <Text>
      {text}
      {unit && (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {` ${unit}`}
        </Text>
      )}
    </Text>
  )
}

export function EmptyValue() {
  return <Text type="secondary">—</Text>
}

/** 长文本：省略号 + 悬浮显示全文。空值退化成占位符 */
export function EllipsisText({ value, width }: { value: string | null | undefined; width?: number }) {
  if (!value) return <EmptyValue />
  return (
    <Tooltip title={<span style={{ wordBreak: 'break-all' }}>{value}</span>}>
      <span
        style={{
          display: 'inline-block',
          maxWidth: width ?? 280,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          verticalAlign: 'bottom',
        }}
      >
        {value}
      </span>
    </Tooltip>
  )
}

export function TextOrEmpty({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === '') return <EmptyValue />
  return <Text>{String(value)}</Text>
}

const MECHANISM_COLORS: Record<string, string> = {
  onerror: 'red',
  unhandledrejection: 'orange',
  resource: 'blue',
}

/** 采集通道。未知值也照常渲染，不假设后端只会返回枚举里那三个 */
export function MechanismTag({ value }: { value: string }) {
  return <Tag color={MECHANISM_COLORS[value] ?? 'default'}>{value}</Tag>
}

/** 展开行里的一行「标签：值」，空值也占位，保证多行对齐好读 */
export function DetailItem({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div style={{ display: 'flex', gap: 8, lineHeight: '22px' }}>
      <Text type="secondary" style={{ width: 120, flexShrink: 0 }}>
        {label}
      </Text>
      <Text style={{ wordBreak: 'break-all' }}>{value || '—'}</Text>
    </div>
  )
}

/**
 * 堆栈展示。
 *
 * 用 <pre> 而不是自动换行：堆栈的对齐和缩进本身是信息，
 * 换行会把帧与帧的边界糊掉。横向溢出交给容器滚动。
 */
export function StackBlock({ label = 'stack', text }: { label?: string; text: string | null }) {
  if (!text) {
    return (
      <div>
        <Text type="secondary">{label}</Text>
        <div>
          <EmptyValue />
        </div>
      </div>
    )
  }
  return (
    <div>
      <Text type="secondary">{label}</Text>
      <pre
        style={{
          margin: '4px 0 0',
          padding: 8,
          maxHeight: 260,
          overflow: 'auto',
          background: 'rgba(0, 0, 0, 0.03)',
          borderRadius: 4,
          fontSize: 12,
          lineHeight: 1.5,
        }}
      >
        {text}
      </pre>
    </div>
  )
}

/**
 * 面包屑时间线。
 *
 * 刻意不用 antd 的 Timeline 组件：v6 里 Timeline.Item 已废弃、要改用 items，
 * 而这里只需要"一行一条线索"的密度，自己排更省事也更好读。
 * timestamp 是毫秒数（SDK 契约），不是 ISO 字符串。
 */
export function BreadcrumbList({ raw }: { raw: unknown }) {
  const items: Breadcrumb[] = asBreadcrumbs(raw)

  if (items.length === 0) {
    return (
      <div>
        <Text type="secondary">面包屑</Text>
        <div>
          <EmptyValue />
        </div>
      </div>
    )
  }

  return (
    <div>
      <Text type="secondary">{`面包屑（${items.length} 条）`}</Text>
      <div style={{ marginTop: 4, maxHeight: 260, overflow: 'auto' }}>
        {items.map((crumb, index) => (
          <div
            // 面包屑没有稳定 ID，同一时刻可能有多条，index 参与 key 避免重复
            key={`${crumb.timestamp}-${index}`}
            style={{ display: 'flex', gap: 8, lineHeight: '20px', fontSize: 12 }}
          >
            <Text type="secondary" style={{ flexShrink: 0 }}>
              {dayjs(crumb.timestamp).format('HH:mm:ss')}
            </Text>
            <Tag
              variant="filled"
              color={crumb.level === 'error' ? 'red' : crumb.level === 'warning' ? 'orange' : 'default'}
              style={{ marginInlineEnd: 0 }}
            >
              {crumb.category}
            </Tag>
            <span style={{ wordBreak: 'break-all' }}>{crumb.message}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** 展开区域的两栏骨架：左栏堆栈/面包屑，右栏字段清单 */
export function ExpandedPanel({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', padding: '4px 8px' }}>
      <div style={{ flex: '1 1 420px', minWidth: 320 }}>{left}</div>
      <div style={{ flex: '1 1 320px', minWidth: 260 }}>{right}</div>
    </div>
  )
}
