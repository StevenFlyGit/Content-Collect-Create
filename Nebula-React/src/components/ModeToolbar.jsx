import Icon from './Icon.jsx'
import './ModeToolbar.css'

const MODES = [
  { key: 'image',  label: '图片', icon: 'capture/image',  disabled: false },
  { key: 'audio',  label: '音频', icon: 'capture/audio',  disabled: false },
  { key: 'camera', label: '拍照', icon: 'capture/camera', disabled: true, title: '拍照（移动端 PWA 支持）' },
  { key: 'record', label: '录音', icon: 'capture/record', disabled: true, title: '录音（移动端 PWA 支持）' },
]

/**
 * ModeToolbar —— 记录页底部 4 模式卡片（图片 / 音频 / 拍照 / 录音）
 * 图标统一用 <img src="/assets/svg/...svg"> 引用；拍照/录音为移动端预留（disabled）。
 */
export default function ModeToolbar({ mode, onModeChange }) {
  return (
    <div className="mode-grid" role="radiogroup" aria-label="输入模式">
      {MODES.map((m) => (
        <button
          key={m.key}
          type="button"
          className={`mode-card${m.disabled ? ' disabled' : ''}${mode === m.key ? ' active' : ''}`}
          role="radio"
          aria-checked={mode === m.key}
          aria-disabled={m.disabled}
          title={m.title}
          disabled={m.disabled}
          onClick={() => !m.disabled && onModeChange(m.key)}
        >
          <span className="mode-ico" aria-hidden="true">
            <Icon name={m.icon} alt={m.label} />
          </span>
          <span className="mode-label">{m.label}</span>
        </button>
      ))}
    </div>
  )
}
