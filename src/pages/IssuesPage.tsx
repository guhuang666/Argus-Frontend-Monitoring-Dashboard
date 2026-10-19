import { Alert, Button, Segmented, Table, Tag } from 'antd'
import type { TableColumnsType } from 'antd'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS, useIssues } from '../api/queries'
import type { IssueRow, IssueStatus } from '../api/types'
import PageShell from '../components/PageShell'
import { EllipsisText, EmptyValue, IssueLevelTag, IssueStatusTag } from '../components/common'
import { formatInt, formatTime } from '../utils/format'
import { ISSUE_STATUS_FILTER_OPTIONS } from '../utils/issue'
import { projectPath, useProjectId } from '../utils/project'

/**
 * 问题列表 —— worker 按指纹归并后的实体。
 *
 * 数据源：GET /api/v1/issues?page=&pageSize=&status=
 * 后端固定按 last_seen 倒序（有 @@index([lastSeen(sort: Desc)]) 支撑），
 * 且**只支持 status 一个过滤维度** —— 没有关键词、没有 level、没有时间范围。
 * 所以这里不做前端"假筛选"控件：点了没用的控件比没有控件更糟。
 *
 * 与异常事件页的分工：异常页看"一次发生了什么"，本页看"哪些错误在反复发生"。
 *
 * ── 为什么列定义是个函数而不是常量 ──────────────────────────────────────
 * 标题列里要放详情页链接，而详情路径带项目前缀（/projects/:projectId/issues/:id）。
 * 列定义是模块级常量、拿不到 hooks，所以把它做成"传进 projectId、返回列数组"的函数。
 * 换成在 render 里调 useProjectId() 会违反 hooks 规则 —— 那些 render 是
 * 普通函数调用，不是组件。
 */
function buildColumns(projectId: string): TableColumnsType<IssueRow> {
  return [
    {
      title: '级别',
      dataIndex: 'level',
      width: 100,
      render: (value: string) => <IssueLevelTag value={value} />,
    },
    {
      title: '标题',
      dataIndex: 'title',
      // 不设固定宽度：标题是这一页的主信息，让它吃掉剩余空间。
      // 库里是 VarChar(500)，不换行会把表格横向撑爆，所以用 wordBreak 允许断行。
      render: (_value, row) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Link
            to={projectPath(projectId, `/issues/${row.id}`)}
            // 行本身也绑了跳转：不拦一下会触发两次 navigate
            onClick={(event) => event.stopPropagation()}
            style={{ wordBreak: 'break-all' }}
          >
            {row.title}
          </Link>
          <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', wordBreak: 'break-all' }}>
            {row.fingerprint}
          </span>
        </div>
      ),
  },
  {
    title: '责任位置',
    dataIndex: 'culprit',
    width: 240,
    // 可空：调用栈为空（resource 通道、被裁剪过的 stack）时后端算不出责任位置
    render: (_value, row) => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <EllipsisText value={row.culprit} width={200} />
        {/* FR-3.9：让用户一眼看出"这条点进去有没有源码可看"
            —— 未符号化时 culprit 是压缩产物位置（index.js:r 这种），别让人误以为是源码 */}
        {row.grouping_version === 'v1-raw' && (
          <Tag color="warning" style={{ marginInlineEnd: 0, width: 'fit-content' }}>
            未符号化
          </Tag>
        )}
      </div>
    ),
  },
  {
    title: '状态',
    dataIndex: 'status',
    width: 100,
    render: (value: string) => <IssueStatusTag value={value} />,
  },
  {
    title: '次数',
    dataIndex: 'times_seen',
    width: 100,
    align: 'right',
    render: (value: number) => formatInt(value),
  },
  {
    title: '影响用户',
    dataIndex: 'users_seen',
    width: 110,
    align: 'right',
    // 0 表示 SDK 没上报 user_id（量不出来），不是"0 个用户受影响"。
    // 这与性能页对 lcp/inp 的 null 处理是同一个立场：区分"没测到"和"测得 0"。
    render: (value: number) => (value > 0 ? formatInt(value) : <EmptyValue />),
  },
  {
    title: '最近出现',
    dataIndex: 'last_seen',
    width: 190,
    render: (_value, row) => (
      <div>
        <div>{formatTime(row.last_seen)}</div>
        <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
          {`首次 ${formatTime(row.first_seen)}`}
        </div>
      </div>
    ),
  },
  {
    title: '版本',
    dataIndex: 'last_release',
    width: 120,
    // 可空：M1 的 SDK 还不上报 release
    render: (value: string | null) => <EllipsisText value={value} width={100} />,
  },
  ]
}

export default function IssuesPage() {
  const navigate = useNavigate()
  const projectId = useProjectId()
  const columns = buildColumns(projectId)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  // undefined = 不过滤。用 'all' 当 UI 值，避免把 undefined 塞进 Segmented
  const [status, setStatus] = useState<IssueStatus | undefined>(undefined)

  const { data, isPending, isError, error, isFetching, refetch } = useIssues(
    projectId,
    page,
    pageSize,
    status,
  )

  if (isError) {
    return (
      <PageShell title="问题">
        <Alert
          type="error"
          showIcon
          message="加载问题列表失败"
          description={error instanceof Error ? error.message : String(error)}
        />
      </PageShell>
    )
  }

  return (
    <PageShell
      title="问题"
      description={
        <span>
          {data ? `共 ${formatInt(data.total)} 个` : '加载中…'}
          {isFetching && <span style={{ marginLeft: 8, color: 'rgba(0,0,0,0.45)' }}>刷新中…</span>}
          <Button size="small" style={{ marginLeft: 12 }} onClick={() => void refetch()}>
            刷新
          </Button>
        </span>
      }
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 16,
        }}
      >
        <Segmented
          value={status ?? 'all'}
          options={ISSUE_STATUS_FILTER_OPTIONS}
          onChange={(value) => {
            setStatus(value === 'all' ? undefined : (value as IssueStatus))
            // 切过滤条件必须回到第 1 页：(page-1)*pageSize 会直接跳过数据
            setPage(1)
          }}
        />
        <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
          按最近出现时间倒序。后端只提供状态这一个过滤维度，故未做关键词/级别筛选。
        </span>
      </div>

      <Table<IssueRow>
        // id 是 UUID 主键，天然唯一，比 index 稳
        rowKey="id"
        columns={columns}
        dataSource={data?.items ?? []}
        loading={isPending || isFetching}
        // 整行可点进详情。标题里另有 <Link>，保留它才能中键/新标签页打开
        onRow={(row) => ({
          onClick: () => navigate(projectPath(projectId, `/issues/${row.id}`)),
          style: { cursor: 'pointer' },
        })}
        // 表格内部不再挂分页器：服务端分页的 current/total 都由上面的 state 驱动，
        // 用受控分页避免"表格自己翻页、请求没跟上"的错位
        pagination={{
          current: page,
          pageSize,
          total: data?.total ?? 0,
          showSizeChanger: true,
          pageSizeOptions: PAGE_SIZE_OPTIONS,
          showTotal: (total) => `共 ${formatInt(total)} 个`,
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
        scroll={{ x: 1200 }}
        size="medium"
      />
    </PageShell>
  )
}
