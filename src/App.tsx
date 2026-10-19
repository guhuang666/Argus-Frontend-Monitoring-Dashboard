import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router'
import { queryClient } from './api/queryClient'
import { router } from './router'

/**
 * 全局 Provider。注意这里不再渲染任何页面 ——
 * 页面由 RouterProvider 按地址栏决定，App 只负责挂"环境"。
 *
 * queryClient 从 api/queryClient.ts 引入（而不是在这里 new）：
 * 登录页和退出按钮需要调用 queryClient.clear()，它们拿不到局部变量。
 */
export default function App() {
  return (
    <ConfigProvider locale={zhCN}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ConfigProvider>
  )
}
