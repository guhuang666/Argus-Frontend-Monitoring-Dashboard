import { Alert, Button, Card, Col, Empty, Row, Spin, Tag, Typography } from 'antd'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useProjects } from '../api/queries'
import type { ProjectRow } from '../api/types'
import CreateProjectModal from '../components/CreateProjectModal'
import { formatInt, formatTime } from '../utils/format'
import { projectPath } from '../utils/project'

const { Title, Text, Paragraph } = Typography

/**
 * 项目列表 —— 登录后的落地页（FR-8.13 的项目管理那一半）。
 *
 * ── 为什么不直接跳到某个项目 ────────────────────────────────────────────
 * 上一版是"重定向页"：查完项目列表就立刻跳进第一个（或上次那个）项目的异常页。
 * 问题是**人从来没机会看到自己有哪些项目** —— 项目只藏在右上角的小下拉里，
 * 而"我有几个项目、哪个有问题、哪个刚建还没数据"这件事，本来是最该一眼看到的。
 * 多租户做完之后，项目就是这套系统里的一等公民，落地页应该给它。
 *
 * ── 这个页面只做三件事 ──────────────────────────────────────────────────
 *   ① 把项目摆出来（名称、公钥、问题数/事件数、创建时间）
 *   ② 点一张卡片进入该项目
 *   ③ 新建项目
 * 项目数量有上限（每组织 20 个，后端 ProjectsService 里有约束），
 * 所以不需要分页、不需要搜索 —— 加了反而是"点了没用的控件"。
 */
export default function ProjectsPage() {
  const { data, isPending, isError, error } = useProjects()
  const [createOpen, setCreateOpen] = useState(false)

  if (isError) {
    return (
      <Alert
        type="error"
        showIcon
        message="加载项目列表失败"
        description={error instanceof Error ? error.message : String(error)}
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

  // 新用户一定会落到 empty 这一支（注册不再自动建项目，见后端 auth.service.ts）
  const isEmpty = data.items.length === 0

  return (
    <>
      {isEmpty ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          style={{ paddingTop: 64 }}
          description={
            <>
              <Paragraph style={{ marginBottom: 4 }}>这个组织还没有项目。</Paragraph>
              <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 0 }}>
                项目是上报的基本单位：每个项目有自己的一对密钥，数据互相隔离。
                <br />
                比如「商城 Web」「后台管理」「H5 活动页」各建一个。
              </Paragraph>
            </>
          }
        >
          <Button type="primary" onClick={() => setCreateOpen(true)}>
            创建第一个项目
          </Button>
        </Empty>
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 16,
              gap: 12,
            }}
          >
            <Title level={4} style={{ margin: 0 }}>
              我的项目
              <Text type="secondary" style={{ fontSize: 14, fontWeight: 400, marginLeft: 8 }}>
                共 {formatInt(data.items.length)} 个
              </Text>
            </Title>
            <Button type="primary" onClick={() => setCreateOpen(true)}>
              新建项目
            </Button>
          </div>

          <Row gutter={[16, 16]}>
            {data.items.map((item) => (
              <Col key={item.id} xs={24} sm={12} lg={8} xxl={6}>
                <ProjectCard item={item} />
              </Col>
            ))}
          </Row>
        </>
      )}

      {/*
        ⚠ 弹窗必须放在 isEmpty 的两个分支**之外**，绝不能写进任一支的内部。

        原因：新建成功后 CreateProjectModal 会 invalidate ['projects']，本页重新拉到
        列表、items.length 从 0 变成 1，上面的 JSX 于是整块换掉。如果弹窗写在分支里，
        它属于被换掉的那棵子树 —— React 会卸载旧实例、在另一支里挂一个新的。而
        createOpen 这个 state 挂在 ProjectsPage 上、值仍是 true，新实例就会以
        open=true + created=null 挂载：用户刚建完又被弹出一个空的「新建项目」表单。

        更要紧的是卸载会连带销毁 created 里的 secret_key_once —— 明文私钥只返回这一次，
        凭据页一闪而过，用户再也拿不到，只能重跑一次创建（还多占一个项目名额）。

        放在这里，同一个实例跨分支存活，凭据页才留得住。
      */}
      <CreateProjectModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </>
  )
}

/**
 * 一张项目卡片。
 *
 * 信息取舍：
 *   放 — 名称、平台、公钥（截断 + 复制）、问题数、事件数、创建时间
 *   不放 — 采样率、限流配置、is_active。这些是"进去之后才关心"的设置项，
 *          摆在列表上只会把"哪个项目有问题"这个主信息淹掉。
 */
function ProjectCard({ item }: { item: ProjectRow }) {
  const navigate = useNavigate()

  return (
    <Card
      size="small"
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, maxWidth: '100%' }}>
          <Text strong ellipsis style={{ maxWidth: 160 }} title={item.name}>
            {item.name}
          </Text>
          <Tag style={{ marginInlineEnd: 0 }}>{item.platform}</Tag>
          {item.public_key === null && <Tag color="red">无密钥</Tag>}
        </span>
      }
      // 整张卡片可点：面积大，比只点按钮顺手。按钮保留是为了"明确可点的提示"
      hoverable
      onClick={() => navigate(projectPath(item.id, '/overview'))}
      style={{ cursor: 'pointer', height: '100%' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', marginBottom: 2 }}>公钥</div>
          {item.public_key === null ? (
            <Text type="danger" style={{ fontSize: 12 }}>
              还没有生成密钥，上报会一律 401
            </Text>
          ) : (
            <Text
              code
              copyable={{ text: item.public_key }}
              // 完整公钥 42 字符，整串摆在卡片上会把卡片撑宽 —— 截断显示，复制时给全量
              style={{ fontSize: 12 }}
              // 点复制图标不该顺带触发"进入项目"
              onClick={(event) => event.stopPropagation()}
            >
              {`${item.public_key.slice(0, 16)}…`}
            </Text>
          )}
        </div>

        <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
          <span>
            <Text strong>{formatInt(item.issue_count)}</Text>
            <Text type="secondary"> 个问题</Text>
          </span>
          <span>
            <Text strong>{formatInt(item.event_count)}</Text>
            <Text type="secondary"> 条事件</Text>
          </span>
        </div>

        {/*
          丢件数（FR-6.4）：只在"确实丢了"或"查不到"时才显示。
          为 0 时整个不渲染 —— 卡片上多一个"今日被限流 0 条"只会增加噪音。
        */}
        {item.dropped_today === null ? (
          <Text type="warning" style={{ fontSize: 12 }}>
            限流计数暂不可用（Redis 未连接）
          </Text>
        ) : item.dropped_today > 0 ? (
          <Text type="danger" style={{ fontSize: 12 }}>
            今日被限流丢弃 {formatInt(item.dropped_today)} 条
            <Text type="secondary" style={{ fontSize: 12 }}>
              （上限 {formatInt(item.rate_limit_per_sec)} 次/秒）
            </Text>
          </Text>
        ) : null}

        <Text type="secondary" style={{ fontSize: 12 }}>
          创建于 {formatTime(item.created_at)}
        </Text>

        <Button
          type="link"
          size="small"
          style={{ paddingLeft: 0, alignSelf: 'flex-start' }}
          onClick={(event) => {
            event.stopPropagation()
            navigate(projectPath(item.id, '/overview'))
          }}
        >
          进入项目 →
        </Button>
      </div>
    </Card>
  )
}
