/**
 * provider（模型提供方）判定。
 *
 * opencode v2 的 CLI 插件上下文直接暴露“当前模型”：
 * - 会话：`ctx.data.session.get(id)?.model`（`ModelRef`，形如 `{ providerID, id, variant? }`）
 * - home：`ctx.client.model.default()`（返回默认/选中模型）
 *
 * 这里只保留纯解析函数，便于单元测试；响应式与异步逻辑放在 `tui.tsx`。
 */

/** 仅需 `providerID` 的最小模型引用结构（允许携带其它字段）。 */
export type ModelRefLike = { providerID?: unknown; [key: string]: unknown }

/**
 * 从模型引用（`ModelRef` 或 `ModelInfo`）中取出 provider id。
 *
 * @param ref 形如 `{ providerID, id }` 的模型引用；允许 `null`/`undefined`。
 * @returns provider id；结构不符或为空时返回 `undefined`。
 */
export function providerFromModelRef(ref: ModelRefLike | null | undefined): string | undefined {
  if (!ref || typeof ref !== "object") return undefined
  const providerID = ref.providerID
  return typeof providerID === "string" && providerID ? providerID : undefined
}
