/** 设置页的小控件：滑杆、开关、色板。全部走宿主的颜色 token。 */
import { useEffect, useState, type ChangeEvent } from 'react'

/** 滑杆 + 数字框。 */
export function Slider(props: {
  title: string
  desc?: string
  value: number
  min: number
  max: number
  unit: string
  onChange: (value: number) => void
  valueAria?: string
  increaseAria?: string
  decreaseAria?: string
}) {
  const { title, desc, value, min, max, unit, onChange, valueAria, increaseAria, decreaseAria } = props
  const [draft, setDraft] = useState(String(value))
  useEffect(() => {
    setDraft(String(value))
  }, [value])

  const percent = max === min ? 0 : ((value - min) / (max - min)) * 100
  const commit = (raw: string): void => {
    const next = Number(raw)
    if (!Number.isFinite(next)) return
    onChange(Math.min(max, Math.max(min, Math.round(next))))
  }
  const step = (delta: number): void => {
    const next = Math.min(max, Math.max(min, value + delta))
    setDraft(String(next))
    onChange(next)
  }

  return (
    <div className="gx-row">
      <div className="gx-row-text">
        <div className="gx-row-title">{title}</div>
        {desc !== undefined && <div className="gx-row-desc">{desc}</div>}
      </div>
      <div className="gx-control">
        <input
          className="gx-range"
          type="range"
          min={min}
          max={max}
          value={value}
          style={{ ['--gx-fill' as string]: `${percent}%` }}
          aria-label={title}
          onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(Number(event.target.value))}
        />
        <div className="gx-num">
          <div className="gx-stepper">
            <input
              type="number"
              min={min}
              max={max}
              value={draft}
              aria-label={`${title}${valueAria ?? ''}`}
              onChange={(event) => {
                setDraft(event.target.value)
                commit(event.target.value)
              }}
              onBlur={() => {
                if (!Number.isFinite(Number(draft))) setDraft(String(value))
              }}
            />
            <span className="gx-stepper-arrows">
              <button type="button" aria-label={`${increaseAria ?? 'Increase'} ${title}`} disabled={value >= max} onClick={() => step(1)}>
                <svg aria-hidden="true" viewBox="0 0 16 16" width="6" height="6"><path d="M12 10L8.70711 6.70711C8.31658 6.31658 7.68342 6.31658 7.29289 6.70711L4 10" fill="none" stroke="currentColor" strokeWidth="1" /></svg>
              </button>
              <button type="button" aria-label={`${decreaseAria ?? 'Decrease'} ${title}`} disabled={value <= min} onClick={() => step(-1)}>
                <svg aria-hidden="true" viewBox="0 0 16 16" width="6" height="6"><path d="M4 6L7.29289 9.29289C7.68342 9.68342 8.31658 9.68342 8.70711 9.29289L12 6" fill="none" stroke="currentColor" strokeWidth="1" /></svg>
              </button>
            </span>
          </div>
          <span className="gx-unit">{unit}</span>
        </div>
      </div>
    </div>
  )
}

/** 开关。 */
export function Switch(props: { title: string; desc?: string; checked: boolean; onChange: (checked: boolean) => void }) {
  const { title, desc, checked, onChange } = props
  return (
    <div className="gx-row">
      <div className="gx-row-text">
        <div className="gx-row-title">{title}</div>
        {desc !== undefined && <div className="gx-row-desc">{desc}</div>}
      </div>
      <div className="gx-control">
        <button
          type="button"
          className="gx-switch"
          role="switch"
          aria-checked={checked}
          aria-label={title}
          onClick={() => onChange(!checked)}
        />
      </div>
    </div>
  )
}

/** 重点色色板 + 取色器 + 色值。 */
export function AccentPicker(props: {
  value: string
  onChange: (value: string) => void
  title: string
  desc: string
  customTitle: string
}) {
  const { value, onChange, title, desc, customTitle } = props
  const colors = ['#F077AF', '#E5484D', '#F08A3C', '#1FA6B8', '#4D7CFE', '#8B6CF0', '#1F2329', '#FFFFFF']
  return (
    <div className="gx-row">
      <div className="gx-row-text">
        <div className="gx-row-title">{title}</div>
        <div className="gx-row-desc">{desc}</div>
      </div>
      <div className="gx-control">
        <div className="gx-swatches">
          {colors.map((color) => (
            <button
              key={color}
              type="button"
              className={`gx-sw${color === '#FFFFFF' ? ' white' : ''}${value.toUpperCase() === color ? ' on' : ''}`}
              style={{ ['--gx-c' as string]: color }}
              aria-label={color}
              onClick={() => onChange(color)}
            />
          ))}
        </div>
        <label className="gx-custom" title={customTitle}>
          <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#F077AF'} onChange={(event) => onChange(event.target.value.toUpperCase())} />
        </label>
        <span className="gx-hex">{value.toUpperCase()}</span>
      </div>
    </div>
  )
}
