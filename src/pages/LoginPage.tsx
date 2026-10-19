import { Alert, Button, Card, Divider, Form, Input, Space, Tabs, Typography } from 'antd'
import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { login, register } from '../api/auth'
import type { RegisterResult } from '../api/auth'
import { ApiError } from '../api/client'
import { queryClient } from '../api/queryClient'
import { getToken, setToken } from '../auth/token'

const { Title, Paragraph, Text } = Typography

/**
 * 登录 / 注册（FR-5.4）。
 *
 * ── 为什么登录和注册在同一页的两个 Tab 里 ────────────────────────────────
 * 这个看板没有"官网首页"这个环节：用户要么已经有账号，要么第一次来。
 * 分成两个路由会让第一次来的人先撞到登录页、再去找"注册在哪"。
 *
 * ── 注册成功后的那一屏，是整个 M4 里最重要的界面 ────────────────────────
 * 因为**明文私钥只出现这一次**（库里只有 sha256）。所以注册不直接进看板，
 * 而是停下来把三样东西摆出来：组织名、公钥、私钥，并要求用户点一次确认。
 * 关掉这一屏就再也拿不到了 —— 这一点必须写在界面上，不能只写在文档里。
 */
export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation();
  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [registered, setRegistered] = useState<RegisterResult | null>(null)

  /** 登录成功后回到用户原本想去的页面（由 RequireAuth 带过来的 state） */
  const from = (location.state as { from?: string } | null)?.from
  const target = from !== undefined && from !== '' && from !== '/login' ? from : '/'

  // 已经登录的人不该再看到登录页（比如手输 /login，或点了浏览器后退）
  if (registered === null && getToken() !== undefined) {
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
      // 先不登录：必须让用户把私钥抄走
      setRegistered(result)
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
      <Card style={{ width: '100%', maxWidth: registered === null ? 420 : 620 }}>
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

        {registered === null ? (
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
                      rules={[{ required: true, message: '请输入邮箱' }, { type: 'email', message: '邮箱格式不正确' }]}
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
                      rules={[{ required: true, message: '请输入邮箱' }, { type: 'email', message: '邮箱格式不正确' }]}
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
                      extra="注册后你会得到自己的组织、一个默认项目，以及一对接入密钥"
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
                      注册并创建项目
                    </Button>
                  </Form>
                ),
              },
            ]}
          />
        ) : (
          <RegisteredPanel result={registered} onEnter={() => enter(registered.access_token)} />
        )}
      </Card>
    </div>
  )
}

/**
 * 注册成功后的凭据展示。
 *
 * 三样东西的呈现顺序是有讲究的：**私钥在最上面、最醒目**，因为它是唯一
 * 无法找回的那个。公钥随时能在看板里重新看到，私钥不行。
 */
function RegisteredPanel({ result, onEnter }: { result: RegisterResult; onEnter: () => void }) {
  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Alert
        type="success"
        showIcon
        message="注册成功，组织与项目已创建"
        description={`组织「${result.organization.name}」· 项目「${result.project.name}」`}
      />

      <div>
        <Text strong>私钥（argus_sec_…）</Text>
        <Paragraph type="secondary" style={{ marginBottom: 4, fontSize: 12 }}>
          只显示这一次，关掉就再也拿不到了。它用于**上传 Sourcemap**，只能放在 CI 或本地 .env 里，
          绝不能出现在前端代码或公开仓库。
        </Paragraph>
        <Paragraph copyable={{ text: result.secret_key_once }} code style={{ wordBreak: 'break-all' }}>
          {result.secret_key_once}
        </Paragraph>
      </div>

      <div>
        <Text strong>公钥（argus_pub_…）</Text>
        <Paragraph type="secondary" style={{ marginBottom: 4, fontSize: 12 }}>
          可以公开。它只授权"往这个项目写事件"，贴进浏览器代码是它的正常用途。
        </Paragraph>
        <Paragraph copyable={{ text: result.project.public_key }} code style={{ wordBreak: 'break-all' }}>
          {result.project.public_key}
        </Paragraph>
      </div>

      <div>
        <Text strong>接入代码</Text>
        <Paragraph
          copyable={{
            text: `initArgus({ key: '${result.project.public_key}' })`,
          }}
          code
          style={{ wordBreak: 'break-all' }}
        >
          {`initArgus({ key: '${result.project.public_key}' })`}
        </Paragraph>
      </div>

      <Divider style={{ margin: '4px 0' }} />
      <Button type="primary" block onClick={onEnter}>
        我已经保存了，进入看板
      </Button>
    </Space>
  )
}
