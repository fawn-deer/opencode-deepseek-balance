# opencode-deepseek-balance

一个 [opencode](https://opencode.ai) 的 **TUI 插件**：当当前选中的模型 provider 为 `deepseek` 时，
在界面上显示你的 **DeepSeek 账户余额**。非 deepseek 模型时自动隐藏，不会发起任何余额请求。

## 特性

- **三处展示**
  - 侧边栏：在内置 `Context` 区块正下方显示 `余额` 区块（`sidebar_content`，order 101）。
  - 会话输入行：在输入框下方信息行右侧显示 `余额 ¥…`（`session_prompt_right`）。
  - 新建会话界面：在模型选择行右侧显示 `余额 ¥…`（`home_prompt_right`）。
- **自动/手动刷新**：挂载、provider 切换为 deepseek、`session.idle`、每 60 秒（可配）自动刷新；
  点击余额可立即刷新。
- **零侵入**：只读 opencode 的 `auth.json`；密钥不会写入日志，也不会发送到 DeepSeek 之外的地址。
- **优雅降级**：缺少密钥显示 `no API key`，请求失败显示 `unavailable`，不会影响 opencode 正常运行。

效果示例（侧边栏）：

```
Context
1,000 tokens
10% used
$0.10 spent
余额
¥100.00
```

> 以上数字仅为示例。

## 前置要求

- opencode **>= 1.18.0**（TUI 插件系统）。
- 已配置 DeepSeek provider 与凭证，即 `auth.json` 中存在：

  ```json
  { "deepseek": { "type": "api", "key": "sk-..." } }
  ```

  通常通过 `opencode auth login`（或 `opencode providers`）写入。

## 安装

> opencode 的 **TUI 插件**配置位于 `tui.json`，**不是** `opencode.json`。
> 修改后需要**完全退出并重启 opencode**（TUI 配置不会热重载）。

### 方式一：npm 包（推荐）

用 opencode CLI 安装（会自动写入 TUI 配置并安装依赖）：

```sh
opencode plugin @fawn/opencode-deepseek-balance
```

或手动编辑全局 `~/.config/opencode/tui.json`：

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["@fawn/opencode-deepseek-balance"]
}
```

带选项：

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [["@fawn/opencode-deepseek-balance", { "refreshMs": 30000 }]]
}
```

### 方式二：本地源码

把 `tui.json` 的 `plugin` 指向本仓库的构建产物或源码（相对路径基于该配置文件解析）：

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [["/absolute/path/to/opencode-deepseek-balance/dist/tui.js", { "refreshMs": 60000 }]]
}
```

本地开发时也可直接指向源码 `.tsx`（opencode 会用内置的 solid 转换编译）：

```json
{ "plugin": ["/absolute/path/to/opencode-deepseek-balance/src/tui.tsx"] }
```

## 配置项

`tui.json` 中插件条目支持以下选项：

| 选项        | 类型     | 默认值       | 说明                                 |
| ----------- | -------- | ------------ | ------------------------------------ |
| `provider`  | `string` | `"deepseek"` | 命中该 provider 时才展示余额。       |
| `refreshMs` | `number` | `60000`      | 余额自动刷新间隔（毫秒），需为正数。 |

## 工作原理

### 展示与门控

插件通过 `api.slots.register(...)` 注册三个插槽。是否展示由「当前模型 provider 是否等于
`provider` 配置」决定：

- **会话路由**：优先读取会话自身的模型 `api.state.session.get(id).model.providerID`；
  若无则回退到最近一条消息的 provider，再回退到全局默认模型 `api.state.config.model`。
- **新建会话界面（home）**：没有会话对象，插件 API 也不暴露“当前选中的模型”，因此使用启发式：
  读取 opencode 状态目录下 `model.json` 的 `recent[0]`（最近一次显式选择的模型），
  再用 `config.model` 兜底。

### 凭证读取

`auth.json` 位于 opencode 的**数据目录**，而 TUI 插件 API 只暴露**状态目录**。
插件会按以下顺序查找，取第一个存在的密钥：

```
$XDG_DATA_HOME/opencode/auth.json          # 设置了 XDG_DATA_HOME 时
~/.local/share/opencode/auth.json          # 默认
~/.local/state/opencode/auth.json          # 回退
<api.state.path.state>/auth.json           # 回退
```

仅使用 `{ "type": "api", "key": "..." }` 形式的凭证；OAuth 等其它形式会被忽略。

### 余额接口

调用 DeepSeek 官方接口：

```
GET https://api.deepseek.com/user/balance
Authorization: Bearer <API_KEY>
```

响应示例：

```json
{
  "is_available": true,
  "balance_infos": [
    { "currency": "CNY", "total_balance": "100.00", "granted_balance": "0.00", "topped_up_balance": "100.00" }
  ]
}
```

多币种会格式化为 `¥100.00 · $10.00` 形式（`CNY`→`¥`、`USD`→`$`）。

### 刷新触发点

- 展示组件挂载 / provider 变为 deepseek 时立即刷新；
- opencode 触发 `session.idle` 事件时；
- 每 `refreshMs`（默认 60s）定时刷新，**仅在命中目标 provider 时**；
- 点击余额文本时强制刷新。

并发刷新在 store 内部去重，同一时刻只会有一个请求在飞。

### `model.json` 监听

home 界面使用 `fs.watch` 监听 opencode 状态目录，感知 `model.json` 的变化：

- 监听**目录**而非文件：`model.json` 采用「临时文件 + rename」原子写入，rename 会替换 inode，
  文件级监听会失效；
- 对 macOS 的重复事件做约 80ms 去抖；
- `fs.watch` 不可用时降级为“仅启动读取一次”，不影响会话路由功能。

> 注意：模型选择本身**不会**触发插件可见的事件，这是采用文件监听的直接原因。

## 开发

需要 [Bun](https://bun.sh)。

```sh
bun install
bun run check      # 类型检查 + 单元测试
bun run build      # 构建 dist/tui.js + 生成 .d.ts
```

### 目录结构

```
build.ts            # 构建脚本（使用 @opentui/solid 的 solid 转换）
src/
  tui.tsx           # 插件入口：解析配置、注册插槽、生命周期
  view.tsx          # Solid 组件（余额文本行、侧边栏区块等）
  options.ts        # 配置解析与默认值
  auth.ts           # 从 auth.json 读取 API Key
  balance.ts        # DeepSeek 余额接口客户端与响应校验
  format.ts         # 货币格式化
  provider.ts       # provider 判定（会话 + home 启发式）
  model-store.ts    # 监听 model.json 得到当前选中 provider
  store.ts          # 余额 store（signals + 请求状态机）
tests/              # Bun 单元测试
```

### 构建为什么必须用 solid 转换

`build.ts` 使用 `@opentui/solid` 提供的 **solid 转换插件**（`babel-preset-solid`）编译 JSX，
产出 `createElement` / `insert` / `setProp` 调用——这与 opencode 内置插件完全一致。

如果改用 Bun 默认的 JSX 运行时（`@opentui/solid/jsx-runtime` 的 `jsx/jsxs`），插件能被加载、
组件也会挂载、甚至能取到正确数据，但**宿主不会把插槽内容渲染出来**。这是本项目踩过的关键坑。

打包时 `@opentui/core`、`@opentui/solid`、`solid-js` 等被标记为 external：opencode 运行时
（`ensureRuntimePluginSupport`）会把它们映射到宿主模块，插件无需自带这些依赖。

## 发布到 npm

```sh
npm version patch        # 或 minor / major
npm run check
npm publish --access public   # scoped 包首次发布需要 --access public
```

- `prepack` 会在发布前自动执行 `bun run build`，确保 `dist/` 是最新的。
- `files` 仅包含 `dist`；`README.md` / `LICENSE` / `package.json` 由 npm 自动包含。
- `exports["./tui"]` 是 opencode TUI 插件加载器解析的入口；`engines.opencode` 声明兼容范围。

## 故障排查

- **完全看不到余额**
  - 确认改的是 `tui.json` 而非 `opencode.json`，并且已**完全重启** opencode。
  - 确认当前模型 provider 是 `deepseek`（非 deepseek 会隐藏）。
  - 查看 `~/.local/share/opencode/log/opencode.log` 是否有插件加载报错。
- **显示 `no API key`**
  - 确认已 `opencode auth login` 且 `auth.json` 中存在 `deepseek` 条目（见上文路径）。
- **显示 `unavailable`**
  - 多为网络问题或密钥无权限；可先在终端用 `curl -H "Authorization: Bearer <key>" https://api.deepseek.com/user/balance` 验证。
- **home 界面选择 deepseek 后不显示 / 显示不符**
  - 见下方「已知局限」，属于启发式判定的边界情况。

## 已知局限

- home 界面的判定基于 `model.json` 的 `recent[0]`（+ `config.model` 兜底），属于**启发式**。
  以下情况可能导致不精确：
  - 使用「循环模型」快捷键（只改内存、不落盘）；
  - 通过历史消息回填模型；
  - 每个 agent 单独配置了模型；
  - 通过 CLI `--model` 指定模型。
- 要做到 100% 精确，需要 opencode 在插件 API 中暴露“当前选中模型”。目前 API 尚未提供。

## License

MIT
