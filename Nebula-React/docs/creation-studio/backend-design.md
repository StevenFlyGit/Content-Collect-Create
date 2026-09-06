# Nebula 本地优先创作功能设计

版本：3.0 · 2026-09-06 · 待实施设计

配套原型：[prototype.html](./prototype.html)。文件名继续保留为 backend-design.md，但本版取消创作数据的云端数据库设计：从用户点击创作篮中的“开始创作”起，创作会话、素材快照、选题大纲、平台稿件、改写记录和恢复状态都由浏览器持久化。

## 1. 设计结论

完整流程为：

创作篮选择素材 → 点击“开始创作” → 浏览器建立本地创作会话 → 生成并编辑选题大纲 → 确认 → 选择一个或两个平台 → 生成和修改正文 → 从“创作空间”恢复未完成创作。

| 数据 | 存储位置 |
|---|---|
| 创作会话、素材文字快照、补充说明 | IndexedDB |
| 标题、核心观点、简短大纲及确认版本 | IndexedDB |
| 小红书、微信公众号稿件 | IndexedDB |
| 手动修改版本、撤销记录、chatbot 对话 | IndexedDB |
| 本地生成任务状态、失败信息 | IndexedDB |
| 默认表达风格、界面偏好、数据库版本号 | LocalStorage |
| 正在输入但尚未防抖落盘的内容 | 页面内存，随后写入 IndexedDB |
| 云端数据库 | 不保存上述创作数据 |

IndexedDB 是正式实现的主存储。LocalStorage 只放体积小、敏感度较低的偏好和迁移标记，不用于保存长正文或大量历史版本。当前单文件原型仍用 LocalStorage 模拟完整状态，正式 React 实现时迁移到 IndexedDB。

## 2. 隐私边界

浏览器本地存储可以避免把草稿长期存入产品云端数据库，但不等于内容永远不会离开设备：

- 使用云端 LLM 生成或改写时，当前操作需要的素材、大纲或稿件会通过 HTTPS 临时发送给模型代理。
- 模型代理只负责身份校验、限流、模型调用和结构校验；不写 PostgreSQL，不建立服务端创作任务表，不保存请求正文或生成结果。
- 响应使用 Cache-Control: no-store。
- 应用日志只记录 request_id、操作类型、模型、耗时、状态码和 token 用量，不记录 prompt、素材或正文。
- 错误追踪、APM、反向代理和 CDN 必须关闭请求体与响应体采集。
- 如果要求“内容完全不离开设备”，只能增加本地模型通道；这与云端 LLM 通道属于不同的隐私等级。

浏览器存储本身也不是加密保险箱。同源脚本可以读取 IndexedDB，因此 XSS 防护、第三方脚本控制和内容安全策略同样属于隐私方案。

## 3. 页面与状态流

“开始创作”是本地创作数据边界的起点。点击后立即完成：

1. 校验至少选择一项灵感或热点。
2. 在浏览器生成 creation_id。
3. 将所选素材的必要文字复制为本地快照，避免后续依赖原素材是否仍在线。
4. 在 IndexedDB 写入 stage=brief、status=in_progress 的创作会话。
5. 打开“这次想怎么写”弹窗，后续输入自动保存到该会话。

打开或取消弹窗不调用 LLM。点击“生成选题与大纲”才发起模型请求。模型结果返回浏览器后先做结构校验，再与本地任务状态一起写入 IndexedDB。

各阶段状态：

| stage | 页面 | 本地保存内容 |
|---|---|---|
| brief | 这次想怎么写 | 素材快照、补充说明、目的、风格 |
| plan | 选题与大纲 | 标题、核心观点、outline_text |
| platform | 选择平台 | 已确认方案、选中的一个或两个平台 |
| write | 内容创作 | 两个平台稿件、版本、对话和完成状态 |

## 4. 浏览器存储设计

数据库名：nebula_creation_v1。建议增加统一存储层，页面组件不能直接散落调用 IndexedDB API。

### 4.1 Object Stores

#### creations

主键：id。

| 字段 | 含义 |
|---|---|
| id | 浏览器生成的 UUID |
| status | in_progress / completed / archived |
| stage | brief / plan / platform / write |
| source_count | 素材数量 |
| title_preview | 创作空间列表标题 |
| selected_platforms | xhs/wechat，长度 0–2 |
| active_platform | 当前编辑平台 |
| created_at / updated_at | 本地 ISO 时间 |
| schema_version | 当前记录结构版本 |

索引：status、updated_at、[status,updated_at]。创作空间读取 status=in_progress，并按 updated_at 倒序展示。

#### creation_materials

主键：[creation_id,item_id]。

字段：creation_id、item_id、origin、source_id、title、text、source_name、source_url、captured_at。

只保存生成需要的文字快照。素材原记录之后被修改或移出创作篮，不覆盖已有创作快照。

#### creation_briefs

主键：creation_id。

字段：supplement、purpose、style_snapshot、updated_at、version。

默认风格只有在用户点击“设为默认风格”时才写入 LocalStorage。本次创作始终冻结一份 style_snapshot。

#### creation_plans

主键：creation_id。

字段：title、core_point、outline_text、version、confirmed_version、confirmed_snapshot、updated_at。

outline_text 始终是一个保留换行的字符串。用户点击确认时，将当前三字段复制到 confirmed_snapshot；平台生成只读取确认快照。

#### platform_drafts

主键：[creation_id,platform]。

字段：content、version、source_plan_version、completed_at、updated_at。

content 结构为 title、body、summary、tags。小红书使用 title/body/tags；微信公众号使用 title/body/summary。两个平台独立保存、改写、撤销和完成。

#### draft_revisions

主键：[creation_id,platform,version]。

字段：content、origin、source_plan_version、pinned、created_at。origin 为 generated、manual、rewrite 或 restore。

默认每个平台保留最近 20 个版本。超过后删除最旧的非固定版本；用户固定的版本不参与自动清理。

#### chat_messages

主键：id，索引：[creation_id,platform,created_at]。

字段：creation_id、platform、role、text、applied_version、status、created_at。对话只属于当前平台，不自动修改另一平台稿件。

#### local_jobs

主键：id。

字段：creation_id、kind、platforms、state、base_version、request_id、error_code、created_at、updated_at。kind 为 plan、draft 或 rewrite；state 为 queued、running、succeeded、failed 或 interrupted。

这里仅保存恢复界面需要的状态，不重复保存完整 prompt。页面刷新时，将遗留的 running 状态改为 interrupted，并允许用户明确重试。

### 4.2 LocalStorage

只建议使用以下轻量键：

| key | 内容 |
|---|---|
| nebula.creation.dbVersion | IndexedDB 结构版本 |
| nebula.creation.defaultStyle | 用户主动保存的默认表达风格 |
| nebula.creation.lastOpenedId | 最近打开的本地 creation_id |
| nebula.creation.ui | 非敏感界面偏好 |

正文、素材快照、chatbot 指令和版本历史不得存入 LocalStorage。LocalStorage 是同步 API，容量较小，不适合长篇创作数据。

## 5. 本地读写规则

### 自动保存

- 补充说明、目的和风格停止输入 400 ms 后保存。
- 标题、核心观点、大纲和正文停止输入 800 ms 后保存。
- 页面隐藏、平台切换、发起改写和点击完成前立即 flush。
- 只有 IndexedDB 事务成功后才显示“已保存到此设备”。
- 保存失败时保留页面内存中的文字，显示导出备份入口，不能误报成功。

### 原子更新

以下内容必须在单个 IndexedDB transaction 中提交：

- 生成结果、当前 plan/draft、revision 和 local_job 终态。
- 手动稿件更新和新 revision。
- 撤销恢复、新 draft version 和新 revision。
- 大纲确认快照和 creation stage 更新。

### 多标签页

使用 BroadcastChannel 通知其他标签页记录已更新，使用 navigator.locks 锁定 creation 或具体平台稿件。不支持 Web Locks 的浏览器使用 version 比较；发现版本变化时保留当前输入并提示用户选择版本，不能静默覆盖。

## 6. 无状态 LLM 接口

服务端只保留三个即时接口，不提供 creations、drafts、messages 的服务端 CRUD：

| 方法 / 路径 | 用途 | 服务端持久化 |
|---|---|---|
| POST /api/llm/creation/plan | 根据素材快照和补充说明生成一个选题大纲 | 无 |
| POST /api/llm/creation/draft | 为一个或两个平台分别生成正文 | 无 |
| POST /api/llm/creation/rewrite | 按指令改写当前平台稿件 | 无 |

请求由浏览器从 IndexedDB 读取并组装。服务端完成 Zod 校验、鉴权、速率限制、模型调用和结果结构校验后立即返回，不接收 creation_id 作为远端存储依据。

选题请求示例：

    {
      "request_id": "browser-generated-uuid",
      "materials": [{"origin":"inspiration","title":"...","text":"..."}],
      "supplement": "希望从普通人的真实场景切入",
      "purpose": "分享一个今天可以尝试的方法",
      "style": "自然直接、少术语"
    }

双平台正文请求示例：

    {
      "request_id": "browser-generated-uuid",
      "plan": {
        "title": "...",
        "core_point": "...",
        "outline_text": "..."
      },
      "platforms": ["xhs", "wechat"],
      "materials": [{"title":"...","text":"..."}],
      "brief": {
        "supplement":"...",
        "purpose":"...",
        "style":"..."
      }
    }

服务端可以返回完整 JSON 或 SSE 流。流式内容只存在页面内存，结束并通过校验后写入 IndexedDB；中断时保留旧稿，将 local_job 标记为 failed 或 interrupted。

服务端最多自动重试一次临时网络错误。浏览器重试生成新的 request_id，避免迟到响应覆盖新的本地版本。应用响应前再次比较 base_version；版本不一致时只保留为候选，不覆盖用户的新编辑。

## 7. 创作空间恢复

进入顶部“创作空间”时直接查询 IndexedDB 中 status=in_progress 的 creations，并按 updated_at 倒序排列。

每个卡片显示标题、当前阶段、素材数量、平台稿件状态和最近修改时间。点击“继续创作”根据 stage 恢复：

| stage | 恢复位置 |
|---|---|
| brief | “这次想怎么写”弹窗 |
| plan | 选题与大纲编辑页 |
| platform | 平台选择页 |
| write | 上次编辑的平台正文页 |

没有记录时显示“当前没有创作的项目”，并引导到创作篮选择素材。恢复过程不访问云端数据库；离线时仍可查看和编辑已有大纲与稿件。

## 8. 容量、备份与删除

- 首次建立创作会话后调用 navigator.storage.persist() 请求持久化存储。
- 使用 navigator.storage.estimate() 监控剩余空间。
- 达到配额 80% 时提示导出和清理历史版本，不得无提示删除当前稿。
- 支持将单个创作导出为 JSON 或 Markdown。JSON 包含恢复所需结构。
- 建议提供可选的加密导出，使用 Web Crypto AES-GCM 和用户输入的口令；口令不保存。
- 删除创作时，在一个事务中删除该 creation_id 下的素材、brief、plan、draft、revision、message 和 job。
- 浏览器清理站点数据、无痕窗口关闭或更换设备都会导致本地创作不可恢复，界面必须明确提示。
- 本版不提供跨设备同步。以后若增加同步，必须由用户主动开启，不能静默上传现有草稿。

## 9. 安全要求

- 设置严格 CSP，生产环境禁止 unsafe-inline 和未经许可的第三方脚本。
- 所有素材、模型输出和聊天内容按文本渲染或经过白名单清洗。
- IndexedDB 数据按当前登录用户建立本地命名空间；退出登录时询问是否保留本机草稿。
- LLM 请求只发送当前操作需要的字段；改写一个平台时不发送另一平台全文。
- Service Worker 不缓存 LLM POST 请求和响应。
- 反向代理、服务端日志、错误追踪和分析工具不得采集创作正文。

可选的“本地隐私锁”可以使用 Web Crypto 加密 IndexedDB 中的敏感字段，但密钥必须来自用户口令且不持久保存。把密钥与密文一起保存在同源浏览器中只能防止直接查看磁盘文件，不能防御 XSS，因此不作为首期核心承诺。

## 10. 实施模块

前端建议新增：

| 文件 | 职责 |
|---|---|
| src/storage/creationDb.js | IndexedDB 初始化、升级和事务封装 |
| src/storage/creationRepository.js | 创作、素材、brief、plan 查询与写入 |
| src/storage/draftRepository.js | 平台稿、版本、撤销和聊天记录 |
| src/storage/localJobRepository.js | 本地生成状态与刷新恢复 |
| src/hooks/useCreationAutosave.js | 防抖保存、flush 和保存状态 |
| src/hooks/useCreationChannel.js | BroadcastChannel 与多标签同步 |
| src/lib/creationLlm.js | 三个无状态 LLM 接口 |
| src/pages/CreationSpacePage.jsx | 查询本地进行中创作并恢复 |

后端只新增无状态的 creationLlm 路由、LLM adapter、prompt 和结构校验器。取消上一版规划中的 PostgreSQL creations、plans、drafts、revisions、generation_jobs 表及其 CRUD 和 worker 设计。

### 从当前原型迁移

当前 prototype.html 使用 nebula-basket-creation-prototype-v2 LocalStorage 键保存演示状态。正式页面首次启动时：

1. 检查 IndexedDB 是否已有对应记录。
2. 读取旧 LocalStorage 状态并转换为新的 object stores。
3. 在一个事务中写入并重新读取校验。
4. 迁移成功后删除旧的完整状态键，只保留轻量偏好。
5. 迁移失败时保留旧数据并提示导出，不产生半成品。

## 11. 验收标准

1. 点击“开始创作”后立即建立 IndexedDB 会话和素材快照，刷新可恢复。
2. 从该时刻起，创作内容不写 PostgreSQL、服务端文件、缓存或任务队列。
3. 补充说明、大纲、双平台稿件、chatbot 记录和撤销版本均可离线读取。
4. 创作空间只读取浏览器本地数据，能恢复 brief、plan、platform、write 四个阶段。
5. 云端 LLM 接口无状态，日志和错误追踪中不出现素材、prompt 或正文。
6. 单平台改写不会发送或修改另一平台内容。
7. 刷新时 running 任务转为 interrupted，旧稿和输入保持不变并可重试。
8. 多标签同时编辑不会静默覆盖较新的本地版本。
9. IndexedDB 写入失败时不显示“已保存”，并提供导出当前内存内容的入口。
10. 清除站点数据、无痕模式和跨设备不可恢复的限制在界面中可见。
11. 360、768、1440 px 下创作空间、弹窗、大纲和正文编辑均不横向溢出。

本版不执行数据库迁移，也不修改现有素材与创作篮的存储方式；调整范围从点击“开始创作”后开始。当前原型已经具备浏览器本地保存和刷新恢复的演示行为，正式实现需按上述结构将长文本从 LocalStorage 迁移到 IndexedDB。