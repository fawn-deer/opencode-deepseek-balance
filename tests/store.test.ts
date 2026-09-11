import { describe, expect, test } from "bun:test"
import { createBalanceStore } from "../src/store"
import type { BalanceResponse } from "../src/balance"

const okBody: BalanceResponse = {
  is_available: true,
  balance_infos: [
    { currency: "CNY", total_balance: "110.00", granted_balance: "10.00", topped_up_balance: "100.00" },
  ],
}

describe("createBalanceStore", () => {
  test("refresh loads the balance", async () => {
    const store = createBalanceStore({
      getKey: async () => "sk",
      getBalance: async () => okBody,
    })

    await store.refresh()

    expect(store.status()).toBe("ready")
    expect(store.data()?.balance_infos[0]?.total_balance).toBe("110.00")
  })

  test("refresh reports a missing key", async () => {
    const store = createBalanceStore({
      getKey: async () => undefined,
      getBalance: async () => okBody,
    })

    await store.refresh()

    expect(store.status()).toBe("error")
    expect(store.error()).toBe("no-key")
  })

  test("refresh captures request errors", async () => {
    const store = createBalanceStore({
      getKey: async () => "sk",
      getBalance: async () => {
        throw new Error("boom")
      },
    })

    await store.refresh()

    expect(store.status()).toBe("error")
    expect(store.error()).toBe("boom")
  })

  test("concurrent refreshes share a single request", async () => {
    let calls = 0
    const store = createBalanceStore({
      getKey: async () => "sk",
      getBalance: async () => {
        calls += 1
        return okBody
      },
    })

    await Promise.all([store.refresh(), store.refresh()])

    expect(calls).toBe(1)
  })
})
