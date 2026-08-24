import { useEffect, useRef } from 'react'
import './DateWheel.css'

const ITEM_H = 36
const COMPACT_H = 28

/** 日期滚轮：点击、滚轮、键盘和拖动均落到同一个受控索引。compact 用于弹框内紧凑排版。 */
export default function DateWheel({ values, index, onIndexChange, col, ariaLabel, compact }) {
  const containerRef = useRef(null)
  const trackRef = useRef(null)
  const draggingRef = useRef(false)
  const movedRef = useRef(false)
  const startYRef = useRef(0)
  const suppressClickUntilRef = useRef(0)
  const itemH = compact ? COMPACT_H : ITEM_H

  const setTransform = (extra = 0) => {
    if (!trackRef.current) return
    const pixelOffset = -(itemH / 2) - index * itemH + extra
    const sign = pixelOffset < 0 ? '-' : '+'
    trackRef.current.style.transform = `translateY(calc(0px - var(--pad) ${sign} ${Math.abs(pixelOffset)}px))`
  }

  useEffect(() => {
    if (!trackRef.current) return
    trackRef.current.style.transition = ''
    setTransform(0)
    const c = containerRef.current
    if (c) {
      // 循环滚轮：语义上无绝对最小/最大，value 由父级据 index 反算
      c.setAttribute('aria-valuenow', String(values[index] ?? ''))
      c.setAttribute('aria-valuetext', String(values[index] ?? ''))
    }
  }, [index, values, itemH])

  // 循环（无限）滚轮：index 在 [0, len) 内取模环绕，到两端仍可继续滚
  const wrap = (value) => {
    const len = values.length
    if (len <= 0) return 0
    return ((value % len) + len) % len
  }
  const emit = (value) => {
    const next = wrap(value)
    if (next !== index) onIndexChange(next)
  }

  useEffect(() => {
    const el = containerRef.current
    if (!el) return undefined
    let wheelLock = false
    const onWheel = (e) => {
      e.preventDefault()
      if (wheelLock) return
      wheelLock = true
      emit(index + (e.deltaY > 0 ? 1 : -1))
      window.setTimeout(() => { wheelLock = false }, 180)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [index, values])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return undefined
    const onKey = (e) => {
      const len = values.length
      const map = {
        ArrowUp: index - 1,
        ArrowDown: index + 1,
        PageUp: index - 3,
        PageDown: index + 3,
        // 循环模式下 Home/End 不再跳到绝对首尾，而是大步前进/后退一圈
        Home: index - len,
        End: index + len,
      }
      if (!(e.key in map)) return
      e.preventDefault()
      emit(map[e.key])
    }
    el.addEventListener('keydown', onKey)
    return () => el.removeEventListener('keydown', onKey)
  }, [index, values])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return undefined

    const onDown = (e) => {
      draggingRef.current = true
      movedRef.current = false
      startYRef.current = e.clientY
      trackRef.current?.style.setProperty('transition', 'none')
      el.setPointerCapture?.(e.pointerId)
    }
    const onMove = (e) => {
      if (!draggingRef.current) return
      const dy = e.clientY - startYRef.current
      if (Math.abs(dy) > 3) movedRef.current = true
      setTransform(dy)
    }
    const onUp = (e) => {
      if (!draggingRef.current) return
      draggingRef.current = false
      const dy = e.clientY - startYRef.current
      const wasMoved = movedRef.current
      const stepDelta = Math.round(-dy / itemH)
      trackRef.current?.style.setProperty('transition', '')
      emit(index + stepDelta)
      if (wasMoved) suppressClickUntilRef.current = performance.now() + 300
      movedRef.current = false
    }

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
    }
  }, [index, values, itemH])

  return (
    <div
      className={`wheel${compact ? ' compact' : ''}`}
      data-col={col}
      tabIndex={0}
      role="spinbutton"
      aria-label={ariaLabel}
      ref={containerRef}
    >
      <div className="wheel-track" ref={trackRef}>
        <div className="wheel-pad" aria-hidden="true" />
        {values.map((value, i) => {
          const className = [
            'wheel-item',
            i === index ? 'active' : '',
          ].filter(Boolean).join(' ')
          return (
            <div
              className={className}
              key={`${value}-${i}`}
              role="option"
              aria-selected={i === index}
              onClick={() => {
                if (performance.now() < suppressClickUntilRef.current) return
                emit(i)
              }}
            >
              {value}
            </div>
          )
        })}
        <div className="wheel-pad" aria-hidden="true" />
      </div>
    </div>
  )
}
