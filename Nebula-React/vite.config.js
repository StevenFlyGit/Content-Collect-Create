import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// SVG 资源放在 public/assets/svg/ 下，按 Vite 约定以根路径 /assets/svg/... 引用，
// 组件里统一用 <img src="/assets/svg/分组/文件名.svg"> —— 路径即源码路径，零翻译。
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173
  }
})
