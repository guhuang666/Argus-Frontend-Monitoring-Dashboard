import { Alert, Button, Table } from 'antd'
import type { TableColumnsType } from 'antd'
import { useState } from 'react'
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS, useErrorEvents } from '../api/queries'
import type { ErrorEventRow } from '../api/types'
import PageShell from '../components/PageShell'
import FramesView from '../components/FramesView'
import {
  BreadcrumbList,
  DetailItem,
  EllipsisText,
  EmptyValue,
  ExpandedPanel,
  MechanismTag,
  StackBlock,
} from '../components/common'
import { formatInt, formatTime } from '../utils/format'
import { useProjectId } from '../utils/project'

/**
 * 异常事件列表。
 *
 * 数据源：GET /api/v1/error —— 按 timestamp 倒序的服务端分页。
 * 后端只支持 page / pageSize 两个参数（没有时间范围、没有过滤、没有排序），
 * 所以这里不做任何前端"假筛选"控件 —— 控件点了没用的界面比没有控件更糟。
 */
const columns: TableColumnsType<ErrorEventRow> = [
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
    title: '通道',
    dataIndex: 'mechanism',
    width: 170,
    render: (value: string) => <MechanismTag value={value} />,
  },
  {
    title: '类型',
    dataIndex: 'type',
    width: 110,
  },
  {
    title: '错误信息',
    dataIndex: 'message',
    // 不设固定宽度：让它吃掉剩余空间，窄屏下也不至于把别的列挤没
    render: (value: string) => <EllipsisText value={value} width={360} />,
  },
  {
    title: '位置',
    dataIndex: 'source',
    width: 190,
    render: (value: string | null) => <EllipsisText value={value} width={170} />,
  },
  {
    title: '页面',
    dataIndex: 'url',
    width: 230,
    render: (value: string) => <EllipsisText value={value} width={210} />,
  },
  {
    title: '环境',
    dataIndex: 'environment',
    width: 110,
    render: (value: string | null) =>
      value ? value : <EmptyValue />,
  },
  {
    title: '版本',
    dataIndex: 'release',
    width: 90,
    render: (value: string | null) => (value ? value : <EmptyValue />),
  },
]

export default function ErrorEventsPage() {
  const projectId = useProjectId()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

  const { data, isPending, isError, error, isFetching, refetch } = useErrorEvents(
    projectId,
    page,
    pageSize,
  )

  // 首次加载还没有任何数据时，不渲染空表：让位给错误或加载提示
  if (isError) {
    return (
      <PageShell title="异常事件">
        <Alert
          type="error"
          showIcon
          message="加载异常事件失败"
          description={error instanceof Error ? error.message : String(error)}
        />
      </PageShell>
    )
  }

  return (
    <PageShell
      title="异常事件"
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
      <Table<ErrorEventRow>
        // event_id 是后端主键，天然唯一，比 index 稳
        rowKey="event_id"
        columns={columns}
        dataSource={data?.items ?? []}
        loading={isPending || isFetching}
        // 表格内部不再挂分页器：服务端分页的 current/total 都由上面的 state 驱动，
        // 用受控分页避免"表格自己翻页、请求没跟上"的错位
        pagination={{
          current: page,
          pageSize,
          total: data?.total ?? 0,
          showSizeChanger: true,
          pageSizeOptions: PAGE_SIZE_OPTIONS,
          showTotal: (total) => `共 ${formatInt(total)} 条`,
          onChange: (nextPage, nextPageSize) => {
            // 改页大小时回到第 1 页：否则 pageSize 变化后 (page-1)*pageSize 会跳过数据
            if (nextPageSize !== pageSize) {
              setPageSize(nextPageSize)
              setPage(1)
            } else {
              setPage(nextPage)
            }
          },
        }}
        scroll={{ x: 1280 }}
        size="medium"
        expandable={{
          expandedRowRender: (row) => (
            <ExpandedPanel
              left={
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <div style={{ marginBottom: 4, color: 'rgba(0,0,0,0.45)' }}>完整错误信息</div>
                    <div style={{ wordBreak: 'break-all' }}>{row.message}</div>
                  </div>
                  {/* M3：与问题详情页保持一致 —— 先看解析后的帧，原文留在下面 */}
                  <FramesView raw={row.stacktrace_frames} />
                  <StackBlock label="堆栈原文（未解析）" text={row.stack} />
                  <BreadcrumbList raw={row.breadcrumbs} />
                </div>
              }
              right={
                <div>
                  <div style={{ marginBottom: 4, color: 'rgba(0,0,0,0.45)' }}>事件字段</div>
                  <DetailItem label="event_id" value={row.event_id} />
                  <DetailItem label="exception_type" value={row.exception_type} />
                  <DetailItem label="exception_value" value={row.exception_value} />
                  <DetailItem label="user_id" value={row.user_id} />
                  <DetailItem label="session_id" value={row.session_id} />
                  <DetailItem label="release" value={row.release} />
                  <DetailItem label="environment" value={row.environment} />
                  <DetailItem label="sdk" value={`${row.sdk_name ?? '—'} ${row.sdk_version ?? ''}`.trim()} />
                  <DetailItem label="user_agent" value={row.user_agent} />
                  <DetailItem
                    label="tags / extra"
                    value={
                      // 这两列是 jsonb，形状由 SDK 决定：只做"有没有值"的判断，
                      // 有值就原样序列化展示，不假设它是对象还是数组
                      row.tags != null || row.extra != null
                        ? JSON.stringify({ tags: row.tags, extra: row.extra })
                        : null
                    }
                  />
                </div>
              }
            />
          ),
        }}
      />
    </PageShell>
  )
}
