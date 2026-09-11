import { describe, expect, test } from "bun:test"
import { formatBalances } from "../src/format"

const info = (currency: string, total: string) => ({
  currency,
  total_balance: total,
  granted_balance: "0.00",
  topped_up_balance: total,
})

describe("formatBalances", () => {
  test("formats a single USD balance", () => {
    expect(formatBalances([info("USD", "15.00")])).toBe("$15.00")
  })

  test("formats a single CNY balance", () => {
    expect(formatBalances([info("CNY", "110.00")])).toBe("¥110.00")
  })

  test("joins multiple currencies", () => {
    expect(formatBalances([info("CNY", "110.00"), info("USD", "15.00")])).toBe("¥110.00 · $15.00")
  })

  test("falls back to a plain label for non-numeric totals", () => {
    expect(formatBalances([info("CNY", "unlimited")])).toBe("CNY unlimited")
  })

  test("returns undefined for an empty list", () => {
    expect(formatBalances([])).toBeUndefined()
  })
})
