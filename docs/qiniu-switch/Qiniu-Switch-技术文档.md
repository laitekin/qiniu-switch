# Qiniu Switch 技术文档

更新：2026-10-10。当前基线：CC Switch v4.0.6；Qiniu Switch 为独立标识的定制版本。此文档描述代码行为与验证路径，不把本地 Mock、目录列表或保存成功当作正式控制台接入与真实推理验收。

## 架构与模块

| 入口       | 主要代码                                                                                                                                  | 作用                                                           |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 新版导航   | `src/App.tsx`、`src/components/shell/Sidebar.tsx`、`src/lib/navigation.ts`                                                                | 侧边栏应用页及模型广场、授权中心等全局页。                     |
| 模型广场   | `src/components/marketplace/ModelMarketplace.tsx`、`MarketConnection.tsx`                                                                 | 浏览、筛选、计数、Key 模型发现和后续操作。                     |
| 七牛目录   | `src-tauri/src/commands/qiniu_market.rs`、`src/lib/api/qiniuMarket.ts`                                                                    | 原生 HTTP 获取公开目录和详情，整理协议、价格、能力及退役状态。 |
| 试用与配置 | `src-tauri/src/commands/qiniu_market_chat.rs`、`src/utils/qiniuMarketProvider.ts`、`src/components/marketplace/MarketConfigureDialog.tsx` | 对话请求；按协议生成供应商记录并走现有写入机制。               |
| AK/SK 管理 | `src-tauri/src/commands/qiniu.rs`、`src/components/settings/QiniuAuthSection.tsx`、`src/config/qiniuManagementApi.json`                   | 签名、只读查询、脱敏及界面展示。                               |
| 网页导入   | `src-tauri/src/deeplink/`、`src/components/DeepLinkImportDialog.tsx`、`src/components/deeplink/ImportModelPicker.tsx`                     | 专属协议解析、暂存、风险预览、目标/模型选择与确认。            |
| 客户端扩展 | `src-tauri/src/workbuddy_config.rs`、`src-tauri/src/antigravity_config.rs`、`src/components/workbuddy/WorkBuddyMemoryPanel.tsx`           | WorkBuddy/Antigravity 配置适配与记忆编辑。                     |
| 数据与身份 | `src-tauri/src/database/`、`src-tauri/src/config.rs`、`src-tauri/tauri.conf.json`                                                         | 独立数据库目录、Tauri 身份、图标、协议与升级检查。             |

## 两条凭据路径

```text
模型 API Key → /v1/models → 选择 API 实际返回的模型 → 试用或保存客户端供应商
管理 AK/SK   → Rust 原生会话 → 管理请求 HMAC-SHA1 签名 → 脱敏结果 → 授权中心
```

管理 AK/SK 不等于模型 API Key，Cookie 不参与这里的管理接口认证。Token Plan 使用订阅专用模型 API Key，不与按量 Key 共用模式。手动输入的 AK/SK 只保存在原生进程当前会话；模型广场的按量与 Token Plan Key 分开留在 React 内存状态，切换模式保留 Key、重置模型连接，退出应用即清除。一旦保存为供应商，会按项目现有的供应商存储方式持久化。开发、日志和文档中都不能写入真实 Key。

## 模型目录与可用数量

Rust `normalize_model` 读取官方目录的 `retirement_at`；退役日期当天结束后将模型标记为 `retired=true`、`available=false`，私有目录项也标记不可用。前端“探索模型”计数的条件为 `available && !retired`。退役及其他不可用项仍放在单独折叠区，方便解释为什么无法使用。

模型 API Key 连接 `https://api.qnaigc.com/v1/models` 后，`MarketConnection` 对空 ID 去重，并将目录中已知退役或不可用模型的主 ID 与 `apiIds` 别名从结果中排除；可用数量和交给“试用/配置”的列表采用过滤后的结果。对一个尚未出现在公开目录里的私有 ID，目录无法判定退役状态，因此仍以该 Key 的接口返回为准。打开操作时再次获取模型详情并检查其可用状态。

`/v1/models` 发现成功仅表示 Key 的列表接口返回该 ID，不证明聊天、工具调用或目标客户端的真实请求成功。目录加载失败时连接按钮不会把未经退役状态校验的结果标成“可用”。

Token Plan 模式由 Rust 从七牛公开套餐页的 `__NEXT_DATA__.props.pageProps.planData.models.groups` 获取当前模型 ID，同时核对 `Enterprise-s` 档存在；前端再与模型广场目录和订阅 Key 的 `/v1/models` 取交集。套餐页获取或解析失败时不回退到按量模型。卡片隐藏按量价格并提示积分扣减，详情中的按量价格只作参考。该路径无法验证 Key 的订阅等级、额度或本次调用扣减结果；相关状态以订阅控制台为准。

## 导入、写入与隔离

`qiniuswitch://v1/import` 先进入 Rust 解析与暂存，再在前端展示脱敏预览；七牛类型导入时允许选择目标客户端和接口返回的模型。确认后由 `ProviderService::add` 保存，`enabled=true` 时会再显式切换。`add` 是否立即投影到客户端 live 配置取决于具体客户端和模式，因此不要把 `enabled=false` 解释为绝不会改动客户端文件。Mock HTML 中的链接仅供本地演示；URL 携带完整模型 Key 时存在浏览器历史与协议转发的泄露面，正式控制台接入应采用短时交接机制。

本应用的产品名为 Qiniu Switch，Tauri identifier 为 `com.qiniuswitch.desktop`，协议为 `qiniuswitch://`，默认数据库为 `~/.qiniu-switch/qiniu-switch.db`。这与 CC Switch 的应用数据分开；两者仍可能共同管理同一个 Claude Code、Codex 等第三方客户端配置，不能同时让两个切换器接管同一客户端。自动更新被关闭，新版须手动安装。v4.0.9 支持数据库 schema v20；从旧版程序启动会出现截图中的 v20/v19 错误，不能通过降级数据库解决。

## 证据、结论与调用路径

| 证据（Evidence）                                                                       | 结论（Finding）                                           | 路径（Path）                                |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------- |
| `qiniu_market.rs` 的 `retirement_at` 处理及 `ModelMarketplace.tsx` 的 `available` 筛选 | 退役模型仍可查看，但不在可用计数和操作列表中。            | 公开目录 → 原生标准化 → React 计数/分组     |
| `MarketConnection.tsx` 的 ID/别名排除和连接测试                                        | 已知退役模型不会被 Key 返回列表误计为可用。               | `/v1/models` → 去重/状态过滤 → 会话模型列表 |
| `qiniu.rs` 与 `qiniuManagementApi.json`                                                | 管理操作限白名单中的只读 GET，并按 AK/SK 签名。           | AK/SK → Rust 签名 → 管理 API → 脱敏结果     |
| `deeplink/provider.rs`、`DeepLinkImportDialog.tsx`                                     | 导入前可确认目标和模型，保存/启用经现有供应商服务。       | `qiniuswitch://` → 预览 → ProviderService   |
| `database/mod.rs` 的 `SCHEMA_VERSION`、Tauri 配置和安装包版本                          | v20 数据库需要支持 v20 的程序；旧 3.20.4 包仍只支持 v19。 | 安装包 → 启动预检 → 数据库 schema           |

## 验证命令

```bash
pnpm typecheck
pnpm test:unit
cargo test --manifest-path src-tauri/Cargo.toml --lib
pnpm tauri build --target universal-apple-darwin --bundles dmg
```

执行数据库迁移测试时应先用 SQLite `.backup` 创建独立副本，并设置 `QINIU_SWITCH_TEST_HOME` 指向临时目录；不要在原始用户数据库上试验。安装包校验应检查 `Info.plist` 版本、`CFBundleIdentifier`、`lipo -archs` 输出与 DMG 校验结果。真实七牛账户查询及客户端推理仍需使用授权的测试凭据单独验收。
