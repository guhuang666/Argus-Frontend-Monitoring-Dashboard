import { Button, Tag, Typography } from 'antd'
import { useState } from 'react'
import { asFrames, isSymbolicatedFrame } from '../api/types'
import type { FrameRow, SourceContext } from '../api/types'
import { EmptyValue } from './common'

const { Text } = Typography

/**
 * 调用栈渲染（M3 / FR-3.4、3.8、3.9）。
 *
 * 这是 M3 在界面上唯一"看得见"的产物：同一段 stack，符号化之前只能显示
 * `index.js:1:48213`，之后能显示 `src/pages/OrderList.tsx:87 renderOrder`。
 *
 * ── 为什么一个组件要处理两种形状 ────────────────────────────────────────
 * stacktrace_frames 是 jsonb，形状取决于这条事件归并时有没有符号化成功：
 *   · v1：RawFrame[]，只有压缩位置
 *   · v2：SymbolicatedFrame[]，压缩位置 + 源码位置 + 上下文
 * 而这**不是二选一**：同一个问题下的历史事件可能是 v1、新事件是 v2
 * （比如 map 是上线后才补传的）。所以按帧判别，不按问题判别。
 *
 * ── 三个层次的信息，按重要程度排 ────────────────────────────────────────
 *   ① 源码位置（能点开去改的那一行）—— 主信息，粗体
 *   ② 压缩位置 —— 副信息、灰色：排查时对照"产物里到底是哪"
 *   ③ 源码上下文 —— 默认收起，点开才加载渲染
 * 没有 ① 的时候（未符号化），就把 ② 提上来当主信息，并明确标注"未还原"，
 * 满足 FR-3.9：**降级时必须让用户知道自己在看压缩位置**，而不是以为那就是源码。
 */
export default function FramesView({ raw }: { raw: unknown }) {
  const frames = asFrames(raw)

  if (frames.length === 0) {
    return <EmptyValue />
  }

  // 只要帧里带 resolved 字段，就说明这批数据是符号化之后的形状
  const symbolicated = frames.some(isSymbolicatedFrame)
  const resolvedCount = frames.filter(
    (frame) => isSymbolicatedFrame(frame) && frame.resolved,
  ).length

  return (
    <div>
      <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', marginBottom: 4 }}>
        {symbolicated
          ? `调用栈（已还原 ${resolvedCount}/${frames.length} 帧）`
          : '调用栈（未符号化，显示的是压缩产物位置）'}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {frames.map((frame, index) => (
          // 帧没有稳定 ID，下标 + 文件位置组成 key
          <FrameLine key={`${frame.file}:${frame.line}:${frame.col}:${index}`} index={index} frame={frame} />
        ))}
      </div>
    </div>
  )
}

function FrameLine({ index, frame }: { index: number; frame: FrameRow }) {
  const [open, setOpen] = useState(false)

  const symbolicated = isSymbolicatedFrame(frame)
  const resolved =
    symbolicated && frame.resolved && frame.source !== null && frame.sourceLine !== null

  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 12, lineHeight: '20px' }}>
      {/* 帧序号：手动对齐，比 ol 的缩进更可控 */}
      <Text type="secondary" style={{ width: 18, flexShrink: 0, textAlign: 'right' }}>
        {index}
      </Text>

      <div style={{ minWidth: 0, flex: 1 }}>
        {resolved ? (
          <>
            <div style={{ wordBreak: 'break-all' }}>
              <Text strong>{`${frame.source}:${frame.sourceLine}`}</Text>
              {frame.sourceCol !== null && <Text type="secondary">{`:${frame.sourceCol}`}</Text>}
              <Text style={{ marginLeft: 8 }}>{frame.name ?? '匿名函数'}</Text>
            </div>

            <div style={{ color: 'rgba(0,0,0,0.45)', wordBreak: 'break-all' }}>
              {`压缩位置 ${shortFile(frame.file)}:${frame.line}:${frame.col}`}
            </div>

            {frame.context !== null && (
              <>
                <Button
                  type="link"
                  size="small"
                  style={{ padding: 0, height: 'auto' }}
                  onClick={() => setOpen((value) => !value)}
                >
                  {open ? '收起源码上下文' : '查看源码上下文'}
                </Button>
                {open && <ContextBlock context={frame.context} />}
              </>
            )}
          </>
        ) : (
          <div style={{ wordBreak: 'break-all' }}>
            <Text>{`${shortFile(frame.file)}:${frame.line}:${frame.col}`}</Text>
            {frame.fn !== null && <Text style={{ marginLeft: 8 }}>{frame.fn}</Text>}
            {symbolicated && (
              // 这一帧 map 里没有对应段（map 不完整 / 行号越界）—— 如实标注
              <Tag color="default" style={{ marginInlineStart: 8 }}>
                本帧未还原
              </Tag>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** 源码上下文：带行号，出错行高亮（FR-3.8） */
function ContextBlock({ context }: { context: SourceContext }) {
  return (
    <pre
      style={{
        margin: '4px 0 0',
        padding: 8,
        maxHeight: 240,
        overflow: 'auto',
        background: 'rgba(0, 0, 0, 0.03)',
        borderRadius: 4,
        fontSize: 12,
        lineHeight: 1.6,
      }}
    >
      {context.lines.map((line, index) => (
        <div
          key={index}
          style={
            index === context.errorIndex
              ? { background: 'rgba(255, 77, 79, 0.12)', borderRadius: 2 }
              : undefined
          }
        >
          <span
            style={{
              display: 'inline-block',
              width: 44,
              paddingRight: 8,
              textAlign: 'right',
              color: 'rgba(0, 0, 0, 0.35)',
              userSelect: 'none',
            }}
          >
            {context.startLine + index}
          </span>
          {line}
        </div>
      ))}
    </pre>
  )
}

/**
 * 只显示路径部分：剥掉 `https://host:port`。
 *
 * 前缀在不同环境（localhost / CDN / 预发）全不一样，但它对"是哪个文件"没有
 * 信息量，留着只会把窄列撑爆。这和指纹那边剥 origin 是同一个理由，
 * 只是这里纯粹为了显示，不影响任何计算。
 */
function shortFile(file: string): string {
  return file.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/]*/, '')
}
