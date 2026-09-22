/**
 * 构建脚本：把 `src/tui.tsx` 打成 `dist/tui.js`（供 `exports["./tui"]` 使用）。
 *
 * 关键点：必须使用 `@opentui/solid` 提供的 solid 转换插件（babel-preset-solid）
 * 来编译 JSX，产出 `createElement` / `insert` / `setProp` 调用——与 opencode
 * 内置插件完全一致。若改用 Bun 默认的 JSX 运行时（`@opentui/solid/jsx-runtime`
 * 的 `jsx/jsxs`），插件能被加载、组件也会挂载，但宿主不会把插槽内容渲染出来。
 *
 * 下面这些包在运行时由 opencode 宿主注入（其 `ensureRuntimePluginSupport`
 * 会把 `@opentui/*`、`solid-js` 等映射到宿主模块），因此全部标记为 external。
 */
import solid from "@opentui/solid/bun-plugin"

const result = await Bun.build({
  entrypoints: ["./src/tui.tsx"],
  outdir: "./dist",
  target: "bun",
  plugins: [solid],
  external: [
    "@opencode/plugin",
    "@opencode/client",
    "@opentui/core",
    "@opentui/solid",
    "solid-js",
    "solid-js/store",
  ],
})

if (!result.success) {
  for (const message of result.logs) console.error(message)
  process.exit(1)
}
