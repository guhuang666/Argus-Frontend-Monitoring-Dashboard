import { Layout, Menu } from 'antd'
import { NavLink, Outlet, useLocation } from 'react-router'

const { Header, Content } = Layout

const NAV_ITEMS = [
  { key: '/errors', label: '异常' },
  { key: '/issues', label: '问题' },
  { key: '/performance', label: '性能' },
]

/**
 * 全局外框：顶部导航 + 内容区。
 *
 * 导航用 antd Menu 只为取它的视觉，实际跳转交给 react-router 的 NavLink ——
 * 这样地址栏、前进后退、刷新都正常，不依赖组件库自己的路由集成。
 */
export default function AppLayout() {
  const location = useLocation()

  // 用路径段匹配而不是全等：以后加 /errors/:id 这类子页面时，
  // 父级菜单项仍然保持高亮，不用回来改这里
  const selectedKey =
    NAV_ITEMS.find((item) => location.pathname.startsWith(item.key))?.key ?? '/errors'

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
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
        <Menu
          theme="dark"
          mode="horizontal"
          selectedKeys={[selectedKey]}
          style={{ flex: 1, minWidth: 0 }}
          items={NAV_ITEMS.map((item) => ({
            key: item.key,
            label: <NavLink to={item.key}>{item.label}</NavLink>,
          }))}
        />
      </Header>
      <Content style={{ padding: 16 }}>
        <Outlet />
      </Content>
    </Layout>
  )
}
