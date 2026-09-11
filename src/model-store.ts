import { watch, type FSWatcher } from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { createSignal, type Accessor } from "solid-js"
import { providerFromSelectedModel } from "./provider"

/**
 * 监听 opencode 的 `model.json`，跟踪“最近一次选择的模型”的 provider。
 *
 * 背景：TUI 在模型选择弹窗中会调用 `local.model.set(..., { recent: true })`，
 * 并把结果原子写入 `<state>/model.json`；但插件既收不到事件、API 也不暴露
 * 当前选中模型，因此只能直接监听该文件。
 *
 * 实现要点：
 * - 监听**目录**而不是文件：`model.json` 采用「临时文件 + rename」原子写入，
 *   rename 会替换 inode，文件级 watcher 会失效。
 * - macOS 上事件可能重复触发，用约 80ms 去抖合并。
 * - `fs.watch` 不可用时降级为“仅启动读取一次”，不影响会话路由功能。
 */

/** watcher 对外暴露的接口。 */
export type SelectedModelWatcher = {
  /** 最近一次选择模型的 provider（响应式）。 */
  provider: Accessor<string | undefined>
  /** 关闭 watcher 并清理定时器。 */
  dispose: () => void
}

/**
 * 创建 `model.json` 监听器。
 *
 * @param stateDir opencode 状态目录（`api.state.path.state`）。
 */
export function createSelectedModelWatcher(stateDir: string): SelectedModelWatcher {
  const [provider, setProvider] = createSignal<string | undefined>(undefined)

  let watcher: FSWatcher | undefined
  let debounce: ReturnType<typeof setTimeout> | undefined

  /** 读取并解析 `model.json`，失败时置为 undefined。 */
  async function read(): Promise<void> {
    try {
      const raw = await readFile(path.join(stateDir, "model.json"), "utf8")
      setProvider(providerFromSelectedModel(JSON.parse(raw)))
    } catch {
      setProvider(undefined)
    }
  }

  /** 去抖后重新读取。 */
  function schedule(): void {
    if (debounce) clearTimeout(debounce)
    debounce = setTimeout(() => {
      debounce = undefined
      void read()
    }, 80)
  }

  // 启动时先读取一次，避免等到第一次文件变更。
  void read()

  try {
    watcher = watch(stateDir, (_event, filename) => {
      const name = filename ? String(filename) : ""
      // 只关心 model.json 的变更；filename 为空时保守地也触发一次。
      if (!name || name.includes("model.json")) schedule()
    })
    watcher.on("error", () => {})
  } catch {
    watcher = undefined
  }

  return {
    provider,
    dispose() {
      if (debounce) clearTimeout(debounce)
      watcher?.close()
    },
  }
}
