# Qiniu Switch 技术文档

版本：v1.0  |  日期：2026-09-28

Qiniu Switch 技术文档

版本 v1.0 · 2026-09-28
内容依据：当前本地工作区代码。区分已有实现与后续设计；本次未运行业务测试或生产联调。

## 1. 技术目标与架构

复用 CC Switch 的供应商管理、配置适配和深度链接能力，新增七牛入口及管理查询。前端负责配置预览和交互，Tauri/Rust 负责本地状态、签名请求和供应商写入。当前技术栈为 React + TypeScript + Tauri + Rust。

| 模块 | 职责 | 主要实现路径（仓库相对路径） |
| --- | --- | --- |
| 网页入口 | 将选定 Key 和供应商参数构造成专属导入链接。 | qiniu-console-mock.html |
| 深度链接接收 | 解析、暂存和消费导入请求，兼容启动时接收。 | src-tauri/src/commands/deeplink.rs<br>src/components/DeepLinkImportDialog.tsx |
| 目标与模型选择 | 按目标工具调整七牛端点；获取列表、选择模型、控制提交条件。 | src/utils/qiniuImportTarget.ts<br>src/components/deeplink/ImportModelPicker.tsx |
| 供应商落库与适配 | 生成工具配置并调用供应商服务；根据 enabled 决定是否切换。 | src-tauri/src/deeplink/provider.rs<br>src-tauri/src/services/provider/ |
| 七牛管理查询 | 前端参数输入，Rust 校验、签名、请求和脱敏。 | src/components/settings/QiniuAuthSection.tsx<br>src-tauri/src/commands/qiniu.rs |
| 接口目录 | 统一定义操作名、路径、参数与可用状态。 | src/config/qiniuManagementApi.json |

## 2. 两条独立的数据路径

配置导入：网页 API Key → qiniuswitch:// → Tauri → 导入弹窗 → 模型选择 → 供应商服务 → 对应工具配置。

管理查询：用户 AK/SK → Tauri 原生会话 → 七牛管理接口签名请求 → 响应脱敏 → 前端展示。两条路径使用不同凭据，不应互相替代。

### 品牌及发布隔离

应用标识为 com.qiniuswitch.desktop，协议为 qiniuswitch。当前配置关闭原有更新通道及更新产物；独立签名发布渠道准备完成后再启用。相关文件为 src-tauri/tauri.conf.json 和 src/config/branding.ts。

## 3. 网页导入与模型选择

### 3.1 链接协议及当前行为

入口使用 qiniuswitch://v1/import，参数包含 resource=provider、app、name、homepage、endpoint、apiKey、icon、configFormat、enabled。Mock 页默认 app=claude、endpoint=https://api.qnaigc.com、enabled=false。URL 参数通过 URLSearchParams 编码。

前端先注册待处理事件监听，再读取冷启动暂存请求，并继续接收运行期间的导入事件。预览展示脱敏 Key；用户确认后调用导入接口。成功后刷新相关数据并通知界面切换目标。

### 3.2 目标工具切换规则

七牛目标选择逻辑只对符合识别条件的普通供应商请求开放：不包含 config/configUrl；端点来源限 api.qnaigc.com 或 api.modelink.ai 的 HTTPS 地址及指定路径，且不带额外查询、片段或用户信息。该条件用于决定是否启用七牛选择交互，不代表所有深度链接的完整安全校验。

目标列表来自 APP_IDS。切换目标后从七牛预设提取协议端点，并清空此前模型选择。存在下拉选项仅表示代码支持选择，不能据此声明全部工具已完成兼容性验收。

### 3.3 模型列表与提交条件

ImportModelPicker 使用当前 API Key 请求对应主机的 /v1/models。列表过滤空 ID 并按 ID 去重；请求序号用于忽略过期响应。状态分为 loading、ready、error。只有 ready 且当前模型仍存在于返回列表中时，才允许确认导入；错误和空列表均不能通过。

### 3.4 供应商保存与启用

后端构造目标工具的 settingsConfig，通过 ProviderService 添加供应商；仅当 enabled=true 时显式切换当前供应商。当前导入 ID 包含时间戳，因此不能宣称已实现重复导入复用。WorkBuddy、MCode、Pi 等分支有独立模型要求和写入策略，需要逐项验证。

### 3.5 WorkBuddy 适配现状

已有 src-tauri/src/workbuddy_config.rs 适配代码，目标文件为 ~/.workbuddy/models.json，以 _qiniuSwitch 记录供应商归属，使用 atomic_write_private 写入。代码存在不等于产品版本兼容已确认，真实 WorkBuddy 客户端的读取、生效和调用仍需验收。

### 3.6 正式接入前需处理的凭据交接

当前演示链接的 apiKey 参数携带完整模型 Key；弹窗脱敏只是展示处理。正式接入需评估浏览器、系统协议分发和日志中的暴露面，核验端到端脱敏，并决定是否使用短时一次性交接票据。后者是设计建议，当前尚未实现。

## 4. 七牛管理认证与接口

| Tauri 命令 | 输入 | 行为 / 返回 |
| --- | --- | --- |
| qiniu_auth_status | 无 | 返回 configured、verified；不返回 AK/SK。 |
| qiniu_auth_connect | accessKey、secretKey | 去除首尾空白并校验；请求 keys 验证成功后保存会话；返回脱敏结果。 |
| qiniu_auth_disconnect | 无 | 切换至 Disconnected；本会话内不自动回退环境变量。 |
| qiniu_management_query | operation、params | 校验目录及参数、签名并查询，返回脱敏 JSON；401/403 后断开。 |

### 4.1 凭据生命周期

AuthSource 包含 Environment、Session、Disconnected。初始状态可读取 QINIU_ACCESS_KEY / QINIU_SECRET_KEY；环境变量存在只表示已配置，未表示连接已验证。手工连接验证成功后进入 Session。会话凭据不写入应用磁盘存储；退出终止会话，但不会删除用户外部设置的环境变量。

### 4.2 查询目录

| 操作 ID | 用途 | 主要参数 |
| --- | --- | --- |
| keys | Key 列表、配额与用量 | 无 |
| bill / bill_all | 单月 / 全部 Key 单月账单 | month；bill 可选 api_key |
| bill_range / bill_range_all | 区间 / 全部 Key 区间账单 | start、end、grain；单 Key 可选 api_key |
| logs / log_detail | 请求日志 / 单条详情 | 日志含分页与筛选；详情需 request_id |
| usage | 用量统计 | 时间范围、g、api_key（可选） |
| pricing / models | 计费项 / 模型市场 | models 可选 sort、order、overseas |

### 4.3 请求与错误约束

管理请求固定发往 https://api.qiniu.com，并仅执行接口目录中开放的 GET 操作。签名串由 GET 路径、查询参数和 Host 构成，使用 HMAC-SHA1 与 URL-safe Base64 生成 Authorization。网络请求超时 30 秒、禁止重定向、响应上限 4 MiB。

对必填字段、类型、枚举、数值范围和时间范围进行校验。响应要求对象或数组；keys 额外要求 data 为数组。前端按错误码展示认证、HTTP、网络、参数或响应异常。创建、删除、启停与限额修改虽然列在目录中，但 available=false，不作为本轮可用操作。

## 5. 凭据保护与功能边界

管理响应在 Rust 侧递归脱敏后再跨 IPC：替换当前 AK/SK、符合规则的 sk- 字符串及 Authorization、Cookie 等敏感字段。此规则针对管理查询返回值，不代表模型 Key 从不保存；供应商配置仍需按原有工具适配机制使用和保存模型凭据。

管理列表中的 Key 已经脱敏，不能直接拿该结果自动配置工具。后续若要从平台列表选择并配置，必须取得对应完整凭据或由用户补充，且不能仅凭名称或尾号关联本地记录。

## 6. 待补齐的配置闭环设计

| 阶段 | 建议实现与验收要求 |
| --- | --- |
| 检测与预览 | 检测工具及版本、真实配置目录、可写性和覆盖来源；预览变更及启用行为。 |
| 快照与写入 | 保存本次操作涉及的文件、供应商记录、原启用状态；写入前复核并发修改，保留无关字段。 |
| 启用与校验 | 配置格式及字段检查通过后明确启用结果；不以数据库新增记录代表工具配置已生效。 |
| 真实请求验证 | 使用当前 Key、模型及实际链路完成最小请求；记录流式和工具调用兼容性。 |
| 幂等与恢复 | 使用稳定标识关联向导记录；重复配置复用；恢复前检测后续改动并按工具执行。 |

## 7. 验证计划与实现依据

已有相关测试文件：tests/components/DeepLinkImportDialog.test.tsx、ImportModelPicker.test.tsx、QiniuAuthSection.test.tsx；tests/config/qiniuImportTarget.test.ts；src-tauri/src/commands/qiniu.rs 内嵌单元测试及 src-tauri/tests/deeplink_import.rs。本次仅核对代码和截图，未执行这些测试，不能据此标记通过。

| 证据（Evidence） | 结论（Finding） | 调用路径（Path） |
| --- | --- | --- |
| Mock 链接构造 + 图 2/3 | 已有本地网页唤起演示；默认不启用。 | 网页 → qiniuswitch → 导入弹窗 |
| DeepLinkImportDialog + ImportModelPicker + 图 4 | 已有目标切换、模型获取及提交门槛。 | 预览 → 模型列表 → 供应商导入 |
| QiniuAuthSection + qiniu.rs + 图 1 | 已有管理认证、查询和响应脱敏。 | 前端 → IPC → 签名 GET → 脱敏展示 |

复核方式：在本仓库查看上述文件及 git diff；原需求稿位于 docs/PRODUCT_REQUIREMENTS.md。发布前仍需 Windows/macOS 冷启动与运行中唤起、查询失败分支、重复导入、凭据日志检查，以及三类目标工具的真实调用验收。
