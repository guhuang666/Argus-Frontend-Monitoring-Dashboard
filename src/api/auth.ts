import { postJson, postJsonPublic, request } from './client'

/**
 * 鉴权接口的类型与调用（FR-5.4）。
 *
 * 字段一律 snake_case，与后端保持一致 —— 后端在 toApiRow / 返回值里统一用了
 * snake_case（ingest、issues、projects 都是），这里没有理由例外。
 */

export interface AuthUserRow {
  id: string
  email: string
  display_name: string | null
  created_at: string
}

export interface LoginResult {
  access_token: string
  token_type: 'Bearer'
  expires_in: number
  user: AuthUserRow
}

/**
 * 注册结果。
 *
 * ⚠️ **没有 project / secret_key_once** —— 注册只建账号 + 组织。
 * 项目和密钥要走 POST /api/v1/projects 单独创建。
 * 这么设计的原因见后端 auth.service.ts 的 register() 注释：
 * 替用户先建一个叫「默认项目」的东西、再发一对他还没准备好的密钥，
 * 结果是第一个项目永远是没意义的名字，而私钥在那一次几乎没人抄下来。
 */
export interface RegisterResult extends LoginResult {
  organization: { id: string; name: string; slug: string }
  /** MVP-B：角色挂在用户上。注册者是自己组织的 owner */
  role: string
}

export interface MeResult {
  id: string
  email: string
  display_name: string | null
  is_active: boolean
  /** owner / admin / member（FR-5.5）。目前只有 owner / admin 能新建项目 */
  role: string
  created_at: string
  last_login_at: string | null
  /**
   * 所属组织（MVP-B：一个用户只属于一个组织，所以是单个对象）。
   * 之前是 `organizations: []` 数组 —— 留着它前端就要写 `[0]`，
   * 而那个 `[0]` 会让"其实应该是 1 个"这件事看不出来。
   */
  organization: { id: string; name: string; slug: string }
}

/** 公开接口：不带 token，401 也不会触发跳转（见 client.ts 里的说明） */
export function login(email: string, password: string): Promise<LoginResult> {
  return postJsonPublic<LoginResult>('/v1/auth/login', { email, password })
}

/** 公开接口：注册 = 建账号 + 建组织 + 建默认项目 + 发一对密钥 */
export function register(input: {
  email: string
  password: string
  display_name?: string
  organization_name?: string
}): Promise<RegisterResult> {
  return postJsonPublic<RegisterResult>('/v1/auth/register', input)
}

/** 需要登录。服务端是空操作（JWT 无状态），主要作用是留审计日志 */
export function logout(): Promise<void> {
  return postJson<void>('/v1/auth/logout')
}

/** 需要登录。看板启动时用它确认"我是谁"，失败会走 401 清凭据流程 */
export function fetchMe(): Promise<MeResult> {
  return request<MeResult>('/v1/auth/me')
}
