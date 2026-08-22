# 录音/图片附件交互改造（CapturePage）概述

## 背景与目标
依据 `Content-Collect-Create/03-交互流程与视觉设计规范.md` 新增的 **5.5 节（录音音频附件卡片交互）** 与 **5.6 节（附件拖拽排序）**，将文档定义的需求、布局与业务逻辑落地到前端代码，保持原有架构与代码风格连贯。

## 改动文件
- `Content-Collect-Create/Nebula-React/src/pages/CapturePage.jsx`
- `Content-Collect-Create/Nebula-React/src/pages/CapturePage.css`（同目录）

## 关键变更
1. **附件区布局（5.5.1）**
   - `.attachments` 由 `grid auto-fill` 改为 `display:flex; flex-direction:column`。
   - 音频卡片 `.attach.audio` 新增 `width:100%`，脱离网格、独占整行（横向全宽）。
   - 新增 `.image-row`（`display:flex; overflow-x:auto; scroll-snap-type:x`），图片以单行多张横向排列并可横向滚动。
2. **音频卡片交互（5.5.2 / 5.5.3）**
   - 播放控件 `.audio-player` 高度 34px → 44px，控件区域放大、间距充足。
   - 拖动进度条（seeking/seeked）时，通过 `seekingId` 给波形加 `.paused` 暂停装饰动画，释放后恢复。
   - 上传失败态 `disabled={attachment.failed}` 禁用音频播放控件（状态联动）。
   - 音频卡片内部分为波形 / 播放控件 / 元数据三个清晰分区。
3. **附件拖拽排序（5.6）**
   - 图片与音频卡片均支持 HTML5 `draggable` 拖拽，`handleAttachmentDrop` 基于全局 `attachments` 数组重排顺序并写入草稿（`persistAttachmentState`），满足「图片拖拽」与「音频可选拖拽」。
   - 拖拽视觉反馈：`.attach.dragging { opacity:.5 }`。
   - 可达性：每个卡片 `tabIndex=0` + `onKeyDown`（←/→ 与相邻项交换），满足键盘重排；`role="list/listitem"` 标注容器与项。
   - 拖拽时通过 `e.target.closest('audio')` 阻止从音频控件发起拖拽，避免与播放交互冲突。
   - 新增 `prefers-reduced-motion` 降级：关闭波形动画与拖拽透明度变化。

## 验证
- 使用项目内已安装的 esbuild（`transformSync`，`loader:jsx`）对 `CapturePage.jsx` 做语法转译校验，结果 `SYNTAX_OK`。
- 静态核对：渲染层级、顺序持久化（`submitInspiration` 按 `attachmentsRef.current` 顺序上传）、CSS 类与 03 文档术语一致。
- 未完成：本地 `npm run dev` 实机预览（沙箱对 `npm run build` 清空 `dist/` 有拦截，构建验证需在本地进行）。

## 2026-08-22 增量优化

### 新增改动文件
- `Content-Collect-Create/Nebula-React/src/components/ModeToolbar.jsx`

### 本次新增与优化
1. **图片多选批量上传**
   - `ModeToolbar.jsx` 中图片 `<input>` 增加 `multiple` 属性，`handleFileChange` 改为把全部选中文件以 `files` 数组上抛。
   - `CapturePage.jsx` 新增 `addAttachmentsBatch`：批量校验每个文件、生成附件对象、一次性保存草稿；`handleFileSelected` 兼容 `files` 与旧 `file` 入参，音频仍读取时长后入队。
2. **拖拽排序交互增强**
   - 新增 `dragOverId` 状态与 `handleAttachmentDragEnter` / `handleAttachmentDragLeave`，拖拽经过目标卡片时显示 `2px dashed` 紫色虚线高亮（`.attach.drag-over`）。
   - `onDragEnd` 统一调用 `clearDragState` 清理 `dragId` 与 `dragOverId`。
3. **音频卡片紧凑化**
   - 减少内边距（`12px` → `8px 10px`）、间距（`10px` → `6px`）、波形区高度（`28px` → `18px`）、播放器高度（`44px` → `36px`）。
   - 元数据行增加 `align-items: center` 与紧凑行距；音频卡片内删除按钮微调至 `top/right 4px`，避免与紧凑内容重叠。

### 验证
- 使用 esbuild API 分别校验 `CapturePage.jsx` 与 `ModeToolbar.jsx`，结果均为 `SYNTAX_OK`。

## 下一步
- 本地 `npm run dev` 打开 http://localhost:5173 ，在「记录灵感」页插入音频/图片，核验：
  - 图片选择器支持一次多选，批量加入草稿；
  - 音频独占一行且高度明显降低、留白减少；
  - 图片横向排列，可通过拖拽（桌面）或键盘方向键调整顺序；
  - 拖拽经过目标卡片时出现虚线高亮反馈。
- 如需：移动端长按拖拽（当前为桌面 HTML5 draggable，移动端浏览器支持有限，可作为后续增强）。

## 2026-08-22 拖拽排序热修复

### 问题
- PC 端图片能拖动但无法真正换位。
- 移动端 HTML5 `draggable` 完全不支持，无法拖动。

### 修复
- 图片行弃用 HTML5 draggable，改为**自定义 pointer/touch 拖拽**。
- 新增 `pointerDrag` 状态、`imageRowRef`、`dragStartRef`；长按约 220ms 触发拖拽，短按/移动超过 8px 取消，避免误触与滚动冲突。
- 拖拽时渲染固定定位的 `.drag-ghost` 幽灵卡片跟随指针；移动过程中实时计算最近卡片并高亮目标（`.drag-over`）。
- 释放后调用 `reorderAttachment(sourceId, targetId)` 重排并写入草稿。
- 抽出 `reorderAttachment` 函数，键盘方向键与音频卡片的 HTML5 拖拽均复用。

### 样式
- `.image-row.is-dragging` 禁止横向滚动；卡片默认 `touch-action: pan-y pinch-zoom`，拖拽时 `touch-action: none`。
- 被拖拽卡片半透明+轻微缩小；目标卡片显示紫色虚线轮廓。

### 验证
- esbuild API 校验 `CapturePage.jsx` JSX 语法通过。
