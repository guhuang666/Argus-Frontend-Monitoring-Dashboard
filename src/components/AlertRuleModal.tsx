import { Alert, Button, Form, Input, InputNumber, Modal, Select, Switch, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { ApiError } from '../api/client'
import { useCreateAlertRule, useUpdateAlertRule } from '../api/queries'
import type {
  AlertChannel,
  AlertComparator,
  AlertMetric,
  AlertRulePayload,
  AlertRuleRow,
} from '../api/types'
import {
  ALERT_CHANNEL_OPTIONS,
  ALERT_COMPARATOR_OPTIONS,
  ALERT_METRIC_OPTIONS,
} from '../utils/alert'

const { Text } = Typography

/** 表单里的字段名。与提交时的 payload 不完全同名（webhook_url 是可选的），所以单独定一层 */
interface FormValues {
  name: string
  metric: AlertMetric
  comparator: AlertComparator
  threshold: number
  window_minutes: number
  channel: AlertChannel
  webhook_url?: string
  silence_minutes: number
  enabled: boolean
}

/** 新建时的默认值：给一组"最像真实规则"的初始值，让人只需要改数字 */
const DEFAULTS: FormValues = {
  name: '',
  metric: 'events',
  comparator: 'gt',
  threshold: 10,
  window_minutes: 5,
  channel: 'feishu',
  webhook_url: '',
  silence_minutes: 30,
  enabled: true,
}

/**
 * 新建 / 编辑告警规则。
 *
 * ── 新建与编辑共用同一个弹窗 ────────────────────────────────────────────
 * 两者字段完全相同，差异只有三处：标题、webhook 是否必填、调哪个接口。
 * 拆成两个组件会让上面那组字段定义写两遍 —— 以后加一个字段就得改两处，
 * 而"只改了一处"的表现是编辑页丢字段，很难在代码评审里看出来。
 *
 * ── 编辑时 webhook 留空 = 不改 ──────────────────────────────────────────
 * 读接口只返回末 6 位（`***6c5b4a`），前端拿不到原地址。所以这里**不能**
 * 把脱敏值回填进输入框（会把 `***6c5b4a` 当成新地址存进去），
 * 只能留空 + 用 placeholder 提示当前值。留空提交时 payload 里干脆不带
 * `webhook_url`，后端就保持原值（见 update-alert-rule.dto.ts）。
 */
export default function AlertRuleModal({
  open,
  projectId,
  rule,
  onClose,
}: {
  open: boolean
  projectId: string
  /** null = 新建；非 null = 编辑这条 */
  rule: AlertRuleRow | null
  onClose: () => void
}) {
  const [form] = Form.useForm<FormValues>()
  const [error, setError] = useState<string | null>(null)
  const create = useCreateAlertRule(projectId)
  const update = useUpdateAlertRule(projectId)

  // 每次打开都重新灌值：编辑不同的规则时，上一次的残留必须清干净
  useEffect(() => {
    if (!open) return
    setError(null)
    form.resetFields()
    form.setFieldsValue(
      rule === null
        ? DEFAULTS
        : {
            name: rule.name,
            metric: rule.metric,
            comparator: rule.comparator,
            threshold: rule.threshold,
            window_minutes: rule.window_minutes,
            channel: rule.channel,
            // 只在编辑时留空；新建时用户可以自己填
            webhook_url: '',
            silence_minutes: rule.silence_minutes,
            enabled: rule.enabled,
          },
    )
  }, [open, rule, form])

  // 阈值的单位随指标变化：同一个「10」，对错误数是 10 次，对错误率是 1000%
  const metric = Form.useWatch('metric', form) ?? DEFAULTS.metric
  const metricOption = ALERT_METRIC_OPTIONS.find((option) => option.value === metric)
  const submitting = create.isPending || update.isPending

  function close(): void {
    if (submitting) return
    onClose()
  }

  async function submit(values: FormValues): Promise<void> {
    setError(null)

    const payload: AlertRulePayload = {
      name: values.name.trim(),
      metric: values.metric,
      comparator: values.comparator,
      threshold: values.threshold,
      window_minutes: values.window_minutes,
      channel: values.channel,
      silence_minutes: values.silence_minutes,
      enabled: values.enabled,
    }

    const webhook = values.webhook_url?.trim()
    // 新建必须带地址；编辑只在用户真的重填了才带（留空 = 保持原值）
    if (webhook !== undefined && webhook !== '') {
      payload.webhook_url = webhook
    }

    try {
      if (rule === null) {
        await create.mutateAsync(payload)
      } else {
        await update.mutateAsync({ id: rule.id, patch: payload })
      }
      onClose()
    } catch (err) {
      // 400（DTO 校验）/ 404（规则被删了）/ 网络错误：都直接显示服务端那句话
      setError(err instanceof ApiError ? err.message : String(err))
    }
  }

  return (
    <Modal
      open={open}
      title={rule === null ? '新建告警规则' : '编辑告警规则'}
      onCancel={close}
      maskClosable={!submitting}
      destroyOnHidden
      footer={[
        <Button key="cancel" onClick={close} disabled={submitting}>
          取消
        </Button>,
        <Button key="ok" type="primary" loading={submitting} onClick={() => form.submit()}>
          保存
        </Button>,
      ]}
    >
      {error !== null && (
        <Alert
          type="error"
          showIcon
          closable
          message={error}
          onClose={() => setError(null)}
          style={{ marginBottom: 12 }}
        />
      )}

      <Form form={form} layout="vertical" onFinish={submit} requiredMark={false}>
        <Form.Item
          name="name"
          label="规则名"
          rules={[
            { required: true, message: '请输入规则名' },
            { max: 100, message: '最长 100 字符' },
          ]}
        >
          <Input autoFocus placeholder="线上错误数突增" />
        </Form.Item>

        <Form.Item label="当" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <Form.Item name="metric" noStyle>
              <Select options={ALERT_METRIC_OPTIONS.map(({ value, label }) => ({ value, label }))} style={{ width: 150 }} />
            </Form.Item>
            <Form.Item name="comparator" noStyle>
              <Select options={ALERT_COMPARATOR_OPTIONS} style={{ width: 90 }} />
            </Form.Item>
            <Form.Item
              name="threshold"
              noStyle
              rules={[{ required: true, message: '请输入阈值' }]}
            >
              <InputNumber style={{ width: 140 }} placeholder="阈值" />
            </Form.Item>
            {/* 单位跟着指标走，放在最后当后缀读起来最顺：错误数 > 10 次 */}
            <div style={{ lineHeight: '32px', color: 'rgba(0,0,0,0.45)' }}>
              {metricOption?.unit ?? ''}
            </div>
          </div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {(metricOption?.hint ?? '') +
              '。错误率的阈值用小数填：0.05 表示 5%。'}
          </Text>
        </Form.Item>

        <Form.Item
          name="window_minutes"
          label="统计窗口（分钟）"
          rules={[{ required: true, message: '请输入窗口' }]}
          extra="窗口是左闭右开的滑动区间，例如 5 分钟 = 最近 5 分钟内发生的次数。"
        >
          <InputNumber min={1} max={1440} style={{ width: 160 }} addonAfter="分钟" />
        </Form.Item>

        <Form.Item name="channel" label="推送渠道" rules={[{ required: true }]}>
          <Select options={ALERT_CHANNEL_OPTIONS} style={{ width: 200 }} />
        </Form.Item>

        <Form.Item
          name="webhook_url"
          label="Webhook 地址"
          rules={[
            // 新建必填；编辑时可留空（= 不修改）
            { required: rule === null, message: '请填写 Webhook 地址' },
            { pattern: /^https?:\/\/\S+$/, message: '必须以 http:// 或 https:// 开头' },
            { max: 500, message: '最长 500 字符' },
          ]}
          extra={
            rule === null
              ? '飞书群 → 添加机器人 → 自定义机器人，复制它给的 Webhook 地址。'
              : `当前已配置：${rule.webhook_url_masked}。留空表示不修改。`
          }
        >
          <Input
            placeholder={
              rule === null ? 'https://open.feishu.cn/open-apis/bot/v2/hook/…' : '留空则保持原地址'
            }
          />
        </Form.Item>

        <Form.Item
          name="silence_minutes"
          label="静默期（分钟）"
          rules={[{ required: true }]}
          extra="触发一次后，这段时间内不再重复通知，避免群里被刷屏。"
        >
          <InputNumber min={0} max={1440} style={{ width: 160 }} addonAfter="分钟" />
        </Form.Item>

        <Form.Item name="enabled" label="启用" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  )
}
