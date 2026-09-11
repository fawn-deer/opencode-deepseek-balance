import { describe, expect, test } from "bun:test"
import {
  currentProviderID,
  homeProviderID,
  providerFromMessages,
  providerFromModel,
  providerFromSelectedModel,
} from "../src/provider"
import type { TuiPluginApi } from "@opencode-ai/plugin/tui"

describe("providerFromMessages", () => {
  test("returns the provider of the most recent message", () => {
    const messages = [
      { role: "user", model: { providerID: "deepseek" } },
      { role: "assistant", providerID: "openai" },
      { role: "user", model: { providerID: "deepseek" } },
    ]
    expect(providerFromMessages(messages)).toBe("deepseek")
  })

  test("reads the provider from user message models", () => {
    expect(providerFromMessages([{ role: "user", model: { providerID: "deepseek" } }])).toBe("deepseek")
  })

  test("reads the provider from assistant messages", () => {
    expect(providerFromMessages([{ role: "assistant", providerID: "deepseek" }])).toBe("deepseek")
  })

  test("returns undefined for an empty or unknown list", () => {
    expect(providerFromMessages([])).toBeUndefined()
    expect(providerFromMessages([{ role: "user" }, { role: "assistant" }])).toBeUndefined()
  })
})

describe("providerFromModel", () => {
  test("splits the provider prefix from a model id", () => {
    expect(providerFromModel("deepseek/deepseek-chat")).toBe("deepseek")
  })

  test("returns undefined when there is no provider prefix", () => {
    expect(providerFromModel(undefined)).toBeUndefined()
    expect(providerFromModel("")).toBeUndefined()
    expect(providerFromModel("deepseek-chat")).toBeUndefined()
  })
})

describe("currentProviderID", () => {
  test("uses the current session model before historical messages", () => {
    const api = {
      state: {
        config: { model: "openai/gpt-4o" },
        session: {
          get: () => ({ model: { providerID: "deepseek" } }),
          messages: () => [{ role: "assistant", providerID: "openai" }],
        },
      },
    } as unknown as TuiPluginApi

    expect(currentProviderID(api, "session")).toBe("deepseek")
  })

  test("falls back to messages when the session model is unavailable", () => {
    const api = {
      state: {
        config: { model: "openai/gpt-4o" },
        session: {
          get: () => undefined,
          messages: () => [{ role: "assistant", providerID: "deepseek" }],
        },
      },
    } as unknown as TuiPluginApi

    expect(currentProviderID(api, "session")).toBe("deepseek")
  })
})

describe("providerFromSelectedModel", () => {
  test("reads the provider of the most recent model", () => {
    expect(providerFromSelectedModel({ recent: [{ providerID: "deepseek", modelID: "deepseek-chat" }] })).toBe(
      "deepseek",
    )
  })

  test("skips entries without a provider", () => {
    expect(providerFromSelectedModel({ recent: [{ modelID: "x" }, { providerID: "deepseek" }] })).toBe("deepseek")
  })

  test("returns undefined for missing or invalid data", () => {
    expect(providerFromSelectedModel(undefined)).toBeUndefined()
    expect(providerFromSelectedModel(null)).toBeUndefined()
    expect(providerFromSelectedModel("nope")).toBeUndefined()
    expect(providerFromSelectedModel({})).toBeUndefined()
    expect(providerFromSelectedModel({ recent: [] })).toBeUndefined()
    expect(providerFromSelectedModel({ recent: "nope" })).toBeUndefined()
  })
})

describe("homeProviderID", () => {
  test("prefers the selected recent model", () => {
    expect(homeProviderID("deepseek", "volcengine/deepseek-v4")).toBe("deepseek")
  })

  test("falls back to the configured model", () => {
    expect(homeProviderID(undefined, "deepseek/deepseek-chat")).toBe("deepseek")
  })

  test("returns undefined when neither is available", () => {
    expect(homeProviderID(undefined, undefined)).toBeUndefined()
  })
})
