import { Alert, Button, Descriptions, Divider, Flex, Result, Table, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS, useIssue } from '../api/queries'
import type { IssueDetailEventRow } from '../api/types'
import PageShell from '../components/PageShell'
import {
  BreadcrumbList,
  DetailItem,
  EllipsisText,
  EmptyValue,
  ExpandedPanel,
  IssueLevelTag,
  IssueStatusTag,
  MechanismTag,
  StackBlock,
} from '../components/common'
import { formatInt, formatTime } from '../utils/format'

const { Text, Title } = Typography

/**
 * 问题详情。
 *
 * 数据源：GET /api/v1/issues/:id —— 一次请求同时返回问题本身与它下面的事件（分页），
 * 所以这里只发一个请求，不会出现"问题信息到了、事件还在转圈"的半截界面。
 *
 * ⚠ 事件表格用的是 IssueDetailEventRow，比「异常」页的 ErrorEventRow 少
 * exception_* / sdk_* / tags / extra / user_id / session_id 这 9 个字段。
 * 照抄异常页的字段清单会全部取到 undefined 并静默渲染成空。
 */
const eventColumns: TableColumnsType<IssueDetailEventRow> = [
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
    // 不设固定宽度：让它吃掉剩余空间
    render: (value: string) => <EllipsisText value={value} width={340} />,
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
    render: (value: string | null) => (value ? value : <EmptyValue />),
  },
  {
    title: '版本',
    dataIndex: 'release',
    width: 90,
    render: (value: string | null) => (value ? value : <EmptyValue />),
  },
]

/**
 * 从 client.ts 抛出的错误里取出 HTTP 状态码。
 *
 * client 把状态码拼进了文案（`请求失败（HTTP 404）：...`），没有挂在 error 对象上，
 * 所以这里只能解析文案。将来 client 改成带 status 字段的自定义 Error 时，
 * 只需要换掉这个函数，调用点不用动。
 */
function extractHttpStatus(error: unknown): number | null {
  if (!(error instanceof Error)) return null
  const matched = /HTTP (\d{3})/.exec(error.message)
  return matched ? Number(matched[1]) : null
}

export default function IssueDetailPage() {
  const navigate = useNavigate()
  const params = useParams()
  const issueId = params.id ?? ''

  // 事件列表自己的分页状态。改页码会连带重新请求详情接口（后端就是一个接口），
  // 但问题信息不会变，配合 keepPreviousData 表格也不会闪空。
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

  const { data, isPending, isError, error, isFetching, refetch } = useIssue(issueId, page, pageSize)

  const backToList = (
    <Button type="primary" onClick={() => navigate('/issues')}>
      返回问题列表
    </Button>
  )

  if (issueId === '') {
    return (
      <PageShell title="问题详情">
        <Result
          status="warning"
          title="缺少问题 ID"
          subTitle="请从问题列表点击进入详情页。"
          extra={<Button onClick={() => navigate('/issues')}>返回问题列表</Button>}
        />
      </PageShell>
    )
  }

  if (isError) {
    // 后端的 id 是 UUID 且控制器上挂了 ParseUUIDPipe：格式不对是 400，查不到是 404。
    // 区分这两种才能给出有意义的提示，而不是一句笼统的网络错误。
    const httpStatus = extractHttpStatus(error)

    if (httpStatus === 404) {
      return (
        <PageShell title="问题详情">
          <Result
            status="404"
            title="问题不存在"
            subTitle={`没有找到 id 为 ${issueId} 的问题，可能已被清理或链接有误。`}
            extra={backToList}
          />
        </PageShell>
      )
    }

    if (httpStatus === 400) {
      return (
        <PageShell title="问题详情">
          <Result
            status="warning"
            title="问题 ID 格式不正确"
            subTitle="问题 id 是 UUID，请从问题列表进入详情页。"
            extra={<Button onClick={() => navigate('/issues')}>返回问题列表</Button>}
          />
        </PageShell>
      )
    }

    return (
      <PageShell title="问题详情">
        <Alert
          type="error"
          showIcon
          message="加载问题详情失败"
          description={error instanceof Error ? error.message : String(error)}
        />
      </PageShell>
    )
  }

  const issue = data?.issue
  const events = data?.events

  return (
    <PageShell
      title="问题详情"
      description={
        <span>
          {isFetching && <span style={{ marginRight: 8, color: 'rgba(0,0,0,0.45)' }}>刷新中…</span>}
          <Button size="small" onClick={() => navigate('/issues')}>
            返回列表
          </Button>
          <Button size="small" style={{ marginLeft: 8 }} onClick={() => void refetch()}>
            刷新
          </Button>
        </span>
      }
    >
      {issue === undefined ? (
        <Alert type="info" showIcon message="加载中…" />
      ) : (
        <Flex vertical gap={24}>
          <div>
            <Title level={4} style={{ margin: 0, wordBreak: 'break-all' }}>
              {issue.title}
            </Title>
            <Text type="secondary" style={{ wordBreak: 'break-all' }}>
              {issue.culprit ?? '责任位置未知（调用栈为空时无法定位）'}
            </Text>
          </div>

          <Descriptions
            bordered
            column={{ xs: 1, sm: 2, lg: 3 }}
            items={[
              { key: 'level', label: '级别', children: <IssueLevelTag value={issue.level} /> },
              { key: 'status', label: '状态', children: <IssueStatusTag value={issue.status} /> },
              {
                key: 'grouping_version',
                label: '归并版本',
                children: issue.grouping_version,
              },
              { key: 'times_seen', label: '累计次数', children: formatInt(issue.times_seen) },
              {
                key: 'users_seen',
                label: '影响用户',
                // 0 = 量不出来，不是"0 个用户受影响"，与列表页保持同一口径
                children: issue.users_seen > 0 ? formatInt(issue.users_seen) : <EmptyValue />,
              },
              {
                key: 'event_count',
                label: '明细条数',
                children: (
                  <span>
                    {formatInt(issue.event_count)}
                    <Text type="secondary" style={{ fontSize: 12, marginLeft: 6 }}>
                      （明细只保留 30 天，可能小于累计次数）
                    </Text>
                  </span>
                ),
              },
              { key: 'first_seen', label: '首次出现', children: formatTime(issue.first_seen) },
              { key: 'last_seen', label: '最近出现', children: formatTime(issue.last_seen) },
              {
                key: 'first_release',
                label: '首次版本',
                children: issue.first_release ?? <EmptyValue />,
              },
              {
                key: 'last_release',
                label: '最近版本',
                children: issue.last_release ?? <EmptyValue />,
              },
              {
                key: 'resolved_at',
                label: '解决时间',
                // NULL 表示尚未解决（后端只在进入 resolved 时打点）
                children: issue.resolved_at ? formatTime(issue.resolved_at) : <EmptyValue />,
              },
              {
                key: 'fingerprint',
                label: '指纹',
                span: 3,
                children: (
                  <Text code style={{ wordBreak: 'break-all' }}>
                    {issue.fingerprint}
                  </Text>
                ),
              },
            ]}
          />

          <Divider style={{ margin: 0 }} />

          <div>
            <Title level={5} style={{ marginTop: 0 }}>
              {events ? `该问题下的事件（共 ${formatInt(events.total)} 条）` : '该问题下的事件'}
            </Title>
            <Text type="secondary" style={{ fontSize: 12 }}>
              详情接口只返回排查所需字段（不含 tags / extra / sdk_*），需要完整事件体请直接查
              error_events 表。
            </Text>

            <Table<IssueDetailEventRow>
              // event_id 是后端主键，天然唯一
              rowKey="event_id"
              columns={eventColumns}
              dataSource={events?.items ?? []}
              loading={isPending || isFetching}
              // 受控分页：current/total 都由 state 驱动，避免表格自己翻页而请求没跟上
              pagination={{
                current: page,
                pageSize,
                total: events?.total ?? 0,
                showSizeChanger: true,
                pageSizeOptions: PAGE_SIZE_OPTIONS,
                showTotal: (total) => `共 ${formatInt(total)} 条`,
                onChange: (nextPage, nextPageSize) => {
                  // 改页大小回到第 1 页，逻辑与其它两个列表页一致
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
                          <div style={{ marginBottom: 4, color: 'rgba(0,0,0,0.45)' }}>
                            完整错误信息
                          </div>
                          <div style={{ wordBreak: 'break-all' }}>{row.message}</div>
                        </div>
                        <StackBlock text={row.stack} />
                        <BreadcrumbList raw={row.breadcrumbs} />
                      </div>
                    }
                    right={
                      <div>
                        <div style={{ marginBottom: 4, color: 'rgba(0,0,0,0.45)' }}>事件字段</div>
                        <DetailItem label="event_id" value={row.event_id} />
                        <DetailItem label="mechanism" value={row.mechanism} />
                        <DetailItem label="type" value={row.type} />
                        <DetailItem label="source" value={row.source} />
                        <DetailItem label="release" value={row.release} />
                        <DetailItem label="environment" value={row.environment} />
                        <DetailItem label="user_agent" value={row.user_agent} />
                        <DetailItem
                          label="stacktrace_frames"
                          value={
                            // jsonb 列，形状由 SDK 决定：只判"有没有值"，不假设结构
                            row.stacktrace_frames
                              ? JSON.stringify(row.stacktrace_frames)
                              : null
                          }
                        />
                      </div>
                    }
                  />
                ),
              }}
            />
          </div>
        </Flex>
      )}
    </PageShell>
  )
}
