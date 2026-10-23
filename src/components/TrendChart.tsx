import { LineChart } from 'echarts/charts'
import {
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
} from 'echarts/components'
import { init, use as echartsUse, type ECharts, type EChartsCoreOption } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { useEffect, useRef } from 'react'

/**
 * 按需引入，而不是 `import * as echarts from 'echarts'`。
 *
 * 完整包会把地图、关系图、3D 那些全部打进产物（gzip 后仍有 300 KB+），
 * 这个项目只画折线，用不到。这里只注册折线图 + 坐标轴 + 提示框 + 图例 +
 * 参考线 + Canvas 渲染器。
 *
 * 以后要加柱状图/饼图，回来往 echartsUse([...]) 里追加即可，不用改结构。
 * 注意 MarkLineComponent 是独立的：漏了它，阈值线会静默不画（不报错）。
 *
 * ⚠️ ECharts 的注册函数本来叫 `use`，这里必须 `as echartsUse` 引进来：
 * eslint 的 react-hooks/rules-of-hooks 会把任意名为 `use(...)` 的调用当成
 * React 19 的 use() Hook，从而报"不能在顶层调用 Hook"。改名是唯一的干净解法
 * （加 eslint-disable 也能过，但那会让真正误用 use() 的地方也失去保护）。
 */
echartsUse([
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
  CanvasRenderer,
])

/** 一条折线 */
export interface TrendSeries {
  name: string
  /**
   * 与 labels 等长的数值。
   *
   * ⚠️ `null` 表示**这个点没有数据**，必须原样传给 ECharts（它会在那里断开），
   * 绝不能在前置逻辑里换成 0 —— 性能分位数的 0 意味着"完美"，而缺样本意味着
   * "不知道"，把后者画成前者是这张图最不能犯的错。
   */
  values: Array<number | null>
  color: string
  /** 面积填充。只在单序列时有意义（多序列叠起来会把彼此盖住） */
  area?: boolean
}

/** 一条水平阈值参考线（Web Vitals 的好/差分界） */
export interface TrendThreshold {
  label: string
  value: number
  color: string
}

interface TrendChartProps {
  /** x 轴标签。由调用方按 range 决定格式（HH:mm / MM-DD / MM-DD HH:mm） */
  labels: string[]
  /**
   * 单序列简写（概览页用这个）。{@link series} 一旦给了就忽略它。
   * 类型放宽成 `Array<number | null>` 是为了让"缺数据"能在任意页面上表达出来。
   */
  values?: Array<number | null>
  /** 单序列时的图例名，默认「错误数」（保持概览页的原有文案） */
  seriesName?: string
  /** 多序列（如 p50 / p75 / p95）。给了就忽略 {@link values} */
  series?: TrendSeries[]
  /** 水平阈值参考线。给几条画几条，不影响数据本身 */
  thresholds?: TrendThreshold[]
  /** 数值单位，只用于 tooltip 与轴标签的后缀（ms 等） */
  unit?: string
  /**
   * 小数位。默认 0（毫秒这种整数指标）。
   * CLS 必须传 3 左右：它是 0.0x 量级，取整会全变 0，把差异全抹掉。
   */
  digits?: number
  /** 图表高度，默认 320 */
  height?: number
}

/**
 * 趋势折线。
 *
 * ── 为什么用 category 轴而不是 time 轴 ──────────────────────────────────
 * 后端返回的趋势是**等距补空**过的（没有数据的小时也在数组里），
 * 所以 category 轴画出来与 time 轴完全一致，却省掉了"时间字符串 → 轴刻度"
 * 的一层转换，tooltip 里的表头也直接就是人话（"10-21 14:00"）。
 * 哪天后端改成只返回有数据的点，这里必须换回 time 轴，否则间隔会被压扁。
 *
 * ── 生命周期 ────────────────────────────────────────────────────────────
 * 实例只在挂载时 init 一次，数据变化走 setOption；卸载时 dispose。
 * 不 dispose 的话，切路由再回来会泄漏一个 canvas 和一个 resize 监听。
 */
export default function TrendChart({
  labels,
  values,
  seriesName,
  series,
  thresholds,
  unit = '',
  digits = 0,
  height = 320,
}: TrendChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ECharts | null>(null)

  // 挂载：建实例 + 跟随容器尺寸
  useEffect(() => {
    const el = containerRef.current
    if (el === null) return

    const chart = init(el)
    chartRef.current = chart

    // 侧栏折叠、窗口缩放、浏览器缩放都会改变容器宽度，ECharts 不会自己知道
    const observer = new ResizeObserver(() => {
      chart.resize()
    })
    observer.observe(el)

    return () => {
      observer.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  // 数据变化：整份替换（notMerge=true），避免上一次的 y 轴范围、图例、阈值线残留
  useEffect(() => {
    const chart = chartRef.current
    if (chart === null) return

    const resolved: TrendSeries[] = series ?? [
      { name: seriesName ?? '错误数', values: values ?? [], color: '#1677ff', area: true },
    ]

    chart.setOption(
      buildOption({ labels, series: resolved, thresholds: thresholds ?? [], unit, digits }),
      true,
    )
  }, [labels, values, seriesName, series, thresholds, unit, digits])

  return <div ref={containerRef} style={{ width: '100%', height }} />
}

function buildOption({
  labels,
  series,
  thresholds,
  unit,
  digits,
}: {
  labels: string[]
  series: TrendSeries[]
  thresholds: TrendThreshold[]
  unit: string
  digits: number
}): EChartsCoreOption {
  const format = (value: number): string =>
    digits > 0 ? value.toFixed(digits) : String(Math.round(value))
  const suffix = unit === '' ? '' : ` ${unit}`

  // 图例只在多序列时出现：单序列的那个名字（"错误数"）没必要占一行
  const showLegend = series.length > 1

  return {
    grid: { left: 56, right: 24, top: showLegend ? 40 : 24, bottom: 32 },
    legend: showLegend
      ? { top: 4, right: 8, itemWidth: 14, itemHeight: 8, textStyle: { fontSize: 12 } }
      : { show: false },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line' },
      // 单位为空的指标（CLS）不追加后缀，避免显示成 "0.050 "
      valueFormatter: (value: unknown) =>
        typeof value === 'number' ? `${format(value)}${suffix}` : '无样本',
    },
    xAxis: {
      type: 'category',
      data: labels,
      boundaryGap: false,
      axisLine: { lineStyle: { color: 'rgba(0,0,0,0.2)' } },
      // 点太密时让 ECharts 自动隔几个显示一个，别把标签叠成一团
      axisLabel: { hideOverlap: true, color: 'rgba(0,0,0,0.55)' },
    },
    yAxis: {
      type: 'value',
      /**
       * 整数指标（事件数、毫秒）才限制最小刻度为 1 —— 否则最大值 3 时 y 轴
       * 会出现 0.5 这种刻度。CLS 是小数，必须放开让 ECharts 自己选步长。
       */
      minInterval: digits === 0 ? 1 : undefined,
      splitLine: { lineStyle: { color: 'rgba(0,0,0,0.06)' } },
      axisLabel: {
        color: 'rgba(0,0,0,0.55)',
        formatter: (value: number) => format(value),
      },
    },
    series: series.map((item, index) => ({
      type: 'line',
      name: item.name,
      data: item.values,
      // showSymbol: false 让密集序列不至于糊成一条毛毛虫
      showSymbol: false,
      smooth: 0.2,
      /**
       * ⚠️ 必须是 false。null 点要在图上**断开**，
       * 连起来等于凭空编造一段"这段时间性能是这样"的假数据。
       * ECharts 默认就是 false，这里显式写出来是为了防止有人"顺手"改成 true。
       */
      connectNulls: false,
      lineStyle: { width: 2, color: item.color },
      itemStyle: { color: item.color },
      areaStyle: item.area ? { color: 'rgba(22,119,255,0.12)' } : undefined,
      /**
       * 阈值线只挂在第一条序列上。markLine 属于 series 而不是全局配置，
       * 挂多份会画出重影；挂第一条是 ECharts 的惯例做法。
       */
      markLine:
        index === 0 && thresholds.length > 0
          ? {
              silent: true,
              symbol: 'none',
              animation: false,
              lineStyle: { type: 'dashed', width: 1 },
              label: { position: 'insideEndTop', fontSize: 11 },
              data: thresholds.map((threshold) => ({
                yAxis: threshold.value,
                lineStyle: { color: threshold.color },
                label: { formatter: threshold.label, color: threshold.color },
              })),
            }
          : undefined,
    })),
  }
}
