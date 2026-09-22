import { describe, expect, test } from "bun:test"
import { providerFromModelRef } from "../src/provider"

describe("providerFromModelRef", () => {
  test("returns the provider id from a model ref", () => {
    expect(providerFromModelRef({ providerID: "deepseek", id: "deepseek-chat" })).toBe("deepseek")
  })

  test("returns undefined for missing or invalid refs", () => {
    expect(providerFromModelRef(undefined)).toBeUndefined()
    expect(providerFromModelRef(null)).toBeUndefined()
    expect(providerFromModelRef({})).toBeUndefined()
    expect(providerFromModelRef({ providerID: "" })).toBeUndefined()
    expect(providerFromModelRef({ providerID: 42 })).toBeUndefined()
  })
})
