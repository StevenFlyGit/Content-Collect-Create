/**
 * CosmosBackground —— 星云背景
 * 支持按页面切换方案 B 中不同的光晕层级。
 */
export default function CosmosBackground({ variant = 'home' }) {
  return (
    <>
      <div className={`cosmos cosmos-${variant}`} aria-hidden="true" />
      {variant === 'home' && <div className="arc" aria-hidden="true" />}
    </>
  )
}
