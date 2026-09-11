/** @jsxImportSource @opentui/solid */
import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { RGBA } from "@opentui/core"
import { createEffect, createMemo, type Accessor } from "solid-js"
import { formatBalances } from "./format"
import { currentProviderID, homeProviderID } from "./provider"
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
 * - 其它（加载中/未开始）→ `textMuted`
 */
function stateColor(api: TuiPluginApi, store: BalanceStore): RGBA {
  if (store.status() === "ready" && store.data()?.is_available !== false) return api.theme.current.success
  if (store.status() === "ready" && store.data()?.is_available === false) return api.theme.current.warning
  if (store.status() === "error") return api.theme.current.error
  return api.theme.current.textMuted
}

/**
 * 当 `active()` 变为真时自动触发一次余额刷新。
 *
 * 这样可以在「组件挂载」或「provider 切换为 deepseek」的瞬间立即拉取，
 * 而不必等待 60s 定时器；并发刷新由 store 内部去重。
 *
 * @param store 余额 store。
 * @param active 当前是否命中目标 provider（响应式访问器）。
 */
function useAutoRefresh(store: BalanceStore, active: Accessor<boolean>): void {
  createEffect(() => {
    if (active()) void store.refresh()
  })
}

/**
 * 会话输入行右侧 / 新建会话模型行右侧共用的「余额 ¥xxx」文本行。
 *
 * 实现注意事项（踩坑记录）：
 * 1. 响应式文本必须放在 `<text>` 中，不能放进 `<span>`：opentui 的 `<span>`
 *    是静态样式文本节点，向其中插入响应式字符串不会随信号更新。
 * 2. 显隐使用 opentui 的 `visible` 布尔属性，而不是 solid 的 `<Show>`；
 *    `<Show>` 在外部插件 + 宿主渲染器组合下会挂载组件但不显示内容。
 *
 * @param props.api   TUI 插件 API（用于读取主题）。
 * @param props.store 余额 store。
 * @param props.active 是否显示该行（响应式访问器）。
 */
export function BalanceRow(props: { api: TuiPluginApi; store: BalanceStore; active: Accessor<boolean> }) {
  const theme = () => props.api.theme.current
  const text = createMemo(() => displayText(props.store))

  return (
    <box visible={props.active()} flexDirection="row" gap={1}>
      <text fg={theme().textMuted}>余额</text>
      <text fg={stateColor(props.api, props.store)} wrapMode="none" onMouseDown={() => void props.store.refresh()}>
        {text()}
      </text>
    </box>
  )
}

/**
 * 侧边栏（`sidebar_content`）中的余额区块。
 *
 * 通过 `order: 101` 渲染在内置 `Context`（order 100）区块的正下方。
 * 是否展示由「当前会话模型 provider」决定。
 */
export function SidebarBalance(props: {
  api: TuiPluginApi
  store: BalanceStore
  sessionID: string
  provider: string
}) {
  const theme = () => props.api.theme.current
  const active = createMemo(() => currentProviderID(props.api, props.sessionID) === props.provider)
  useAutoRefresh(props.store, active)

  return (
    <box visible={active()}>
      <text fg={theme().text}>
        <b>余额</b>
      </text>
      <text fg={stateColor(props.api, props.store)} onMouseDown={() => void props.store.refresh()}>
        {displayText(props.store)}
      </text>
    </box>
  )
}

/**
 * 会话输入行右侧（`session_prompt_right`）的余额。
 *
 * provider 判定优先使用会话自身的模型（`session.model.providerID`），
 * 其次回退到最近消息 / 全局默认模型。
 */
export function SessionPromptBalance(props: {
  api: TuiPluginApi
  store: BalanceStore
  sessionID: string
  provider: string
}) {
  const active = createMemo(() => currentProviderID(props.api, props.sessionID) === props.provider)
  useAutoRefresh(props.store, active)

  return <BalanceRow api={props.api} store={props.store} active={active} />
}

/**
 * 新建会话界面（`home_prompt_right`）的余额。
 *
 * home 没有会话，插件 API 也拿不到「当前选中的模型」，因此这里使用启发式：
 * 以 `model.json` 的 `recent[0]`（最近一次显式选择的模型）为主，`config.model` 兜底。
 *
 * @param props.selectedProvider 由 `model-store` 监听 `model.json` 得到的 provider 访问器。
 */
export function HomePromptBalance(props: {
  api: TuiPluginApi
  store: BalanceStore
  provider: string
  selectedProvider: Accessor<string | undefined>
}) {
  const active = createMemo(
    () => homeProviderID(props.selectedProvider(), props.api.state.config.model) === props.provider,
  )
  useAutoRefresh(props.store, active)

  return <BalanceRow api={props.api} store={props.store} active={active} />
}
