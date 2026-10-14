import { afterEach, describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import os from "node:os"
import path from "node:path"
import { extractApiKey, readApiKeyFromDb, defaultDataDir } from "../src/credential-db"

/** 与 opencode v2 `credential` 表兼容的最小建表语句（测试用）。 */
const CREATE_CREDENTIAL_TABLE = `
  CREATE TABLE credential (
    id text PRIMARY KEY,
    integration_id text,
    label text NOT NULL,
    value text NOT NULL,
    connector_id text,
    method_id text,
    active integer,
    time_created integer NOT NULL,
    time_updated integer NOT NULL
  )
`

type Row = {
  id: string
  integration_id: string
  value: string
  active: number
  time_updated: number
}

const tempDirs: string[] = []

async function tempDb(rows: Row[] = []): Promise<string> {
  const dir = (await Bun.$`mktemp -d`.text()).trim()
  tempDirs.push(dir)
  const file = path.join(dir, "opencode.db")
  const db = new Database(file)
  db.run(CREATE_CREDENTIAL_TABLE)
  for (const row of rows) {
    db.run("INSERT INTO credential (id, integration_id, label, value, active, time_created, time_updated) VALUES (?, ?, ?, ?, ?, ?, ?)", [
      row.id,
      row.integration_id,
      "DeepSeek",
      row.value,
      row.active,
      row.time_updated,
      row.time_updated,
    ])
  }
  db.close()
  return file
}

afterEach(async () => {
  while (tempDirs.length) {
    const dir = tempDirs.pop()
    if (dir) await Bun.$`rm -rf ${dir}`.quiet()
  }
})

describe("extractApiKey", () => {
  test("returns the key from a type=key credential value", () => {
    expect(extractApiKey(JSON.stringify({ type: "key", key: "sk-abc" }))).toBe("sk-abc")
  })

  test("returns undefined for oauth / non-key credential values", () => {
    expect(extractApiKey(JSON.stringify({ type: "oauth", access: "x" }))).toBeUndefined()
    expect(extractApiKey(JSON.stringify({ key: "sk-abc" }))).toBeUndefined()
  })

  test("returns undefined for malformed values", () => {
    expect(extractApiKey(undefined)).toBeUndefined()
    expect(extractApiKey("{ not json")).toBeUndefined()
    expect(extractApiKey(JSON.stringify({ type: "key", key: 42 }))).toBeUndefined()
    expect(extractApiKey(JSON.stringify({ type: "key", key: "" }))).toBeUndefined()
    expect(extractApiKey("nope")).toBeUndefined()
  })
})

describe("defaultDataDir", () => {
  test("respects XDG_DATA_HOME when set", () => {
    const previous = process.env.XDG_DATA_HOME
    process.env.XDG_DATA_HOME = "/custom/data"
    try {
      expect(defaultDataDir()).toBe("/custom/data/opencode")
    } finally {
      if (previous === undefined) delete process.env.XDG_DATA_HOME
      else process.env.XDG_DATA_HOME = previous
    }
  })

  test("falls back to the default data dir", () => {
    const previous = process.env.XDG_DATA_HOME
    delete process.env.XDG_DATA_HOME
    try {
      expect(defaultDataDir()).toBe(path.join(os.homedir(), ".local", "share", "opencode"))
    } finally {
      if (previous !== undefined) process.env.XDG_DATA_HOME = previous
    }
  })
})

describe("readApiKeyFromDb", () => {
  test("reads the active key for the given provider", async () => {
    const file = await tempDb([
      { id: "c1", integration_id: "deepseek", value: JSON.stringify({ type: "key", key: "sk-live" }), active: 1, time_updated: 1 },
    ])
    expect(await readApiKeyFromDb("deepseek", file)).toBe("sk-live")
  })

  test("ignores inactive credentials", async () => {
    const file = await tempDb([
      { id: "c1", integration_id: "deepseek", value: JSON.stringify({ type: "key", key: "sk-off" }), active: 0, time_updated: 2 },
    ])
    expect(await readApiKeyFromDb("deepseek", file)).toBeUndefined()
  })

  test("ignores other integrations", async () => {
    const file = await tempDb([
      { id: "c1", integration_id: "openai", value: JSON.stringify({ type: "key", key: "sk-other" }), active: 1, time_updated: 1 },
    ])
    expect(await readApiKeyFromDb("deepseek", file)).toBeUndefined()
  })

  test("ignores non-key credential values", async () => {
    const file = await tempDb([
      { id: "c1", integration_id: "deepseek", value: JSON.stringify({ type: "oauth", access: "x" }), active: 1, time_updated: 1 },
    ])
    expect(await readApiKeyFromDb("deepseek", file)).toBeUndefined()
  })

  test("prefers the most recently updated active credential", async () => {
    const file = await tempDb([
      { id: "c1", integration_id: "deepseek", value: JSON.stringify({ type: "key", key: "sk-old" }), active: 1, time_updated: 1 },
      { id: "c2", integration_id: "deepseek", value: JSON.stringify({ type: "key", key: "sk-new" }), active: 1, time_updated: 5 },
    ])
    expect(await readApiKeyFromDb("deepseek", file)).toBe("sk-new")
  })

  test("returns undefined when the database file is missing", async () => {
    const dir = (await Bun.$`mktemp -d`.text()).trim()
    tempDirs.push(dir)
    expect(await readApiKeyFromDb("deepseek", path.join(dir, "opencode.db"))).toBeUndefined()
  })

  test("returns undefined when the credential table is missing", async () => {
    const dir = (await Bun.$`mktemp -d`.text()).trim()
    tempDirs.push(dir)
    const file = path.join(dir, "opencode.db")
    const db = new Database(file)
    db.run("CREATE TABLE unrelated (id text PRIMARY KEY)")
    db.close()
    expect(await readApiKeyFromDb("deepseek", file)).toBeUndefined()
  })
})
