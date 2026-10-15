import { Card } from 'antd'

/**
 * 页面外壳：统一的标题 + 说明 + 白底卡片。
 *
 * 两个页面只有"取什么数据、显示哪些列"不同，外框完全一致，
 * 所以外框放这里，页面文件里只留表格本身。
 *
 * 卡片高度撑满可视区，表格分页器才能贴着底部；
 * 否则数据少的时候分页器会浮在屏幕中间。
 */
export default function PageShell({
  title,
  description,
  children,
}: {
  title: string
  /** 右上角区域。允许传 JSX（例如"共 N 条 + 刷新按钮"），所以是 ReactNode 而不是 string */
  description?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Card
      title={title}
      extra={description}
      style={{ minHeight: 'calc(100vh - 96px)' }}
      styles={{ body: { paddingTop: 16 } }}
    >
      {children}
    </Card>
  )
}
