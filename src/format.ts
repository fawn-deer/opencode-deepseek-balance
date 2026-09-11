import type { BalanceInfo } from "./balance"

/**
 * 余额格式化。
 *
 * 使用 `Intl.NumberFormat` 并指定 `currencyDisplay: "narrowSymbol"`，
 * 这样 `CNY` 显示为 `¥`（而不是 `CN¥`）、`USD` 显示为 `$`。
 * 由于余额刷新频繁，按币种缓存 formatter 以避免重复构造。
 */

const formatters = new Map<string, Intl.NumberFormat>()

/** 获取（并缓存）指定币种的 formatter；币种非法时返回 undefined。 */
function formatter(currency: string): Intl.NumberFormat | undefined {
  const cached = formatters.get(currency)
  if (cached) return cached

  try {
    const created = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    })
    formatters.set(currency, created)
    return created
  } catch {
    return undefined
  }
}

/** 格式化单个币种：金额非数字或币种非法时回退为 `币种 原值`。 */
function formatOne(info: BalanceInfo): string {
  const value = Number(info.total_balance)
  const format = Number.isFinite(value) ? formatter(info.currency) : undefined
  if (format) return format.format(value)
  return `${info.currency} ${info.total_balance}`
}

/**
 * 把多币种余额格式化为一行文本，例如 `¥100.00 · $10.00`。
 *
 * @param infos 余额列表（可能为空）。
 * @returns 格式化文本；列表为空时返回 `undefined`。
 */
export function formatBalances(infos: readonly BalanceInfo[] | undefined): string | undefined {
  if (!infos || infos.length === 0) return undefined
  return infos.map(formatOne).join(" · ")
}
