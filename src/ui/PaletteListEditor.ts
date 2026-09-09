import type { StatusConfig } from '@system-commons/core'
import { renderIconControl } from '@system-commons/ui'

export interface PaletteEntry {
  id: string
  label: string
  color: string
  icon: string
}

/** Appends the icon, label, and color inputs to `parent`, in that order. */
export function renderPaletteFields(parent: HTMLElement, item: PaletteEntry, onChanged: () => void): void {
  const iconCell = parent.createDiv('pm-settings-status-icon')
  renderIconControl({
    container: iconCell,
    value: item.icon,
    color: item.color,
    onChange: (icon) => {
      item.icon = icon
      onChanged()
    }
  })

  const label = parent.createEl('input', { type: 'text', value: item.label })
  label.addClass('pm-settings-status-label')
  label.addEventListener('change', () => {
    item.label = label.value
    onChanged()
  })

  const color = parent.createEl('input', { type: 'color', value: item.color })
  color.addEventListener('change', () => {
    item.color = color.value
    onChanged()
  })
}

/** Marks which statuses count as complete. */
export function renderStatusDoneToggle(parent: HTMLElement, status: StatusConfig, onChanged: () => void): void {
  const wrapper = parent.createEl('label', { cls: 'pm-settings-complete-toggle' })
  const checkbox = wrapper.createEl('input', { type: 'checkbox' })
  checkbox.checked = status.complete
  wrapper.createSpan({ text: 'Done', cls: 'pm-settings-complete-text' })
  checkbox.addEventListener('change', () => {
    status.complete = checkbox.checked
    onChanged()
  })
}
