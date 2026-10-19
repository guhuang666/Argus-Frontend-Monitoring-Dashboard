import { Avatar, Dropdown, Layout, Menu, Space, Typography } from 'antd'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { logout } from '../api/auth'
import { queryClient } from '../api/queryClient'
import { useMe } from '../api/queries'
import { clearToken } from '../auth/token'
import ProjectSelect from './ProjectSelect'
import { projectPath, useProjectId } from '../utils/project'

const { Header, Content } = Layout
const { Text } = Typography

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
 * 全局外框：顶部导航 + 项目切换器 + 用户菜单 + 内容区。
 *
 * 导航用 antd Menu 只为取它的视觉，实际跳转交给 react-router 的 NavLink ——
 * 这样地址栏、前进后退、刷新都正常，不依赖组件库自己的路由集成。
 */
export default function AppLayout() {
  const projectId = useProjectId()
  const location = useLocation()
  const navigate = useNavigate()
  const { data: me } = useMe()

  // 高亮哪一项：先把 "/projects/<id>" 前缀去掉，剩下的按路径段前缀匹配。
  // 用去前缀后的相对路径、而不是直接匹配全路径 —— 项目 id 是动态的，
  // 写死 startsWith('/issues') 在 /projects/xxx/issues 上永远不成立。
  const rest = location.pathname.replace(/^\/projects\/[^/]+/, '') || '/'
  const selectedKey = NAV_ITEMS.find((item) => rest.startsWith(item.key))?.key ?? '/errors'

  /**
   * 退出登录。
   *
   * 顺序不能反：**先请求服务端、再清本地凭据**。
   * 先清的话请求带不上 token，服务端那条审计日志就丢了（虽然它现在是空操作）。
   *
   * 用 try/finally 包住：即使登出请求失败（后端挂了），本地也必须清干净 ——
   * 否则用户点了"退出"却还停在登录状态，这是最让人困惑的一种"没反应"。
   */
  async function handleLogout(): Promise<void> {
    try {
      await logout()
    } catch {
      // 忽略：服务端不可达时，本地登出仍然必须完成
    } finally {
      clearToken()
      queryClient.clear()
      navigate('/login', { replace: true })
    }
  }

  const email = me?.email ?? ''
  // MVP-B：一个用户只属于一个组织，所以直接读 organization（不再是数组）
  const orgName = me?.organization?.name

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

        <Dropdown
          menu={{
            items: [
              {
                key: 'org',
                label: orgName !== undefined ? `组织：${orgName}` : '组织：—',
                disabled: true,
              },
              { type: 'divider' },
              { key: 'logout', label: '退出登录', danger: true, onClick: () => void handleLogout() },
            ],
          }}
          placement="bottomRight"
        >
          <Space style={{ color: '#fff', cursor: 'pointer' }} size={8}>
            <Avatar size={28} style={{ background: '#1677ff' }}>
              {(email[0] ?? '?').toUpperCase()}
            </Avatar>
            <Text style={{ color: 'rgba(255,255,255,0.85)', maxWidth: 180 }} ellipsis>
              {email === '' ? '加载中…' : email}
            </Text>
          </Space>
        </Dropdown>
      </Header>
      <Content style={{ padding: 16 }}>
        <Outlet />
      </Content>
    </Layout>
  )
}
