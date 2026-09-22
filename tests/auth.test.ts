import { describe, expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import { defaultAuthDirs, extractApiKey, readApiKey, readApiKeyFromDirs } from "../src/auth"

describe("extractApiKey", () => {
  test("returns the api key for the given provider", () => {
    const auth = { deepseek: { type: "api", key: "sk-abc" } }
    expect(extractApiKey(auth, "deepseek")).toBe("sk-abc")
  })

  test("returns undefined for a missing provider", () => {
    expect(extractApiKey({ openai: { type: "api", key: "x" } }, "deepseek")).toBeUndefined()
  })

  test("returns undefined for non-api auth entries", () => {
    expect(extractApiKey({ deepseek: { type: "oauth", access: "x" } }, "deepseek")).toBeUndefined()
  })

  test("returns undefined for malformed auth data", () => {
    expect(extractApiKey(null, "deepseek")).toBeUndefined()
    expect(extractApiKey("nope", "deepseek")).toBeUndefined()
    expect(extractApiKey({ deepseek: { key: 42 } }, "deepseek")).toBeUndefined()
    expect(extractApiKey({ deepseek: null }, "deepseek")).toBeUndefined()
  })
})

describe("readApiKey", () => {
  test("reads the api key from auth.json in the state dir", async () => {
    const dir = await Bun.$`mktemp -d`.text()
    const stateDir = dir.trim()
    await Bun.write(`${stateDir}/auth.json`, JSON.stringify({ deepseek: { type: "api", key: "sk-file" } }))
    expect(await readApiKey(stateDir, "deepseek")).toBe("sk-file")
    await Bun.$`rm -rf ${stateDir}`.quiet()
  })

  test("returns undefined when auth.json is missing", async () => {
    const dir = (await Bun.$`mktemp -d`.text()).trim()
    expect(await readApiKey(dir, "deepseek")).toBeUndefined()
    await Bun.$`rm -rf ${dir}`.quiet()
  })

  test("returns undefined when auth.json is invalid json", async () => {
    const dir = (await Bun.$`mktemp -d`.text()).trim()
    await Bun.write(`${dir}/auth.json`, "{ not json")
    expect(await readApiKey(dir, "deepseek")).toBeUndefined()
    await Bun.$`rm -rf ${dir}`.quiet()
  })
})

describe("defaultAuthDirs", () => {
  test("respects XDG_DATA_HOME when set", () => {
    const previous = process.env.XDG_DATA_HOME
    process.env.XDG_DATA_HOME = "/custom/data"
    try {
      expect(defaultAuthDirs()).toContain("/custom/data/opencode")
    } finally {
      if (previous === undefined) delete process.env.XDG_DATA_HOME
      else process.env.XDG_DATA_HOME = previous
    }
  })

  test("includes the default data dir", () => {
    const dirs = defaultAuthDirs()
    expect(dirs).toContain(path.join(os.homedir(), ".local", "share", "opencode"))
  })
})

describe("readApiKeyFromDirs", () => {
  test("returns the key from the first directory that has one", async () => {
    const empty = (await Bun.$`mktemp -d`.text()).trim()
    const withKey = (await Bun.$`mktemp -d`.text()).trim()
    await Bun.write(`${withKey}/auth.json`, JSON.stringify({ deepseek: { type: "api", key: "sk-found" } }))

    expect(await readApiKeyFromDirs([empty, withKey], "deepseek")).toBe("sk-found")

    await Bun.$`rm -rf ${empty} ${withKey}`.quiet()
  })

  test("returns undefined when no directory has a key", async () => {
    const dir = (await Bun.$`mktemp -d`.text()).trim()
    expect(await readApiKeyFromDirs([dir], "deepseek")).toBeUndefined()
    await Bun.$`rm -rf ${dir}`.quiet()
  })
})
