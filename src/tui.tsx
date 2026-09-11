/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginModule, TuiSlotPlugin } from "@opencode-ai/plugin/tui"
import { defaultAuthDirs, readApiKeyFromDirs } from "./auth"
import { fetchBalance } from "./balance"
import { createSelectedModelWatcher } from "./model-store"
import { resolveOptions } from "./options"
import { currentProviderID, homeProviderID } from "./provider"
import { createBalanceStore } from "./store"
import { HomePromptBalance, SessionPromptBalance, SidebarBalance } from "./view"

/**
 * 插件入口。
 *
 * opencode 会在 TUI 启动时调用本函数（`tui(api, options, meta)`），
 * 这里完成：解析配置 → 组装依赖（余额 store、model.json 监听）→
 * 注册三个展示插槽 → 注册刷新定时器/事件 → 注册清理逻辑。
 *
 * 展示位置：
 * - `sidebar_content`（order 101）：内置 `Context` 区块下方
 * - `session_prompt_right`：会话输入行右侧
 * - `home_prompt_right`：新建会话界面模型选择行右侧
 */
const tui: TuiPlugin = async (api, options) => {
  const opts = resolveOptions(options)

  // 账户级余额 store：key 解析、接口调用都在这里注入，组件只读它。
  const store = createBalanceStore({
    getKey: () => readApiKeyFromDirs(defaultAuthDirs(api.state.path.state), opts.provider),
    getBalance: (key) => fetchBalance(key),
  })

  // 监听 model.json，用于在 home 界面感知“当前选中的模型”变化。
  const selectedModel = createSelectedModelWatcher(api.state.path.state)

  /** 当前路由对应的会话 ID（非会话路由返回 undefined）。 */
  function activeSessionID(): string | undefined {
    const route = api.route.current
    if (route.name !== "session") return undefined
    const params = route.params as { sessionID?: unknown } | undefined
    return params && typeof params.sessionID === "string" ? params.sessionID : undefined
  }

  /**
   * 当前是否应展示/刷新余额：
   * - 会话路由：用会话模型判定；
   * - 其它（home 等）：用 model.json 的启发式判定。
   */
  function isActive(): boolean {
    const sessionID = activeSessionID()
    if (sessionID) return currentProviderID(api, sessionID) === opts.provider
    return homeProviderID(selectedModel.provider(), api.state.config.model) === opts.provider
  }

  // 周期性刷新：仅在命中目标 provider 时请求余额接口（不会对非 deepseek 会话发请求）。
  const timer = setInterval(() => {
    if (isActive()) void store.refresh()
  }, opts.refreshMs)

  // 会话空闲时（一轮回答结束、余额可能变化）刷新一次。
  const unsubscribe = api.event.on("session.idle", () => {
    if (isActive()) void store.refresh()
  })

  // 插件停用时清理定时器、事件订阅与文件监听。
  api.lifecycle.onDispose(() => {
    clearInterval(timer)
    unsubscribe()
    selectedModel.dispose()
  })

  // 侧边栏区块：order 101，紧跟在内置 Context（order 100）之后。
  const sidebar: TuiSlotPlugin = {
    order: 101,
    slots: {
      sidebar_content(_ctx, props) {
        return <SidebarBalance api={api} store={store} sessionID={props.session_id} provider={opts.provider} />
      },
    },
  }

  // 会话输入行右侧余额。
  const sessionPromptRight: TuiSlotPlugin = {
    slots: {
      session_prompt_right(_ctx, props) {
        return <SessionPromptBalance api={api} store={store} sessionID={props.session_id} provider={opts.provider} />
      },
    },
  }

  // 新建会话界面（home）模型行右侧余额。
  const homePromptRight: TuiSlotPlugin = {
    slots: {
      home_prompt_right() {
        return (
          <HomePromptBalance
            api={api}
            store={store}
            provider={opts.provider}
            selectedProvider={selectedModel.provider}
          />
        )
      },
    },
  }

  api.slots.register(sidebar)
  api.slots.register(sessionPromptRight)
  api.slots.register(homePromptRight)
}

/**
 * TUI 插件模块。
 *
 * `id` 用于插件启用状态与插槽归属（文件插件必须提供非空 id）；
 * 通过包方式安装时可省略，opencode 会回退使用包名。
 */
const plugin: TuiPluginModule = {
  id: "deepseek-balance",
  tui,
}

export default plugin
