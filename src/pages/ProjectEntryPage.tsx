import { Alert, Empty, Spin } from 'antd'
import { Navigate } from 'react-router'
import { useProjects } from '../api/queries'
import { projectPath, readRememberedProjectId } from '../utils/project'

/**
 * 站点根路径 `/` 的落地页：决定"打开看板先看哪个项目"。
 *
 * 规则：上次选过的项目 > 列表里的第一个。
 * 用 <Navigate> 而不是在 useEffect 里调 navigate —— 前者在渲染阶段就完成重定向，
 * 用户看不到一闪而过的空白页；后者会先渲染一帧再跳。
 *
 * 判断"上次选的项目还在不在"是必要的：项目被删掉之后 localStorage 里还留着旧 id，
 * 直接跳过去会得到一个满屏 404 的页面，看起来像整个看板坏了。
 */
export default function ProjectEntryPage() {
  const { data, isPending, isError, error } = useProjects()

  if (isError) {
    return (
      <Alert
        type="error"
        showIcon
        message="无法加载项目列表"
        description={
          <>
            <div>{error instanceof Error ? error.message : String(error)}</div>
            <div style={{ marginTop: 8 }}>
              如果是首次运行：先在 backend 目录跑 <code>npm run seed</code>，再刷新本页。
            </div>
          </>
        }
      />
    )
  }

  if (isPending || data === undefined) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
        <Spin tip="加载项目…" />
      </div>
    )
  }

  if (data.items.length === 0) {
    return (
      <Empty
        description={
          <>
            还没有任何项目。
            <br />
            在 backend 目录跑 <code>npm run project:new -- "项目名"</code> 新建一个，然后刷新本页。
          </>
        }
      />
    )
  }

  const remembered = readRememberedProjectId()
  const target = data.items.find((item) => item.id === remembered) ?? data.items[0]

  return <Navigate to={projectPath(target.id, '/errors')} replace />
}
