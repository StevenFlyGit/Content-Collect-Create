import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import Icon from './Icon.jsx'
import { getBasket } from '../lib/hotspots.js'
import './TopNav.css'

/**
 * 统一导航：工作台使用完整导航；记录页使用状态栏；灵感库使用方案 B 的返回/工具栏。
 */
export default function TopNav({ variant = 'home', title, backTo = '/', backLabel = '返回', right = null }) {
  const { pathname } = useLocation()
  const [basketTotal, setBasketTotal] = useState(0)

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

  if (variant === 'home') {
    const links = [
      { to: '/', label: '工作台' },
      { to: '/capture', label: '记录' },
      { to: '/timeline', label: '灵感库' },
      { to: '/hotspots', label: '热点' },
      { to: '/creation-space', label: '创作空间', prefixMatch: '/creation' },
      { to: '/creation-basket', label: '创作篮', badge: true },
    ]
    return (
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
                className={`nav-link${(l.to !== '#' && (pathname === l.to || (l.prefixMatch && pathname.startsWith(l.prefixMatch)))) ? ' active' : ''}`}
              >
                {l.label}
                {l.badge && basketTotal > 0 && <span className="badge">{basketTotal}</span>}
              </Link>
            ))}
            <span className="avatar" title="St">S</span>
          </div>
        </div>
      </nav>
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

