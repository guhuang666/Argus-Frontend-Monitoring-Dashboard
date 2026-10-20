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

/**
 * 项目内的相对路径 → 绝对路径。
 *
 * 集中一处拼接，是为了让"所有页面都在 /projects/:id 之下"这件事只有一份实现：
 * 将来改成 /orgs/:orgId/projects/:projectId 时，只改这一个函数。
 *
 * 注：这里曾经还有一对 `rememberProjectId` / `readRememberedProjectId`，
 * 用来把"上次访问的项目"记进 localStorage、并在落地时自动跳过去。
 * 落地页改成项目列表之后，没有任何地方再读这个值了 ——
 * 一个只写不读的 localStorage 键属于纯噪音，所以整段删掉。
 */
export function projectPath(projectId: string, suffix: string): string {
  const clean = suffix.startsWith('/') ? suffix : `/${suffix}`
  return projectId === '' ? clean : `/projects/${projectId}${clean}`
}
