# opencode-deepseek-balance

一个 [opencode](https://opencode.ai) **v2 CLI 插件**：当当前选中的模型 provider 为 `deepseek` 时，
在界面上显示你的 **DeepSeek 账户余额**。非 deepseek 模型时自动隐藏，不会发起任何余额请求。

> v2 专用。v1 使用 `tui.json` + `@opencode-ai/plugin`，本版本不兼容 v1。

## 特性

- **三处展示**
  - 侧边栏：`sidebar.content` 槽位。
  - 会话输入行状态区：`prompt.footer.status` 槽位（`余额 ¥…`）。
  - 新建会话界面底部状态行：`home.footer.status` 槽位（`余额 ¥…`）。
- **自动/手动刷新**：命中 provider 时挂载即刷新；模型选择（`session.model.selected`）、
  一轮回答结束（`session.idle`）、模型/凭据更新（`model.updated` / `provider.updated`）、
  每 60 秒（可配）定时刷新；点击余额可立即刷新。
- **零侵入**：只读 opencode 的 `auth.json`；密钥不会写入日志，也不会发送到 DeepSeek 之外的地址。
- **优雅降级**：缺少密钥显示 `no API key`，请求失败显示 `unavailable`，不会影响 opencode 正常运行。

效果示例（会话输入行）：

```
余额 ¥100.00
```

> 以上数字仅为示例。

## 前置要求

- opencode **>= 2.0.4**（CLI 插件系统）。
- 已配置 DeepSeek provider 与凭证，即 `auth.json` 中存在：

  ```json
  { "deepseek": { "type": "api", "key": "sk-..." } }
  ```

  通常通过 `opencode auth login` 写入。

## 安装

### 方式一：npm 包（发布后）

用 opencode CLI 安装（会自动写入 `cli.json`）：

```sh
opencode plugin add @fawn/opencode-deepseek-balance
```

或手动编辑全局 `~/.config/opencode/cli.json`：

```json
{
  "$schema": "https://opencode.ai/v2/cli.json",
  "plugins": ["@fawn/opencode-deepseek-balance"]
}
```

带选项：

```json
{
  "plugins": [
    {
      "package": "@fawn/opencode-deepseek-balance",
      "options": { "refreshMs": 30000 }
    }
  ]
}
```

### 方式二：本地源码（开发）

opencode v2 会**自动发现**全局配置目录下的插件：

```
~/.config/opencode/plugins/deepseek-balance/
└── tui.ts        # export { default } from "<repo>/dist/tui.js"
```

或把插件目录（含 `tui.ts` / `index.ts`）加入 `cli.json` 的 `plugins`。
本地加载需先 `bun run build` 生成 `dist/`。

> 注意：v2 要求插件条目指向**目录**；直接指向 `.js` 文件会被拒绝
> （`configured plugin path must be a directory`）。

## 配置项

通过 `cli.json` 插件条目的 `options` 传入（对应 `setup(context)` 的 `context.options`）：

| 选项        | 类型     | 默认值       | 说明                                 |
| ----------- | -------- | ------------ | ------------------------------------ |
| `provider`  | `string` | `"deepseek"` | 命中该 provider 时才展示余额。       |
| `refreshMs` | `number` | `60000`      | 余额自动刷新间隔（毫秒），需为正数。 |

## 工作原理

### 展示与门控

插件通过 `setup(context)` 用 `context.ui.slot(...)` 注册三个槽位：

| 槽位                   | 说明                     | 输入                        |
| ---------------------- | ------------------------ | --------------------------- |
| `sidebar.content`      | 侧边栏内容区             | `{ sessionID }`             |
| `prompt.footer.status` | 会话输入行底部状态行     | `{ sessionID?, mode, ... }` |
| `home.footer.status`   | 新建会话界面底部状态行   | `{}`                        |

是否展示由「当前模型 provider 是否等于 `provider` 配置」决定：

- **会话路由**：`context.data.session.get(id)?.model?.providerID`。
- **新建会话界面（home）**：`context.client.model.default()` 返回当前默认/选中模型，
  无需再读取 `model.json`（v1 的启发式判定已移除）。
- 会话模型缺失时回退到当前默认/选中模型。

### 凭证读取

`auth.json` 位于 opencode 的**数据目录**。插件按以下顺序查找，取第一个存在的密钥：

```
$XDG_DATA_HOME/opencode/auth.json          # 设置了 XDG_DATA_HOME 时
~/.local/share/opencode/auth.json          # 默认
~/.local/state/opencode/auth.json          # 回退
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
- 模型选择（`session.model.selected`）或模型/凭据更新（`model.updated` / `provider.updated`）时；
- 每 `refreshMs`（默认 60s）定时刷新，**仅在命中目标 provider 时**；
- 点击余额文本时强制刷新。

并发刷新在 store 内部去重，同一时刻只会有一个请求在飞。

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
  tui.tsx           # 插件入口：setup、注册槽位、事件订阅与清理
  view.tsx          # Solid 组件（余额文本行、侧边栏区块等）
  options.ts        # 配置解析与默认值
  auth.ts           # 从 auth.json 读取 API Key
  balance.ts        # DeepSeek 余额接口客户端与响应校验
  format.ts         # 货币格式化
  provider.ts       # provider 纯解析函数
  store.ts          # 余额 store（signals + 请求状态机）
tests/              # Bun 单元测试
```

### 构建为什么必须用 solid 转换

`build.ts` 使用 `@opentui/solid` 提供的 **solid 转换插件**（`babel-preset-solid`）编译 JSX，
产出 `createElement` / `insert` / `setProp` 调用——与 opencode 内置插件完全一致。
若改用 Bun 默认的 JSX 运行时，插件能被加载、组件也会挂载，但宿主可能不会把插槽内容渲染出来。

打包时 `@opencode/plugin`、`@opentui/*`、`solid-js` 等被标记为 external：opencode 运行时会把它们
映射到宿主模块，插件无需自带这些依赖。

## 发布到 npm

```sh
npm version patch        # 或 minor / major
npm run check
npm publish --access public   # scoped 包首次发布需要 --access public
```

- `prepack` 会在发布前自动执行 `bun run build`。
- `files` 仅包含 `dist`；`exports["./tui"]` 是 CLI 插件加载器解析的入口；
  `engines.opencode` 声明兼容范围（`>=2.0.4`）。

## 故障排查

- **完全看不到余额**
  - 确认当前模型 provider 是 `deepseek`（非 deepseek 会隐藏）。
  - 侧边栏槽位需要侧边栏可见（`cli.json` 的 `session.sidebar` 不为 `hide`）。
  - 查看 `~/.local/share/opencode/log/opencode.log` 是否有插件加载报错。
- **显示 `no API key`**
  - 确认已 `opencode auth login` 且 `auth.json` 中存在 `deepseek` 条目（见上文路径）。
- **显示 `unavailable`**
  - 多为网络问题或密钥无权限；可先在终端用
    `curl -H "Authorization: Bearer <key>" https://api.deepseek.com/user/balance` 验证。

## License

MIT
