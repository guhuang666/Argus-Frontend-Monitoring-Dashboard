import { Alert, Button, Card, Empty, Segmented, Skeleton, Space, Table, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import dayjs from 'dayjs'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  usePerformanceMetrics,
  usePerformanceTrend,
} from '../api/queries'
import type { OverviewRange, PerfMetric, PerformanceRow } from '../api/types'
import PageShell from '../components/PageShell'
import TrendChart from '../components/TrendChart'
import type { TrendSeries, TrendThreshold } from '../components/TrendChart'
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

const { Text, Title } = Typography

/**
 * 性能页 = 上方分位趋势（回答"最近变好还是变坏"）+ 下方明细（回答"具体是哪次"）。
 *
 * ── 两部分的数据源不同，这是有意的 ──────────────────────────────────────
 *   趋势：GET /api/v1/stats/performance  —— 服务端按桶算 p50/p75/p95，前端不二次聚合
 *   明细：GET /api/v1/performance        —— 原始事件，服务端分页
 * 明细接口**没有时间过滤参数**，所以上方的 range/metric 不影响下面的表格。
 * 界面上必须把这句话说出来（见表格上方那行小字），否则用户切了"近 7 天"、
 * 发现表格没变，会以为是 bug。宁可说明限制，也不做假筛选。
 *
 * ── 两个状态放在哪 ──────────────────────────────────────────────────────
 * metric / range 放 URL（?metric=lcp&range=7d）：刷新、分享、后退都还原成同一个视图。
 * 表格的 page / pageSize 放 useState：它是"临时下钻视角"，不该进历史记录。
 */
const METRIC_OPTIONS: Array<{ label: string; value: PerfMetric }> = [
  { label: 'LCP', value: 'lcp' },
  { label: 'INP', value: 'inp' },
  { label: 'CLS', value: 'cls' },
]

/**
 * 三个时间范围。与后端 OverviewQueryDto 的 OVERVIEW_RANGES 必须逐字一致 ——
 * 多一个（比如 1h）后端会 400，少一个则用户看不到。
 * 性能趋势的 PerformanceQueryDto 直接复用了这套枚举，所以两边共用一份。
 */
const RANGE_OPTIONS: Array<{ label: string; value: OverviewRange }> = [
  { label: '近 24 小时', value: '24h' },
  { label: '近 7 天', value: '7d' },
  { label: '近 30 天', value: '30d' },
]

/** 每个指标的展示口径与阈值。阈值取 Web Vitals 官方分档，别自己调 */
interface MetricMeta {
  label: string
  /** 数值单位，仅用于 tooltip 后缀 */
  unit: string
  /** 小数位。CLS 是 0.0x 量级，取整会把差异全抹掉 */
  digits: number
  /** 「好」的上界 / 「差」的下界 —— 两条参考线画在这两个值上 */
  good: number
  poor: number
  goodLabel: string
  poorLabel: string
  /** 卡片右上角的完整口径说明 */
  thresholdText: string
}

const METRIC_META: Record<PerfMetric, MetricMeta> = {
  lcp: {
    label: 'LCP',
    unit: 'ms',
    digits: 0,
    good: 2500,
    poor: 4000,
    goodLabel: '需改进 >2500ms',
    poorLabel: '差 >4000ms',
    thresholdText: '好 ≤2500ms｜需改进 2500–4000ms｜差 >4000ms',
  },
  inp: {
    label: 'INP',
    unit: 'ms',
    digits: 0,
    good: 200,
    poor: 500,
    goodLabel: '需改进 >200ms',
    poorLabel: '差 >500ms',
    thresholdText: '好 ≤200ms｜需改进 200–500ms｜差 >500ms',
  },
  cls: {
    label: 'CLS',
    unit: '',
    digits: 3,
    good: 0.1,
    poor: 0.25,
    goodLabel: '需改进 >0.1',
    poorLabel: '差 >0.25',
    thresholdText: '好 ≤0.1｜需改进 0.1–0.25｜差 >0.25',
  },
}

/**
 * 明细表格列。
 *
 * ⚠️ 本页最重要的一条纪律：lcp / cls / inp 的 null 一律渲染成占位符。
 * 后端 toRow 刻意用 `?? null` 而不是 `?? 0`，因为
 *   · 用户全程没交互 → INP 无值（不是"INP = 0ms 的完美交互"）
 *   · 跨域图片读不到 renderTime → LCP 无值（不是"0ms 加载完"）
 *   · CLS 的 0 是合法值且代表"没有布局偏移"
 * 用 0 兜底会把前两种"没测到"伪造成最后一种"性能完美"。
 * 组件里 MetricText 对 null 和 0 的处理是分开的，别改成 Number(x) || 0。
 * 上方的趋势图同理：null 必须是断点，不能连成线。
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
  const [searchParams, setSearchParams] = useSearchParams()

  const metric = parseMetric(searchParams.get('metric'))
  const range = parseRange(searchParams.get('range'))

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

  const trend = usePerformanceTrend(projectId, range, metric)
  const table = usePerformanceMetrics(projectId, page, pageSize)

  const meta = METRIC_META[metric]

  /**
   * 两条阈值参考线的配置必须稳定引用：
   * TrendChart 的 setOption 依赖它，每次渲染都造新数组会让图表每次渲染都重设一遍
   * （视觉上是"切指标之外的任何一次渲染都在重画"）。METRIC_META 里的是常量对象，
   * 所以依赖 [meta] 就够。
   */
  const thresholds = useMemo<TrendThreshold[]>(
    () => [
      { label: meta.goodLabel, value: meta.good, color: '#faad14' },
      { label: meta.poorLabel, value: meta.poor, color: '#ff4d4f' },
    ],
    [meta],
  )

  /**
   * x 轴标签与三条折线。
   *
   * 依赖只能是 `trend.data`：
   *   · `trend.data?.trend ?? []` 每次渲染都会造一个新数组，若直接当依赖会无限重算
   *   · labelFormat 用的是响应里的 bucket / range（后端权威值），
   *     不用地址栏的 range —— 这样 placeholderData 期间"旧图配旧标签"，不会错位
   */
  const chart = useMemo(() => {
    const points = trend.data?.trend ?? []
    const bucket = trend.data?.bucket ?? 'hour'
    const dataRange = trend.data?.range ?? range

    const series: TrendSeries[] = [
      { name: 'p50 中位数', values: points.map((point) => point.p50), color: '#1677ff' },
      { name: 'p75', values: points.map((point) => point.p75), color: '#722ed1' },
      { name: 'p95', values: points.map((point) => point.p95), color: '#ff4d4f' },
    ]

    return {
      labels: points.map((point) => dayjs(point.t).format(labelFormat(bucket, dataRange))),
      series,
      // 三个分位数全 null 说明这段时间一个样本都没有 —— 画出来是三条空白线，
      // 不如直接给空态说清楚
      hasData: points.some(
        (point) => point.p50 !== null || point.p75 !== null || point.p95 !== null,
      ),
      totalSamples: points.reduce((sum, point) => sum + point.samples, 0),
    }
  }, [trend.data, range])

  /** 切指标/切范围只改 URL 参数，查询由 hook 根据参数自动重发 */
  function setParam(key: 'metric' | 'range', value: string): void {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev)
        params.set(key, value)
        return params
      },
      { replace: true },
    )
  }

  function handleRefresh(): void {
    void trend.refetch()
    void table.refetch()
  }

  return (
    <PageShell
      title="性能指标"
      description={
        <Space size={12} wrap>
          {trend.isFetching && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              刷新中…
            </Text>
          )}
          <Segmented<PerfMetric>
            options={METRIC_OPTIONS}
            value={metric}
            onChange={(next) => setParam('metric', next)}
          />
          <Segmented<OverviewRange>
            options={RANGE_OPTIONS}
            value={range}
            onChange={(next) => setParam('range', next)}
          />
          <Button size="small" onClick={handleRefresh}>
            刷新
          </Button>
        </Space>
      }
    >
      <Card
        title={`${meta.label} 分位趋势`}
        style={{ marginBottom: 16 }}
        extra={
          <Space orientation="vertical" size={0} style={{ textAlign: 'right' }}>
            {trend.data !== undefined && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {`${formatTime(trend.data.from)} ~ ${formatTime(trend.data.to)}`}
              </Text>
            )}
            <Text type="secondary" style={{ fontSize: 12 }}>
              {meta.thresholdText}
            </Text>
          </Space>
        }
      >
        {trend.isError ? (
          <Alert
            type="error"
            showIcon
            message="趋势数据加载失败"
            description={trend.error instanceof Error ? trend.error.message : String(trend.error)}
          />
        ) : trend.isPending && trend.data === undefined ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : chart.hasData ? (
          <TrendChart
            labels={chart.labels}
            series={chart.series}
            thresholds={thresholds}
            unit={meta.unit}
            digits={meta.digits}
          />
        ) : (
          <Empty
            style={{ padding: '48px 0' }}
            description={`这段时间没有 ${meta.label} 样本（该指标可能没有上报，或全为无效值）`}
          />
        )}
      </Card>

      <div>
        <Title level={5} style={{ marginTop: 0, marginBottom: 4 }}>
          明细事件（下钻）
          <Text type="secondary" style={{ fontSize: 13, fontWeight: 400, marginLeft: 8 }}>
            {table.data ? `共 ${formatInt(table.data.total)} 条` : '加载中…'}
          </Text>
        </Title>
        <Text type="secondary" style={{ fontSize: 12 }}>
          最近上报的原始性能指标，<Text strong>不受上方指标与时间范围影响</Text> ——
          明细接口暂无时间过滤参数，所以这里不做联动筛选。
        </Text>

        {table.isError && (
          <Alert
            type="error"
            showIcon
            style={{ marginTop: 12 }}
            message="加载性能明细失败"
            description={table.error instanceof Error ? table.error.message : String(table.error)}
          />
        )}

        <Table<PerformanceRow>
          style={{ marginTop: 12 }}
          rowKey="event_id"
          columns={columns}
          dataSource={table.data?.items ?? []}
          loading={table.isPending || table.isFetching}
          pagination={{
            current: page,
            pageSize,
            total: table.data?.total ?? 0,
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
                      value={
                        row.device_viewport
                          ? `${row.device_viewport} @${row.device_dpr ?? '?'}x`
                          : null
                      }
                    />
                    <DetailItem label="connection" value={row.connection} />
                    <DetailItem label="user_id" value={row.user_id} />
                    <DetailItem label="session_id" value={row.session_id} />
                    <DetailItem
                      label="sdk"
                      value={`${row.sdk_name ?? '—'} ${row.sdk_version ?? ''}`.trim()}
                    />
                  </div>
                }
              />
            ),
          }}
        />
      </div>
    </PageShell>
  )
}

/** URL 里的 metric 不可信：可能是手改的、可能是旧链接。认不出来就回默认 */
function parseMetric(raw: string | null): PerfMetric {
  return raw === 'lcp' || raw === 'cls' || raw === 'inp' ? raw : 'lcp'
}

/** 同 parseMetric。默认 24h，与后端 DTO 的默认值一致 */
function parseRange(raw: string | null): OverviewRange {
  return raw === '7d' || raw === '30d' || raw === '24h' ? raw : '24h'
}

/**
 * x 轴标签格式。
 *
 * 优先看响应里的 bucket（后端权威值），range 只用来区分小时桶的两种密度：
 *   · 24h：每小时一个点，标"几点"就够
 *   · 7d ：168 个小时点，必须带日期，否则两天的小时标签长得一样
 *   · 30d：按天桶，标到"月-日"
 */
function labelFormat(bucket: 'hour' | 'day', range: OverviewRange): string {
  if (bucket === 'day') return 'MM-DD'
  return range === '7d' ? 'MM-DD HH:mm' : 'HH:mm'
}
