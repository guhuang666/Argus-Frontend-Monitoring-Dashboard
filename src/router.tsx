import { createBrowserRouter, Navigate } from 'react-router'
import AppLayout from './components/AppLayout'
import RequireAuth from './components/RequireAuth'
import ErrorEventsPage from './pages/ErrorEventsPage'
import IssueDetailPage from './pages/IssueDetailPage'
import IssuesPage from './pages/IssuesPage'
import LoginPage from './pages/LoginPage'
import PerformancePage from './pages/PerformancePage'
import ProjectsPage from './pages/ProjectsPage'

/**
 * 路由表。用 createBrowserRouter（数据路由）而不是 BrowserRouter + Routes：
 * 前者是 v6.4 之后的主推形态，以后要加 loader / errorElement 不用改结构。
 *
 * ── 两层结构 ────────────────────────────────────────────────────────────
 *   /login                公开，不进布局（没有顶栏）
 *   /  → RequireAuth      没凭据就送回 /login（体验优化，真正的门在服务端）
 *      → AppLayout        顶栏（只有项目内页面才显示切换器与菜单）
 *      → index  项目列表  ← 登录后的落地页
 *      → /projects/:projectId/...   某个项目的业务页面
 *
 * ── 为什么落地页是项目列表，而不是自动跳进某个项目 ──────────────────────
 * 上一版 `/` 是个"重定向页"：查完项目列表立刻跳进第一个（或上次那个）项目，
 * 于是**人从来没机会看到自己有哪些项目** —— 项目只藏在右上角的小下拉里。
 * 多租户做完之后项目是一等公民，落地页应该给它：一眼看到几个项目、
 * 哪个有问题、哪个刚建还没数据。
 *
 * ── 为什么项目页都挂在 /projects/:projectId 下 ──────────────────────────
 * "看哪个项目"必须是地址的一部分，而不是组件的内部状态。这样才有：
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
          // 登录后的落地页：项目列表（不再自动重定向到某个项目）
          { index: true, element: <ProjectsPage /> },
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
          // 兜底：手输错地址 → 回项目列表，而不是渲染一个"看起来正常"的页面
          { path: '*', element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
])
