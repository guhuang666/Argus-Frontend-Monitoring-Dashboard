import { clearToken, getToken } from '../auth/token'

/**
 * 统一的 HTTP 出口。看板所有请求都从这里走。
 *
 * 基址是相对路径 /api，靠 vite.config.ts 里的 dev 代理转到 localhost:3000。
 * 好处是浏览器视角下始终同源：开发期没有跨域与预检，
 * 将来把看板和后端部署到同一域名下也不用改代码。
 */

const BASE = '/api'

/** 查询参数。数值直接传，序列化交给 URLSearchParams */
export type QueryParams = Record<string, string | number>

/**
 * 带状态码的错误。
 *
 * 为什么要带 status 而不是只有 message：调用方需要区分"登录失效（401）"
 * 和"参数错了（400）"和"服务没起（0）"。把这些差异压成一句字符串，
 * 上层就只能靠正则去猜 —— 那种代码在改文案的当天就会坏。
 */
export class ApiError extends Error {
  // 注意：不能写成构造函数参数属性 `constructor(msg, readonly status)` ——
  // tsconfig 开了 erasableSyntaxOnly（Vite 只做类型擦除、不生成运行时代码），
  // 参数属性属于"会生成代码"的语法，会被直接拒绝
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function buildUrl(path: string, params?: QueryParams): string {
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params ?? {})) {
    qs.set(key, String(value))
  }
  const query = qs.toString()
  return `${BASE}${path}${query ? `?${query}` : ''}`
}

interface SendOptions {
  params?: QueryParams
  body?: unknown
  /** 是否附带登录凭据。登录/注册接口必须传 false */
  auth: boolean
}

/**
 * 发请求 + 统一错误处理。
 *
 * ⚠️ fetch 只在网络层失败时 reject；HTTP 4xx / 5xx 是**正常 resolve** 的。
 * 不自己判 res.ok 的话，后端返回 400 时页面会拿着错误响应当数据用，
 * 表格显示空白却不报错 —— 这比直接报错更难排查。
 */
async function send<T>(method: string, path: string, options: SendOptions): Promise<T> {
  const token = options.auth ? getToken() : undefined
  const headers: Record<string, string> = {}
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token !== undefined) headers['Authorization'] = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(buildUrl(path, options.params), {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
  } catch {
    // 代理目标没起来时，Vite 会让请求直接失败（TypeError: Failed to fetch）
    throw new ApiError('无法连接到后端服务，请确认后端已在 localhost:3000 启动', 0)
  }

  // ── 401 的两种含义，必须分开处理 ──
  //   带 token 的请求 401 = 这份 token 已失效（过期 / 改了密钥 / 账号被停用）
  //     → 清掉凭据、回登录页。继续留在页面上只会看到一屏"加载失败"
  //   不带 token 的请求 401 = 用户名或密码不对
  //     → 交给登录页自己显示，绝不能跳转（那会把用户刚输入的内容清空、
  //        而且看起来像"什么都没发生"）
  if (res.status === 401 && token !== undefined) {
    clearToken()
    if (!window.location.pathname.startsWith('/login')) {
      // 用整页跳转而不是 router.navigate：这个文件不在 React 树里拿不到 navigate，
      // 而"整页重载"在语义上也更合适 —— 旧用户的全部内存状态都该被丢掉
      window.location.assign('/login')
    }
    throw new ApiError('登录已失效，请重新登录', 401)
  }

  if (!res.ok) {
    throw new ApiError(`请求失败（HTTP ${res.status}）：${await readErrorMessage(res)}`, res.status)
  }

  // 204 No Content（比如登出）没有响应体，json() 会抛
  if (res.status === 204) return undefined as T

  try {
    return (await res.json()) as T
  } catch {
    // 代理目标不可用或返回了 HTML 错误页时，json() 会抛 SyntaxError
    throw new ApiError(`响应不是合法 JSON（HTTP ${res.status}），请检查 /api 代理目标是否可用`, res.status)
  }
}

/** 需要登录的 GET（看板的全部查询都走这里） */
export function request<T>(path: string, params?: QueryParams): Promise<T> {
  return send<T>('GET', path, { params, auth: true })
}

/** 需要登录的 POST */
export function postJson<T>(path: string, body?: unknown): Promise<T> {
  return send<T>('POST', path, { body, auth: true })
}

/**
 * 不需要登录的 POST —— 只有登录和注册用。
 *
 * 单独一个函数而不是传个 `auth: false` 参数：让"哪些接口是公开的"
 * 在这个文件里一眼可数。传布尔值的话，那个 false 会散落在各个调用点，
 * 想审计"有没有把某个接口误标成公开"就得全文搜索。
 */
export function postJsonPublic<T>(path: string, body?: unknown): Promise<T> {
  return send<T>('POST', path, { body, auth: false })
}

/** 从错误响应里尽量挖出一句人话，挖不到就退回状态文本 */
async function readErrorMessage(res: Response): Promise<string> {
  try {
    const body: unknown = await res.json()
    if (typeof body === 'object' && body !== null) {
      const message = (body as { message?: unknown }).message
      if (typeof message === 'string') return message
      // class-validator 校验失败时 message 是字符串数组
      if (Array.isArray(message)) return message.join('；')
    }
  } catch {
    // 响应体不是 JSON，用状态文本兜底
  }
  return res.statusText || '未知错误'
}
