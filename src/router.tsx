import { createBrowserRouter, Navigate } from 'react-router'
import AppLayout from './components/AppLayout'
import ErrorEventsPage from './pages/ErrorEventsPage'
import IssueDetailPage from './pages/IssueDetailPage'
import IssuesPage from './pages/IssuesPage'
import PerformancePage from './pages/PerformancePage'

/**
 * 路由表。用 createBrowserRouter（数据路由）而不是 BrowserRouter + Routes：
 * 前者是 v6.4 之后的主推形态，以后要加 loader / errorElement 不用改结构。
 *
 * 路径与应用内调用后端的接口路径（/api/v1/...）刻意错开，
 * 将来把看板与后端放到同一个域名下时不会互相抢路由。
 *
 * 问题（issues）是「异常」的上层视角：异常看一次发生了什么，
 * 问题看哪些错误在反复发生。所以 issues 放在 errors 之后、performance 之前。
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/errors" replace /> },
      { path: 'errors', element: <ErrorEventsPage /> },
      { path: 'issues', element: <IssuesPage /> },
      { path: 'issues/:id', element: <IssueDetailPage /> },
      { path: 'performance', element: <PerformancePage /> },
      // 兜底：手输错地址不至于白屏
      { path: '*', element: <Navigate to="/errors" replace /> },
    ],
  },
])
