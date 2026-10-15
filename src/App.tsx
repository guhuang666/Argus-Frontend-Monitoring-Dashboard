import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { RouterProvider } from 'react-router'
import { router } from './router'

/**
 * 全局 Provider。注意这里不再渲染任何页面 ——
 * 页面由 RouterProvider 按地址栏决定，App 只负责挂"环境"。
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 看板数据由人工刷新驱动，切回窗口自动重拉会让翻页/滚动位置乱跳
      refetchOnWindowFocus: false,
      // 失败不自动重试：后端没起时应当立刻把错误摆到界面上，
      // 而不是让用户盯着转圈等三次重试
      retry: false,
      staleTime: 30_000,
    },
  },
})

export default function App() {
  return (
    <ConfigProvider locale={zhCN}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ConfigProvider>
  )
}
