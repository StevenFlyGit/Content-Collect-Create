# Nebula Edition · 灵感收集与查阅（React + Vite）

基于已选定的 **方案 B · Nebula 深色星云** 设计稿，输出的一套**真实可运行的 React 组件**。
设计令牌（CSS 变量）与图标 SVG 资源均**零翻译**复用原型侧产出。

## 运行

```bash
npm install
npm run dev      # 本地开发 http://localhost:5173
npm run build    # 生产构建到 dist/
npm run preview  # 预览构建产物
```

## 关键约定（零翻译）

1. **CSS 变量直接复用**：所有设计令牌集中在 `src/styles/tokens.css`，
   变量名与设计稿 `:root` 完全一致（`--nebula-violet`、`--cosmos-deep`、`--radius-panel` …）。
   组件样式里直接写 `var(--nebula-violet)`，无需任何映射或二次定义。
2. **图标统一用 `<img src>` 引用本地 SVG**：
   资源位于 `public/assets/svg/{common,nav,capture,timeline}/...svg`，
   组件通过 `Icon` 封装统一引用：

   ```jsx
   import Icon from '../components/Icon.jsx'
   <Icon name="capture/image" alt="图片" />   // → <img src="/assets/svg/capture/image.svg">
   ```

   `public/` 下的资源在 Vite 中以根路径 `/assets/svg/...` 提供，路径即源码路径。

## 目录结构

```
Nebula-React/
├─ public/assets/svg/        # 本地 SVG 图标资源（4 分组：common / nav / capture / timeline）
├─ src/
│  ├─ main.jsx               # 入口，先引入 tokens.css + base.css
│  ├─ App.jsx                # react-router 路由（/ 、/capture 、/timeline）
│  ├─ styles/
│  │  ├─ tokens.css          # ★ 统一设计令牌（CSS 变量唯一来源）
│  │  └─ base.css            # 重置 + 星云背景 + 入场动效 + a11y
│  ├─ components/            # 可独立复用组件（每个自带 .css）
│  │  ├─ Icon.jsx            # <img src="/assets/svg/..."> 封装
│  │  ├─ CosmosBackground.jsx
│  │  ├─ TopNav.jsx          # 居中导航（home / capture / timeline 三态）
│  │  ├─ DateWheel.jsx       # 日期滚轮（受控：年/月/日、拖动/滚轮/键盘）
│  │  ├─ ModeToolbar.jsx     # 记录页 4 模式卡片
│  │  ├─ TypeSelect.jsx      # 灵感类型下拉
│  │  ├─ InspirationSticky.jsx
│  │  ├─ NebulaView.jsx      # 星云聚类视图
│  │  ├─ ViewSwitch.jsx
│  │  └─ SelectionBar.jsx
│  ├─ pages/                 # 三个核心页面
│  │  ├─ HomePage.jsx        # 工作台首页（双主按钮 + 最近灵感）
│  │  ├─ CapturePage.jsx     # 记录灵感（文字/图/音 + 类型 + 自动保存）
│  │  └─ TimelinePage.jsx    # 灵感库（日期滚轮 + 白板/星云 + 多选）
│  └─ data/inspirations.js   # 示例数据（后续接 MCP / 后端替换）
```

## 交互要点

- **日期滚轮**：列独立滚动，5 项可见 + 顶/底渐隐；鼠标滚轮单步（180ms 防抖）、拖动 36px=1 步吸附、键盘可达；切月自动收敛当月天数。
- **多选进入创作**：白板贴片 / 星云节点点击选中，底部操作栏滑入；「用这些灵感创作」跳转到记录页。
- **模式卡片**：图片/音频可用，拍照/录音为移动端 PWA 预留（disabled）。
- **响应式**：≤720px 白板贴片转静态流、模式卡片 4 列紧凑、导航图标收起。
- **降级**：`prefers-reduced-motion` 下动效自动关闭；焦点环统一 `var(--focus)`。

## 下一步

- 接入真实数据：替换 `src/data/inspirations.js` 为 MCP / 后端接口。
- PWA：拍照/录音按钮挂 `getUserMedia` + `MediaRecorder`（需 HTTPS + manifest）。
- AI 融合：OCR / ASR / 分类返回后，类型色与 AI 标签自动融合（已有 `ai-tag` 位预留）。
