import { Navigate, Outlet, useLocation } from 'react-router'
import { getToken } from '../auth/token'

/**
 * 登录守卫：没凭据就送回登录页。
 *
 * ── 为什么这**不是**安全措施 ────────────────────────────────────────────
 * 它只是体验优化（省掉一屏"加载失败"）。真正的门在服务端：每个读接口都要求
 * JWT，且要校验项目归属。前端路由守卫可以被任何一个改了 devtools 的人绕过 ——
 * 绕过之后他看到的仍然是 401，因为数据根本不会发过来。
 *
 * 反过来，如果某天有人把后端鉴权删了、只留这个守卫，那就是彻底没防。
 * 这条注释是用来防止那种"优化"的。
 *
 * ── 为什么不在这里校验 token 是否有效 ───────────────────────────────────
 * 校验就要发请求，等于每次进页面多一次等待。这里只看"有没有"，
 * 失效的 token 会在第一次真实请求时得到 401，由 client.ts 统一清理并跳回这里。
 * 少一次往返，且行为完全一样。
 */
export default function RequireAuth() {
  const location = useLocation()

  if (getToken() === undefined) {
    // 把来源路径带过去：登录成功后可以回到用户原本想去的页面
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
