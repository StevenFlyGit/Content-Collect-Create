import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import TopNav from '../components/TopNav.jsx'
import CosmosBackground from '../components/CosmosBackground.jsx'
import InspirationDetailDrawer from '../components/InspirationDetailDrawer.jsx'
import { listInspirations } from '../lib/api.js'
import './HomePage.css'

const onCardMove = (e) => { const r = e.currentTarget.getBoundingClientRect(); e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`); e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`) }
const typePill = { 想法: 'idea', 引用: 'quote', 随感: 'moment', 待办: 'task', 案例: 'case', 问题: 'question', 先不分类: 'muted' }
const formatTime = (value) => { const date = new Date(value); return `${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })} · ${date.toLocaleDateString('zh-CN')}` }

export default function HomePage() {
  const [items, setItems] = useState([])
  const [todayCount, setTodayCount] = useState(0)
  const [state, setState] = useState('loading')
  const [detailId, setDetailId] = useState(null)
  const [editId, setEditId] = useState(null)
  const load = () => { setState('loading'); listInspirations({ recent: 4 }).then((payload) => { setItems(payload.data || []); setTodayCount(payload.meta?.today_count || 0); setState('ready') }).catch(() => setState('error')) }
  useEffect(() => { load() }, [])
  return <><CosmosBackground variant="home" /><TopNav variant="home" /><main className="main">
    <section className="hero reveal"><p className="greeting">下午好 · St</p><h1 className="headline">把散落的灵感，<br />慢慢变成<em>可以分享</em>的作品。</h1><p className="subline"><span className="dot-pulse" aria-hidden="true" />今日已收集 <strong style={{ color: 'var(--ink)' }}>{todayCount}</strong> 条灵感</p></section>
    <section className="actions reveal d1"><Link to="/capture" className="action-card capture" onMouseMove={onCardMove}><div className="ico" aria-hidden="true">＋</div><h2 className="title">记录灵感 <span className="arrow">→</span></h2><p className="desc">随手写下一句话、拍一张图、录一段语音。<br />不必完整，先抓住那束光。</p><div className="tags"><span className="tag">文字</span><span className="tag">图片 ≤20MB</span><span className="tag">音频 ≤1分钟</span></div></Link><Link to="/timeline" className="action-card create" onMouseMove={onCardMove}><div className="ico" aria-hidden="true">✦</div><h2 className="title">开始创作 <span className="arrow">→</span></h2><p className="desc">从某一天出发，挑出今天想到的，<br />开始一段结构化的写作。</p><div className="tags"><span className="tag">按日期</span><span className="tag">白板贴片</span><span className="tag">多选进入</span></div></Link></section>
    <section className="reveal d2"><header className="section-head"><h3 className="section-title">最近的灵感</h3><Link to="/timeline" className="section-link">查看全部 →</Link></header>
      {state === 'loading' && <p className="empty">正在加载灵感…</p>}{state === 'error' && <div className="empty">最近灵感加载失败。<button type="button" onClick={load}>重试</button></div>}{state === 'ready' && !items.length && <p className="empty">还没有已提交的灵感，先记录一条吧。</p>}
      <div className="recent-grid">{items.map((item, i) => <article className={`note reveal d${i + 2}`} tabIndex={0} key={item.id} role="button" aria-label={`查看灵感 ${item.title || item.text || ''}`} onClick={() => { setEditId(null); setDetailId(item.id) }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setEditId(null); setDetailId(item.id) } }}><div className="meta"><span className={`pill ${typePill[item.type] || 'idea'}`}>{item.type}</span><span>{formatTime(item.recorded_at)}</span></div><p className="excerpt">{item.title ? `${item.title}：` : ''}{item.text || '（无正文）'}</p><div className="footer"><span>{item.attachments?.filter((a) => a.kind === 'image').length ? `🖼 ${item.attachments.filter((a) => a.kind === 'image').length} 张图` : ''}</span><span>{item.attachments?.filter((a) => a.kind === 'audio').length ? `🎙 ${item.attachments.filter((a) => a.kind === 'audio').length} 段音频` : ''}</span><span>{item.sync_status === 'synced' ? '已同步' : '草稿'}</span><button type="button" className="note-edit-btn" aria-label="编辑灵感" onClick={(event) => { event.stopPropagation(); setDetailId(null); setEditId(item.id) }}>编辑</button></div></article>)}</div>
    </section>
    {detailId && !editId && <InspirationDetailDrawer inspirationId={detailId} onClose={() => setDetailId(null)} onChanged={load} />}
    {editId && <InspirationDetailDrawer inspirationId={editId} initialMode="edit" onClose={() => setEditId(null)} onChanged={load} />}
  </main></>
}
