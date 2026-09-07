import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import Icon from './Icon.jsx'
import { getBasket } from '../lib/hotspots.js'
import './TopNav.css'

/**
 * 统一导航：工作台使用完整导航；记录页使用状态栏；灵感库使用方案 B 的返回/工具栏。
 * 窄屏（≤720px）：横向链接隐藏，右侧显示汉堡按钮，点击展开抽屉式菜单。
 */
export default function TopNav({ variant = 'home', title, backTo = '/', backLabel = '返回', right = null }) {
  const { pathname } = useLocation()
  const [basketTotal, setBasketTotal] = useState(0)
  // 移动端菜单展开状态（仅 home 变体使用）
  const [menuOpen, setMenuOpen] = useState(false)

  // 创作篮数量角标：进入任意页面时拉取一次，导航切换即随页面重挂载刷新
  useEffect(() => {
    let active = true
    getBasket()
      .then((r) => {
        if (!active) return
        const d = r.data || {}
        setBasketTotal((d.inspirations?.length || 0) + (d.hotspots?.length || 0))
      })
      .catch(() => {})
    return () => { active = false }
  }, [])

  // 路由切换时自动关闭抽屉（点击链接后通过 onClick 也会关闭，双保险）
  useEffect(() => { setMenuOpen(false) }, [pathname])

  // 抽屉打开时锁滚动；Esc 关闭
  useEffect(() => {
    if (!menuOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event) => { if (event.key === 'Escape') setMenuOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  if (variant === 'home') {
    const links = [
      { to: '/', label: '工作台' },
      { to: '/capture', label: '记录' },
      { to: '/timeline', label: '灵感库' },
      { to: '/hotspots', label: '热点' },
      { to: '/creation-space', label: '创作空间', prefixMatch: '/creation' },
      { to: '/creation-basket', label: '创作篮', badge: true },
    ]
    const isActive = (l) => l.to !== '#' && (pathname === l.to || (l.prefixMatch && pathname.startsWith(l.prefixMatch)))
    return (
      <>
        <nav className="nav">
          <div className="nav-inner">
            <Link to="/" className="brand">
              <span className="brand-mark" aria-hidden="true" />
              <span>Nebula</span>
            </Link>
            <div className="nav-links">
              {links.map((l) => (
                <Link
                  key={l.label}
                  to={l.to}
                  className={`nav-link${isActive(l) ? ' active' : ''}`}
                >
                  {l.label}
                  {l.badge && basketTotal > 0 && <span className="badge">{basketTotal}</span>}
                </Link>
              ))}
              <span className="avatar" title="St">S</span>
            </div>
            <button
              type="button"
              className="nav-burger"
              aria-label={menuOpen ? '关闭菜单' : '打开菜单'}
              aria-expanded={menuOpen}
              aria-controls="nav-mobile-panel"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span className={`nav-burger-bars${menuOpen ? ' is-open' : ''}`} aria-hidden="true">
                <span /><span /><span />
              </span>
            </button>
          </div>
        </nav>

        {/* 移动端抽屉菜单（仅窄屏可见，CSS 控制） */}
        <div
          className={`nav-mobile${menuOpen ? ' open' : ''}`}
          aria-hidden={!menuOpen}
        >
          <div
            className="nav-mobile-mask"
            onClick={() => setMenuOpen(false)}
          />
          <aside
            id="nav-mobile-panel"
            className="nav-mobile-panel"
            role="dialog"
            aria-modal="true"
            aria-label="主导航菜单"
          >
            <div className="nav-mobile-head">
              <Link to="/" className="brand" onClick={() => setMenuOpen(false)}>
                <span className="brand-mark" aria-hidden="true" />
                <span>Nebula</span>
              </Link>
              <button type="button" className="nav-mobile-close" aria-label="关闭菜单" onClick={() => setMenuOpen(false)}>×</button>
            </div>
            <nav className="nav-mobile-links" aria-label="主导航">
              {links.map((l) => (
                <Link
                  key={l.label}
                  to={l.to}
                  className={`nav-mobile-link${isActive(l) ? ' active' : ''}`}
                  onClick={() => setMenuOpen(false)}
                >
                  <span>{l.label}</span>
                  {l.badge && basketTotal > 0 && <span className="badge">{basketTotal}</span>}
                </Link>
              ))}
            </nav>
            <div className="nav-mobile-foot">
              <span className="avatar" title="St">S</span>
              <span className="nav-mobile-user">St · 当前工作区</span>
            </div>
          </aside>
        </div>
      </>
    )
  }

  if (variant === 'timeline') {
    return (
      <nav className="nav timeline-nav">
        <div className="nav-inner timeline-nav-inner">
          <Link to={backTo} className="back" aria-label={`${backLabel}工作台`}>
            ← {backLabel}
          </Link>
          <div className="nav-title">{title}</div>
          <div className="nav-tools">{right}</div>
        </div>
      </nav>
    )
  }

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link to={backTo} className="back" aria-label={`${backLabel}工作台`}>
          <Icon name="nav/back" alt="" width={14} height={14} />
          {backLabel}
        </Link>
        <div className="topbar-title">{title}</div>
        <div className="nav-tools">{right}</div>
      </div>
    </header>
  )
}

