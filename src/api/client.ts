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

function buildUrl(path: string, params?: QueryParams): string {
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params ?? {})) {
    qs.set(key, String(value))
  }
  const query = qs.toString()
  return `${BASE}${path}${query ? `?${query}` : ''}`
}

/**
 * 发一个 GET 请求并解析 JSON。
 *
 * ⚠️ fetch 只在网络层失败时 reject；HTTP 4xx / 5xx 是**正常 resolve** 的。
 * 不自己判 res.ok 的话，后端返回 400 时页面会拿着错误响应当数据用，
 * 表格显示空白却不报错 —— 这比直接报错更难排查。
 *
 * 错误对象里带上 status 与后端返回的 message，让错误态能显示人话：
 * NestJS 的异常体形如 { statusCode, message, error }，
 * 其中 message 可能是字符串，也可能是校验失败时的字符串数组。
 */
export async function request<T>(path: string, params?: QueryParams): Promise<T> {
  const url = buildUrl(path, params)

  let res: Response
  try {
    res = await fetch(url)
  } catch {
    // 代理目标没起来时，Vite 会让请求直接失败（TypeError: Failed to fetch）
    throw new Error('无法连接到后端服务，请确认后端已在 localhost:3000 启动')
  }

  if (!res.ok) {
    throw new Error(`请求失败（HTTP ${res.status}）：${await readErrorMessage(res)}`)
  }

  try {
    return (await res.json()) as T
  } catch {
    // 代理目标不可用或返回了 HTML 错误页时，json() 会抛 SyntaxError
    throw new Error(`响应不是合法 JSON（HTTP ${res.status}），请检查 /api 代理目标是否可用`)
  }
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
