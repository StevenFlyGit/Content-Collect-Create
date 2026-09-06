# Nebula-React 部署手册 · ESA Pages（前端）+ 函数计算 FC 3.0（后端）

版本：1.0 · 2026-09-06

## 架构

```
浏览器
  │  https://<pages 域名>.er.aliyun-esa.net
  ▼
ESA Pages（静态 dist · SPA 回退）
  │  /api/* ── 边缘函数 esa/api-proxy.js 同源反代 ──┐
  ▼                                               ▼
静态资源 dist                     FC 3.0 Web 函数（Express · node src/index.js · 监听 9000）
                                                    │
                                                    ├── RDS PostgreSQL（沿用 .env.local 的公网地址）
                                                    ├── OSS（附件直传，需补 ESA 域名白名单）
                                                    └── LLM 上游（LLM_API_KEY 环境变量）
```

同源代理的好处：前端 `VITE_API_BASE` 保持默认 `/api`，无需构建变量、无 CORS 配置。

## 一、后端 · 函数计算 FC 3.0

### 前置条件
- 阿里云账号已开通函数计算 FC 3.0
- RDS PostgreSQL 允许公网访问（FC 实例默认可出公网，无需 VPC 配置）
- Serverless Devs CLI：`npm install -g @serverless-devs/s`

### 方式 A：CLI 自动化部署（推荐）

```bash
cd server

# 1. 配置阿里云凭证（一次性）
s config add --AccessKeyID <AccessKeyID> --AccessKeySecret <AccessKeySecret> --AccountID <账号ID>

# 2. 注入本地 .env.local 中的业务密钥（s.yaml 通过 ${env(...)} 读取，不落盘到代码包）
set -a; source .env.local; set +a

# 3. 部署变量
export FC_REGION=cn-hangzhou
export WORKSPACE_ID=00000000-0000-4000-8000-000000000001   # 与本地一致
# 可选：export CORS_ORIGIN / OSS_CORS_ORIGINS（先占位，拿到 ESA 域名后再回来更新）

# 4. 部署（打包 server/ 目录，.fcignore 已排除 .env.local 等密钥文件）
s deploy

# 5. 记录输出中的公网地址，形如：
#    https://nebula-inspiration-api.<region>.fcapp.run
```

### 方式 B：控制台手动部署
1. FC 控制台 → 创建函数 → **Web Server 模式**，运行时 Node.js 20
2. 上传 `server/` 目录 zip（**删除 .env.local 后再压缩**，含 node_modules）
3. 启动命令 `node src/index.js`，监听端口 `9000`，内存 512MB，超时 120s
4. 环境变量照抄 `server/.env.local` 全部键 + `API_PORT=9000`
5. 创建 HTTP 触发器：authType=anonymous，全部方法，启用公网访问 URL

### 部署后验证

```bash
curl https://<fc 地址>/api/live        # {"status":"ok","api":"ok"}
curl https://<fc 地址>/api/ready       # database / oss 均 ok
```

> 常见坑：① 内存/vCPU 配比必须在 1:1~1:4（512MB 起步）；② RDS 公网地址含特殊字符需 URL 编码；③ `startCleanupScheduler` 定时任务在多实例下会重复执行，量大后再改 SLS 定时触发器。

## 二、前端 · ESA 函数和 Pages

### 前置条件
- 开通 ESA「函数和 Pages」服务
- 仓库已推送 GitHub（StevenFlyGit/Content-Collect-Create）

### 部署步骤
1. **先完成 FC 部署**，拿到 `https://nebula-inspiration-api.<region>.fcapp.run`
2. ESA 控制台 → 边缘计算和 AI → 函数和 Pages → 创建 → **导入 GitHub 仓库**
3. 选择仓库 `Content-Collect-Create`，**根目录**填 `/Content-Collect-Create/Nebula-React`（monorepo 子目录；ESA 自动读取该目录下的 `esa.jsonc`）
4. 构建信息由 esa.jsonc 接管：install `npm install`，build `npm run build`，静态目录 `./dist`，SPA 回退 `singlePageApplication`
5. 在 Pages 项目设置 → 环境变量，添加：
   - `FC_BASE_URL = https://nebula-inspiration-api.<region>.fcapp.run`（边缘函数代理目标）
6. 开始部署，得到默认域名 `https://<项目>.er.aliyun-esa.net`
7. 若边缘函数路由需要手动绑定：在函数路由设置中把 `/api/*` 指向 entry 函数（多数情况自动生效）

### 部署后验证
- 打开 `https://<pages 域名>/` → 工作台正常渲染
- 刷新 `https://<pages 域名>/creation-space` → SPA 回退正常，不 404
- 打开创作篮：列表有数据（说明 `/api/creation-basket` 代理链路通）

## 三、上线后收尾（必须）

| 事项 | 位置 | 值 |
|---|---|---|
| 后端 CORS_ORIGIN | FC 环境变量（重新 s deploy 或控制台改） | `https://<pages 域名>` |
| OSS_CORS_ORIGINS | FC 环境变量 + OSS 控制台跨域设置 | `https://<pages 域名>`（附件直传用） |
| 自定义域名（可选） | Pages 项目设置 → 添加域名 | DNS CNAME 到 ESA 分配地址 |

> 说明：走边缘函数同源代理时，浏览器对 `/api` 不产生跨域，CORS_ORIGIN 主要是给 OSS 直传（PUT put_url）兜底。

## 四、日常更新

- **前端**：push 到 GitHub 生产分支 → ESA Pages 自动构建部署；或控制台手动「重新部署」
- **后端**：`cd server && set -a && source .env.local && set +a && s deploy`（秒级换包）
- **LLM 配置**：改 FC 环境变量 `LLM_API_KEY / LLM_BASE_URL / LLM_MODEL`，无需重新部署代码
