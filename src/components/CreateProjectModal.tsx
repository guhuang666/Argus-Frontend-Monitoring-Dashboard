import { Alert, Button, Divider, Form, Input, Modal, Space, Typography } from 'antd'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ApiError, postJson } from '../api/client'
import { projectPath } from '../utils/project'

const { Text, Paragraph } = Typography

/** 建项目成功后服务端返回的形状（见 projects.service.ts 的 create） */
interface CreateProjectResult {
  project: {
    id: string
    name: string
    platform: string
    created_at: string
    public_key: string
  }
  /** 明文私钥，只有这一次 */
  secret_key_once: string
}

/**
 * 新建项目（MVP-B / FR-5.8 的后端接上了，这是界面的最小形态）。
 *
 * ── 两步式，不是一键关闭 ────────────────────────────────────────────────
 * 创建成功后**不能直接关窗**：`secret_key_once` 只返回这一次，
 * 关了就只能重跑一次创建（还占着一个项目名额）。
 * 所以第二步是一屏"把这两串抄走"的凭据页，用户点"我已保存"才关闭。
 *
 * ── 为什么创建完不自动跳过去 ────────────────────────────────────────────
 * 凭据页上还有一个"进入这个项目"。自动跳会让私钥那一屏一闪而过 ——
 * 用户没复制到，而且他可能根本没意识到有东西要复制。
 */
export default function CreateProjectModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [form] = Form.useForm<{ name: string }>()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<CreateProjectResult | null>(null)
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  function reset(): void {
    form.resetFields()
    setCreated(null)
    setError(null)
  }

  function close(): void {
    reset()
    onClose()
  }

  async function submit(values: { name: string }): Promise<void> {
    setSubmitting(true)
    setError(null)
    try {
      const result = await postJson<CreateProjectResult>('/v1/projects', {
        name: values.name.trim(),
      })
      setCreated(result)
      // 列表里立刻出现新项目 —— 不 invalidate 的话切换器要等 60 秒 staleTime
      await queryClient.invalidateQueries({ queryKey: ['projects'] })
    } catch (err) {
      // 409 重名 / 403 权限不足 / 400 参数错误，都直接显示服务端那句人话
      setError(err instanceof ApiError ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      // 提交中/凭据页时不允许点遮罩关闭：那会把没抄走的私钥弄丢
      onCancel={submitting ? undefined : close}
      maskClosable={!submitting && created === null}
      title={created === null ? '新建项目' : '项目已创建'}
      footer={
        created === null
          ? [
              <Button key="cancel" onClick={close} disabled={submitting}>
                取消
              </Button>,
              <Button key="ok" type="primary" loading={submitting} onClick={() => form.submit()}>
                创建
              </Button>,
            ]
          : [
              // 主按钮是"关闭"而不是"进入项目"：
              // 这个弹窗现在主要从**项目列表页**打开，用户建完多半想先看一眼
              // 新卡片有没有出现在列表里。自动跳进新项目会让他看不到自己刚建的东西。
              <Button
                key="go"
                onClick={() => {
                  const id = created.project.id
                  close()
                  navigate(projectPath(id, '/overview'))
                }}
              >
                进入这个项目
              </Button>,
              <Button key="stay" type="primary" onClick={close}>
                我已保存，返回列表
              </Button>,
            ]
      }
    >
      {created === null ? (
        <>
          {error !== null && (
            <Alert type="error" showIcon closable message={error} onClose={() => setError(null)} style={{ marginBottom: 12 }} />
          )}
          <Form form={form} layout="vertical" onFinish={submit} requiredMark={false}>
            <Form.Item
              name="name"
              label="项目名"
              rules={[
                { required: true, message: '请输入项目名' },
                { max: 100, message: '最长 100 字符' },
              ]}
              extra="同一组织内不能重名。比如「商城 Web」「后台管理」「H5 活动页」"
            >
              <Input autoFocus placeholder="商城 Web" onPressEnter={() => form.submit()} />
            </Form.Item>
          </Form>
        </>
      ) : (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Alert
            type="success"
            showIcon
            message={`「${created.project.name}」已创建`}
            description="下面两串凭据需要分别放到两个地方"
          />

          <div>
            <Text strong>公钥（argus_pub_…）</Text>
            <Paragraph type="secondary" style={{ marginBottom: 4, fontSize: 12 }}>
              放进浏览器代码，用来上报。可以公开。
            </Paragraph>
            <Paragraph copyable={{ text: created.project.public_key }} code style={{ wordBreak: 'break-all' }}>
              {created.project.public_key}
            </Paragraph>
          </div>

          <div>
            <Text strong>私钥（argus_sec_…）</Text>
            <Paragraph type="secondary" style={{ marginBottom: 4, fontSize: 12 }}>
              只显示这一次，关掉就再也拿不到了。用于上传 Sourcemap，只能放在 CI 或本地 .env。
            </Paragraph>
            <Paragraph copyable={{ text: created.secret_key_once }} code style={{ wordBreak: 'break-all' }}>
              {created.secret_key_once}
            </Paragraph>
          </div>

          <Divider style={{ margin: '4px 0' }} />
          <Paragraph copyable={{ text: `initArgus({ key: '${created.project.public_key}' })` }} code style={{ marginBottom: 0 }}>
            {`initArgus({ key: '${created.project.public_key}' })`}
          </Paragraph>
        </Space>
      )}
    </Modal>
  )
}
