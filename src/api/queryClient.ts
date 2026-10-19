import { QueryClient } from '@tanstack/react-query'

/**
 * 全局 QueryClient。
 *
 * 从 App.tsx 抽出来，是因为登录 / 登出时需要 `queryClient.clear()` ——
 * 而那个动作发生的地方（登录页、布局里的退出按钮）拿不到 App 里的局部变量。
 *
 * ── 为什么登录登出必须清缓存 ────────────────────────────────────────────
 * 缓存键是 `['issues', projectId, ...]`，里面**不含用户**。换个账号登录后，
 * 如果不清缓存，新用户会先看到上一个用户的项目数据（缓存命中、不重新请求），
 * 直到他自己点刷新。这是最典型的"看起来正常的数据泄露"。
 * 清缓存比"把 userId 塞进每一个 queryKey"更省事，也更不容易漏。
 */
export const queryClient = new QueryClient({
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
