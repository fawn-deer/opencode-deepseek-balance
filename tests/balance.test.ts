import { describe, expect, test } from "bun:test"
import { fetchBalance } from "../src/balance"

const okBody = {
  is_available: true,
  balance_infos: [
    { currency: "CNY", total_balance: "110.00", granted_balance: "10.00", topped_up_balance: "100.00" },
  ],
}

describe("fetchBalance", () => {
  test("requests the DeepSeek balance endpoint with bearer auth", async () => {
    let seenUrl = ""
    let seenAuth = ""
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      seenUrl = String(url)
      seenAuth = new Headers(init?.headers).get("authorization") ?? ""
      return new Response(JSON.stringify(okBody), { status: 200, headers: { "content-type": "application/json" } })
    }) as typeof fetch

    const result = await fetchBalance("sk-test", fetchImpl)

    expect(seenUrl).toBe("https://api.deepseek.com/user/balance")
    expect(seenAuth).toBe("Bearer sk-test")
    expect(result.is_available).toBe(true)
    expect(result.balance_infos[0]?.total_balance).toBe("110.00")
  })

  test("throws with the status when the request fails", async () => {
    const fetchImpl = (async () => new Response("unauthorized", { status: 401 })) as unknown as typeof fetch
    await expect(fetchBalance("sk-bad", fetchImpl)).rejects.toThrow("401")
  })

  test("throws when the response shape is invalid", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ nope: true }), { status: 200 })) as unknown as typeof fetch
    await expect(fetchBalance("sk-test", fetchImpl)).rejects.toThrow()
  })
})
