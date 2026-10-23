import { Alert, Card, Col, Empty, Row, Segmented, Skeleton, Space, Statistic, Table, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import dayjs from 'dayjs'
import { Link, useSearchParams } from 'react-router'
import { useOverview } from '../api/queries'
import type { OverviewRange, TopIssue } from '../api/types'
import PageShell from '../components/PageShell'
import TrendChart from '../components/TrendChart'
import { formatInt, formatTime } from '../utils/format'
import { projectPath, useProjectId } from '../utils/project'

const { Text } = Typography

/**
 * 三个时间范围。与后端 OverviewQueryDto 的 OVERVIEW_RANGES 必须逐字一致 ——
 * 多一个（比如 1h）后端会 400，少一个则用户看不到。
 */
const RANGE_OPTIONS: Array<{ label: string; value: OverviewRange }> = [
  { label: '近 24 小时', value: '24h' },
  { label: '近 7 天', value: '7d' },
  { label: '近 30 天', value: '30d' },
]

const DEFAULT_RANGE: OverviewRange = '24h'

/**
 * 概览页 —— 第一批"能截图给人看"的界面。
 *
 * 只回答一个问题：最近这个项目出的事多不多、是在变好还是变坏。
 * 三个数字 + 一条曲线，没有下钻、没有排行，那些是下一批的事。
 *
 * ── 状态放在哪 ──────────────────────────────────────────────────────────
 * 选中的时间范围存在 URL 里（?range=7d），不是组件 state。
 * 这样刷新、分享链接、浏览器后退都还原成同一个视图；如果放 useState，
 * 刷新一下就会悄悄回到 24 小时，"我刚才看到的那张图去哪了"。
 *
 * ── 三个数字的口径 ──────────────────────────────────────────────────────
 * 全部由后端算好，前端只负责显示，绝不在前端二次聚合：
 *   错误数   窗口内事件条数（Σ 小时桶的 event_count）
 *   问题数   窗口内出现过的问题数（COUNT DISTINCT group_id）
 *   新问题数 首次出现落在窗口内的问题数（error_groups.first_seen）
 * 前端自己算的话，两边口径迟早会分叉，而且是"看起来都对"的那种分叉。
 */
export default function OverviewPage() {
  const projectId = useProjectId()
  const [searchParams, setSearchParams] = useSearchParams()
  const range = parseRange(searchParams.get('range'))

  const { data, isPending, isError, error, isFetching } = useOverview(projectId, range)

  /** 切范围只改 URL 参数，查询由 useOverview 根据 range 自动重发 */
  function handleRangeChange(next: OverviewRange): void {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev)
        params.set('range', next)
        return params
      },
      { replace: true },
    )
  }

  const labels = (data?.trend ?? []).map((point) => dayjs(point.t).format(labelFormat(range)))
  const values = (data?.trend ?? []).map((point) => point.events)
  const hasData = data !== undefined && data.summary.events > 0
  // 卡片的标题要跟着时间范围走，否则切到 7d 后标题还写着"近 24 小时"
  const rangeLabel = RANGE_OPTIONS.find((option) => option.value === range)?.label ?? ''

  return (
    <PageShell
      title="概览"
      description={
        <Space size={12}>
          {isFetching && <Text type="secondary">刷新中…</Text>}
          <Segmented<OverviewRange>
            options={RANGE_OPTIONS}
            value={range}
            onChange={handleRangeChange}
          />
        </Space>
      }
    >
      {isError && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="概览数据加载失败"
          description={error instanceof Error ? error.message : '未知错误'}
        />
      )}

      {isPending && data === undefined ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : (
        <>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={8}>
              <Card>
                <Statistic title="错误数" value={data?.summary.events ?? 0} />
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card>
                <Statistic title="问题数" value={data?.summary.issues ?? 0} />
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card>
                <Statistic title="新问题数" value={data?.summary.new_issues ?? 0} />
              </Card>
            </Col>
          </Row>

          <Card
            title="错误趋势"
            style={{ marginTop: 16 }}
            extra={
              data !== undefined && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {`${formatTime(data.from)} ~ ${formatTime(data.to)}`}
                </Text>
              )
            }
          >
            {hasData ? (
              <TrendChart labels={labels} values={values} />
            ) : (
              // 全零的平线看起来像"服务挂了但没报错"，空态至少把话说清楚
              <Empty
                style={{ padding: '48px 0' }}
                description="这段时间没有上报数据（也可能是时间范围不对）"
              />
            )}
          </Card>

          {/*
            Top N 两个榜（FR-8.2）。刻意并排放：它们回答的是同一件事的两面 ——
            "谁最吵" 和 "谁最伤人"，而这两个问题的答案经常不是同一个问题。
          */}
          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col xs={24} lg={12}>
              <Card title={`最常发生（${rangeLabel}）`}>
                <TopTable
                  projectId={projectId}
                  rows={data?.top?.byEvents ?? []}
                  highlight="events"
                />
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card
                title={`新增受影响用户（${rangeLabel}）`}
                extra={
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    口径：首次影响落在该时间段
                  </Text>
                }
              >
                <TopTable
                  projectId={projectId}
                  rows={data?.top?.byUsers ?? []}
                  highlight="users"
                />
              </Card>
            </Col>
          </Row>
        </>
      )}
    </PageShell>
  )
}

/** URL 里的 range 不可信：可能是手改的、可能是旧链接。认不出来就回默认 */
function parseRange(raw: string | null): OverviewRange {
  return raw === '7d' || raw === '30d' || raw === '24h' ? raw : DEFAULT_RANGE
}

/**
 * x 轴标签格式。
 * 24 小时只看到"几点"，7 天必须带上日期（不然两天的小时标签长得一样），
 * 30 天按天桶，标到"月-日"就够了。
 */
function labelFormat(range: OverviewRange): string {
  if (range === '30d') return 'MM-DD'
  if (range === '7d') return 'MM-DD HH:mm'
  return 'HH:mm'
}

/**
 * 榜单表格（两个榜共用）。
 *
 * ── 为什么不抽到 components/ 里 ──────────────────────────────────────────
 * 它只服务这一个页面，而且"哪一列是排序依据"这种语义太窄（随时会变）。
 * 抽早了只会多一层要维护的间接。
 *
 * ── 为什么必须高亮排序依据那一列 ────────────────────────────────────────
 * 两张表长得几乎一样，唯一区别就是排序依据。不加粗的话，用户会以为
 * "同一个榜排了两遍"，然后把两张表当成数据重复。
 *
 * ── 为什么三列都显示 ────────────────────────────────────────────────────
 * 按次数榜里"用户数"和按用户榜里"次数"恰恰是最有信息量的对照：
 * 一个高频但只伤 1 人的问题，和一个低频但伤 40 人的问题，一眼就能分辨。
 */
function TopTable({
  projectId,
  rows,
  highlight,
}: {
  projectId: string
  rows: TopIssue[]
  highlight: 'events' | 'users'
}) {
  const columns: TableColumnsType<TopIssue> = [
    {
      title: '问题',
      dataIndex: 'title',
      render: (_value, row) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Link
            to={projectPath(projectId, `/issues/${row.id}`)}
            style={{ wordBreak: 'break-all' }}
          >
            {row.title}
          </Link>
          {row.culprit !== null && (
            <span
              style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', wordBreak: 'break-all' }}
            >
              {row.culprit}
            </span>
          )}
        </div>
      ),
    },
    {
      title: '次数',
      dataIndex: 'events',
      width: 88,
      align: 'right',
      render: (value: number) =>
        highlight === 'events' ? <Text strong>{formatInt(value)}</Text> : formatInt(value),
    },
    {
      title: '新增用户',
      dataIndex: 'users',
      width: 96,
      align: 'right',
      render: (value: number) =>
        highlight === 'users' ? <Text strong>{formatInt(value)}</Text> : formatInt(value),
    },
  ]

  return (
    <Table<TopIssue>
      columns={columns}
      dataSource={rows}
      rowKey="id"
      size="small"
      pagination={false}
      // 空态要说清"这段时间没有问题"，而不是留一张空白表格让人猜是不是加载失败
      locale={{
        emptyText: (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="这段时间没有问题" />
        ),
      }}
    />
  )
}
