/** @jsxImportSource @opentui/solid */
import { Plugin } from "@opencode/plugin/tui"
import { createSignal } from "solid-js"
import { defaultAuthDirs, readApiKeyFromDirs } from "./auth"
import { fetchBalance } from "./balance"
import { resolveOptions } from "./options"
import { providerFromModelRef } from "./provider"
import { createBalanceStore } from "./store"
import { HomeBalance, SessionBalance, SidebarBalance } from "./view"

/**
 * 插件入口（opencode v2 CLI 插件）。
 *
 * opencode 在 TUI 启动时调用 `setup(context)`，这里完成：解析配置 →
 * 组装依赖（余额 store、当前选中模型）→ 注册三个展示插槽 → 订阅事件/定时器
 * → 返回清理函数。
 *
 * 展示位置：
 * - `sidebar.content`：侧边栏内容区
 * - `prompt.footer.status`：会话输入行底部状态行
 * - `home.footer.status`：新建会话界面底部状态行
 */
export default Plugin.define({
  id: "deepseek-balance",
  setup(ctx) {
    const opts = resolveOptions(ctx.options)

    // 账户级余额 store：key 解析、接口调用都在这里注入，组件只读它。
    const store = createBalanceStore({
      getKey: () => readApiKeyFromDirs(defaultAuthDirs(), opts.provider),
      getBalance: (key) => fetchBalance(key),
    })

    /**
     * 当前默认/选中模型的 provider。
     *
     * home（新建会话）没有会话对象，用 `client.model.default()` 获取；
     * 模型/凭据变化时通过事件刷新。
     */
    const [selectedProvider, setSelectedProvider] = createSignal<string | undefined>(undefined)
    async function refreshSelectedProvider(): Promise<void> {
      try {
        const result = await ctx.client.model.default()
        setSelectedProvider(providerFromModelRef(result.data))
      } catch {
        setSelectedProvider(undefined)
      }
    }
    void refreshSelectedProvider()

    /** 会话路由：会话模型优先，缺省回退到当前默认/选中模型。 */
    function isActive(sessionID: string | undefined): boolean {
      const sessionProvider = sessionID
        ? providerFromModelRef(ctx.data.session.get(sessionID)?.model)
        : undefined
      return (sessionProvider ?? selectedProvider()) === opts.provider
    }

    // 模型 / 凭据变化时刷新默认模型 provider。
    const unsubscribers = [
      ctx.data.on("session.model.selected", () => void refreshSelectedProvider()),
      ctx.data.on("model.updated", () => void refreshSelectedProvider()),
      ctx.data.on("provider.updated", () => void refreshSelectedProvider()),
      // 一轮回答结束、余额可能变化时刷新一次。
      ctx.data.on("session.idle", (event) => {
        if (isActive(event.data.sessionID)) void store.refresh()
      }),
    ]

    // 周期性刷新：仅在命中目标 provider 时请求余额接口。
    const timer = setInterval(() => {
      const route = ctx.ui.router.current()
      if (isActive(route.type === "session" ? route.sessionID : undefined)) void store.refresh()
    }, opts.refreshMs)

    // 三个展示插槽。
    const unregisterSlots = [
      ctx.ui.slot({
        append: "sidebar.content",
        render: (input) => (
          <SidebarBalance ctx={ctx} store={store} sessionID={input.sessionID} provider={opts.provider} />
        ),
      }),
      ctx.ui.slot({
        append: "prompt.footer.status",
        render: (input) => (
          <SessionBalance
            ctx={ctx}
            store={store}
            sessionID={input.sessionID}
            provider={opts.provider}
            selectedProvider={selectedProvider}
          />
        ),
      }),
      ctx.ui.slot({
        append: "home.footer.status",
        render: () => (
          <HomeBalance ctx={ctx} store={store} provider={opts.provider} selectedProvider={selectedProvider} />
        ),
      }),
    ]

    // 插件停用时清理定时器、事件订阅与插槽。
    return () => {
      clearInterval(timer)
      for (const unsubscribe of unsubscribers) unsubscribe()
      for (const unregister of unregisterSlots) unregister()
    }
  },
})
