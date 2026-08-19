import { Link, useLocation } from 'react-router-dom'
import Icon from './Icon.jsx'
import './TopNav.css'

/**
 * 统一导航：工作台使用完整导航；记录页使用状态栏；灵感库使用方案 B 的返回/工具栏。
 */
export default function TopNav({ variant = 'home', title, backTo = '/', backLabel = '返回', right = null }) {
  const { pathname } = useLocation()

  if (variant === 'home') {
    const links = [
      { to: '/', label: '工作台' },
      { to: '/capture', label: '记录' },
      { to: '/timeline', label: '灵感库' },
      { to: '#', label: '热点' },
      { to: '#', label: '项目' },
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
                className={`nav-link${l.to !== '#' && pathname === l.to ? ' active' : ''}`}
              >
                {l.label}
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

