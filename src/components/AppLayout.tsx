import { Layout, Menu } from 'antd'
import { NavLink, Outlet, useLocation } from 'react-router'
import ProjectSelect from './ProjectSelect'
import { projectPath, useProjectId } from '../utils/project'

const { Header, Content } = Layout

/**
 * 导航项。key 是**项目内的相对路径**，实际跳转时再拼上 /projects/:projectId。
 * 这样导航表本身与"当前是哪个项目"无关，切项目时只需要重新拼接。
 */
const NAV_ITEMS = [
  { key: '/errors', label: '异常' },
  { key: '/issues', label: '问题' },
  { key: '/performance', label: '性能' },
]

/**
 * 全局外框：顶部导航 + 项目切换器 + 内容区。
 *
 * 导航用 antd Menu 只为取它的视觉，实际跳转交给 react-router 的 NavLink ——
 * 这样地址栏、前进后退、刷新都正常，不依赖组件库自己的路由集成。
 */
export default function AppLayout() {
  const projectId = useProjectId()
  const location = useLocation()

  // 高亮哪一项：先把 "/projects/<id>" 前缀去掉，剩下的按路径段前缀匹配。
  // 用去前缀后的相对路径、而不是直接匹配全路径 —— 项目 id 是动态的，
  // 写死 startsWith('/issues') 在 /projects/xxx/issues 上永远不成立。
  const rest = location.pathname.replace(/^\/projects\/[^/]+/, '') || '/'
  const selectedKey = NAV_ITEMS.find((item) => rest.startsWith(item.key))?.key ?? '/errors'

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div
          style={{
            color: '#fff',
            fontSize: 16,
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          Argus 看板
        </div>

        <ProjectSelect />

        {/*
          位置放在切换器右边：先选项目、再选页面，顺序与人的动作一致。
          label 里用 NavLink 而不是 onClick={() => navigate()}：前者是真正的
          <a href>，中键新标签页打开、右键复制链接都正常可用。
        */}
        <Menu
          theme="dark"
          mode="horizontal"
          selectedKeys={[selectedKey]}
          style={{ flex: 1, minWidth: 0 }}
          items={NAV_ITEMS.map((item) => ({
            key: item.key,
            label: <NavLink to={projectPath(projectId, item.key)}>{item.label}</NavLink>,
          }))}
        />
      </Header>
      <Content style={{ padding: 16 }}>
        <Outlet />
      </Content>
    </Layout>
  )
}
