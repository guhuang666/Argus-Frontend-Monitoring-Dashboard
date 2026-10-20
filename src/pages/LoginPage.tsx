import { Alert, Button, Card, Form, Input, Tabs, Typography } from 'antd'
import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { login, register } from '../api/auth'
import { ApiError } from '../api/client'
import { queryClient } from '../api/queryClient'
import { getToken, setToken } from '../auth/token'

const { Title } = Typography

/**
 * 登录 / 注册（FR-5.4）。
 *
 * ── 为什么登录和注册在同一页的两个 Tab 里 ────────────────────────────────
 * 这个看板没有"官网首页"这个环节：用户要么已经有账号，要么第一次来。
 * 分成两个路由会让第一次来的人先撞到登录页、再去找"注册在哪"。
 *
 * ── 注册现在不建项目，也不再显示密钥 ────────────────────────────────────
 * 注册只做两件事：建账号、建组织。项目与密钥走「新建项目」那一步。
 *
 * 这么改之前，注册会顺手建一个叫「默认项目」的东西并把私钥在一个
 * "注册成功"页上显示一次 —— 那一步用户还没想好要监控什么，
 * 私钥几乎没人会认真抄，而「默认项目」这个名字又改不掉。
 * 拆开之后：注册 → 看板提示"还没有项目" → 点「新建项目」→ 填名字 → 拿密钥。
 * 私钥仍然只显示一次，但那一次是用户主动触发的，他知道自己在看什么。
 */
export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** 登录成功后回到用户原本想去的页面（由 RequireAuth 带过来的 state） */
  const from = (location.state as { from?: string } | null)?.from
  const target = from !== undefined && from !== '' && from !== '/login' ? from : '/'

  // 已经登录的人不该再看到登录页（比如手输 /login，或点了浏览器后退）
  if (getToken() !== undefined) {
    return <Navigate to={target} replace />
  }

  /** 收尾三件套：存凭据 → 清掉上一个账号的缓存 → 走 */
  function enter(token: string): void {
    setToken(token)
    // 不清缓存的话，换账号登录会先看到上一个账号的项目数据（缓存命中）。
    // 详见 api/queryClient.ts 的注释
    queryClient.clear()
    navigate(target, { replace: true })
  }

  async function handleLogin(values: { email: string; password: string }): Promise<void> {
    setSubmitting(true)
    setError(null)
    try {
      const result = await login(values.email.trim(), values.password)
      enter(result.access_token)
    } catch (err) {
      // 登录页的 401 是"密码错了"，不是"登录失效" —— client.ts 对公开接口
      // 刻意不做跳转，所以这里能拿到真实的错误信息显示出来
      setError(err instanceof ApiError ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRegister(values: {
    email: string
    password: string
    display_name?: string
    organization_name?: string
  }): Promise<void> {
    setSubmitting(true)
    setError(null)
    try {
      const result = await register({
        email: values.email.trim(),
        password: values.password,
        display_name: values.display_name?.trim() || undefined,
        organization_name: values.organization_name?.trim() || undefined,
      })
      // 注册直接进看板：没有私钥需要停留展示，落地的空状态会引导去建项目
      enter(result.access_token)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f5f5f5',
        padding: 24,
      }}
    >
      <Card style={{ width: '100%', maxWidth: 420 }}>
        <Title level={4} style={{ marginTop: 0 }}>
          Argus 看板
        </Title>

        {error !== null && (
          <Alert
            type="error"
            showIcon
            closable
            message={error}
            onClose={() => setError(null)}
            style={{ marginBottom: 16 }}
          />
        )}

        <Tabs
          activeKey={tab}
          onChange={(key) => {
            setTab(key as 'login' | 'register')
            // 切 Tab 时清掉上一个 Tab 的报错，否则会看到"注册"页上挂着
            // "邮箱或密码不正确"，容易以为是这次提交的结果
            setError(null)
          }}
          items={[
            {
              key: 'login',
              label: '登录',
              children: (
                <Form layout="vertical" onFinish={handleLogin} requiredMark={false}>
                  <Form.Item
                    name="email"
                    label="邮箱"
                    rules={[
                      { required: true, message: '请输入邮箱' },
                      { type: 'email', message: '邮箱格式不正确' },
                    ]}
                  >
                    <Input autoComplete="username" placeholder="admin@argus.local" />
                  </Form.Item>
                  <Form.Item
                    name="password"
                    label="密码"
                    rules={[{ required: true, message: '请输入密码' }]}
                  >
                    <Input.Password autoComplete="current-password" />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" block loading={submitting}>
                    登录
                  </Button>
                </Form>
              ),
            },
            {
              key: 'register',
              label: '注册',
              children: (
                <Form layout="vertical" onFinish={handleRegister} requiredMark={false}>
                  <Form.Item
                    name="email"
                    label="邮箱"
                    rules={[
                      { required: true, message: '请输入邮箱' },
                      { type: 'email', message: '邮箱格式不正确' },
                    ]}
                  >
                    <Input autoComplete="username" placeholder="you@example.com" />
                  </Form.Item>
                  <Form.Item
                    name="password"
                    label="密码"
                    rules={[
                      { required: true, message: '请输入密码' },
                      { min: 8, message: '至少 8 位' },
                    ]}
                    extra="注册后会建好你的组织；项目在下一步单独创建并发放密钥"
                  >
                    <Input.Password autoComplete="new-password" />
                  </Form.Item>
                  <Form.Item name="display_name" label="显示名（可空）">
                    <Input placeholder="张三" />
                  </Form.Item>
                  <Form.Item name="organization_name" label="组织名（可空，默认用邮箱前缀）">
                    <Input placeholder="我的公司" />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" block loading={submitting}>
                    注册
                  </Button>
                </Form>
              ),
            },
          ]}
        />
      </Card>
    </div>
  )
}
