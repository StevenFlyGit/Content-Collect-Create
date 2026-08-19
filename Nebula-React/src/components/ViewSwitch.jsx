/**
 * ViewSwitch —— 白板 / 星云视图切换
 */
export default function ViewSwitch({ view, onChange }) {
  return (
    <div className="view-switch" role="tablist" aria-label="视图切换">
      <button
        type="button"
        className={view === 'board' ? 'active' : ''}
        data-view="board"
        role="tab"
        aria-selected={view === 'board'}
        onClick={() => onChange('board')}
      >
        ▦ 白板
      </button>
      <button
        type="button"
        className={view === 'nebula' ? 'active' : ''}
        data-view="nebula"
        role="tab"
        aria-selected={view === 'nebula'}
        onClick={() => onChange('nebula')}
      >
        ✦ 星云
      </button>
    </div>
  )
}