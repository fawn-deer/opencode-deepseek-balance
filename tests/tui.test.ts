import { describe, expect, test } from "bun:test"
import type { Context } from "@opencode/plugin/tui/context"
import plugin from "../src/tui"
import { displayText } from "../src/view"
import { resolveOptions } from "../src/options"
import { createBalanceStore } from "../src/store"
import type { BalanceResponse } from "../src/balance"

const okBody: BalanceResponse = {
  is_available: true,
  balance_infos: [
    { currency: "CNY", total_balance: "110.00", granted_balance: "0.00", topped_up_balance: "110.00" },
  ],
}

type Claim = { append?: string; prepend?: string; before?: string; after?: string; replace?: string }

function fakeContext(models: { providerID: string; id: string } | null = { providerID: "deepseek", id: "deepseek-chat" }) {
  const claims: Claim[] = []
  let subscriptions = 0
  let unsubscribes = 0
  let slotUnregisters = 0

  const context = {
    options: {},
    client: {
      model: {
        default: async () => ({ location: {}, data: models }),
      },
    },
    data: {
      session: { get: () => undefined },
      on: (_type: string, _handler: unknown) => {
        subscriptions += 1
        return () => {
          unsubscribes += 1
        }
      },
    },
    ui: {
      router: { current: () => ({ type: "home" }) },
      slot: (claim: Claim) => {
        claims.push(claim)
        return () => {
          slotUnregisters += 1
        }
      },
    },
    theme: {
      text: {
        base: {},
        muted: {},
        feedback: {
          success: { base: {} },
          warning: { base: {} },
          error: { base: {} },
          info: { base: {} },
        },
      },
    },
  }

  return {
    context: context as unknown as Context,
    claims,
    stats: () => ({ subscriptions, unsubscribes, slotUnregisters }),
  }
}

describe("deepseek-balance tui plugin", () => {
  test("exports a v2 plugin definition", () => {
    expect(plugin.id).toBe("deepseek-balance")
    expect(typeof plugin.setup).toBe("function")
  })

  test("registers the sidebar, prompt footer and home footer slots", async () => {
    const { context, claims } = fakeContext()

    const cleanup = await plugin.setup(context)

    const paths = claims.map((claim) => claim.append)
    expect(paths).toContain("sidebar.content")
    expect(paths).toContain("prompt.footer.status")
    expect(paths).toContain("home.footer.status")

    expect(typeof cleanup).toBe("function")
    cleanup?.()
  })

  test("subscribes events and disposes them on cleanup", async () => {
    const { context, stats } = fakeContext()

    const cleanup = await plugin.setup(context)
    expect(stats().subscriptions).toBeGreaterThan(0)

    cleanup?.()
    expect(stats().unsubscribes).toBe(stats().subscriptions)
    expect(stats().slotUnregisters).toBe(3)
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
