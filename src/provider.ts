import type { TuiPluginApi } from "@opencode-ai/plugin/tui"

/**
 * provider（模型提供方）判定。
 *
 * 插件只在“当前模型 provider === deepseek”时展示余额，因此需要区分两种场景：
 *
 * 1. **会话路由**：优先读会话自身的模型 `session.model.providerID`，
 *    再回退到最近一条消息的 provider，最后回退到全局默认 `config.model`。
 * 2. **新建会话（home）**：没有会话，插件 API 也不暴露“当前选中的模型”。
 *    只能使用启发式：`model.json` 的 `recent[0]`（最近一次显式选择的模型），
 *    再用 `config.model` 兜底。
 */

/** 仅提取判定所需字段的消息最小结构。 */
type ProviderMessage = {
  role?: string
  providerID?: unknown
  model?: { providerID?: unknown } | undefined
}

/**
 * 从消息列表中取“最近一条带 provider 的消息”的 provider。
 *
 * 用户消息的 provider 在 `model.providerID`，助手消息在顶层 `providerID`。
 *
 * @param messages 会话消息（按时间正序）。
 * @returns provider id；找不到时返回 `undefined`。
 */
export function providerFromMessages(messages: readonly ProviderMessage[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (!message) continue

    if (typeof message.providerID === "string" && message.providerID) return message.providerID

    const nested = message.model?.providerID
    if (typeof nested === "string" && nested) return nested
  }
  return undefined
}

/**
 * 从 `provider/model` 形式的模型 id 中拆出 provider。
 *
 * @example providerFromModel("deepseek/deepseek-chat") // "deepseek"
 * @returns provider id；无 `/` 前缀时返回 `undefined`。
 */
export function providerFromModel(model: string | undefined): string | undefined {
  if (!model) return undefined
  const separator = model.indexOf("/")
  if (separator <= 0) return undefined
  return model.slice(0, separator)
}

/** 读取会话自身记录的模型 provider（首选信号）。 */
function providerFromSession(api: TuiPluginApi, sessionID: string): string | undefined {
  const model = api.state.session.get(sessionID)?.model
  return typeof model?.providerID === "string" && model.providerID ? model.providerID : undefined
}

/**
 * 会话场景下判定当前 provider。
 *
 * 优先级：会话模型 → 最近消息 → 全局默认模型。
 *
 * @param api TUI 插件 API。
 * @param sessionID 会话 id。
 */
export function currentProviderID(api: TuiPluginApi, sessionID: string): string | undefined {
  const sessionProvider = providerFromSession(api, sessionID)
  if (sessionProvider) return sessionProvider

  const messages = api.state.session.messages(sessionID) as readonly ProviderMessage[]
  return providerFromMessages(messages) ?? providerFromModel(api.state.config.model)
}

/**
 * 从解析后的 `model.json` 中取最近一次显式选择模型的 provider。
 *
 * `model.json` 结构形如 `{ recent: [{ providerID, modelID }, ...], ... }`。
 *
 * @param data 解析后的 `model.json`（未知类型，需运行时校验）。
 */
export function providerFromSelectedModel(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined

  const recent = (data as { recent?: unknown }).recent
  if (!Array.isArray(recent)) return undefined

  for (const item of recent) {
    if (!item || typeof item !== "object") continue
    const providerID = (item as { providerID?: unknown }).providerID
    if (typeof providerID === "string" && providerID) return providerID
  }

  return undefined
}

/**
 * home（新建会话）场景下的 provider 判定（启发式）。
 *
 * @param recentProvider `model.json` 中最近一次选择模型的 provider。
 * @param configModel 全局默认模型 `config.model`。
 * @returns 优先 `recentProvider`，否则从 `configModel` 解析。
 *
 * @remarks
 * 这是近似判定：若有效模型来自未持久化的内存值（例如“循环模型”快捷键、
 * 历史消息回填、per-agent 配置或 CLI `--model`），可能与实际选中项不一致。
 * 要 100% 精确需上游在插件 API 暴露当前选中模型。
 */
export function homeProviderID(
  recentProvider: string | undefined,
  configModel: string | undefined,
): string | undefined {
  return recentProvider ?? providerFromModel(configModel)
}
