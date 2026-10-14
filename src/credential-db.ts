import { Database } from "bun:sqlite"
import os from "node:os"
import path from "node:path"

/**
 * 凭证（API Key）解析：opencode v2 的数据库。
 *
 * v2 把凭证存进数据目录下的 SQLite 数据库（`opencode.db` 的 `credential`
 * 表），`auth.json` 只是 v1 遗留文件（v2 仅在一次性迁移
 * `import_legacy_credentials` 时读取它，之后不再写入）。
 *
 * 插件以**只读**方式打开该库，按 `integration_id` 取当前启用的凭证，
 * 绝不写入，也不会打印密钥。
 */

/** `credential.value` 中 `type === "key"` 条目的结构。 */
type CredentialValue = {
  type?: unknown
  key?: unknown
}

/**
 * opencode 的数据目录（凭证数据库所在目录）。
 *
 * 优先 `$XDG_DATA_HOME/opencode`，未设置时回退 `~/.local/share/opencode`。
 */
export function defaultDataDir(): string {
  const xdgData = process.env.XDG_DATA_HOME?.trim()
  if (xdgData) return path.join(xdgData, "opencode")
  return path.join(os.homedir(), ".local", "share", "opencode")
}

/** 凭证数据库文件名。 */
export const CREDENTIAL_DB_FILE = "opencode.db"

/**
 * 从 `credential.value` 字符串中取出 API Key。
 *
 * 仅接受 `{ "type": "key", "key": "sk-..." }`；OAuth 等其它形式一律忽略。
 *
 * @param value `credential.value` 原始字符串（未知类型，需运行时校验）。
 * @returns 命中的 API Key；结构不符时返回 `undefined`。
 */
export function extractApiKey(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined

  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    return undefined
  }

  if (!parsed || typeof parsed !== "object") return undefined

  const entry = parsed as CredentialValue
  if (entry.type !== "key") return undefined
  if (typeof entry.key !== "string" || entry.key.length === 0) return undefined

  return entry.key
}

/**
 * 从 opencode v2 数据库读取指定 provider 的 API Key。
 *
 * 文件缺失、表不存在、JSON 非法或没有启用中的凭证时静默返回 `undefined`
 * （凭证问题不应让插件崩溃）。
 *
 * @param providerID 目标 provider（即 `credential.integration_id`），例如 `deepseek`。
 * @param dbPath 数据库路径，默认取 {@link defaultDataDir} 下的 `opencode.db`（便于测试注入）。
 */
export async function readApiKeyFromDb(providerID: string, dbPath?: string): Promise<string | undefined> {
  const file = dbPath ?? path.join(defaultDataDir(), CREDENTIAL_DB_FILE)

  let db: Database | undefined
  try {
    // 只读打开：文件不存在时不会创建新库，也避免对正在运行的 opencode 造成任何写入。
    db = new Database(file, { readonly: true })
    const row = db
      .query(
        "SELECT value FROM credential WHERE integration_id = ? AND active = 1 ORDER BY time_updated DESC LIMIT 1",
      )
      .get(providerID) as { value?: unknown } | null

    return extractApiKey(row?.value)
  } catch {
    return undefined
  } finally {
    db?.close()
  }
}
