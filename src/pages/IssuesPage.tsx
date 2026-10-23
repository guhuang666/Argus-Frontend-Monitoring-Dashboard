import { Alert, Button, Input, Segmented, Select, Space, Table, Tag } from 'antd'
import type { TableColumnsType, TableProps } from 'antd'
import { useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS, useIssueFacets, useIssues } from '../api/queries'
import type {
  IssueFilters,
  IssueLevel,
  IssueRow,
  IssueSort,
  IssueStatus,
  SortOrder,
} from '../api/types'
import PageShell from '../components/PageShell'
import { EllipsisText, EmptyValue, IssueLevelTag, IssueStatusTag } from '../components/common'
import { formatInt, formatTime } from '../utils/format'
import { ISSUE_STATUS_FILTER_OPTIONS } from '../utils/issue'
import { projectPath, useProjectId } from '../utils/project'

/**
 * 问题列表（FR-8.3：六维筛选 + 排序 + 分页）。
 *
 * 数据源：GET /api/v1/issues?projectId=&page=&pageSize=
 *         &status=&level=&q=&release=&environment=&from=&to=&sort=&order=
 *
 * ── 筛选状态为什么放 URL 而不是 useState ────────────────────────────────
 * 和概览页的 `?range=` 同一套理由：刷新、分享链接、浏览器后退都能还原
 * "我刚才看到的那个视图"。放 state 的话，刷新一下筛选条件全没了，
 * 而用户会以为"数据不见了"。
 *
 * ── 为什么 time range 在前端换算成 from/to ───────────────────────────────
 * "近 7 天"是**界面**的说法，不是接口契约。接口只认具体时刻，
 * 于是以后加"上周三到周五"这种任意区间时，后端一行都不用改。
 *
 * ── 为什么每次改筛选都要回到第 1 页 ──────────────────────────────────────
 * `page` 参与 skip 计算：(page-1)*pageSize。筛完只剩 3 条而你还停在第 5 页，
 * 看到的就是一张空表 —— 用户会以为"筛选把数据弄没了"。
 */
export default function IssuesPage() {
  const navigate = useNavigate()
  const projectId = useProjectId()
  const [searchParams, setSearchParams] = useSearchParams()
  const state = readState(searchParams)

  // 下拉数据：环境 / 版本。后端给什么就只能选什么，避免手输错一个字符就空列表
  const facets = useIssueFacets(projectId)

  /**
   * 时间范围的起点。
   *
   * ⚠ 必须 useMemo 住：直接写 `Date.now() - X` 的话，每次渲染都会得到
   * 毫秒级不同的 ISO 字符串 → queryKey 每次都变 → **无限重发请求**。
   * 依赖只有 range，所以除非用户换范围，这个值不会变。
   */
  const from = useMemo(() => rangeStart(state.range), [state.range])

  const filters: IssueFilters = {
    ...(state.status !== undefined ? { status: state.status } : {}),
    ...(state.level !== undefined ? { level: state.level } : {}),
    ...(state.q !== '' ? { q: state.q } : {}),
    ...(state.release !== undefined ? { release: state.release } : {}),
    ...(state.environment !== undefined ? { environment: state.environment } : {}),
    ...(from !== undefined ? { from } : {}),
    ...(state.sort !== 'lastSeen' ? { sort: state.sort } : {}),
    ...(state.order !== 'desc' ? { order: state.order } : {}),
  }

  const { data, isPending, isError, error, isFetching, refetch } = useIssues(
    projectId,
    state.page,
    state.pageSize,
    filters,
  )

  /** 改筛选：除翻页外的任何变化都回到第 1 页 */
  function update(patch: Partial<PageState>): void {
    const isPageOnly = Object.keys(patch).every((key) => key === 'page' || key === 'pageSize')
    const next: PageState = { ...state, ...patch, page: isPageOnly ? (patch.page ?? state.page) : 1 }
    setSearchParams(writeState(next), { replace: true })
  }

  const columns = buildColumns(projectId, state.sort, state.order)

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

  const activeCount = countActive(state)

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
      <Space size={12} wrap style={{ marginBottom: 12 }}>
        {/* 关键字：回车或点搜索才发请求，不做输入即筛（每敲一个字打一次库） */}
        <Input.Search
          allowClear
          placeholder="搜标题 / 责任位置"
          defaultValue={state.q}
          onSearch={(value) => update({ q: value.trim() })}
          style={{ width: 220 }}
        />
        <Segmented
          value={state.status ?? 'all'}
          options={ISSUE_STATUS_FILTER_OPTIONS}
          onChange={(value) =>
            update({ status: value === 'all' ? undefined : (value as IssueStatus) })
          }
        />
        <Select
          value={state.level ?? 'all'}
          style={{ width: 130 }}
          onChange={(value) =>
            update({ level: value === 'all' ? undefined : (value as IssueLevel) })
          }
          options={[
            { label: '全部级别', value: 'all' },
            { label: 'fatal', value: 'fatal' },
            { label: 'error', value: 'error' },
            { label: 'warning', value: 'warning' },
            { label: 'info', value: 'info' },
          ]}
        />
        <Select
          value={state.environment ?? 'all'}
          style={{ width: 150 }}
          loading={facets.isPending}
          onChange={(value) => update({ environment: value === 'all' ? undefined : value })}
          options={[
            { label: '全部环境', value: 'all' },
            ...(facets.data?.environments ?? []).map((value) => ({ label: value, value })),
          ]}
        />
        <Select
          value={state.release ?? 'all'}
          style={{ width: 170 }}
          loading={facets.isPending}
          onChange={(value) => update({ release: value === 'all' ? undefined : value })}
          options={[
            { label: '全部版本', value: 'all' },
            ...(facets.data?.releases ?? []).map((value) => ({ label: value, value })),
          ]}
        />
        <Select
          value={state.range}
          style={{ width: 130 }}
          onChange={(value) => update({ range: value })}
          options={[
            { label: '全部时间', value: 'all' },
            { label: '近 24 小时', value: '24h' },
            { label: '近 7 天', value: '7d' },
            { label: '近 30 天', value: '30d' },
          ]}
        />
        {activeCount > 0 && (
          <Button size="small" type="link" onClick={() => setSearchParams(new URLSearchParams())}>
            {`清空筛选（${activeCount} 项）`}
          </Button>
        )}
      </Space>

      <div style={{ marginBottom: 12, fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
        默认按最近出现时间倒序；点表头可改排序。时间范围作用于「最近出现」这一列。
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
        onChange={handleTableChange}
        // 表格内部不再挂分页器：服务端分页的 current/total 都由 URL 驱动，
        // 用受控分页避免"表格自己翻页、请求没跟上"的错位
        pagination={{
          current: state.page,
          pageSize: state.pageSize,
          total: data?.total ?? 0,
          showSizeChanger: true,
          pageSizeOptions: PAGE_SIZE_OPTIONS,
          showTotal: (total) => `共 ${formatInt(total)} 个`,
          onChange: (nextPage, nextPageSize) => {
            // 改页大小时回到第 1 页：否则 pageSize 变化后 (page-1)*pageSize 会跳过数据
            if (nextPageSize !== state.pageSize) {
              update({ pageSize: nextPageSize, page: 1 })
            } else {
              update({ page: nextPage })
            }
          },
        }}
        scroll={{ x: 1200 }}
        size="medium"
      />
    </PageShell>
  )

  /** 表头排序：只认白名单里的三列，其余忽略 */
  function handleTableChange(
    _pagination: unknown,
    _filters: unknown,
    sorter: Parameters<NonNullable<TableProps<IssueRow>['onChange']>>[2],
  ): void {
    const single = Array.isArray(sorter) ? sorter[0] : sorter
    if (single === undefined || single.order === undefined) {
      // 第三次点击取消排序 → 回到默认（最近出现倒序）
      update({ sort: 'lastSeen', order: 'desc' })
      return
    }
    const field = SORTABLE_COLUMNS[String(single.columnKey)]
    if (field === undefined) return
    update({ sort: field, order: single.order === 'ascend' ? 'asc' : 'desc' })
  }
}

/** 列 key → 后端排序字段。只有这三列可排，其余列没有对应的索引支撑 */
const SORTABLE_COLUMNS: Record<string, IssueSort> = {
  lastSeen: 'lastSeen',
  timesSeen: 'timesSeen',
  usersSeen: 'usersSeen',
}

function buildColumns(
  projectId: string,
  sort: IssueSort,
  order: SortOrder,
): TableColumnsType<IssueRow> {
  // sortOrder 必须是 'ascend' | 'descend' | null 三者之一，antd 用它决定表头箭头；
  // 给出当前排序后，用户能看出"这张表现在按哪一列排"
  const arrow = (field: IssueSort): 'ascend' | 'descend' | null =>
    field === sort ? (order === 'asc' ? 'ascend' : 'descend') : null

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
      width: 110,
      align: 'right',
      // sorter + sortOrder 一起给，表头才能显示"当前按这一列排、方向是啥"；
      // 真正的排序发生在服务端（onChange 里映射成 sort/order）
      sorter: true,
      sortOrder: arrow('timesSeen'),
      render: (value: number) => formatInt(value),
    },
    {
      title: '影响用户',
      dataIndex: 'users_seen',
      width: 120,
      align: 'right',
      sorter: true,
      sortOrder: arrow('usersSeen'),
      // 0 表示 SDK 没上报 user_id（量不出来），不是"0 个用户受影响"。
      // 这与性能页对 lcp/inp 的 null 处理是同一个立场：区分"没测到"和"测得 0"。
      render: (value: number) => (value > 0 ? formatInt(value) : <EmptyValue />),
    },
    {
      title: '最近出现',
      dataIndex: 'last_seen',
      width: 200,
      sorter: true,
      sortOrder: arrow('lastSeen'),
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
      title: '版本 / 环境',
      dataIndex: 'last_release',
      width: 150,
      render: (_value, row) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* 可空：M1 的 SDK 还不上报 release */}
          <EllipsisText value={row.last_release} width={110} />
          {row.last_environment !== null && (
            <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
              {row.last_environment}
            </span>
          )}
        </div>
      ),
    },
  ]
}

/* ── URL ⇄ 状态 ─────────────────────────────────────────────────────────── */

type RangeKey = 'all' | '24h' | '7d' | '30d'

interface PageState {
  q: string
  status?: IssueStatus
  level?: IssueLevel
  environment?: string
  release?: string
  range: RangeKey
  sort: IssueSort
  order: SortOrder
  page: number
  pageSize: number
}

const RANGE_MS: Record<Exclude<RangeKey, 'all'>, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
}

/**
 * 时间范围 → 起点 ISO。
 *
 * 对齐到整分钟：不做对齐的话每次调用都差几毫秒，queryKey 会一直变
 * （调用处还用 useMemo 兜了一层，但这里对齐之后即使不 memo 也稳定）。
 */
function rangeStart(range: RangeKey): string | undefined {
  if (range === 'all') return undefined
  const now = Math.floor(Date.now() / 60_000) * 60_000
  return new Date(now - RANGE_MS[range]).toISOString()
}

/**
 * URL → 状态。**URL 里的值一律不可信**：可能是手改的、旧链接、别人分享的。
 * 认不出来就回默认值，绝不让一个 `?status=hacked` 变成 400。
 */
function readState(params: URLSearchParams): PageState {
  const page = Number(params.get('page') ?? '1')
  const pageSize = Number(params.get('pageSize') ?? String(DEFAULT_PAGE_SIZE))
  return {
    q: params.get('q') ?? '',
    status: oneOf(params.get('status'), ['unresolved', 'resolved', 'ignored', 'archived']),
    level: oneOf(params.get('level'), ['fatal', 'error', 'warning', 'info']),
    environment: params.get('environment') ?? undefined,
    release: params.get('release') ?? undefined,
    range: oneOf(params.get('range'), ['24h', '7d', '30d']) ?? 'all',
    sort: oneOf(params.get('sort'), ['lastSeen', 'firstSeen', 'timesSeen', 'usersSeen']) ?? 'lastSeen',
    order: oneOf(params.get('order'), ['asc', 'desc']) ?? 'desc',
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize: PAGE_SIZE_OPTIONS.includes(pageSize) ? pageSize : DEFAULT_PAGE_SIZE,
  }
}

/** 状态 → URL。默认值不写进 URL，保持链接干净（`/issues` 而不是 `/issues?sort=lastSeen&order=desc`） */
function writeState(state: PageState): URLSearchParams {
  const params = new URLSearchParams()
  if (state.q !== '') params.set('q', state.q)
  if (state.status !== undefined) params.set('status', state.status)
  if (state.level !== undefined) params.set('level', state.level)
  if (state.environment !== undefined) params.set('environment', state.environment)
  if (state.release !== undefined) params.set('release', state.release)
  if (state.range !== 'all') params.set('range', state.range)
  if (state.sort !== 'lastSeen') params.set('sort', state.sort)
  if (state.order !== 'desc') params.set('order', state.order)
  if (state.page !== 1) params.set('page', String(state.page))
  if (state.pageSize !== DEFAULT_PAGE_SIZE) params.set('pageSize', String(state.pageSize))
  return params
}

/** 只接受白名单里的值，其余一律 undefined */
function oneOf<T extends string>(raw: string | null, allowed: readonly T[]): T | undefined {
  return raw !== null && (allowed as readonly string[]).includes(raw) ? (raw as T) : undefined
}

/** 有几项筛选在生效（用于"清空筛选（3 项）"） */
function countActive(state: PageState): number {
  return [
    state.q !== '',
    state.status !== undefined,
    state.level !== undefined,
    state.environment !== undefined,
    state.release !== undefined,
    state.range !== 'all',
  ].filter(Boolean).length
}
