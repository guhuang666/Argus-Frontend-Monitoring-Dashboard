import { useParams } from 'react-router'

/**
 * 当前项目 id，来自路由 `/projects/:projectId/...`。
 *
 * 拿不到时返回空串而不是抛错：布局层可能还没解析出路由（首帧），
 * 抛错会直接白屏。空串的语义是"还没确定是哪个项目"，
 * 所有查询钩子都对空串做了 enabled: false —— 不发请求，而不是发一个必然 400 的请求。
 */
export function useProjectId(): string {
  const { projectId } = useParams()
  return projectId ?? ''
}

/** localStorage 里记住上次选的项目，key 前缀避免和其它站点配置撞车 */
const STORAGE_KEY = 'argus:lastProjectId'

/**
 * 记住上次选的项目。
 *
 * 为什么值得做：这个看板只有一个组织，多项目之间切换是高频动作（对比环境、
 * 对比两条业务线）。每次刷新都回到第一个项目，等于每次都要多点一次下拉框。
 *
 * 读的时候不做校验：存的 id 可能已被删掉，ProjectEntryPage 会拿列表核对，
 * 对不上就退回第一个 —— 让无效值自然失效，比在这里加一套清理逻辑简单。
 */
export function rememberProjectId(projectId: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, projectId)
  } catch {
    // 隐私模式 / 禁用存储时 setItem 会抛。记住偏好是锦上添花，不值得因此报错
  }
}

export function readRememberedProjectId(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

/**
 * 项目内的相对路径 → 绝对路径。
 *
 * 集中一处拼接，是为了让"所有页面都在 /projects/:id 之下"这件事只有一份实现：
 * 将来改成 /orgs/:orgId/projects/:projectId 时，只改这一个函数。
 */
export function projectPath(projectId: string, suffix: string): string {
  const clean = suffix.startsWith('/') ? suffix : `/${suffix}`
  return projectId === '' ? clean : `/projects/${projectId}${clean}`
}
