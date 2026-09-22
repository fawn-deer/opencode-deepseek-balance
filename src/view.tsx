/** @jsxImportSource @opentui/solid */
import type { Context } from "@opencode/plugin/tui/context"
import type { RGBA } from "@opentui/core"
import { createEffect, createMemo, type Accessor } from "solid-js"
import { formatBalances } from "./format"
import { providerFromModelRef } from "./provider"
import type { BalanceStore } from "./store"

/**
 * 根据余额 store 的状态生成要展示的文本。
 *
 * 规则（自上而下命中）：
 * - 已拿到数据但账户不可用 → `unavailable`
 * - 已拿到数据且有余额 → 形如 `¥100.00`（多币种用 ` · ` 连接）
 * - 首次加载中 → `loading…`
 * - 缺少 API Key → `no API key`
 * - 其它错误 → `unavailable`
 * - 尚未开始加载 → `—`
 *
 * @param store 余额 store。
 * @returns 展示文本。
 */
export function displayText(store: BalanceStore): string {
  const data = store.data()
  if (data && !data.is_available) return "unavailable"

  const formatted = formatBalances(data?.balance_infos)
  if (formatted) return formatted
  if (store.status() === "loading") return "loading…"
  if (store.status() === "error") return store.error() === "no-key" ? "no API key" : "unavailable"
  return "—"
}

/**
 * 根据 store 状态挑选文本颜色：
 * - 正常且有余额 → `success`
 * - 已连接但账户不可用 → `warning`
 * - 请求错误 → `error`
 * - 其它（加载中/未开始）→ `text.muted`
 */
function stateColor(ctx: Context, store: BalanceStore): RGBA {
  const feedback = ctx.theme.text.feedback
  if (store.status() === "ready" && store.data()?.is_available !== false) return feedback.success.base
  if (store.status() === "ready" && store.data()?.is_available === false) return feedback.warning.base
  if (store.status() === "error") return feedback.error.base
  return ctx.theme.text.muted
}

/**
 * 当 `active()` 变为真时自动触发一次余额刷新。
 *
 * 这样可以在「组件挂载」或「provider 切换为目标 provider」的瞬间立即拉取，
 * 而不必等待定时器；并发刷新由 store 内部去重。
 */
function useAutoRefresh(store: BalanceStore, active: Accessor<boolean>): void {
  createEffect(() => {
    if (active()) void store.refresh()
  })
}

/**
 * 会话输入行 / home 模型行共用的「余额 ¥xxx」文本行。
 *
 * 说明：响应式文本必须放在 `<text>` 中（不要放进 `<span>`）；显隐使用
 * opentui 的 `visible` 属性而不是 solid 的 `<Show>`——这是 v1 踩过的坑，
 * v2 沿用相同做法。
 */
export function BalanceRow(props: { ctx: Context; store: BalanceStore; active: Accessor<boolean> }) {
  const text = createMemo(() => displayText(props.store))

  return (
    <box visible={props.active()} flexDirection="row" gap={1}>
      <text fg={props.ctx.theme.text.muted}>余额</text>
      <text
        fg={stateColor(props.ctx, props.store)}
        wrapMode="none"
        onMouseDown={() => void props.store.refresh()}
      >
        {text()}
      </text>
    </box>
  )
}

/**
 * 侧边栏（`sidebar.content`）中的余额区块。
 *
 * 是否展示由「当前会话模型 provider」决定。
 */
export function SidebarBalance(props: {
  ctx: Context
  store: BalanceStore
  sessionID: string
  provider: string
}) {
  const active = createMemo(
    () => providerFromModelRef(props.ctx.data.session.get(props.sessionID)?.model) === props.provider,
  )
  useAutoRefresh(props.store, active)

  return (
    <box visible={active()}>
      <text fg={props.ctx.theme.text.base}>
        <b>余额</b>
      </text>
      <text fg={stateColor(props.ctx, props.store)} onMouseDown={() => void props.store.refresh()}>
        {displayText(props.store)}
      </text>
    </box>
  )
}

/**
 * 会话输入行右侧（`prompt.footer.status`）的余额。
 *
 * provider 判定优先使用会话自身的模型（`session.model.providerID`），
 * 会话不可用时回退到当前默认/选中模型。
 */
export function SessionBalance(props: {
  ctx: Context
  store: BalanceStore
  sessionID: string | undefined
  provider: string
  selectedProvider: Accessor<string | undefined>
}) {
  const active = createMemo(() => {
    const sessionProvider = props.sessionID
      ? providerFromModelRef(props.ctx.data.session.get(props.sessionID)?.model)
      : undefined
    return (sessionProvider ?? props.selectedProvider()) === props.provider
  })
  useAutoRefresh(props.store, active)

  return <BalanceRow ctx={props.ctx} store={props.store} active={active} />
}

/**
 * 新建会话界面（`home.footer.status`）的余额。
 *
 * home 没有会话，使用 `ctx.client.model.default()` 得到的当前默认/选中模型。
 */
export function HomeBalance(props: {
  ctx: Context
  store: BalanceStore
  provider: string
  selectedProvider: Accessor<string | undefined>
}) {
  const active = createMemo(() => props.selectedProvider() === props.provider)
  useAutoRefresh(props.store, active)

  return <BalanceRow ctx={props.ctx} store={props.store} active={active} />
}
