# Qiniu Switch

基于 [CC Switch](https://github.com/farion1231/cc-switch) v4.0.6 的七牛模型接入桌面应用。保留新版侧边栏、供应商切换和工具管理能力，并加入七牛模型广场、模型选择、管理查询和专属导入协议。应用标识、数据库、图标和协议均与原版分开。

> **已有数据库提示**：若看到“数据库 v20，应用仅支持 v19”，说明打开的是旧的 Qiniu Switch 3.x 程序。请退出旧程序，安装当前 4.0.6 安装包；不要删除数据库或手动修改 `PRAGMA user_version`。见[故障排查](docs/qiniu-switch/故障排查.md)。自动更新尚未启用。

## 开始使用

在 macOS、Windows 或 Linux 上安装 Node.js、pnpm、Rust 和 [Tauri 所需系统依赖](https://v2.tauri.app/start/prerequisites/)，然后在项目根目录运行：

```bash
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev` 启动完整的 Tauri 桌面版。`pnpm dev:renderer` 只启动网页界面，不能代替桌面版写入其他客户端配置。开发服务默认使用 3000 端口；若提示端口已占用，先关闭之前的开发终端。

在 macOS 构建安装包：

```bash
pnpm build:local
```

同时支持 Intel 与 Apple 芯片的通用 DMG（需安装 `aarch64-apple-darwin`、`x86_64-apple-darwin` 两个 Rust target）：

```bash
pnpm tauri build --target universal-apple-darwin --bundles dmg
```

安装包位于 `src-tauri/target/universal-apple-darwin/release/bundle/dmg/`。未经 Apple 开发者证书签名、公证的本地包，首次在其他 Mac 上打开可能需要系统安全确认。

在 Apple 芯片 Mac 上交叉编译 Windows x64 的 NSIS 安装版，先准备工具链（配置依据见 [Tauri Windows Installer 文档](https://v2.tauri.app/distribute/windows-installer/)）：

```bash
brew install llvm lld nsis
rustup target add x86_64-pc-windows-msvc
cargo install --locked cargo-xwin
```

本机的 Tauri CLI 不接受直接使用 `--bundles nsis`，应通过配置指定目标：

```bash
PATH="/opt/homebrew/opt/llvm/bin:/opt/homebrew/opt/lld/bin:$PATH" \
  pnpm tauri build --runner cargo-xwin \
  --target x86_64-pc-windows-msvc \
  --config '{"bundle":{"targets":["nsis"]}}' --ci
```

产物位于 `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/`，为 Windows `.exe` 安装程序。`.msi` 需在 Windows 机器上通过 WiX 构建。交叉编译包尚未在 Windows 实机运行验证，也未进行 Windows 代码签名。

## 在新版界面中使用七牛模型

1. 侧边栏打开“模型广场”，浏览七牛公开模型目录、价格、能力和详情。已退役与暂不可用模型单列展示，不计入“探索模型”的可用数量。
2. 输入**模型 API Key** 并连接。应用调用七牛 `/v1/models`，按真实返回的模型 ID 选择；目录中已知退役或不可用的 ID 与别名不会计入可用数量。
3. 选择模型后，可在应用内试用支持对话的模型，或选择兼容的客户端生成供应商配置。部分客户端仍需确认其自身版本、认证方式和模型协议。
4. 若已有 `qiniuswitch://v1/import` 链接，打开后会先显示配置预览，再选择客户端和接口返回的模型，由用户确认导入。仓库内的 HTML 页面是本地演示，不是七牛正式控制台页面。

侧边栏“授权中心”可输入七牛 **AK/SK**，查询受支持的 Key、用量、账单和日志管理接口。这与模型 API Key 是两套凭据：AK/SK 用于管理接口签名，模型 API Key 用于模型调用。当前管理操作为只读；不提供网页登录 Cookie 接管。

## 当前功能与边界

| 功能                      | 当前实现                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 上游 v4.0.6 UI 与工具能力 | 侧边栏、应用页、供应商直连/路由/聚合、用量、MCP、Skills、提示词、会话及应用管理；具体支持随目标客户端而异。   |
| 七牛模型广场              | 动态目录与厂商图标、搜索筛选、价格/详情、退役状态、API Key 模型发现、对话试用、配置到兼容客户端。             |
| 七牛预设                  | 供应商列表预置七牛入口，用户填写自己的模型 API Key 后再启用。                                                 |
| 七牛管理查询              | AK/SK 签名、只读查询、敏感字段脱敏；手输 AK/SK 只在当前原生会话内保存。                                       |
| 网页导入                  | 专属协议、冷启动暂存、风险预览、客户端图标选择、模型发现与确认导入。                                          |
| WorkBuddy 等扩展          | WorkBuddy、Antigravity 入口及配置适配；WorkBuddy 记忆文件可在应用内编辑。并非每个客户端都支持同一种模型协议。 |
| 独立安装与数据            | `com.qiniuswitch.desktop`、`qiniuswitch://`、`~/.qiniu-switch/qiniu-switch.db`；自动更新暂未启用。            |

模型广场里的“可用”是目录状态与该 Key 模型列表的交集，不等于已完成一次真实推理请求。网页导入若在 URL 中携带完整 Key，浏览器历史、系统协议转发等环节可能记录它；正式控制台接入前应采用更安全的交接方式。

## 文档与验证

- [Qiniu Switch 文档索引](docs/qiniu-switch/README.md)：当前功能、技术结构、变更与故障排查。
- [需求与实现范围](docs/qiniu-switch/Qiniu-Switch-需求文档.md)：已实现能力和待验收边界。
- [技术文档](docs/qiniu-switch/Qiniu-Switch-技术文档.md)：关键文件、数据流、数据库与测试。
- `docs/user-manual/` 为上游通用功能参考；七牛专属行为以 `docs/qiniu-switch/` 为准。

```bash
pnpm typecheck
pnpm test:unit
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

## 来源与许可

Qiniu Switch 是在 CC Switch 代码基础上开发的定制版本。上游项目和本仓库的许可文件见 [LICENSE](LICENSE)；上游版本的新功能与修复以 [CC Switch v4.0.6 发布说明](https://github.com/farion1231/cc-switch/releases/tag/v4.0.6) 为准。仓库中的上游赞助内容不代表 Qiniu Switch 的合作关系。
