import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import CosmosBackground from '../components/CosmosBackground.jsx'
import TopNav from '../components/TopNav.jsx'
import { listInProgressCreations, getPlan } from '../storage/creationRepository.js'
import { listDrafts } from '../storage/draftRepository.js'
import './CreationSpacePage.css'

const STAGE_LABEL = { brief: '这次想怎么写', plan: '选题与大纲', platform: '选择平台', write: '内容创作' }

/** 依据创作当前数据推导阶段描述（对照原型 creationStage）。 */
function describeStage(creation, plan, drafts) {
  if (!plan) return '选题与大纲生成未完成，可继续重试'
  if (!plan.confirmed_snapshot) return '选题与大纲待确认'
  const count = (drafts.xhs ? 1 : 0) + (drafts.wechat ? 1 : 0)
  return count ? `已有 ${count} 个平台版本，可继续修改` : '大纲已确认，等待开始平台创作'
}

/**
 * 创作空间：查询本地 IndexedDB 中 status=in_progress 的创作，按 updated_at 倒序。
 * 只读取浏览器本地数据，离线可用（backend-design.md §7）。
 */
export default function CreationSpacePage() {
  const navigate = useNavigate()
  const [state, setState] = useState('loading')
  const [projects, setProjects] = useState([])

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const creations = await listInProgressCreations()
        const enriched = await Promise.all(creations.map(async (creation) => ({
          creation,
          plan: await getPlan(creation.id),
          drafts: await listDrafts(creation.id),
        })))
        if (active) {
          setProjects(enriched)
          setState('ready')
        }
      } catch {
        if (active) setState('error')
      }
    })()
    return () => { active = false }
  }, [])

  const latest = projects[0]

  return (
    <>
      <CosmosBackground variant="home" />
      <TopNav variant="home" />
      <main className="space-wrap">
        <div className="space-head">
          <div>
            <p className="space-kicker">NEBULA · CREATION SPACE</p>
            <h1 className="space-title">创作空间</h1>
            <p className="space-sub">{projects.length ? '从上次停下的位置继续，不必重新选择素材。' : '把还没完成的创作，接着写下去。'}</p>
          </div>
          <button type="button" className="space-btn" onClick={() => navigate('/creation-basket')}>返回创作篮</button>
        </div>

        {state === 'loading' && <div className="space-loading">正在读取本地创作…</div>}
        {state === 'error' && <div className="space-loading">本地创作数据读取失败，请刷新重试。</div>}

        {state === 'ready' && !projects.length && (
          <section className="space-empty">
            <div className="space-empty-content">
              <div className="space-orb" aria-hidden="true" />
              <h2>当前没有创作中的项目</h2>
              <p>去创作篮选择一些灵感或热点，让一个想法从素材开始，慢慢长成完整作品。</p>
              <button type="button" className="space-btn primary" onClick={() => navigate('/creation-basket')}>去创作篮选择素材 →</button>
            </div>
          </section>
        )}

        {state === 'ready' && latest && (
          <section className="space-project">
            <div className="space-project-head">
              <div>
                <span className="space-pill violet">正在创作</span>
                <h2>{latest.creation.title_preview || '未命名创作'}</h2>
                <p className="desc">{describeStage(latest.creation, latest.plan, latest.drafts)}</p>
              </div>
              <span className="space-small">{latest.creation.source_count} 项素材</span>
            </div>
            <div className="space-progress" aria-hidden="true"><span /></div>
            <div className="space-project-meta">
              <span className="space-pill">
                {latest.plan?.confirmed_snapshot ? '选题与大纲已确认' : latest.plan ? '选题与大纲草稿' : '等待生成选题'}
              </span>
              <div className="space-platforms">
                <span className={`space-pill${latest.drafts.xhs ? '' : ' muted'}`} style={latest.drafts.xhs ? { color: 'var(--nebula-rose)' } : undefined}>
                  小红书 · {latest.drafts.xhs ? '已生成' : '未生成'}
                </span>
                <span className={`space-pill${latest.drafts.wechat ? '' : ' muted'}`} style={latest.drafts.wechat ? { color: 'var(--nebula-mint)' } : undefined}>
                  微信公众号 · {latest.drafts.wechat ? '已生成' : '未生成'}
                </span>
              </div>
            </div>
            <div className="space-project-actions">
              <span className="space-small">草稿自动保存在此浏览器</span>
              <button type="button" className="space-btn primary" onClick={() => navigate(`/creation/${latest.creation.id}`)}>
                继续创作 →
              </button>
            </div>
          </section>
        )}

        {state === 'ready' && projects.length > 1 && (
          <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {projects.slice(1).map(({ creation }) => (
              <div key={creation.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '14px 18px', border: '1px solid var(--line-soft)', borderRadius: 14, background: 'var(--surface)', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 650, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{creation.title_preview || '未命名创作'}</div>
                  <div className="space-small">{STAGE_LABEL[creation.stage] || '创作中'} · {creation.source_count} 项素材</div>
                </div>
                <button type="button" className="space-btn" style={{ minHeight: 34, padding: '5px 14px', fontSize: 13 }} onClick={() => navigate(`/creation/${creation.id}`)}>继续 →</button>
              </div>
            ))}
          </div>
        )}

        {state === 'ready' && projects.length > 0 && (
          <p className="space-small" style={{ marginTop: 18 }}>
            创作内容仅保存在此浏览器（IndexedDB）。清除站点数据、无痕窗口关闭或更换设备将无法恢复。
          </p>
        )}
      </main>
    </>
  )
}
