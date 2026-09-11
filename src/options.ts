/**
 * 插件配置项解析。
 *
 * opencode 的 TUI 配置（`tui.json`）允许以
 * `[["@fawn/opencode-deepseek-balance", { ...options }]]` 的形式传入选项，
 * 这里负责把原始对象规范化成内部使用的强类型配置。
 */

/** 规范化后的插件配置。 */
export type ResolvedOptions = {
  /** 命中该 provider 时才展示余额，默认 `deepseek`。 */
  provider: string
  /** 余额自动刷新间隔（毫秒），默认 60000。 */
  refreshMs: number
}

/** 默认展示的 provider。 */
export const DEFAULT_PROVIDER = "deepseek"

/** 默认刷新间隔：60 秒。 */
export const DEFAULT_REFRESH_MS = 60_000

/**
 * 把 `tui.json` 传入的原始选项对象解析为 {@link ResolvedOptions}。
 *
 * - 缺省或非法的字段会回退到默认值，保证插件在任意配置下都能启动。
 * - `refreshMs` 必须是有限正数，否则改用默认值。
 *
 * @param raw opencode 传入的原始选项（可能为 `undefined`）。
 * @returns 规范化后的配置。
 */
export function resolveOptions(raw: Record<string, unknown> | undefined): ResolvedOptions {
  const refreshMs =
    typeof raw?.refreshMs === "number" && Number.isFinite(raw.refreshMs) && raw.refreshMs > 0
      ? raw.refreshMs
      : DEFAULT_REFRESH_MS
  const provider = typeof raw?.provider === "string" && raw.provider ? raw.provider : DEFAULT_PROVIDER
  return { provider, refreshMs }
}
