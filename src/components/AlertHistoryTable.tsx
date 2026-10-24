import { Alert, Button, Empty, Segmented, Select, Space, Table, Tag, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS, useAlertEvents } from '../api/queries'
import type { AlertEventRow, AlertRuleRow } from '../api/types'
import { channelLabel, formatMetricValue } from '../utils/alert'
import { formatInt, formatTime } from '../utils/format'

const { Text } = Typography

/** 状态筛选。'all' 不传参数，交给后端返回全部 */
type StatusFilter = 'all' | 'ok' | 'fail'

const STATUS_OPTIONS: Array<{ label: string; value: StatusFilter }> = [
  { label: '全部', value: 'all' },
  { label: '已送达', value: 'ok' },
  { label: '失败', value: 'fail' },
]

/**
 * 告警触发历史（M6-5）。
 *
 * ── 这页是干什么的 ──────────────────────────────────────────────────────
 * `alert_events` 之前只写不读。它回答两个规则列表回答不了的问题：
 *   ① 这条规则到底响过没有（`last_fired_at` 只说"最后一次"）
 *   ② 为什么我没收到（`delivered=false` + 失败原因）
 *
 * ── 筛选条件为什么放 URL ────────────────────────────────────────────────
 * 刷新、复制链接给同事、浏览器后退都要能回到同一个视图。放在组件 state 里，
 * F5 一下筛选就悄悄丢了 —— 而"我刚才筛出来的那几条"正是要拿给人看的东西。
 * 页码留在 state：它是一屏内的浏览状态，不构成"我在看什么"。
 *
 * ── 默认显示全部（含失败）────────────────────────────────────────────────
 * 失败记录是最有价值的部分，默认藏起来等于让"为什么没收到"永远查不出来。
 * 但失败重试会连续写多条，所以给了状态切换，方便只看成功的那几条。
 */
export default function AlertHistoryTable({
  projectId,
  rules,
}: {
  projectId: string
  /** 规则列表，用来做"只看某条规则"的下拉 */
  rules: AlertRuleRow[]
}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

  const statusParam = searchParams.get('histStatus')
  const status: StatusFilter =
    statusParam === 'ok' || statusParam === 'fail' ? statusParam : 'all'
  const delivered = status === 'all' ? undefined : status === 'ok'
  const ruleId = searchParams.get('histRule') ?? undefined

  const { data, isPending, isFetching, isError, error, refetch } = useAlertEvents(projectId, {
    page,
    pageSize,
    ruleId,
    delivered,
  })

  /** 改筛选条件时回到第 1 页：停在第 3 页上看一份只剩 5 条的结果只会显示空表 */
  function setFilter(key: 'histRule' | 'histStatus', value: string | undefined): void {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev)
        if (value === undefined || value === '') {
          params.delete(key)
        } else {
          params.set(key, value)
        }
        return params
      },
      { replace: true },
    )
    setPage(1)
  }

  const columns: TableColumnsType<AlertEventRow> = [
    {
      title: '时间',
      dataIndex: 'fired_at',
      width: 190,
      render: (value: string) => formatTime(value),
    },
    {
      title: '规则',
      dataIndex: 'rule_name',
      render: (_value, row) => (
        <div>
          <div>{row.rule_name}</div>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
            {channelLabel(row.channel)}
          </div>
        </div>
      ),
    },
    {
      title: '当时的值',
      width: 220,
      render: (_value, row) => (
        <div>
          <div>{formatMetricValue(row.metric, row.value)}</div>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
            {row.threshold === null
              ? '阈值未记录'
              : `阈值 ${row.threshold}${row.window_minutes === null ? '' : ` · ${row.window_minutes} 分钟窗口`}`}
          </div>
        </div>
      ),
    },
    {
      title: '状态',
      dataIndex: 'delivered',
      width: 110,
      render: (delivered: boolean) =>
        delivered ? <Tag color="success">已送达</Tag> : <Tag color="error">失败</Tag>,
    },
    {
      title: '失败原因',
      dataIndex: 'error',
      render: (value: string | null) =>
        value === null ? (
          <Text type="secondary">—</Text>
        ) : (
          // 原因可能是一整段 HTML 错误页，截断后用 title 兜住全文
          <Text type="danger" ellipsis={{ tooltip: value }} style={{ maxWidth: 320 }}>
            {value}
          </Text>
        ),
    },
  ]

  return (
    <>
      <Space wrap style={{ marginBottom: 12 }}>
        <Select
          allowClear
          placeholder="全部规则"
          style={{ width: 200 }}
          value={ruleId}
          onChange={(next?: string) => setFilter('histRule', next)}
          options={rules.map((rule) => ({ value: rule.id, label: rule.name }))}
        />
        <Segmented<StatusFilter>
          options={STATUS_OPTIONS}
          value={status}
          onChange={(next) => setFilter('histStatus', next === 'all' ? undefined : next)}
        />
        <Button size="small" onClick={() => void refetch()}>
          刷新
        </Button>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {data === undefined ? '加载中…' : `共 ${formatInt(data.total)} 条`}
        </Text>
      </Space>

      {isError && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 12 }}
          message="触发历史加载失败"
          description={error instanceof Error ? error.message : '未知错误'}
        />
      )}

      <Table<AlertEventRow>
        rowKey="id"
        columns={columns}
        dataSource={data?.items ?? []}
        loading={isPending || isFetching}
        size="middle"
        scroll={{ x: 900 }}
        pagination={{
          current: page,
          pageSize,
          total: data?.total ?? 0,
          showSizeChanger: true,
          pageSizeOptions: PAGE_SIZE_OPTIONS,
          showTotal: (total) => `共 ${formatInt(total)} 条`,
          onChange: (nextPage, nextPageSize) => {
            if (nextPageSize !== pageSize) {
              setPageSize(nextPageSize)
              setPage(1)
            } else {
              setPage(nextPage)
            }
          },
        }}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="还没有触发记录。规则越过阈值后（无论投递成功与否）都会出现在这里。"
            />
          ),
        }}
      />
    </>
  )
}
