import { Alert, Button, Empty, Popconfirm, Space, Switch, Table, Tabs, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { ApiError } from '../api/client'
import { useAlertRules, useDeleteAlertRule, useUpdateAlertRule } from '../api/queries'
import type { AlertRuleRow } from '../api/types'
import AlertHistoryTable from '../components/AlertHistoryTable'
import AlertRuleModal from '../components/AlertRuleModal'
import PageShell from '../components/PageShell'
import { channelLabel, formatCondition, formatMinutes } from '../utils/alert'
import { formatInt, formatTime } from '../utils/format'
import { useProjectId } from '../utils/project'

const { Text } = Typography

/** 两个 Tab 的 key。放 URL 里（`?tab=history`），刷新和分享都能回到原处 */
type TabKey = 'rules' | 'history'

/**
 * 项目设置页。
 *
 * 现在有两块内容：
 *   · 告警规则（M6-2）：建、改、开关、删
 *   · 触发历史（M6-5）：这张表之前只写不读，规则列表回答不了"到底响过没有"
 *
 * 页名仍叫「设置」：后面的采样率、配额、Sourcemap 上传记录、密钥轮换都要落这里
 * （FR-8.13），现在叫「告警」以后得改两次路由和导航。
 *
 * ── 为什么删除要二次确认 ────────────────────────────────────────────────
 * 删除是物理删除，外键 Cascade 会连它的触发历史一起删（alert_events）。
 * "停用"才是那个可逆的选项，所以开关和删除必须长得足够不一样。
 */
export default function SettingsPage() {
  const projectId = useProjectId()
  const { data, isPending, isError, error } = useAlertRules(projectId)
  const updateRule = useUpdateAlertRule(projectId)
  const deleteRule = useDeleteAlertRule(projectId)

  const [searchParams, setSearchParams] = useSearchParams()
  const tab: TabKey = searchParams.get('tab') === 'history' ? 'history' : 'rules'

  const [modalOpen, setModalOpen] = useState(false)
  /** null = 新建；非 null = 正在编辑哪条 */
  const [editing, setEditing] = useState<AlertRuleRow | null>(null)
  /** 正在等哪一行的请求返回。用它只禁用那一行，而不是整张表 */
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const items = data?.items ?? []

  function switchTab(next: string): void {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev)
        if (next === 'rules') {
          // 默认 Tab 不写进 URL：地址越短越好，`/settings` 就是规则页
          params.delete('tab')
        } else {
          params.set('tab', next)
        }
        return params
      },
      { replace: true },
    )
  }

  function openCreate(): void {
    setEditing(null)
    setModalOpen(true)
  }

  function openEdit(rule: AlertRuleRow): void {
    setEditing(rule)
    setModalOpen(true)
  }

  /** 开关只改一个字段，不重新提交整条规则 */
  async function toggle(rule: AlertRuleRow): Promise<void> {
    setActionError(null)
    setPendingId(rule.id)
    try {
      await updateRule.mutateAsync({ id: rule.id, patch: { enabled: !rule.enabled } })
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : String(err))
    } finally {
      setPendingId(null)
    }
  }

  async function remove(rule: AlertRuleRow): Promise<void> {
    setActionError(null)
    setPendingId(rule.id)
    try {
      await deleteRule.mutateAsync(rule.id)
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : String(err))
    } finally {
      setPendingId(null)
    }
  }

  const columns: TableColumnsType<AlertRuleRow> = [
    {
      title: '名称',
      dataIndex: 'name',
      render: (_value, row) => (
        <div>
          <div>{row.name}</div>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
            {row.last_fired_at === null
              ? '从未触发'
              : `最近触发 ${formatTime(row.last_fired_at)}`}
          </div>
        </div>
      ),
    },
    {
      title: '条件',
      width: 200,
      // 条件由三列拼出来（指标 + 方向 + 阈值），没有单一 dataIndex 可给
      render: (_value, row) => (
        <Space size={6}>
          <span>{formatCondition(row)}</span>
        </Space>
      ),
    },
    {
      title: '窗口',
      width: 110,
      render: (_value, row) => `${row.window_minutes} 分钟`,
    },
    {
      title: '渠道',
      dataIndex: 'channel',
      width: 100,
      render: (channel: AlertRuleRow['channel']) => channelLabel(channel),
    },
    {
      title: '静默',
      width: 110,
      render: (_value, row) => formatMinutes(row.silence_minutes),
    },
    {
      title: '开关',
      width: 90,
      render: (_value, row) => (
        <Switch
          checked={row.enabled}
          loading={pendingId === row.id && updateRule.isPending}
          disabled={pendingId !== null && pendingId !== row.id}
          onChange={() => void toggle(row)}
        />
      ),
    },
    {
      title: '操作',
      width: 130,
      render: (_value, row) => (
        <Space size={4}>
          <Button type="link" size="small" style={{ paddingLeft: 0 }} onClick={() => openEdit(row)}>
            编辑
          </Button>
          <Popconfirm
            title="删除这条规则？"
            description="它的触发历史也会一起删除。想暂时停掉请用左侧开关。"
            okText="删除"
            okButtonProps={{ danger: true }}
            cancelText="取消"
            onConfirm={() => void remove(row)}
          >
            <Button type="link" size="small" danger disabled={pendingId !== null}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const rulesSection = (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {data === undefined ? '加载中…' : `共 ${formatInt(items.length)} 条`}
        </Text>
      </div>

      {isError && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 12 }}
          message="告警规则加载失败"
          description={error instanceof Error ? error.message : '未知错误'}
        />
      )}

      {actionError !== null && (
        <Alert
          type="error"
          showIcon
          closable
          style={{ marginBottom: 12 }}
          message={actionError}
          onClose={() => setActionError(null)}
        />
      )}

      <Table<AlertRuleRow>
        rowKey="id"
        columns={columns}
        dataSource={items}
        loading={isPending}
        pagination={false}
        size="middle"
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="还没有告警规则。先建一条「错误数 5 分钟内超过 10 次」试试。"
            />
          ),
        }}
      />
    </>
  )

  return (
    <PageShell
      title="设置"
      description={
        tab === 'rules' ? (
          <Button type="primary" onClick={openCreate}>
            新建规则
          </Button>
        ) : undefined
      }
    >
      <Tabs
        activeKey={tab}
        onChange={switchTab}
        items={[
          { key: 'rules', label: '告警规则', children: rulesSection },
          {
            key: 'history',
            label: '触发历史',
            // 规则列表已经加载过，直接传下去做"只看某条规则"的下拉，避免再请求一次
            children: <AlertHistoryTable projectId={projectId} rules={items} />,
          },
        ]}
      />

      <AlertRuleModal
        open={modalOpen}
        projectId={projectId}
        rule={editing}
        onClose={() => setModalOpen(false)}
      />
    </PageShell>
  )
}
