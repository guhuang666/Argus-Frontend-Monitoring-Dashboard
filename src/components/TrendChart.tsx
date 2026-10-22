import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { init, use, type ECharts, type EChartsCoreOption } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { useEffect, useRef } from 'react'

/**
 * 按需引入，而不是 `import * as echarts from 'echarts'`。
 *
 * 完整包会把地图、关系图、3D 那些全部打进产物（gzip 后仍有 300 KB+），
 * 这个项目只画一条折线，用不到。这里只注册折线图 + 坐标轴 + 提示框 + Canvas 渲染器。
 * 以后要加柱状图/饼图，回来往 use([...]) 里追加即可，不用改结构。
 */
use([LineChart, GridComponent, TooltipComponent, CanvasRenderer])

interface TrendChartProps {
  /** x 轴标签。由调用方按 range 决定格式（HH:mm / MM-DD / MM-DD HH:mm） */
  labels: string[]
  /** 与 labels 等长的数值，单位是"条" */
  values: number[]
  /** 图表高度，默认 320 */
  height?: number
}

/**
 * 趋势折线。
 *
 * ── 为什么用 category 轴而不是 time 轴 ──────────────────────────────────
 * 后端返回的趋势是**等距补零**过的（没有事件的小时也在数组里，值为 0），
 * 所以 category 轴画出来与 time 轴完全一致，却省掉了"时间字符串 → 轴刻度"
 * 的一层转换，tooltip 里的表头也直接就是人话（"10-21 14:00"）。
 * 哪天后端改成只返回有数据的点，这里必须换回 time 轴，否则间隔会被压扁。
 *
 * ── 生命周期 ────────────────────────────────────────────────────────────
 * 实例只在挂载时 init 一次，数据变化走 setOption；卸载时 dispose。
 * 不 dispose 的话，切路由再回来会泄漏一个 canvas 和一个 resize 监听。
 */
export default function TrendChart({ labels, values, height = 320 }: TrendChartProps) {
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

  // 数据变化：整份替换（notMerge=true），避免上一次的 y 轴范围残留
  useEffect(() => {
    const chart = chartRef.current
    if (chart === null) return
    chart.setOption(buildOption(labels, values), true)
  }, [labels, values])

  return <div ref={containerRef} style={{ width: '100%', height }} />
}

function buildOption(labels: string[], values: number[]): EChartsCoreOption {
  return {
    grid: { left: 48, right: 20, top: 24, bottom: 32 },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line' },
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
      // 事件数是整数：不设 minInterval 的话，最大值 3 时 y 轴会出现 0.5 这种刻度
      minInterval: 1,
      splitLine: { lineStyle: { color: 'rgba(0,0,0,0.06)' } },
      axisLabel: { color: 'rgba(0,0,0,0.55)' },
    },
    series: [
      {
        type: 'line',
        name: '错误数',
        data: values,
        showSymbol: false,
        smooth: 0.2,
        lineStyle: { width: 2, color: '#1677ff' },
        areaStyle: { color: 'rgba(22,119,255,0.12)' },
      },
    ],
  }
}
