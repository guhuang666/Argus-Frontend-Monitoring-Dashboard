import { createBrowserRouter, Navigate } from 'react-router'
import AppLayout from './components/AppLayout'
import RequireAuth from './components/RequireAuth'
import ErrorEventsPage from './pages/ErrorEventsPage'
import IssueDetailPage from './pages/IssueDetailPage'
import IssuesPage from './pages/IssuesPage'
import LoginPage from './pages/LoginPage'
import PerformancePage from './pages/PerformancePage'
import ProjectEntryPage from './pages/ProjectEntryPage'

/**
 * 路由表。用 createBrowserRouter（数据路由）而不是 BrowserRouter + Routes：
 * 前者是 v6.4 之后的主推形态，以后要加 loader / errorElement 不用改结构。
 *
 * ── 三层结构 ────────────────────────────────────────────────────────────
 *   /login                公开，不进布局（没有导航栏和项目切换器）
 *   /  → RequireAuth      没凭据就送回 /login（体验优化，真正的门在服务端）
 *      → AppLayout        顶部导航 + 项目切换器
 *      → /projects/:projectId/...   全部业务页面
 *
 * ── 为什么一切都挂在 /projects/:projectId 下 ─────────────────────────────
 * 从 M4 起看板是多租户的：每一条数据都属于某个项目，所以"看哪个项目"必须是
 * 地址的一部分，而不是某个组件的内部状态。这样才有：
 *   · 可分享 —— 把链接发同事，他看到的是同一个项目
 *   · 可刷新 —— F5 之后还在原项目、原页面
 *   · 可后退 —— 切项目进历史记录，浏览器后退键符合直觉
 *
 * 问题（issues）是「异常」的上层视角：异常看一次发生了什么，
 * 问题看哪些错误在反复发生。
 */
export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: <RequireAuth />,
    children: [
      {
        // 无 path 的布局路由：它自己不出现在地址里，只负责套外框
        element: <AppLayout />,
        children: [
          // 根路径不直接渲染页面：先查项目列表，再决定去哪个项目的 /errors
          { index: true, element: <ProjectEntryPage /> },
          {
            path: 'projects/:projectId',
            children: [
              // /projects/xxx 本身没有页面，统一进异常列表
              { index: true, element: <Navigate to="errors" replace /> },
              { path: 'errors', element: <ErrorEventsPage /> },
              { path: 'issues', element: <IssuesPage /> },
              { path: 'issues/:id', element: <IssueDetailPage /> },
              { path: 'performance', element: <PerformancePage /> },
              // 项目内的未知子路径：回到这个项目的异常列表，而不是把用户扔到别的项目
              { path: '*', element: <Navigate to="errors" replace /> },
            ],
          },
          // 兜底：手输错地址（连 /projects 都没有）时交给入口页重新决定
          { path: '*', element: <ProjectEntryPage /> },
        ],
      },
    ],
  },
])
