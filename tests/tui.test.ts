import { describe, expect, test } from "bun:test"
import type { TuiPluginApi, TuiPluginMeta } from "@opencode-ai/plugin/tui"
import plugin from "../src/tui"
import { displayText } from "../src/view"
import { resolveOptions } from "../src/options"
import { createBalanceStore } from "../src/store"
import type { BalanceResponse } from "../src/balance"

const meta = {} as TuiPluginMeta

type Registration = { order?: number; slots: Record<string, unknown> }

const okBody: BalanceResponse = {
  is_available: true,
  balance_infos: [
    { currency: "CNY", total_balance: "110.00", granted_balance: "0.00", topped_up_balance: "110.00" },
  ],
}

function fakeApi() {
  const registrations: Registration[] = []
  const disposers: Array<() => void | Promise<void>> = []

  const api = {
    state: {
      path: { state: "/tmp/opencode-deepseek-balance-missing" },
      config: { model: "deepseek/deepseek-chat" },
      session: { messages: () => [] },
    },
    route: { current: { name: "home" } },
    event: { on: () => () => {} },
    lifecycle: { onDispose: (fn: () => void | Promise<void>) => disposers.push(fn) },
    slots: {
      register: (registration: Registration) => {
        registrations.push(registration)
        return "deepseek-balance"
      },
    },
    theme: { current: {} },
  }

  return { api: api as unknown as TuiPluginApi, registrations, disposers }
}

describe("deepseek-balance tui plugin", () => {
  test("exports a valid tui plugin module", () => {
    expect(plugin.id).toBe("deepseek-balance")
    expect(typeof plugin.tui).toBe("function")
  })

  test("registers the sidebar, session prompt and home prompt slots", async () => {
    const { api, registrations } = fakeApi()

    await plugin.tui(api, {}, meta)

    const names = registrations.flatMap((item) => Object.keys(item.slots))
    expect(names).toContain("sidebar_content")
    expect(names).toContain("session_prompt_right")
    expect(names).toContain("home_prompt_right")
    expect(registrations.find((item) => "sidebar_content" in item.slots)?.order).toBe(101)
  })

  test("registers a lifecycle disposer", async () => {
    const { api, disposers } = fakeApi()

    await plugin.tui(api, {}, meta)

    expect(disposers.length).toBeGreaterThan(0)
    for (const dispose of disposers) await dispose()
  })
})

describe("resolveOptions", () => {
  test("uses defaults when options are missing", () => {
    expect(resolveOptions(undefined)).toEqual({ provider: "deepseek", refreshMs: 60_000 })
  })

  test("honors provided values", () => {
    expect(resolveOptions({ provider: "custom", refreshMs: 5_000 })).toEqual({
      provider: "custom",
      refreshMs: 5_000,
    })
  })

  test("ignores invalid values", () => {
    expect(resolveOptions({ provider: "", refreshMs: -1 })).toEqual({
      provider: "deepseek",
      refreshMs: 60_000,
    })
    expect(resolveOptions({ provider: 7, refreshMs: Number.NaN })).toEqual({
      provider: "deepseek",
      refreshMs: 60_000,
    })
  })
})

describe("displayText", () => {
  test("formats a ready balance", async () => {
    const store = createBalanceStore({ getKey: async () => "sk", getBalance: async () => okBody })
    await store.refresh()
    expect(displayText(store)).toBe("¥110.00")
  })

  test("reports a missing key", async () => {
    const store = createBalanceStore({ getKey: async () => undefined, getBalance: async () => okBody })
    await store.refresh()
    expect(displayText(store)).toBe("no API key")
  })

  test("reports an unavailable balance on error", async () => {
    const store = createBalanceStore({
      getKey: async () => "sk",
      getBalance: async () => {
        throw new Error("network")
      },
    })
    await store.refresh()
    expect(displayText(store)).toBe("unavailable")
  })

  test("reports when the provider marks the balance unavailable", async () => {
    const store = createBalanceStore({
      getKey: async () => "sk",
      getBalance: async () => ({ ...okBody, is_available: false, balance_infos: [] }),
    })
    await store.refresh()
    expect(displayText(store)).toBe("unavailable")
  })

  test("shows a placeholder before the first load", () => {
    const store = createBalanceStore({ getKey: async () => "sk", getBalance: async () => okBody })
    expect(displayText(store)).toBe("—")
  })
})
