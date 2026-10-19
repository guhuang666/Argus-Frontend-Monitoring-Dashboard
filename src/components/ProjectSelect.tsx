import { Alert, Select, Tag, Tooltip } from 'antd'
import { useLocation, useNavigate } from 'react-router'
import { useProjects } from '../api/queries'
import { projectPath, rememberProjectId, useProjectId } from '../utils/project'

/**
 * 顶部项目切换器。
 *
 * ── 为什么它必须存在（而不是"以后再加"）──
 * 从 S2 起，上报靠公钥区分项目，事件、问题、性能全都带 project_id。
 * 如果没有切换入口，看板只能看数据库里"第一个"项目 —— 多租户做完了，
 * 但人在界面上验证不了它，等于没做完。
 *
 * ── 为什么切换项目时详情页要退回到列表 ──
 * issue id 是全局唯一的 UUID，理论上可以直接带过去，但那个问题属于**另一个项目**：
 * 后端按 (id, projectId) 定位，会返回 404。让用户看到"问题不存在"容易误解成
 * "问题被删了"。退回到列表更符合预期。
 */
export default function ProjectSelect() {
  const projectId = useProjectId()
  const { data, isPending, isError, error } = useProjects()
  const navigate = useNavigate()
  const location = useLocation()

  if (isError) {
    // 切换器挂了不该拖垮整个页面：导航和内容区还能用（虽然都会报错），
    // 但至少错误信息在这里看得见
    return (
      <Alert
        type="error"
        showIcon
        banner
        message="项目列表加载失败"
        description={error instanceof Error ? error.message : String(error)}
        style={{ maxWidth: 520 }}
      />
    )
  }

  const items = data?.items ?? []
  const current = items.find((item) => item.id === projectId)

  return (
    <>
      <Select
        // 受控 + 显式显示当前项目名：projectId 在列表里找不到时（手工改了地址），
        // 直接把那个 id 显示出来，比显示空白更容易看出问题
        value={projectId !== '' ? projectId : undefined}
        loading={isPending}
        placeholder="选择项目"
        style={{ width: 200 }}
        options={items.map((item) => ({
          value: item.id,
          label: item.name,
        }))}
        // 切到当前项目相当于没操作，不要为此触发一次导航（会丢掉滚动位置、
        // 也会让详情页被无谓地重挂载）
        onChange={(next) => {
          if (next === projectId) return
          rememberProjectId(next)

          // 把 /projects/<旧id> 之后的部分保留下来，但详情页退回到列表
          const rest = location.pathname.replace(/^\/projects\/[^/]+/, '') || '/errors'
          const safeRest = /^\/issues\//.test(rest) ? '/issues' : rest
          navigate(projectPath(next, safeRest))
        }}
        notFoundContent={isPending ? '加载中…' : '没有项目'}
      />

      {current !== undefined && current.public_key === null && (
        <Tooltip title="这个项目还没有密钥，上报会一律 401。用 npm run project:new 新建项目会同时生成密钥">
          <Tag color="red">无密钥</Tag>
        </Tooltip>
      )}
    </>
  )
}
