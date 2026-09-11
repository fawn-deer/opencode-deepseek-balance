/**
 * DeepSeek 余额接口客户端。
 *
 * 文档：`GET https://api.deepseek.com/user/balance`，使用
 * `Authorization: Bearer <API_KEY>` 鉴权。
 */

/** 单个币种的余额信息（金额均为字符串，避免浮点误差）。 */
export type BalanceInfo = {
  /** 货币：`CNY` 或 `USD`。 */
  currency: string
  /** 总可用余额（赠金 + 充值余额）。 */
  total_balance: string
  /** 未过期的赠金余额。 */
  granted_balance: string
  /** 充值余额。 */
  topped_up_balance: string
}

/** 余额接口响应。 */
export type BalanceResponse = {
  /** 当前账户是否有余额可供 API 调用。 */
  is_available: boolean
  /** 各币种余额。 */
  balance_infos: BalanceInfo[]
}

/** 余额接口地址。 */
export const BALANCE_URL = "https://api.deepseek.com/user/balance"

/** 运行时校验单个 `balance_infos` 元素。 */
function isBalanceInfo(value: unknown): value is BalanceInfo {
  if (!value || typeof value !== "object") return false
  const info = value as Record<string, unknown>
  return (
    typeof info.currency === "string" &&
    typeof info.total_balance === "string" &&
    typeof info.granted_balance === "string" &&
    typeof info.topped_up_balance === "string"
  )
}

/** 运行时校验整个响应结构。 */
function isBalanceResponse(value: unknown): value is BalanceResponse {
  if (!value || typeof value !== "object") return false
  const response = value as Record<string, unknown>
  return (
    typeof response.is_available === "boolean" &&
    Array.isArray(response.balance_infos) &&
    response.balance_infos.every(isBalanceInfo)
  )
}

/**
 * 查询 DeepSeek 账户余额。
 *
 * @param apiKey DeepSeek API Key。
 * @param fetchImpl 可注入的 fetch 实现（便于测试），默认使用全局 `fetch`。
 * @returns 校验通过的余额响应。
 * @throws 当 HTTP 状态非 2xx，或响应结构不符合预期时抛出。
 */
export async function fetchBalance(apiKey: string, fetchImpl: typeof fetch = fetch): Promise<BalanceResponse> {
  const response = await fetchImpl(BALANCE_URL, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  })

  if (!response.ok) {
    throw new Error(`DeepSeek balance request failed with status ${response.status}`)
  }

  const data: unknown = await response.json()
  if (!isBalanceResponse(data)) {
    throw new Error("DeepSeek balance response has an unexpected shape")
  }

  return data
}
