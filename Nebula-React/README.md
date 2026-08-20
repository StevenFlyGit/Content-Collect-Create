# Nebula Edition · 灵感记录系统

这是基于 React + Vite 的灵感采集与查阅应用。当前版本已经接入 Express 后端，并以阿里云 RDS PostgreSQL Serverless 保存结构化数据、以私有 OSS Bucket 保存图片和音频对象。

本期范围不包含 OCR、ASR 和 AI 标签自动融合。数据库中仅预留衍生数据结构，不代表这些能力已经启用。

## 已实现能力

- 首页：今日灵感计数、最近灵感、加载/空数据/失败重试状态。
- 记录页：标题、正文、内置与自定义类型、图片、拍照、音频文件和最长 1 分钟录音。
- 本地草稿：停止输入约 2 秒自动保存，手动“保存草稿”，IndexedDB 同时保存字段、附件元数据及 Blob，刷新后可恢复。
- 正式提交：独立“提交灵感”按钮；先保存本地草稿，再写入 RDS、直传 OSS、执行服务端 HEAD 核验；完整成功后才删除 IndexedDB 草稿。
- 文件限制：单张图片最大 20MB；音频最长 60 秒，并设置 100MB 防御性传输上限；前后端均校验。
- 时间线：按 Asia/Shanghai 业务日期查询、搜索、类型筛选、分页、白板/星云视图和白板布局保存。
- 后端：灵感 CRUD、类型管理、附件预签名与完成校验、workspace 隔离、幂等创建、统一错误、请求 ID、限流、健康检查和删除补偿任务。
- 数据一致性：附件使用 `pending/ready/failed/deleting/deleted` 状态；RDS 与 OSS 删除采用最终一致和幂等重试，不宣称跨资源强事务。
- PWA：manifest、Service Worker 和安全上下文检查；拍照、录音需 HTTPS 或 localhost。

## 目录结构

```text
Nebula-React/
├─ public/                       # 图标、manifest、Service Worker
├─ src/
│  ├─ components/               # 通用 React 组件
│  ├─ lib/api.js                # API 客户端与 OSS 直传流程
│  ├─ lib/draftStore.js         # IndexedDB 草稿与 Blob
│  ├─ lib/assetUpload.js        # 前端文件校验
│  └─ pages/                    # 首页、记录页、时间线
├─ server/
│  ├─ migrations/               # PostgreSQL 正向与回滚迁移
│  ├─ src/routes/               # inspirations/assets/types/daily-boards
│  ├─ src/cleanup.js            # pending 与删除任务清理
│  └─ test/                     # Node 单元测试
├─ .env.example                 # 前端环境变量示例
└─ server/.env.example          # 后端环境变量示例
```

## 本地运行前置条件

1. Node.js 18 或更高版本。
2. 可连接的 PostgreSQL 数据库。完整联调应使用目标阿里云 RDS PostgreSQL Serverless 测试实例。
3. 私有 OSS Bucket，以及仅允许访问该测试 Bucket/对象前缀的 RAM 凭证。
4. 本地开发机能够访问 RDS 公网地址；RDS 白名单只加入当前公网出口 IP。
5. OSS 已配置允许本地前端 Origin 的 CORS 规则。

## 安装依赖

```bash
npm install
npm --prefix server install
```

## 环境变量

复制前端模板：

```bash
copy .env.example .env.local
```

前端 `.env.local`：

```env
VITE_API_BASE=/api
VITE_WORKSPACE_ID=00000000-0000-4000-8000-000000000001
```

复制服务端模板：

```bash
copy server\.env.example server\.env.local
```

服务端 `server/.env.local` 的核心配置：

```env
API_PORT=3210

DATABASE_URL=postgresql://用户名:URL编码后的密码@RDS地址:5432/数据库名
DATABASE_SSL=true
DATABASE_SSL_REJECT_UNAUTHORIZED=false
DATABASE_SSL_CA=
DB_POOL_MAX=5
DB_IDLE_TIMEOUT_MS=10000
DB_CONNECTION_TIMEOUT_MS=5000

WORKSPACE_ID=00000000-0000-4000-8000-000000000001
CORS_ORIGIN=http://localhost:5173
APP_TIMEZONE=Asia/Shanghai

PENDING_ASSET_TTL_MINUTES=30
CLEANUP_INTERVAL_SECONDS=300
PRESIGN_TTL_SECONDS=300

OSS_REGION=oss-cn-目标地域
OSS_ENDPOINT=https://oss-cn-目标地域.aliyuncs.com
OSS_BUCKET=私有Bucket名
OSS_ACCESS_KEY_ID=服务端RAM账号AccessKeyId
OSS_ACCESS_KEY_SECRET=服务端RAM账号AccessKeySecret

TRUST_PROXY=0
API_RATE_LIMIT_WINDOW_MS=60000
API_RATE_LIMIT_MAX=300
```

注意：

- 前后端 `WORKSPACE_ID` 必须一致；迁移脚本会创建固定开发工作区 `00000000-0000-4000-8000-000000000001`。
- RDS 密码、连接串和 OSS AccessKey 只能放在服务端环境变量中，绝不能使用 `VITE_*`。
- 数据库密码包含 `@`、`:`、`/`、`#` 等字符时必须进行 URL 编码。
- `.env.local` 不应提交到版本库。

## 阿里云测试资源配置

### RDS PostgreSQL Serverless

- RDS、OSS 与未来部署的 Express API 优先选择同一地域；具体可用 PostgreSQL 版本、RCU 和最低存储以目标账号控制台为准。
- 开发测试可从最低 0.5 RCU、最大 1～2 RCU 和控制台允许的最低存储档开始。
- 若最低 RCU 设为 0 并开启自动暂停，首次请求可能出现恢复延迟；调试阶段可保持最低 0.5 RCU。
- 本地连接池建议 2～5；当前模板为 5，并配置较短空闲超时和连接超时。
- 本地连接使用公网地址、SSL 和精确出口 IP 白名单，禁止 `0.0.0.0/0`。
- 生产环境应改用同 VPC 内网地址，并验证 CA 与主机名；迁移账号和应用账号应分离。
- 迁移需要目标数据库允许 `pgcrypto` 与 `pg_trgm` 扩展；必须在目标 RDS 实例实际验证权限。

### OSS

- Bucket 必须为 private，不使用永久公网 URL。
- 本地可使用 RAM 子用户 AccessKey；生产优先使用 RAM Role/STS 临时凭证。
- RAM 权限仅开放指定测试 Bucket 和应用对象前缀所需的对象读写、HEAD 与删除能力；健康检查当前还会调用 GetBucketInfo，因此 RAM 策略需显式允许该 Bucket 的 oss:GetBucketInfo。不使用主账号 AccessKey。
- 对象 key 由后端生成，格式为 `{workspace_id}/{asset_id}.{ext}`；客户端不能指定任意路径。
- CORS 应精确允许 `http://localhost:5173` 和实际 HTTPS 测试域名，方法至少包含 `PUT、GET、HEAD`，允许 `Content-Type`，按排障需要暴露 `ETag`、`x-oss-request-id`。
- 不要用公开 Bucket、任意 Origin 或任意 Header 绕过 CORS。
- 中国内地 OSS 默认公共 Endpoint 可能受账号开通时间和端点策略限制；必须以目标账号实测结果为准，必要时使用合规自定义域名、非中国内地测试地域或云上 API 代理上传。

### 连通关系

| 调用方 | RDS | OSS |
|---|---|---|
| 本地 Express API | 公网地址 + 精确 IP 白名单 + SSL | 公网 Endpoint 或已验证自定义域名 |
| 本地浏览器 | 禁止直连 | 仅使用 Express 签发的短期 PUT/GET URL |
| 生产 Express API | 同地域 VPC 内网地址 | 同地域 OSS 内网 Endpoint |
| 生产浏览器 | 禁止直连 | 短期签名 URL |

## 数据库迁移

确保 `server/.env.local` 已配置后执行：

```bash
npm run server:migrate
```

迁移会创建 `workspaces`、`inspiration_types`、`inspirations`、`assets`、`asset_deletion_tasks`、`asset_derivatives` 和 `daily_boards` 等结构，并写入内置灵感类型。

破坏性回滚命令：

```bash
npm run server:migrate:down
```

`server:migrate:down` 会删除本功能相关表，只允许在隔离测试库执行，禁止在生产库执行。

## 启动

终端一：

```bash
npm run server:dev
```

终端二：

```bash
npm run dev
```

默认地址：

- 前端：`http://localhost:5173`
- 后端：`http://localhost:3210`
- 存活检查：`GET /api/live`
- 依赖就绪检查：`GET /api/ready`
- 综合健康检查：`GET /api/health`

Vite 开发服务器会将 `/api` 代理到本地 Express 服务。

## 主要接口

| 方法 | 路径 | 用途 |
|---|---|---|
| `POST` | `/api/inspirations` | 幂等创建灵感主记录 |
| `GET` | `/api/inspirations` | 日期、最近、类型与分页查询 |
| `GET` | `/api/inspirations/search` | 文本搜索与筛选 |
| `GET` | `/api/inspirations/:id` | 灵感详情 |
| `PATCH` | `/api/inspirations/:id` | 更新内容、状态与附件绑定 |
| `DELETE` | `/api/inspirations/:id` | 软删除并建立 OSS 删除任务，返回 202 |
| `GET/POST` | `/api/inspiration-types` | 查询或创建灵感类型 |
| `POST` | `/api/assets/presign` | 校验文件并创建/复用 pending 附件，返回短期 PUT URL |
| `POST` | `/api/assets/complete` | HEAD OSS 对象并核验路径、大小、Content-Type、ETag/CRC64 |
| `DELETE` | `/api/assets/:id` | 附件进入 deleting 状态并建立删除任务 |
| `POST/PATCH` | `/api/daily-boards` | 保存白板布局并校验 `layout_version` |

所有业务接口使用 `X-Workspace-Id`。当前 Header 仅用于开发期工作区隔离，不是正式用户登录与鉴权方案。

## 测试与检查

```bash
npm test
```

该命令会先执行 Vite 生产构建，再运行服务端 Node 单元测试。

真实云端完整验证还应覆盖：

1. 执行正向迁移，确认扩展、索引、种子数据和固定开发工作区创建成功。
2. 访问 `/api/live` 与 `/api/ready`，确认数据库和 OSS 状态均为 `ok`。
3. 创建纯文本灵感，确认首页计数、最近列表和时间线按 Asia/Shanghai 日期显示。
4. 保存草稿后刷新页面，确认标题、正文、类型、图片/音频 Blob 能恢复。
5. 上传 20MB 边界内图片；验证超过 20MB 时前后端均拒绝。
6. 录制或选择 60 秒边界内音频；验证超过 60 秒或无法识别时长时前后端均拒绝。
7. 模拟网络中断、OSS 403、签名过期和 complete 失败，确认 IndexedDB 草稿保留且页面不显示已同步。
8. 成功提交后确认 RDS 主记录、ready 附件、OSS 对象和页面数据一致，并确认本地草稿已清理。
9. 验证搜索、类型筛选、分页、白板拖动保存和布局版本冲突提示。
10. 删除灵感或附件，验证 202/deleting、后台删除任务重试以及最终 `deleted` 状态。
11. 在 HTTPS 手机环境验证摄像头、录音、后台切换、IndexedDB、Service Worker 和弱网行为。
12. 仅在隔离测试库演练回滚和备份恢复，不在生产执行破坏性迁移。
13. 验证私有 OSS 的短期 GET 地址过期后，时间线能通过 /api/assets/:id/access-url 重新获取预览地址；验证非 ready 附件和跨 workspace 附件不会泄露地址。

## 已知限制

- RDS 与 OSS 无法组成单一原子事务，当前通过状态机、删除任务和定时清理实现最终一致。
- `X-Workspace-Id` 不是正式鉴权；生产上线前需要接入真实用户身份并从服务端可信上下文确定 workspace。
- 当前限流存放在单个 Express 进程内，多实例部署需改用共享限流存储或网关能力。
- 图片上传前未自动清理 EXIF，可能保留设备或位置信息。
- `sha256` 字段和 complete 参数已预留，但当前未实现服务端可信内容哈希与内容级去重。
- 未实现 OCR、ASR、AI 标签自动融合。
- 当前没有主动枚举 OSS 并与 RDS 做双向孤儿对象对账；已有能力是以 RDS 状态驱动 pending 超时清理、删除任务重试和对象删除补偿，完整对账需另行增加低峰期任务。
- 当前接口统一返回 data/meta 包装，若与旧文档示例中的裸数组或 date_count 字段不同，应以本项目现有 API 封装为准。
- 普通 ile 附件不在本期前端页面范围内，当前仅实现图片和音频。
- 没有真实目标账号的 RDS/OSS 凭证时，只能完成构建、单元测试和静态检查，不能宣称云端端到端验证通过。
