import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github.css'
import CosmosBackground from '../components/CosmosBackground.jsx'
import TopNav from '../components/TopNav.jsx'
import CreationBriefModal from '../components/CreationBriefModal.jsx'
import { generatePlan, generateDraft, rewriteDraft } from '../lib/creationLlm.js'
import { showToast } from '../lib/toast.js'
import {
  getCreation, getMaterials, getBrief, getPlan, savePlan, writeGeneratedPlan, confirmPlan, updateCreation, saveBrief,
} from '../storage/creationRepository.js'
import {
  listDrafts, saveDraft, completeDraft, restorePreviousRevision, listChatMessages, addChatMessage,
} from '../storage/draftRepository.js'
import { createJob, finishJob, getLatestJob, interruptRunningJobs } from '../storage/localJobRepository.js'
import { LS_KEYS, PLATFORM_LABEL } from '../storage/creationDb.js'
import './CreationFlowPage.css'

const CHAT_CHIPS = [
  { label: '更自然', prompt: '语气更自然，像和朋友聊天' },
  { label: '精简一些', prompt: '精简一些，保留核心观点' },
  { label: '改写开头', prompt: '开头更直接，先抛出观点' },
]

/** 防抖保存（backend-design.md §5：brief 400ms / 大纲与正文 800ms）。 */
function useDebouncedCallback(fn, delay) {
  const timerRef = useRef(null)
  const argsRef = useRef([])
  const fnRef = useRef(fn)
  fnRef.current = fn
  const apiRef = useRef(null)
  useEffect(() => () => { if (timerRef.current) window.clearTimeout(timerRef.current) }, [])
  if (!apiRef.current) {
    apiRef.current = {
      schedule: (...args) => {
        argsRef.current = args
        if (timerRef.current) window.clearTimeout(timerRef.current)
        timerRef.current = window.setTimeout(() => {
          timerRef.current = null
          fnRef.current(...argsRef.current)
        }, delay)
      },
      flush: () => {
        if (!timerRef.current) return
        window.clearTimeout(timerRef.current)
        timerRef.current = null
        fnRef.current(...argsRef.current)
      },
      cancel: () => {
        if (timerRef.current) { window.clearTimeout(timerRef.current); timerRef.current = null }
      },
    }
  }
  return apiRef.current
}

function autoSize(event) {
  const el = event.target
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight + 4}px`
}

function planTextOf(planDraft) {
  return `# ${planDraft.title}\n\n${planDraft.core_point}\n\n${planDraft.outline_text}`
}

function draftTextOf(draft, platform) {
  const extra = platform === 'xhs' ? draft.content.tags : draft.content.summary
  return `# ${draft.content.title}\n\n${draft.content.body}\n\n${extra || ''}`.trim()
}

function downloadText(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function CreationFlowPage() {
  const { creationId } = useParams()
  const navigate = useNavigate()
  const [loadState, setLoadState] = useState('loading')
  const [creation, setCreation] = useState(null)
  const [materials, setMaterials] = useState([])
  const [brief, setBrief] = useState(null)
  const [plan, setPlan] = useState(null)
  const [planDraft, setPlanDraft] = useState({ title: '', core_point: '', outline_text: '' })
  const [drafts, setDrafts] = useState({ xhs: null, wechat: null })
  const [messages, setMessages] = useState([])
  const [chosen, setChosen] = useState([])
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const [saveState, setSaveState] = useState('saved')
  const [preview, setPreview] = useState(false)
  const [confirmState, setConfirmState] = useState(null)
  const [chatInput, setChatInput] = useState('')
  const busyRef = useRef(null)

  /* ---------- 防抖保存 ---------- */

  const persistPlan = useCallback(async (fields) => {
    if (!creationId) return
    try {
      const next = await savePlan(creationId, fields)
      setPlan(next)
      setSaveState('saved')
    } catch {
      setSaveState('failed')
    }
  }, [creationId])
  const planSave = useDebouncedCallback(persistPlan, 800)

  const persistDraft = useCallback(async ({ platform, content }) => {
    if (!creationId) return
    try {
      const next = await saveDraft(creationId, platform, content, { origin: 'manual' })
      setDrafts((prev) => (prev[platform] ? { ...prev, [platform]: next } : prev))
      setSaveState('saved')
    } catch {
      setSaveState('failed')
    }
  }, [creationId])
  const draftSave = useDebouncedCallback(persistDraft, 800)

  /* ---------- 生成编排 ---------- */

  async function runPlanGeneration(record = creation, briefRecord = brief, mats = materials) {
    if (busyRef.current || !record) return
    busyRef.current = { kind: 'plan' }
    setBusy({ kind: 'plan' })
    setError(null)
    const job = await createJob({ creation_id: record.id, kind: 'plan' })
    try {
      const result = await generatePlan({
        materials: mats.map((m) => ({ origin: m.origin, title: m.title, text: m.text || '', source_name: m.source_name || '', source_url: m.source_url || '' })),
        supplement: briefRecord?.supplement || '',
        purpose: briefRecord?.purpose || '',
        style: briefRecord?.style_snapshot || '',
      })
      const nextPlan = await writeGeneratedPlan(record.id, result.data.plan)
      await finishJob(job.id, { state: 'succeeded' })
      setPlan(nextPlan)
      setPlanDraft({ title: nextPlan.title, core_point: nextPlan.core_point, outline_text: nextPlan.outline_text })
      setCreation((c) => (c ? { ...c, stage: 'plan', title_preview: nextPlan.title || c.title_preview } : c))
    } catch (err) {
      await finishJob(job.id, { state: 'failed', error_code: err.code || 'PLAN_FAILED' })
      setError({ kind: 'plan', message: `${err.message || '选题生成未完成'}，输入和已有内容已保留，请重试。` })
    } finally {
      busyRef.current = null
      setBusy(null)
    }
  }

  async function runDraftGeneration(platforms, options = {}) {
    const { skipConfirm = false } = options
    if (!plan?.confirmed_snapshot) { showToast('请先确认选题与大纲'); return }
    if (plan.version !== plan.confirmed_version) {
      showToast('大纲已有修改，请先确认新大纲')
      await backToPlan()
      return
    }
    const existing = platforms.filter((p) => drafts[p])
    if (existing.length && !skipConfirm) {
      setConfirmState({
        title: '重新创作已选平台版本？',
        body: '将使用已确认的大纲重新生成已选平台的内容。现有稿件保留到生成成功，之后仍可以撤销恢复。',
        label: '重新创作',
        onConfirm: () => runDraftGeneration(platforms, { skipConfirm: true }),
      })
      return
    }
    if (busyRef.current) return
    busyRef.current = { kind: 'draft', platforms }
    setBusy({ kind: 'draft', platforms })
    setError(null)
    const job = await createJob({ creation_id: creationId, kind: 'draft', platforms, base_version: plan.confirmed_version })
    const confirmed = plan.confirmed_snapshot
    try {
      const result = await generateDraft({
        plan: confirmed,
        platforms,
        materials: materials.map((m) => ({ origin: m.origin, title: m.title, text: m.text || '', source_name: m.source_name || '', source_url: m.source_url || '' })),
        brief: { supplement: brief?.supplement || '', purpose: brief?.purpose || '', style: brief?.style_snapshot || '' },
      })
      const nextDrafts = { ...drafts }
      for (const platform of platforms) {
        nextDrafts[platform] = await saveDraft(creationId, platform, result.data.drafts[platform], { origin: 'generated', sourcePlanVersion: plan.confirmed_version })
      }
      await finishJob(job.id, { state: 'succeeded' })
      setDrafts(nextDrafts)
      const record = await updateCreation(creationId, { stage: 'write', selected_platforms: platforms, active_platform: platforms[0] })
      setCreation(record)
      setPreview(false)
      setMessages(await listChatMessages(creationId, platforms[0]))
    } catch (err) {
      await finishJob(job.id, { state: 'failed', error_code: err.code || 'DRAFT_FAILED' })
      setError({ kind: 'draft', platforms, message: `${err.message || '内容生成未完成'}，已有稿件会保留，请重试。` })
    } finally {
      busyRef.current = null
      setBusy(null)
    }
  }

  async function runRewrite(instruction) {
    const platform = creation?.active_platform || 'xhs'
    const text = String(instruction || '').trim()
    if (!text) { showToast('请填写修改要求'); return }
    if (!drafts[platform] || busyRef.current) return
    draftSave.flush()
    const userMessage = await addChatMessage({ creation_id: creationId, platform, role: 'user', text })
    setMessages((prev) => [...prev, userMessage])
    setChatInput('')
    busyRef.current = { kind: 'rewrite', platform }
    setBusy({ kind: 'rewrite', platform })
    setError(null)
    const job = await createJob({ creation_id: creationId, kind: 'rewrite', platforms: [platform], base_version: drafts[platform].version })
    try {
      const current = (await listDrafts(creationId))[platform] || drafts[platform]
      const result = await rewriteDraft({
        platform,
        content: current.content,
        instruction: text,
        plan: plan?.confirmed_snapshot || null,
        brief: { supplement: brief?.supplement || '', purpose: brief?.purpose || '', style: brief?.style_snapshot || '' },
      })
      const next = await saveDraft(creationId, platform, result.data.content, { origin: 'rewrite', sourcePlanVersion: current.source_plan_version })
      const assistant = await addChatMessage({ creation_id: creationId, platform, role: 'assistant', text: '已按你的要求修改当前稿件，可在正文中查看，不满意可撤销。', applied_version: next.version })
      await finishJob(job.id, { state: 'succeeded' })
      setDrafts((prev) => ({ ...prev, [platform]: next }))
      setMessages((prev) => [...prev, assistant])
    } catch (err) {
      await finishJob(job.id, { state: 'failed', error_code: err.code || 'REWRITE_FAILED' })
      setError({ kind: 'rewrite', message: `${err.message || '改写未完成'}，稿件保持原样，请重试。` })
    } finally {
      busyRef.current = null
      setBusy(null)
    }
  }

  /* ---------- 页面动作 ---------- */

  async function backToPlan() {
    draftSave.flush()
    planSave.flush()
    const record = await updateCreation(creationId, { stage: 'plan' })
    setCreation(record)
    setError(null)
    window.scrollTo(0, 0)
  }

  async function handleConfirmPlan() {
    const fields = { ...planDraft }
    if (!['title', 'core_point', 'outline_text'].every((key) => fields[key].trim())) return
    planSave.cancel()
    try {
      await savePlan(creationId, fields)
      const confirmed = await confirmPlan(creationId)
      setPlan(confirmed)
      setChosen([])
      const record = await updateCreation(creationId, { stage: 'platform' })
      setCreation(record)
      setSaveState('saved')
      window.scrollTo(0, 0)
    } catch {
      setSaveState('failed')
    }
  }

  async function switchPlatform(nextPlatform) {
    if (nextPlatform === (creation?.active_platform || 'xhs')) return
    draftSave.flush()
    setPreview(false)
    setError(null)
    const record = await updateCreation(creationId, { active_platform: nextPlatform })
    setCreation(record)
    setMessages(await listChatMessages(creationId, nextPlatform))
  }

  async function handleUndo() {
    const platform = creation?.active_platform || 'xhs'
    try {
      const next = await restorePreviousRevision(creationId, platform)
      if (!next) { showToast('没有可撤销的历史版本'); return }
      setDrafts((prev) => ({ ...prev, [platform]: next }))
      showToast('已恢复修改前的版本')
    } catch (err) {
      showToast(`撤销失败：${err.message}`)
    }
  }

  async function handleFinish() {
    const platform = creation?.active_platform || 'xhs'
    draftSave.flush()
    const draft = (await listDrafts(creationId))[platform]
    if (!draft?.content?.title?.trim() || !draft?.content?.body?.trim()) {
      showToast('请补全当前稿件的标题与正文')
      return
    }
    try {
      await completeDraft(creationId, platform)
      setCreation(await getCreation(creationId))
      setDrafts((prev) => ({ ...prev, [platform]: { ...draft, completed_at: new Date().toISOString() } }))
      showToast('当前平台作品已完成')
    } catch (err) {
      showToast(`操作失败：${err.message}`)
    }
  }

  async function handleCopy() {
    const platform = creation?.active_platform || 'xhs'
    const draft = drafts[platform]
    if (!draft) return
    try {
      await navigator.clipboard.writeText(draftTextOf(draft, platform))
      showToast('已复制当前稿件')
    } catch {
      handleDownload()
      showToast('浏览器不允许复制，已改为下载')
    }
  }

  function handleDownload() {
    const platform = creation?.active_platform || 'xhs'
    const draft = drafts[platform]
    if (!draft) return
    downloadText(`${PLATFORM_LABEL[platform]}-作品.md`, draftTextOf(draft, platform))
  }

  function handleBackup() {
    const platform = creation?.active_platform || 'xhs'
    const draft = drafts[platform]
    if (draft) downloadText(`${PLATFORM_LABEL[platform]}-备份.md`, draftTextOf(draft, platform))
    else if (plan) downloadText('选题大纲-备份.md', planTextOf(planDraft))
  }

  function handleRetry() {
    if (!error) return
    if (error.kind === 'plan') {
      runPlanGeneration()
    } else if (error.kind === 'draft' || error.kind === 'drafts') {
      const platforms = error.platforms?.length ? error.platforms : [creation?.active_platform || 'xhs']
      runDraftGeneration(platforms, { skipConfirm: true })
    }
  }

  function handleRegeneratePlan() {
    setConfirmState({
      title: '重新生成选题与大纲？',
      body: '会替换当前选题草稿。已有成稿仍保留，生成失败也会保留当前选题。',
      label: '重新生成',
      onConfirm: () => {
        setPlan(null)
        setPlanDraft({ title: '', core_point: '', outline_text: '' })
        runPlanGeneration()
      },
    })
  }

  /* ---------- 字段编辑 ---------- */

  const handlePlanField = (key, value) => {
    const next = { ...planDraft, [key]: value }
    setPlanDraft(next)
    setSaveState('saving')
    planSave.schedule(next)
  }

  const handleDraftField = (key, value) => {
    const platform = creation?.active_platform || 'xhs'
    const draft = drafts[platform]
    if (!draft) return
    const nextDraft = { ...draft, content: { ...draft.content, [key]: value }, completed_at: null }
    setDrafts((prev) => ({ ...prev, [platform]: nextDraft }))
    setSaveState('saving')
    draftSave.schedule({ platform, content: nextDraft.content })
  }

  /* ---------- brief 阶段（stage=brief 恢复） ---------- */

  const handleBriefPersist = async (patch) => {
    try {
      setBrief(await saveBrief(creationId, patch))
    } catch { /* 保存失败保留内存值，不误报成功 */ }
  }

  const handleBriefGenerate = async () => {
    try {
      const record = await updateCreation(creationId, { stage: 'plan' })
      setCreation(record)
      runPlanGeneration(record, brief, materials)
    } catch {
      showToast('会话更新失败，请重试')
    }
  }

  /* ---------- 加载与恢复 ---------- */

  const load = useCallback(async () => {
    setLoadState('loading')
    try {
      const [record, mats, briefRecord, planRecord, draftMap] = await Promise.all([
        getCreation(creationId), getMaterials(creationId), getBrief(creationId), getPlan(creationId), listDrafts(creationId),
      ])
      if (!record) { setLoadState('missing'); return }
      try { localStorage.setItem(LS_KEYS.lastOpenedId, record.id) } catch { /* 忽略 */ }
      // 刷新恢复：遗留 running 任务 → interrupted（backend-design.md §4.1 local_jobs）
      const interrupted = await interruptRunningJobs()
      let nextError = null
      if (interrupted > 0) {
        const job = await getLatestJob(record.id)
        if (job && job.state === 'interrupted') {
          nextError = { kind: job.kind, platforms: job.platforms, message: '上次生成被中断，已保留输入与已有内容，请重试。' }
        }
      }
      const activePlatform = record.active_platform || 'xhs'
      setCreation(record)
      setMaterials(mats)
      setBrief(briefRecord)
      setPlan(planRecord)
      setPlanDraft(planRecord
        ? { title: planRecord.title, core_point: planRecord.core_point, outline_text: planRecord.outline_text }
        : { title: '', core_point: '', outline_text: '' })
      setDrafts(draftMap)
      setMessages(await listChatMessages(record.id, activePlatform))
      setChosen(record.selected_platforms || [])
      setLoadState('ready')
      setError(nextError)
      // 创作篮点击「生成选题与大纲」导航而来：自动开始生成
      if (record.stage === 'plan' && !planRecord && !nextError && !busyRef.current) {
        runPlanGeneration(record, briefRecord, mats)
      }
    } catch (err) {
      setLoadState('error')
      setError({ message: err.message || '本地创作数据读取失败' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creationId])

  useEffect(() => { load() }, [load])

  // pagehide 立即 flush（backend-design.md §5）
  useEffect(() => {
    const flushAll = () => { planSave.flush(); draftSave.flush() }
    window.addEventListener('pagehide', flushAll)
    return () => window.removeEventListener('pagehide', flushAll)
  }, [planSave, draftSave])

  // 草稿/大纲载入或切换平台后，按内容撑开自适应编辑框
  // （onInput autoSize 只覆盖后续输入；首次渲染长文必须在这里初始化高度，否则被固定高度裁切）
  // 注意：只依赖顶层 state，platform/stage 等渲染段变量在 effect 内部推导，避免 TDZ 崩溃
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      document.querySelectorAll('.cfw .title-field, .cfw .body-field, .cfw .extra-field').forEach((el) => {
        el.style.height = 'auto'
        el.style.height = `${el.scrollHeight + 4}px`
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [preview, loadState, creation, plan, drafts])

  // Escape 关闭确认弹窗
  useEffect(() => {
    const handler = (event) => { if (event.key === 'Escape') setConfirmState(null) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  /* ---------- 渲染 ---------- */

  if (loadState === 'loading') {
    return (
      <>
        <CosmosBackground variant="home" />
        <TopNav variant="home" />
        <main className="cfw-wrap cfw"><div className="panel loading"><div className="spinner" /><h2>正在读取本地创作…</h2></div></main>
      </>
    )
  }

  if (loadState === 'missing' || !creation) {
    return (
      <>
        <CosmosBackground variant="home" />
        <TopNav variant="home" />
        <main className="cfw-wrap cfw">
          <div className="panel loading">
            <h2>创作会话不存在</h2>
            <p className="muted">本地创作数据可能已被清理。</p>
            <button type="button" className="btn primary" onClick={() => navigate('/creation-basket')}>返回创作篮 →</button>
          </div>
        </main>
      </>
    )
  }

  const stage = creation.stage || 'brief'
  const platform = creation.active_platform || 'xhs'
  const draft = drafts[platform]
  const draftBusy = busy?.kind === 'draft'
  const working = draftBusy && busy.platforms?.includes(platform)
  const rewriteBusy = busy?.kind === 'rewrite' && busy.platform === platform
  const completed = !!draft?.completed_at

  const saveStatus = (
    <span className={`save-status${saveState === 'saving' ? ' saving' : ''}${saveState === 'failed' ? ' failed' : ''}`}>
      {saveState === 'saving' ? '保存中…' : saveState === 'failed' ? '尚未保存，请下载备份' : '已保存到此设备'}
    </span>
  )

  const banner = error && (
    <div className="notice" role="alert">
      {error.message}
      {((error.kind === 'draft' || error.kind === 'drafts') && stage === 'write') ? (
        <button type="button" className="btn small" style={{ marginLeft: 10 }} onClick={handleRetry}>
          {error.kind === 'drafts' ? '重试已选平台' : '重试当前平台'}
        </button>
      ) : null}
    </div>
  )

  const stepLabels = (
    <div className="step-labels">
      <span>创作篮</span><span>→</span>
      <span className={stage === 'plan' ? 'current' : ''}>选题与大纲</span><span>→</span>
      <span className={stage === 'platform' ? 'current' : ''}>选择平台</span><span>→</span>
      <span className={stage === 'write' ? 'current' : ''}>内容创作</span>
    </div>
  )

  const flowHead = (title, sub, buttons) => (
    <div className="flow-head">
      <div>
        <p className="eyebrow">NEBULA · CREATION</p>
        <h1>{title}</h1>
        <p>{sub}</p>
      </div>
      {buttons}
    </div>
  )

  /* ----- brief 阶段 ----- */
  if (stage === 'brief') {
    return (
      <>
        <CosmosBackground variant="home" />
        <TopNav variant="home" />
        <main className="cfw-wrap cfw">
          {flowHead('开始创作', '已建立本地创作会话，先补充本次创作的要求。', (
            <button type="button" className="btn ghost" onClick={() => navigate('/creation-basket')}>← 返回创作篮</button>
          ))}
          <div className="panel context-box">
            <h2>本次创作</h2>
            <h3>所选素材 · {materials.length} 项</h3>
            <ul>{materials.map((m) => <li key={m.item_id}>{m.title}</li>)}</ul>
            <p className="small muted" style={{ marginTop: 20 }}>填写完成后生成选题与大纲；平台在大纲确认后选择。</p>
          </div>
        </main>
        <CreationBriefModal
          open
          materialsCount={materials.length}
          brief={brief}
          onPersist={handleBriefPersist}
          onGenerate={handleBriefGenerate}
          onCancel={() => navigate('/creation-basket')}
          busy={busy?.kind === 'plan'}
        />
      </>
    )
  }

  /* ----- plan 阶段 ----- */
  if (stage === 'plan') {
    const planWorking = busy?.kind === 'plan'
    const validPlan = ['title', 'core_point', 'outline_text'].every((key) => planDraft[key].trim())
    return (
      <>
        <CosmosBackground variant="home" />
        <TopNav variant="home" />
        <main className="cfw-wrap cfw">
          {stepLabels}
          {flowHead('先确定这次想表达什么', '标题、核心观点和大纲都可以直接修改。确认满意后，再选择创作平台。', (
            <button type="button" className="btn ghost" onClick={() => navigate('/creation-basket')} disabled={planWorking}>← 返回创作篮</button>
          ))}
          {planWorking ? (
            <div className="panel loading" role="status">
              <div className="spinner" />
              <h2>正在整理选题与大纲…</h2>
              <p className="muted">根据已选素材和你的想法生成一个推荐方案</p>
            </div>
          ) : !plan ? (
            <>
              {banner}
              <div className="panel">
                <h2>选题与大纲尚未生成</h2>
                <p className="muted">根据已选素材和补充说明，生成一个推荐方案。</p>
                <button type="button" className="btn primary" onClick={() => runPlanGeneration()}>重新生成选题</button>
              </div>
            </>
          ) : (
            <>
              {banner}
              <div className="plan-layout">
                <section className="panel">
                  <div className="row between">
                    <h2>推荐方案</h2>
                    <button type="button" className="btn small ghost" onClick={handleRegeneratePlan} disabled={planWorking}>换个方向</button>
                  </div>
                  <label className="label" htmlFor="plan-title">标题</label>
                  <textarea id="plan-title" className="field title-field" rows="1" maxLength={120}
                    value={planDraft.title} aria-invalid={!planDraft.title.trim()}
                    onInput={autoSize} onChange={(e) => handlePlanField('title', e.target.value)} />
                  <label className="label" htmlFor="plan-point">核心观点</label>
                  <textarea id="plan-point" className="field point-field" maxLength={2000}
                    value={planDraft.core_point} aria-invalid={!planDraft.core_point.trim()}
                    onChange={(e) => handlePlanField('core_point', e.target.value)} />
                  <label className="label" htmlFor="plan-outline">简短大纲 <small>在一个文本框内自由编辑</small></label>
                  <textarea id="plan-outline" className="field outline-field" maxLength={12000}
                    value={planDraft.outline_text} aria-invalid={!planDraft.outline_text.trim()}
                    onChange={(e) => handlePlanField('outline_text', e.target.value)} />
                  <div className="actions">
                    {saveStatus}
                    {saveState === 'failed' && <button type="button" className="btn small ghost" onClick={handleBackup}>下载备份</button>}
                    <button type="button" className="btn primary" onClick={handleConfirmPlan} disabled={!validPlan}>确认大纲，选择平台 →</button>
                  </div>
                </section>
                <aside className="panel context-box">
                  <h2>本次创作</h2>
                  <h3>所选素材 · {materials.length} 项</h3>
                  <ul>{materials.map((m) => <li key={m.item_id}>{m.title}</li>)}</ul>
                  <h3>补充说明</h3>
                  <p className="muted">{brief?.supplement || '依据所选素材自然展开'}</p>
                  <h3>创作目的</h3>
                  <p className="muted">{brief?.purpose || '自然表达观点'}</p>
                  <h3>表达风格</h3>
                  <p className="muted">{brief?.style_snapshot || '自然清楚，避免空话'}</p>
                  <p className="small muted" style={{ marginTop: 25 }}>先把方向定下来，再选择小红书或微信公众号。</p>
                </aside>
              </div>
            </>
          )}
        </main>
        {confirmState && <ConfirmBox confirmState={confirmState} onClose={() => setConfirmState(null)} />}
      </>
    )
  }

  /* ----- platform 阶段 ----- */
  if (stage === 'platform') {
    const confirmed = plan?.confirmed_snapshot
    return (
      <>
        <CosmosBackground variant="home" />
        <TopNav variant="home" />
        <main className="cfw-wrap cfw">
          {stepLabels}
          {flowHead('选择要创作的平台', '方向已经确认。可以选择一个或两个平台，分别生成对应的完整内容。', (
            <button type="button" className="btn ghost" onClick={backToPlan}>← 修改选题与大纲</button>
          ))}
          <div className="panel">
            <div className="row between">
              <h2>{confirmed?.title || '已确认选题'}</h2>
              <span className="pill violet">选题与大纲已确认</span>
            </div>
            <p className="muted">{confirmed?.core_point || ''}</p>
            <p className="small muted" style={{ marginTop: 18 }}>可同时选择两个平台；每个平台会独立生成、保存和修改。</p>
            <div className="platform-grid">
              {['xhs', 'wechat'].map((p) => (
                <button key={p} type="button" className="platform-choice" aria-pressed={chosen.includes(p)} onClick={() => setChosen((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p])}>
                  <span className={`platform-icon${p === 'wechat' ? ' wx' : ''}`}>{p === 'xhs' ? '小红书' : '微信'}</span>
                  <strong>{PLATFORM_LABEL[p]}</strong>
                  <p>{p === 'xhs' ? '场景切入、短段落和具体建议，形成适合分享的图文笔记文案。' : '完整论述、分节展开和连贯表达，形成适合阅读的公众号文章。'}</p>
                  <span className="small" style={{ color: 'var(--nebula-violet)' }}>{chosen.includes(p) ? '✓ 已选择' : '选择这个平台'}</span>
                </button>
              ))}
            </div>
            <div className="actions">
              <span className="small muted">已选择 {chosen.length} 个平台</span>
              <button type="button" className="btn primary" disabled={!chosen.length} onClick={() => runDraftGeneration(chosen)}>
                开始{chosen.length === 2 ? '双平台' : chosen.length === 1 ? PLATFORM_LABEL[chosen[0]] : '平台'}创作 →
              </button>
            </div>
          </div>
        </main>
        {confirmState && <ConfirmBox confirmState={confirmState} onClose={() => setConfirmState(null)} />}
      </>
    )
  }

  /* ----- write 阶段 ----- */
  const extraKey = platform === 'xhs' ? 'tags' : 'summary'
  return (
    <>
      <CosmosBackground variant="home" />
      <TopNav variant="home" />
      <main className="cfw-wrap cfw">
        {stepLabels}
        {flowHead(completed ? '这篇作品已完成' : '让内容，更像你想说的话', '当前平台独立保存。你可以直接编辑，或让创作助手帮你修改。', (
          <div className="row">
            <button type="button" className="btn ghost" onClick={backToPlan} disabled={!!busy}>查看 / 修改大纲</button>
            <button type="button" className="btn primary" onClick={handleFinish} disabled={!draft || !!busy}>{completed ? '✓ 已完成' : '完成创作'}</button>
          </div>
        ))}
        <div className="tabs" role="tablist" aria-label="稿件平台">
          {['xhs', 'wechat'].map((k) => {
            const kWorking = draftBusy && busy.platforms?.includes(k)
            return (
              <button
                key={k}
                type="button"
                role="tab"
                id={`tab-${k}`}
                aria-controls="draft-content"
                aria-selected={platform === k}
                className="btn"
                disabled={!!busy}
                onClick={() => switchPlatform(k)}
              >
                {PLATFORM_LABEL[k]} <small>{drafts[k] ? '已生成' : kWorking ? '生成中' : '未生成'}</small>
              </button>
            )
          })}
        </div>
        {banner}
        {draft && plan && draft.source_plan_version !== plan.confirmed_version && (
          <div className="notice info">此稿基于上次确认的大纲；当前新大纲不会自动覆盖这篇内容。</div>
        )}
        {draftBusy && (
          <div className="notice info" role="status">
            正在创作{busy.platforms.map((p) => PLATFORM_LABEL[p]).join('、')}版本… 已有稿件会保留至新版本生成成功。
          </div>
        )}
        <div className="draft-layout">
          <section id="draft-content" role="tabpanel" aria-labelledby={`tab-${platform}`}>
            {!draft ? (
              <div className="panel loading">
                {working ? (
                  <>
                    <div className="spinner" />
                    <h2>正在创作{PLATFORM_LABEL[platform]}内容</h2>
                  </>
                ) : (
                  <>
                    <h2>{PLATFORM_LABEL[platform]}版本尚未生成</h2>
                    <p className="muted">使用已确认的大纲，为这个平台单独创作一篇内容。</p>
                    <button type="button" className="btn primary" onClick={() => runDraftGeneration([platform])}>开始{PLATFORM_LABEL[platform]}创作 →</button>
                  </>
                )}
              </div>
            ) : (
              <>
                <div className="paper-shell">
                  <div className="paper-tools">
                    <span>{PLATFORM_LABEL[platform]} · {preview ? '预览' : '直接编辑'}</span>
                    <div className="row">
                      <button type="button" className="btn small" onClick={() => setPreview((v) => !v)} disabled={working}>{preview ? '返回编辑' : '预览'}</button>
                      <button type="button" className="btn small" onClick={handleCopy}>复制</button>
                      <button type="button" className="btn small" onClick={handleDownload}>下载</button>
                    </div>
                  </div>
                  <div className="paper">
                    {preview ? (
                      <>
                        <h2 className="preview-title">{draft.content.title}</h2>
                        {/* Markdown 渲染：GFM 表格/任务列表 + 代码高亮 + KaTeX 公式；默认不渲染原始 HTML（安全白名单策略 §9） */}
                        <div className="preview-md">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm, remarkMath]}
                            rehypePlugins={[rehypeKatex, [rehypeHighlight, { detect: true, ignoreMissing: true }]]
                            }
                          >
                            {draft.content.body}
                          </ReactMarkdown>
                        </div>
                        {draft.content[extraKey] && <p className="cfw-preview-extra">{draft.content[extraKey]}</p>}
                      </>
                    ) : (
                      <>
                        <label className="label" htmlFor="draft-title">{platform === 'xhs' ? '笔记标题' : '文章标题'}</label>
                        <textarea id="draft-title" className="field title-field" rows="1" maxLength={160} disabled={working}
                          value={draft.content.title} onInput={autoSize} onChange={(e) => handleDraftField('title', e.target.value)} />
                        <label className="label" htmlFor="draft-body">正文</label>
                        <textarea id="draft-body" className="field body-field" maxLength={50000} disabled={working}
                          value={draft.content.body} onInput={autoSize} onChange={(e) => handleDraftField('body', e.target.value)} />
                        <label className="label" htmlFor="draft-extra">{platform === 'xhs' ? '话题标签' : '摘要'}</label>
                        <textarea id="draft-extra" className="field extra-field" maxLength={1000} disabled={working}
                          value={draft.content[extraKey] || ''} onInput={autoSize} onChange={(e) => handleDraftField(extraKey, e.target.value)} />
                      </>
                    )}
                  </div>
                </div>
                <div className="actions">
                  {saveStatus}
                  {saveState === 'failed' && <button type="button" className="btn small ghost" onClick={handleBackup}>下载备份</button>}
                  <button type="button" className="btn small ghost" onClick={handleUndo} disabled={!(draft.version > 1) || working}>↶ 撤销上次修改</button>
                </div>
              </>
            )}
          </section>
          <aside className="panel chat">
            <div className="row between">
              <h2>✦ 创作助手</h2>
              <span className="pill violet">{PLATFORM_LABEL[platform]}</span>
            </div>
            <p className="small muted">只修改当前平台的成稿，不会自动改动另一篇。</p>
            <div className="chat-history" aria-live="polite">
              <div className="message">
                <small>NEBULA</small>
                可以让我调整语气、开头或篇幅，也可以直接编辑正文。
              </div>
              {messages.map((message) => (
                <div key={message.id} className={`message${message.role === 'user' ? ' user' : ''}`}>
                  <small>{message.role === 'user' ? '你' : 'NEBULA'}</small>
                  {message.text}
                </div>
              ))}
              {rewriteBusy && <div className="message" role="status">正在调整当前稿件…</div>}
            </div>
            <div className="chat-compose">
              <div className="chips">
                {CHAT_CHIPS.map((chip) => (
                  <button key={chip.label} type="button" className="btn small ghost" onClick={() => setChatInput(chip.prompt)}>{chip.label}</button>
                ))}
              </div>
              <label className="label" htmlFor="chat-prompt">修改要求</label>
              <textarea
                id="chat-prompt"
                className="field"
                rows="3"
                maxLength={2000}
                placeholder="例如：少一点说教，开头更直接。"
                disabled={!draft || working}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') runRewrite(chatInput) }}
              />
              <button type="button" className="btn primary" disabled={!draft || !!busy} onClick={() => runRewrite(chatInput)}>修改当前稿件 ↑</button>
              <p className="small muted">Ctrl / ⌘ + Enter 发送 · 修改后可撤销</p>
            </div>
          </aside>
        </div>
      </main>
      {confirmState && <ConfirmBox confirmState={confirmState} onClose={() => setConfirmState(null)} />}
    </>
  )
}

function ConfirmBox({ confirmState, onClose }) {
  return (
    <div className="cfw-modal-mask" role="dialog" aria-modal="true" aria-label={confirmState.title} onClick={onClose}>
      <div className="cfw-modal-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="cfw-modal-close" aria-label="关闭弹窗" onClick={onClose}>×</button>
        <h2>{confirmState.title}</h2>
        <p className="cfw-modal-text">{confirmState.body}</p>
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose}>取消</button>
          <button type="button" className="btn primary" onClick={() => { const fn = confirmState.onConfirm; onClose(); fn() }}>
            {confirmState.label || '继续'}
          </button>
        </div>
      </div>
    </div>
  )
}
