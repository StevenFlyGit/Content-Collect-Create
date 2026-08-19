import { Link } from 'react-router-dom'
import TopNav from '../components/TopNav.jsx'
import CosmosBackground from '../components/CosmosBackground.jsx'
import './HomePage.css'

const recent = [
  { type: '想法', pill: 'idea', time: '17:42 · 今天', excerpt: '"如果按日期回看灵感，会不会更像回到当天？"', footer: ['🖼 2 张图', '·', '已存草稿'] },
  { type: '引用', pill: 'quote', time: '11:08 · 今天', excerpt: '"桂花落在车座上，气味比照片更早把秋天保存下来。"', footer: ['🎙 01:24', '·', '已转写'] },
  { type: '随感', pill: 'moment', time: '21:30 · 昨天', excerpt: '城市记忆短文：便利店夜班、巷口手写招牌、雨后的石板路……', footer: ['用于 1 个项目'] },
  { type: '待办', pill: 'task', time: '09:15 · 昨天', excerpt: '周五合作视频开场：用一个"还没说清的念头"做钩子。', footer: ['进行中 · 还有 3 天'] },
]

const onCardMove = (e) => {
  const r = e.currentTarget.getBoundingClientRect()
  e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`)
  e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`)
}

export default function HomePage() {
  return (
    <>
      <CosmosBackground variant="home" />
      <TopNav variant="home" />

      <main className="main">
        <section className="hero reveal">
          <p className="greeting">下午好 · St</p>
          <h1 className="headline">把散落的灵感，<br />慢慢变成<em>可以分享</em>的作品。</h1>
          <p className="subline">
            <span className="dot-pulse" aria-hidden="true" />
            今日已收集 <strong style={{ color: 'var(--ink)' }}>3</strong> 条灵感 · 连续第 12 天
          </p>
        </section>

        <section className="actions reveal d1">
          <Link to="/capture" className="action-card capture" onMouseMove={onCardMove}>
            <div className="ico" aria-hidden="true">＋</div>
            <h2 className="title">记录灵感 <span className="arrow">→</span></h2>
            <p className="desc">随手写下一句话、拍一张图、录一段语音。<br />不必完整，先抓住那束光。</p>
            <div className="tags">
              <span className="tag">文字</span>
              <span className="tag">图片</span>
              <span className="tag">音频</span>
              <span className="tag muted">拍照 · 录音（移动端）</span>
            </div>
          </Link>

          <Link to="/timeline" className="action-card create" onMouseMove={onCardMove}>
            <div className="ico" aria-hidden="true">✦</div>
            <h2 className="title">开始创作 <span className="arrow">→</span></h2>
            <p className="desc">从某一天出发，挑出今天想到的，<br />开始一段结构化的写作。</p>
            <div className="tags">
              <span className="tag">按日期</span>
              <span className="tag">白板贴片</span>
              <span className="tag">多选进入</span>
            </div>
          </Link>
        </section>

        <section className="reveal d2">
          <header className="section-head">
            <h3 className="section-title">最近的灵感</h3>
            <Link to="/timeline" className="section-link">查看全部 →</Link>
          </header>

          <div className="recent-grid">
            {recent.map((n, i) => (
              <article className={`note reveal d${i + 2}`} tabIndex={0} key={i}>
                <div className="meta"><span className={`pill ${n.pill}`}>{n.type}</span><span>{n.time}</span></div>
                <p className="excerpt">{n.excerpt}</p>
                <div className="footer">
                  {n.footer.map((part, partIndex) => <span key={`${part}-${partIndex}`}>{part}</span>)}
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    </>
  )
}
