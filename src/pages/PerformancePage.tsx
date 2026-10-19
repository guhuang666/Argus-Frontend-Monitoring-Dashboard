import { Alert, Button, Table } from 'antd'
import type { TableColumnsType } from 'antd'
import { useState } from 'react'
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS, usePerformanceMetrics } from '../api/queries'
import type { PerformanceRow } from '../api/types'
import PageShell from '../components/PageShell'
import {
  DetailItem,
  EllipsisText,
  EmptyValue,
  ExpandedPanel,
  MetricText,
  StackBlock,
} from '../components/common'
import { formatInt, formatTime } from '../utils/format'
import { useProjectId } from '../utils/project'

/**
 * 性能指标列表。
 *
 * 数据源：GET /api/v1/performance —— 与异常表同构的服务端分页。
 *
 * ⚠️ 本页最重要的一条纪律：lcp / cls / inp 的 null 一律渲染成占位符。
 * 后端 toRow 刻意用 `?? null` 而不是 `?? 0`，因为
 *   · 用户全程没交互 → INP 无值（不是"INP = 0ms 的完美交互"）
 *   · 跨域图片读不到 renderTime → LCP 无值（不是"0ms 加载完"）
 *   · CLS 的 0 是合法值且代表"没有布局偏移"
 * 用 0 兜底会把前两种"没测到"伪造成最后一种"性能完美"。
 * 组件里 MetricText 对 null 和 0 的处理是分开的，别改成 Number(x) || 0。
 */
const columns: TableColumnsType<PerformanceRow> = [
  {
    title: '时间',
    dataIndex: 'timestamp',
    width: 180,
    render: (_value, row) => (
      <div>
        <div>{formatTime(row.timestamp)}</div>
        <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
          {`接收 ${formatTime(row.received_at)}`}
        </div>
      </div>
    ),
  },
  {
    title: '页面',
    dataIndex: 'url',
    render: (value: string) => <EllipsisText value={value} width={300} />,
  },
  {
    title: 'LCP',
    dataIndex: 'lcp',
    width: 110,
    // 毫秒整数：小数点后没有意义
    render: (value: number | null) => <MetricText value={value} unit="ms" />,
  },
  {
    title: 'CLS',
    dataIndex: 'cls',
    width: 100,
    // 保留 4 位：好的页面 CLS < 0.1，取整会全变 0，把差异全抹掉
    render: (value: number | null) => <MetricText value={value} digits={4} />,
  },
  {
    title: 'INP',
    dataIndex: 'inp',
    width: 110,
    render: (value: number | null) => <MetricText value={value} unit="ms" />,
  },
  {
    title: 'LCP 元素',
    dataIndex: 'lcp_element',
    width: 110,
    render: (value: string | null) => (value ? value : <EmptyValue />),
  },
  {
    title: '交互 / 元素',
    dataIndex: 'inp_target',
    width: 170,
    render: (_value, row) =>
      row.inp_target || row.inp_element ? (
        <span>{`${row.inp_target ?? '—'} · ${row.inp_element ?? '—'}`}</span>
      ) : (
        <EmptyValue />
      ),
  },
  {
    title: 'INP 阶段',
    dataIndex: 'inp_phase',
    width: 130,
    render: (value: string | null) => (value ? value : <EmptyValue />),
  },
  {
    title: '导航类型',
    dataIndex: 'navigation_type',
    width: 120,
    render: (value: string | null) => (value ? value : <EmptyValue />),
  },
  {
    title: '设备',
    dataIndex: 'device_viewport',
    width: 150,
    render: (_value, row) =>
      row.device_viewport ? (
        <span>{`${row.device_viewport}${row.device_dpr ? ` @${row.device_dpr}x` : ''}`}</span>
      ) : (
        <EmptyValue />
      ),
  },
  {
    title: '网络',
    dataIndex: 'connection',
    width: 90,
    render: (value: string | null) => (value ? value : <EmptyValue />),
  },
  {
    title: '版本 / 环境',
    dataIndex: 'release',
    width: 140,
    render: (_value, row) =>
      row.release || row.environment ? (
        <span>{`${row.release ?? '—'} · ${row.environment ?? '—'}`}</span>
      ) : (
        <EmptyValue />
      ),
  },
]

export default function PerformancePage() {
  const projectId = useProjectId()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

  const { data, isPending, isError, error, isFetching, refetch } = usePerformanceMetrics(
    projectId,
    page,
    pageSize,
  )

  if (isError) {
    return (
      <PageShell title="性能指标">
        <Alert
          type="error"
          showIcon
          message="加载性能指标失败"
          description={error instanceof Error ? error.message : String(error)}
        />
      </PageShell>
    )
  }

  return (
    <PageShell
      title="性能指标"
      description={
        <span>
          {data ? `共 ${formatInt(data.total)} 条` : '加载中…'}
          {isFetching && <span style={{ marginLeft: 8, color: 'rgba(0,0,0,0.45)' }}>刷新中…</span>}
          <Button size="small" style={{ marginLeft: 12 }} onClick={() => void refetch()}>
            刷新
          </Button>
        </span>
      }
    >
      <Table<PerformanceRow>
        rowKey="event_id"
        columns={columns}
        dataSource={data?.items ?? []}
        loading={isPending || isFetching}
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
        scroll={{ x: 1500 }}
        size="medium"
        expandable={{
          expandedRowRender: (row) => (
            <ExpandedPanel
              left={
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <div style={{ marginBottom: 4, color: 'rgba(0,0,0,0.45)' }}>完整页面地址</div>
                    <div style={{ wordBreak: 'break-all' }}>{row.url}</div>
                  </div>
                  <div>
                    <div style={{ marginBottom: 4, color: 'rgba(0,0,0,0.45)' }}>
                      INP 归因说明
                    </div>
                    <div>
                      阶段决定开什么药方：input-delay 要拆长任务，processing 要优化回调代码，
                      presentation 要减少 DOM 与简化样式。
                    </div>
                  </div>
                  <StackBlock label="user_agent" text={row.user_agent} />
                </div>
              }
              right={
                <div>
                  <div style={{ marginBottom: 4, color: 'rgba(0,0,0,0.45)' }}>事件字段</div>
                  <DetailItem label="event_id" value={row.event_id} />
                  <DetailItem
                    label="lcp"
                    value={row.lcp === null ? '未测到（null）' : `${row.lcp} ms`}
                  />
                  <DetailItem
                    label="cls"
                    value={row.cls === null ? '未测到（null）' : String(row.cls)}
                  />
                  <DetailItem
                    label="inp"
                    value={row.inp === null ? '未测到（null）' : `${row.inp} ms`}
                  />
                  <DetailItem label="lcp_element" value={row.lcp_element} />
                  <DetailItem label="inp_target" value={row.inp_target} />
                  <DetailItem label="inp_element" value={row.inp_element} />
                  <DetailItem label="inp_phase" value={row.inp_phase} />
                  <DetailItem label="navigation_type" value={row.navigation_type} />
                  <DetailItem
                    label="device"
                    value={row.device_viewport ? `${row.device_viewport} @${row.device_dpr ?? '?'}x` : null}
                  />
                  <DetailItem label="connection" value={row.connection} />
                  <DetailItem label="user_id" value={row.user_id} />
                  <DetailItem label="session_id" value={row.session_id} />
                  <DetailItem label="sdk" value={`${row.sdk_name ?? '—'} ${row.sdk_version ?? ''}`.trim()} />
                </div>
              }
            />
          ),
        }}
      />
    </PageShell>
  )
}
