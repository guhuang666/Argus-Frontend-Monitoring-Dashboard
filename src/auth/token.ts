/**
 * 登录凭据的本地存储。
 *
 * ── 为什么放 localStorage 而不是 Cookie ───────────────────────────────────
 * Cookie 要好用就必须处理 CORS 凭证（`credentials: 'include'` +
 * `Access-Control-Allow-Credentials` + 不能用通配 origin），而且一旦配置写错，
 * 表现是"请求都发了、后端收不到 Cookie"，极难看出原因。
 * 对单机部署的看板，localStorage + Authorization 头是最短且最不容易错的路径。
 *
 * 代价必须说清楚：
 *   ① **XSS 能读走它**。这是 localStorage 的原罪，Cookie 加 HttpOnly 才免疫
 *   ② 所以它要求前端没有 XSS。React 默认转义 + 不用 dangerouslySetInnerHTML
 *      是当前的主要防线；真正的加固是 CSP，属于部署阶段的事
 *
 * 一个好处是它天然不随跨域请求自动发送 —— 不会出现 CSRF 那种
 * "你打开一个恶意网页，它替你发了请求"的问题。
 */

const TOKEN_KEY = 'argus:token';

export function getToken(): string | undefined {
  try {
    const value = window.localStorage.getItem(TOKEN_KEY);
    return value === null || value === '' ? undefined : value;
  } catch {
    // 隐私模式 / 禁用存储：当作未登录处理，而不是让整个应用崩掉
    return undefined;
  }
}

export function setToken(token: string): void {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // 存不进去的后果是"刷新后要重新登录"，不该阻断当前这次登录
  }
}

export function clearToken(): void {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // 同上：清不掉也不该抛
  }
}
