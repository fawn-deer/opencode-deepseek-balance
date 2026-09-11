import { createSignal } from "solid-js"
import type { BalanceResponse } from "./balance"

/**
 * 余额 store。
 *
 * 以 Solid signals 保存余额数据与请求状态，供三个展示插槽共享。
 * 请求逻辑通过 {@link BalanceStoreDeps} 注入（key 解析、接口调用），
 * 便于单元测试时替换。
 */

/** 请求状态。 */
export type BalanceStatus = "idle" | "loading" | "ready" | "error"

/** store 依赖（可注入，便于测试）。 */
export type BalanceStoreDeps = {
  /** 解析当前 provider 的 API Key。 */
  getKey: () => Promise<string | undefined>
  /** 使用 API Key 查询余额。 */
  getBalance: (key: string) => Promise<BalanceResponse>
  /** 时间源，默认 `Date.now`（便于测试）。 */
  now?: () => number
}

/** 余额 store 的实例类型。 */
export type BalanceStore = ReturnType<typeof createBalanceStore>

/**
 * 创建余额 store。
 *
 * `refresh()` 具备并发去重：同一时刻多次调用只会发起一个请求。
 *
 * @param deps 依赖注入。
 */
export function createBalanceStore(deps: BalanceStoreDeps) {
  const [status, setStatus] = createSignal<BalanceStatus>("idle")
  const [data, setData] = createSignal<BalanceResponse | undefined>(undefined)
  const [error, setError] = createSignal<string | undefined>(undefined)
  const [updatedAt, setUpdatedAt] = createSignal<number | undefined>(undefined)

  let inFlight: Promise<void> | undefined

  /**
   * 刷新余额。
   *
   * - 缺少 API Key：置错误码 `no-key`。
   * - 请求异常：把错误信息写入 `error`。
   * - 成功：写入数据与 `updatedAt`。
   */
  function refresh(): Promise<void> {
    if (inFlight) return inFlight

    inFlight = (async () => {
      setStatus("loading")
      try {
        const key = await deps.getKey()
        if (!key) {
          setData(undefined)
          setError("no-key")
          setStatus("error")
          return
        }

        const result = await deps.getBalance(key)
        setData(result)
        setError(undefined)
        setUpdatedAt((deps.now ?? Date.now)())
        setStatus("ready")
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause))
        setStatus("error")
      } finally {
        inFlight = undefined
      }
    })()

    return inFlight
  }

  return { status, data, error, updatedAt, refresh }
}
