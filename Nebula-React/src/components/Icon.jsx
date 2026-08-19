/**
 * Icon —— 统一图标引用封装
 * ------------------------------------------------------------
 * 所有图标资源位于 public/assets/svg/{分组}/{名}.svg，
 * 通过 <img src="/assets/svg/分组/名.svg"> 引用本地 SVG（零网络请求）。
 *
 * 用法：<Icon name="capture/image" alt="图片" />
 * 等价于手写 <img src="/assets/svg/capture/image.svg" alt="图片" />
 *
 * 设计要点：
 * - 默认显式设置 width/height（18px），防止 SVG 自身 width="24" 属性溢出
 *   父容器尺寸，导致图标被放大到 24px+ 看起来"错位"或"全屏"；
 * - 通过 aspect-ratio + object-fit:contain 兜底，避免父容器被 SVG 撑高；
 * - user-select:none + draggable=false，避免被误选中。
 */
export default function Icon({ name, alt = '', className = '', width = 18, height = 18 }) {
  return (
    <img
      src={`/assets/svg/${name}.svg`}
      alt={alt}
      className={`icon ${className}`}
      width={width}
      height={height}
      draggable={false}
    />
  )
}
