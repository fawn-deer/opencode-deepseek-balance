import { readFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

/**
 * 凭证（API Key）解析。
 *
 * opencode 用 `opencode auth login` 把凭证写入 `auth.json`，格式为：
 * ```
 * { "deepseek": { "type": "api", "key": "sk-..." } }
 * ```
 * 插件只读取 `type === "api"` 的 `key`，不做任何写入，也不会打印密钥。
 */

/**
 * 从已解析的 `auth.json` 对象中取出指定 provider 的 API Key。
 *
 * @param auth 解析后的 `auth.json` 内容（未知类型，需运行时校验）。
 * @param providerID 目标 provider，例如 `deepseek`。
 * @returns 命中的 API Key；结构不符或为 OAuth 凭证时返回 `undefined`。
 */
export function extractApiKey(auth: unknown, providerID: string): string | undefined {
  if (!auth || typeof auth !== "object") return undefined

  const entry = (auth as Record<string, unknown>)[providerID]
  if (!entry || typeof entry !== "object") return undefined

  const { type, key } = entry as { type?: unknown; key?: unknown }
  if (type !== "api") return undefined
  if (typeof key !== "string" || key.length === 0) return undefined

  return key
}

/**
 * 从指定目录读取 `auth.json` 并取出 API Key。
 * 文件缺失或 JSON 非法时静默返回 `undefined`（凭证问题不应让插件崩溃）。
 *
 * @param stateDir 存放 `auth.json` 的目录。
 * @param providerID 目标 provider。
 */
export async function readApiKey(stateDir: string, providerID: string): Promise<string | undefined> {
  try {
    const raw = await readFile(path.join(stateDir, "auth.json"), "utf8")
    return extractApiKey(JSON.parse(raw), providerID)
  } catch {
    return undefined
  }
}

/**
 * 返回 `auth.json` 的候选目录（按优先级）。
 *
 * 背景：opencode 把 `auth.json` 放在**数据目录**
 * （`$XDG_DATA_HOME/opencode`，未设置时回退 `~/.local/share/opencode`），
 * 早期版本也可能出现在状态目录，因此一并作为回退。
 */
export function defaultAuthDirs(): string[] {
  const dirs: string[] = []

  const xdgData = process.env.XDG_DATA_HOME?.trim()
  if (xdgData) dirs.push(path.join(xdgData, "opencode"))

  dirs.push(path.join(os.homedir(), ".local", "share", "opencode"))
  dirs.push(path.join(os.homedir(), ".local", "state", "opencode"))

  return [...new Set(dirs)]
}

/**
 * 依次在候选目录中查找 API Key，返回第一个命中项。
 *
 * @param dirs 候选目录（见 {@link defaultAuthDirs}）。
 * @param providerID 目标 provider。
 */
export async function readApiKeyFromDirs(
  dirs: readonly string[],
  providerID: string,
): Promise<string | undefined> {
  for (const dir of dirs) {
    const key = await readApiKey(dir, providerID)
    if (key) return key
  }
  return undefined
}
