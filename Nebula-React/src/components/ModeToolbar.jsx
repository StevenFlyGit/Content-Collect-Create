import { useMemo, useRef } from 'react'
import Icon from './Icon.jsx'
import { isSecureContextSupported } from '../lib/secure.js'
import './ModeToolbar.css'

const ACCEPT = {
  image: 'image/*',
  audio: 'audio/*',
}

/**
 * ModeToolbar —— 记录页底部 4 模式卡片（图片 / 音频 / 拍照 / 录音）
 * 图标统一用 <img src="/assets/svg/...svg"> 引用。
 * - 图片 / 音频：点击触发本机文件选择器（<input type=file>），选中文件经 onFileSelected 上抛
 * - 拍照 / 录音：纯客户端 PWA 能力，仅在安全上下文（HTTPS / localhost）可用，否则禁用并提示
 */
export default function ModeToolbar({ mode, onModeChange, onFileSelected, disabled = false }) {
  const secure = useMemo(() => isSecureContextSupported(), [])
  const fileRefs = useRef({})

  const MODES = [
    { key: 'image', label: '图片', icon: 'capture/image', capture: false },
    { key: 'audio', label: '音频', icon: 'capture/audio', capture: false },
    {
      key: 'camera',
      label: '拍照',
      icon: 'capture/camera',
      capture: true,
      disabled: !secure,
      title: secure ? '拍照' : '拍照需 HTTPS 或 localhost 安全环境',
    },
    {
      key: 'record',
      label: '录音',
      icon: 'capture/record',
      capture: true,
      disabled: !secure,
      title: secure ? '录音' : '录音需 HTTPS 或 localhost 安全环境',
    },
  ]

  const openPicker = (key) => {
    const input = fileRefs.current[key]
    if (!input) return
    input.value = '' // 允许重复选择同一文件
    input.click()
  }

  const handleFileChange = (key, e) => {
    const file = e.target.files && e.target.files[0]
    if (file && onFileSelected) onFileSelected({ kind: key, file })
  }

  return (
    <div className="mode-grid" role="radiogroup" aria-label="输入模式">
      {MODES.map((m) => (
        <button
          key={m.key}
          type="button"
          className={`mode-card${m.disabled || disabled ? ' disabled' : ''}${mode === m.key ? ' active' : ''}`}
          role="radio"
          aria-checked={mode === m.key}
          aria-disabled={m.disabled || disabled}
          title={m.title}
          disabled={m.disabled || disabled}
          onClick={() => {
            if (m.disabled || disabled) return
            if (m.capture) onModeChange(m.key)
            else openPicker(m.key)
          }}
        >
          <span className="mode-ico" aria-hidden="true">
            <Icon name={m.icon} alt={m.label} />
          </span>
          <span className="mode-label">{m.label}</span>
        </button>
      ))}

      {/* 本地文件选择器：图片 / 音频（隐藏，由对应按钮触发） */}
      <input
        ref={(el) => { fileRefs.current.image = el }}
        type="file"
        accept={ACCEPT.image}
        hidden
        disabled={disabled}
        onChange={(e) => handleFileChange('image', e)}
      />
      <input
        ref={(el) => { fileRefs.current.audio = el }}
        type="file"
        accept={ACCEPT.audio}
        hidden
        disabled={disabled}
        onChange={(e) => handleFileChange('audio', e)}
      />
    </div>
  )
}
