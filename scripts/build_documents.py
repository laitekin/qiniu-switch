from pathlib import Path
from xml.sax.saxutils import escape
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Image
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.colors import HexColor, white
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from PIL import Image as PILImage

ROOT=Path(__file__).resolve().parents[1]
pdfmetrics.registerFont(TTFont('CN','/System/Library/Fonts/STHeiti Light.ttc'))
pdfmetrics.registerFont(TTFont('CNB','/System/Library/Fonts/STHeiti Medium.ttc'))
W,H=A4; CW=W-96
styles={
 'title':ParagraphStyle('title',fontName='CNB',fontSize=22,leading=31,spaceAfter=12,textColor=HexColor('#173350')),
 'h1':ParagraphStyle('h1',fontName='CNB',fontSize=15,leading=23,spaceBefore=13,spaceAfter=8,textColor=HexColor('#173350')),
 'h2':ParagraphStyle('h2',fontName='CNB',fontSize=11.5,leading=18,spaceBefore=9,spaceAfter=5),
 'p':ParagraphStyle('p',fontName='CN',fontSize=10,leading=17,spaceAfter=7,wordWrap='CJK',textColor=HexColor('#242F3B')),
 'small':ParagraphStyle('small',fontName='CN',fontSize=8,leading=12,spaceAfter=6,wordWrap='CJK',textColor=HexColor('#526170')),
 'cell':ParagraphStyle('cell',fontName='CN',fontSize=9,leading=14,wordWrap='CJK'),
 'head':ParagraphStyle('head',fontName='CNB',fontSize=9,leading=14,wordWrap='CJK',textColor=white),
 'caption':ParagraphStyle('caption',fontName='CN',fontSize=8,leading=12,alignment=TA_CENTER,spaceBefore=5,spaceAfter=9,textColor=HexColor('#526170')),
}

def p(s,style='p'): return Paragraph(escape(s).replace('\n','<br/>'),styles[style])
def table(rows,widths):
 t=Table([[p(x,'head' if i==0 else 'cell') for x in row] for i,row in enumerate(rows)],colWidths=[CW*x for x in widths],hAlign='LEFT',repeatRows=1)
 t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),HexColor('#25486B')),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7),('LINEBELOW',(0,0),(-1,-1),.4,HexColor('#D9E1E8')),('ROWBACKGROUNDS',(0,1),(-1,-1),[white,HexColor('#F4F7FA')])]))
 return t

def footer(canvas,doc):
 canvas.setStrokeColor(HexColor('#CCD5DE'));canvas.line(48,43,W-48,43)
 canvas.setFont('CN',8);canvas.setFillColor(HexColor('#596775'))
 canvas.drawString(48,29,'Qiniu Switch  |  2026-09-28  |  v1.0')
 canvas.drawRightString(W-48,29,str(doc.page))

def make_doc(name,title,pages):
 story=[]; md=['# '+title,'','版本：v1.0  |  日期：2026-09-28','']
 for n,items in enumerate(pages):
  if n: story.append(PageBreak())
  for kind,data in items:
   if kind in ['title','h1','h2','p','small']:
    story.append(p(data,kind));md += [('## ' if kind=='h1' else '### ' if kind=='h2' else '')+data,'']
   elif kind=='table':
    rows,widths=data;story.append(table(rows,widths));story.append(Spacer(1,8))
    md+=['| '+' | '.join(rows[0])+' |','| '+' | '.join(['---']*len(rows[0]))+' |']
    md+=['| '+' | '.join(r).replace('\n','<br>')+' |' for r in rows[1:]];md+=['']
   elif kind=='image':
    file,cap,maxh=data
    iw,ih=PILImage.open(file).size; scale=min(CW/iw,maxh/ih)
    im=Image(file,width=iw*scale,height=ih*scale);im.hAlign='CENTER';story += [im,p(cap,'caption')]
    md += [cap,'']
 out=ROOT/'output/pdf'/f'{name}.pdf'
 SimpleDocTemplate(str(out),pagesize=A4,rightMargin=48,leftMargin=48,topMargin=43,bottomMargin=58,title=title,author='Qiniu Switch',pageCompression=1).build(story,onFirstPage=footer,onLaterPages=footer)
 (ROOT/'docs/qiniu-switch'/f'{name}.md').write_text('\n'.join(md),encoding='utf-8')
 print(out)

req=[
[
('title','Qiniu Switch 需求文档'),
('small','版本 v1.0 · 2026-09-28\n依据：现有产品需求稿、当前工作区代码及用户提供的四张截图。本文为需求与现状整理，不作为上线验收证明。'),
('h1','1. 背景与目标'),
('p','用户获得七牛模型 API Key 后，仍需查找不同 AI 工具的配置位置、服务地址、认证方式和模型名称。配置完成后，用户还需要判断是否启用、是否能实际调用，以及去哪里查看用量与失败原因。'),
('p','本项目在 CC Switch 基础上开发 Qiniu Switch。目标是让用户通过一次凭据输入或网页导入，完成目标工具配置，并在客户端获得必要的查询和排障入口。首批目标工具为 Claude Code、Codex、WorkBuddy；支持范围以真实客户端验收结果为准。'),
('h1','2. 用户问题与解决方式'),
('table',([
['原有问题','需求','本轮修改及作用'],
['配置字段多，容易填错','减少重复输入，使用七牛预设','导入时带入供应商、端点与 Key，减少手动复制和填写。'],
['网页 Key 与桌面工具割裂','从 Key 页面直接进入配置','增加本地演示页导入按钮和客户端唤起流程，验证入口衔接。'],
['不知道应该导入哪个工具','可选择目标工具并适配配置','导入弹窗增加目标选择，按预设调整端点，降低选错配置的可能。'],
['模型名称需要手填','从接口返回列表选择模型','动态获取模型并要求选择后再导入，减少模型 ID 拼写错误。'],
['用量与失败原因查询分散','提供统一查询入口','新增 AK/SK 接入及 Key、配额、账单、用量和日志查询能力。'],
['无法确认修改是否生效','区分导入、启用与实际可用','明确各阶段验收口径；完整验证与恢复闭环仍需补齐。'],
],[.22,.24,.54])),
('h1','3. 使用对象与范围'),
('p','面向首次接入七牛的开发者、使用多个 AI 工具的用户，以及协助排障的支持人员。本轮以配置导入和只读查询为主，不新增聊天产品、充值购买、平台 Key 创建或吊销、目标工具自动安装等能力。'),
],
[
('h1','4. 功能需求与验收标准'),
('small','状态口径：“已有实现”表示代码中存在相关能力；“本地演示”表示截图与 Mock 页可展示流程；“待补齐/验收”表示尚不能据此承诺生产可用。'),
('table',([
['编号 / 需求','验收标准','当前状态'],
['R01 七牛品牌与独立入口','使用 Qiniu Switch 名称、应用标识和专属唤起协议；避免唤起原版。','已有实现；安装包共存需实测。'],
['R02 网页导入','点击对应 Key 后唤起客户端，展示正确供应商信息；用户可取消。','本地演示；正式控制台接入待完成。'],
['R03 目标工具与配置预览','展示目标工具、供应商、端点及脱敏 Key；切换工具后更新配置并重选模型。','已有实现；逐工具兼容性待验收。'],
['R04 模型列表与选择','使用当前 Key 获取列表；失败可重试；空列表或未选模型时阻止导入。','已有实现；模型列表不等于调用验证。'],
['R05 管理接口认证','支持连接、状态查询、断开；认证失败有提示；断开后停止使用会话凭据。','已有 AK/SK 实现；不是网页登录。'],
['R06 用量和账单查询','支持 Key/配额、月账单、区间账单、日志及详情、用量、计费项、模型市场；区分错误与空数据。','已有查询实现；业务字段逐项联调验收。'],
['R07 安全配置与恢复','检测安装和冲突；预览、备份、合并、启用；失败按工具恢复；重复操作不产生无意义记录。','完整快速配置流程待补齐/验收。'],
['R08 真实可用性验证','以选定 Key、模型和链路完成真实请求，分别记录配置、接口和目标工具结果。','需专项验收，不能以导入成功代替。'],
['R09 七牛账号与套餐','获得有效用户授权，显示账号和 Token Plan；平台 Key 与本机配置按可靠依据关联。','需求保留；当前 AK/SK 查询不能替代。'],
],[.24,.52,.24])),
('h1','5. 已解决问题的表述边界'),
('p','本轮已提供减少配置输入、选择目标工具、动态选择模型和集中查询的实现基础，并形成网页到桌面导入的本地演示。当前没有提供配置耗时、成功率、用户规模等统计，因此不宣称量化提升。'),
],
[
('h1','6. 用户流程与异常处理'),
('h2','6.1 当前导入流程'),
('p','本地 Key 演示页点击“导入 Qiniu Switch” → 浏览器确认打开应用 → 客户端预览配置 → 选择目标工具 → 获取并选择模型 → 确认导入供应商。当前演示链接设置 enabled=false，因此导入后不能直接显示“已启用”或“工具可用”。'),
('h2','6.2 管理查询流程'),
('p','输入七牛管理 AK/SK → 连接并验证 Key 列表查询 → 选择查询类型与参数 → 展示结果或错误 → 断开。管理 AK/SK 用于管理接口；模型 API Key 用于模型调用，二者不能混用。'),
('h2','6.3 目标完整流程（待补齐/验收）'),
('p','选择凭据及工具 → 检测安装、配置目录和冲突 → 预览变更 → 保存快照 → 合并写入并启用 → 真实请求测试 → 查看逐工具结果 → 必要时重试或恢复。'),
('table',([
['异常场景','产品应有行为'],
['未安装、浏览器未能唤起','提供安装或重新唤起入口，以及手动填写 Key 的替代路径。'],
['模型获取失败或无结果','显示对应状态，允许重新获取；保持导入不可提交。'],
['只有脱敏 Key','允许展示记录；配置前补充完整 Key，不能把脱敏字符串写入工具。'],
['认证失效、网络异常、查询失败','展示明确错误，区分凭据错误与网络失败；不伪装为空数据或零用量。'],
['配置写入成功但测试失败','显示“已写入、测试未通过”；保留重试和恢复入口。'],
['多工具部分失败','逐工具展示结果，成功项保留；失败项独立重试或恢复。'],
],[.3,.7])),
('h1','7. 后续验收重点'),
('p','优先完成三类验证：① Windows/macOS 的安装、唤起和逐工具真实调用；② 写入、启用、重复配置及恢复的一致性；③ 正式控制台凭据交接与查询接口联调。网页登录和 Token Plan 需先核实授权及数据接口，再确定实现方案。'),
('small','本次文档整理未执行生产接口请求、目标工具真实调用或兼容性测试。原需求稿见 docs/PRODUCT_REQUIREMENTS.md；本版补充现状与验收边界，不替换原稿。'),
],
]
imgs=[
('/var/folders/bl/970_4phn6696xlpr4dvxtz740000gn/T/codex-clipboard-c247446c-58cb-4f90-8dcc-fa8487f748cc.png','图 1：AK/SK 管理接口接入及数据查询入口。'),
('/var/folders/bl/970_4phn6696xlpr4dvxtz740000gn/T/codex-clipboard-191506d2-803f-4132-af0a-8f671cf48d9b.png','图 2：本地 Key 演示页增加“导入 Qiniu Switch”入口。'),
('/var/folders/bl/970_4phn6696xlpr4dvxtz740000gn/T/codex-clipboard-dda634dd-b4e4-4de0-8849-d1152045d3dc.png','图 3：浏览器请求唤起桌面客户端。'),
('/var/folders/bl/970_4phn6696xlpr4dvxtz740000gn/T/codex-clipboard-b44715f5-d316-4569-9e91-38bfffae508f.png','图 4：导入前预览、目标工具选择及模型选择。'),
]
req.append([('h1','附录 A：管理查询与网页入口'),('small','截图由用户提供。网页截图为本地 Mock 演示，不能作为正式控制台上线或真实调用通过的证明。')]+[('image',(file,caption,230)) for file,caption in imgs[:2]])
req.append([('h1','附录 B：唤起应用与导入确认'),('small','浏览器确认唤起后，客户端展示配置预览。截图用于说明界面，不代表导入、启用或真实请求已经成功。')]+[('image',(file,caption,h)) for (file,caption),h in zip(imgs[2:],[205,335])])

tech=[
[
('title','Qiniu Switch 技术文档'),
('small','版本 v1.0 · 2026-09-28\n内容依据：当前本地工作区代码。区分已有实现与后续设计；本次未运行业务测试或生产联调。'),
('h1','1. 技术目标与架构'),
('p','复用 CC Switch 的供应商管理、配置适配和深度链接能力，新增七牛入口及管理查询。前端负责配置预览和交互，Tauri/Rust 负责本地状态、签名请求和供应商写入。当前技术栈为 React + TypeScript + Tauri + Rust。'),
('table',([
['模块','职责','主要实现路径（仓库相对路径）'],
['网页入口','将选定 Key 和供应商参数构造成专属导入链接。','qiniu-console-mock.html'],
['深度链接接收','解析、暂存和消费导入请求，兼容启动时接收。','src-tauri/src/commands/deeplink.rs\nsrc/components/DeepLinkImportDialog.tsx'],
['目标与模型选择','按目标工具调整七牛端点；获取列表、选择模型、控制提交条件。','src/utils/qiniuImportTarget.ts\nsrc/components/deeplink/ImportModelPicker.tsx'],
['供应商落库与适配','生成工具配置并调用供应商服务；根据 enabled 决定是否切换。','src-tauri/src/deeplink/provider.rs\nsrc-tauri/src/services/provider/'],
['七牛管理查询','前端参数输入，Rust 校验、签名、请求和脱敏。','src/components/settings/QiniuAuthSection.tsx\nsrc-tauri/src/commands/qiniu.rs'],
['接口目录','统一定义操作名、路径、参数与可用状态。','src/config/qiniuManagementApi.json'],
],[.19,.36,.45])),
('h1','2. 两条独立的数据路径'),
('p','配置导入：网页 API Key → qiniuswitch:// → Tauri → 导入弹窗 → 模型选择 → 供应商服务 → 对应工具配置。'),
('p','管理查询：用户 AK/SK → Tauri 原生会话 → 七牛管理接口签名请求 → 响应脱敏 → 前端展示。两条路径使用不同凭据，不应互相替代。'),
('h2','品牌及发布隔离'),
('p','应用标识为 com.qiniuswitch.desktop，协议为 qiniuswitch。当前配置关闭原有更新通道及更新产物；独立签名发布渠道准备完成后再启用。相关文件为 src-tauri/tauri.conf.json 和 src/config/branding.ts。'),
],
[
('h1','3. 网页导入与模型选择'),
('h2','3.1 链接协议及当前行为'),
('p','入口使用 qiniuswitch://v1/import，参数包含 resource=provider、app、name、homepage、endpoint、apiKey、icon、configFormat、enabled。Mock 页默认 app=claude、endpoint=https://api.qnaigc.com、enabled=false。URL 参数通过 URLSearchParams 编码。'),
('p','前端先注册待处理事件监听，再读取冷启动暂存请求，并继续接收运行期间的导入事件。预览展示脱敏 Key；用户确认后调用导入接口。成功后刷新相关数据并通知界面切换目标。'),
('h2','3.2 目标工具切换规则'),
('p','七牛目标选择逻辑只对符合识别条件的普通供应商请求开放：不包含 config/configUrl；端点来源限 api.qnaigc.com 或 api.modelink.ai 的 HTTPS 地址及指定路径，且不带额外查询、片段或用户信息。该条件用于决定是否启用七牛选择交互，不代表所有深度链接的完整安全校验。'),
('p','目标列表来自 APP_IDS。切换目标后从七牛预设提取协议端点，并清空此前模型选择。存在下拉选项仅表示代码支持选择，不能据此声明全部工具已完成兼容性验收。'),
('h2','3.3 模型列表与提交条件'),
('p','ImportModelPicker 使用当前 API Key 请求对应主机的 /v1/models。列表过滤空 ID 并按 ID 去重；请求序号用于忽略过期响应。状态分为 loading、ready、error。只有 ready 且当前模型仍存在于返回列表中时，才允许确认导入；错误和空列表均不能通过。'),
('h2','3.4 供应商保存与启用'),
('p','后端构造目标工具的 settingsConfig，通过 ProviderService 添加供应商；仅当 enabled=true 时显式切换当前供应商。当前导入 ID 包含时间戳，因此不能宣称已实现重复导入复用。WorkBuddy、MCode、Pi 等分支有独立模型要求和写入策略，需要逐项验证。'),
('h2','3.5 WorkBuddy 适配现状'),
('p','已有 src-tauri/src/workbuddy_config.rs 适配代码，目标文件为 ~/.workbuddy/models.json，以 _qiniuSwitch 记录供应商归属，使用 atomic_write_private 写入。代码存在不等于产品版本兼容已确认，真实 WorkBuddy 客户端的读取、生效和调用仍需验收。'),
('h2','3.6 正式接入前需处理的凭据交接'),
('p','当前演示链接的 apiKey 参数携带完整模型 Key；弹窗脱敏只是展示处理。正式接入需评估浏览器、系统协议分发和日志中的暴露面，核验端到端脱敏，并决定是否使用短时一次性交接票据。后者是设计建议，当前尚未实现。'),
],
[
('h1','4. 七牛管理认证与接口'),
('table',([
['Tauri 命令','输入','行为 / 返回'],
['qiniu_auth_status','无','返回 configured、verified；不返回 AK/SK。'],
['qiniu_auth_connect','accessKey、secretKey','去除首尾空白并校验；请求 keys 验证成功后保存会话；返回脱敏结果。'],
['qiniu_auth_disconnect','无','切换至 Disconnected；本会话内不自动回退环境变量。'],
['qiniu_management_query','operation、params','校验目录及参数、签名并查询，返回脱敏 JSON；401/403 后断开。'],
],[.3,.23,.47])),
('h2','4.1 凭据生命周期'),
('p','AuthSource 包含 Environment、Session、Disconnected。初始状态可读取 QINIU_ACCESS_KEY / QINIU_SECRET_KEY；环境变量存在只表示已配置，未表示连接已验证。手工连接验证成功后进入 Session。会话凭据不写入应用磁盘存储；退出终止会话，但不会删除用户外部设置的环境变量。'),
('h2','4.2 查询目录'),
('table',([
['操作 ID','用途','主要参数'],
['keys','Key 列表、配额与用量','无'],
['bill / bill_all','单月 / 全部 Key 单月账单','month；bill 可选 api_key'],
['bill_range / bill_range_all','区间 / 全部 Key 区间账单','start、end、grain；单 Key 可选 api_key'],
['logs / log_detail','请求日志 / 单条详情','日志含分页与筛选；详情需 request_id'],
['usage','用量统计','时间范围、g、api_key（可选）'],
['pricing / models','计费项 / 模型市场','models 可选 sort、order、overseas'],
],[.34,.3,.36])),
('h2','4.3 请求与错误约束'),
('p','管理请求固定发往 https://api.qiniu.com，并仅执行接口目录中开放的 GET 操作。签名串由 GET 路径、查询参数和 Host 构成，使用 HMAC-SHA1 与 URL-safe Base64 生成 Authorization。网络请求超时 30 秒、禁止重定向、响应上限 4 MiB。'),
('p','对必填字段、类型、枚举、数值范围和时间范围进行校验。响应要求对象或数组；keys 额外要求 data 为数组。前端按错误码展示认证、HTTP、网络、参数或响应异常。创建、删除、启停与限额修改虽然列在目录中，但 available=false，不作为本轮可用操作。'),
],
[
('h1','5. 凭据保护与功能边界'),
('p','管理响应在 Rust 侧递归脱敏后再跨 IPC：替换当前 AK/SK、符合规则的 sk- 字符串及 Authorization、Cookie 等敏感字段。此规则针对管理查询返回值，不代表模型 Key 从不保存；供应商配置仍需按原有工具适配机制使用和保存模型凭据。'),
('p','管理列表中的 Key 已经脱敏，不能直接拿该结果自动配置工具。后续若要从平台列表选择并配置，必须取得对应完整凭据或由用户补充，且不能仅凭名称或尾号关联本地记录。'),
('h1','6. 待补齐的配置闭环设计'),
('table',([
['阶段','建议实现与验收要求'],
['检测与预览','检测工具及版本、真实配置目录、可写性和覆盖来源；预览变更及启用行为。'],
['快照与写入','保存本次操作涉及的文件、供应商记录、原启用状态；写入前复核并发修改，保留无关字段。'],
['启用与校验','配置格式及字段检查通过后明确启用结果；不以数据库新增记录代表工具配置已生效。'],
['真实请求验证','使用当前 Key、模型及实际链路完成最小请求；记录流式和工具调用兼容性。'],
['幂等与恢复','使用稳定标识关联向导记录；重复配置复用；恢复前检测后续改动并按工具执行。'],
],[.24,.76])),
('h1','7. 验证计划与实现依据'),
('p','已有相关测试文件：tests/components/DeepLinkImportDialog.test.tsx、ImportModelPicker.test.tsx、QiniuAuthSection.test.tsx；tests/config/qiniuImportTarget.test.ts；src-tauri/src/commands/qiniu.rs 内嵌单元测试及 src-tauri/tests/deeplink_import.rs。本次仅核对代码和截图，未执行这些测试，不能据此标记通过。'),
('table',([
['证据（Evidence）','结论（Finding）','调用路径（Path）'],
['Mock 链接构造 + 图 2/3','已有本地网页唤起演示；默认不启用。','网页 → qiniuswitch → 导入弹窗'],
['DeepLinkImportDialog + ImportModelPicker + 图 4','已有目标切换、模型获取及提交门槛。','预览 → 模型列表 → 供应商导入'],
['QiniuAuthSection + qiniu.rs + 图 1','已有管理认证、查询和响应脱敏。','前端 → IPC → 签名 GET → 脱敏展示'],
],[.35,.36,.29])),
('small','复核方式：在本仓库查看上述文件及 git diff；原需求稿位于 docs/PRODUCT_REQUIREMENTS.md。发布前仍需 Windows/macOS 冷启动与运行中唤起、查询失败分支、重复导入、凭据日志检查，以及三类目标工具的真实调用验收。'),
],
]
make_doc('Qiniu-Switch-需求文档','Qiniu Switch 需求文档',req)
make_doc('Qiniu-Switch-技术文档','Qiniu Switch 技术文档',tech)
