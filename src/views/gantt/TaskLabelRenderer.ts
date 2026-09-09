import { CollapseToggle, IconButton, renderStatusDot, safeAsync, ROW_HEIGHT } from '@system-commons/ui'
import type PMPlugin from '../../main'
import type { StatusConfig, Task } from '@system-commons/core'
import type { ProjectContext } from '../../store'
import { openTaskModal } from '../../ui/ModalFactory'

export interface LabelContext {
  plugin: PMPlugin
  scope: ProjectContext
  statuses: StatusConfig[]
  onRefresh: () => Promise<void>
}

export function renderTaskLabel(
  container: HTMLElement,
  task: Task,
  depth: number,
  _row: number,
  ctx: LabelContext
): void {
  const project = ctx.scope.project
  const el = container.createDiv('pm-gantt-label-row')
  el.style.height = `${ROW_HEIGHT}px`
  el.style.paddingLeft = `${depth * 18 + 8}px`
  el.dataset.taskId = task.id

  el.draggable = true
  el.addEventListener('dragstart', (e: DragEvent) => {
    e.dataTransfer?.setData('text/plain', task.id)
    el.addClass('pm-gantt-label-row--dragging')
  })
  el.addEventListener('dragend', () => {
    el.removeClass('pm-gantt-label-row--dragging')
  })
  let dropPosition: 'before' | 'after' = 'before'
  el.addEventListener('dragover', (e: DragEvent) => {
    e.preventDefault()
    const rect = el.getBoundingClientRect()
    const midY = rect.top + rect.height / 2
    dropPosition = e.clientY < midY ? 'before' : 'after'
    el.removeClass('pm-gantt-label-row--drop-before', 'pm-gantt-label-row--drop-after')
    el.addClass(dropPosition === 'before' ? 'pm-gantt-label-row--drop-before' : 'pm-gantt-label-row--drop-after')
  })
  el.addEventListener('dragleave', () => {
    el.removeClass('pm-gantt-label-row--drop-before', 'pm-gantt-label-row--drop-after')
  })
  el.addEventListener(
    'drop',
    safeAsync(async (e: DragEvent) => {
      e.preventDefault()
      el.removeClass('pm-gantt-label-row--drop-before', 'pm-gantt-label-row--drop-after')
      const draggedId = e.dataTransfer?.getData('text/plain')
      if (!draggedId || draggedId === task.id) return
      await ctx.plugin.store.reorderTask(project, draggedId, task.id, dropPosition)
      await ctx.onRefresh()
    })
  )

  if (task.subtasks.length > 0) {
    new CollapseToggle(el, {
      collapsed: task.collapsed,
      onToggle: safeAsync(async () => {
        await ctx.plugin.toggleTaskCollapsed(project, task.id)
        await ctx.onRefresh()
      })
    })
  } else {
    el.createSpan({ cls: 'pm-gantt-label-spacer' })
  }

  renderStatusDot(el, task.status, ctx.statuses, 'pm-gantt-label-dot')

  const titleEl = el.createSpan({ text: task.title, cls: 'pm-gantt-label-title' })
  titleEl.addEventListener('click', () => {
    openTaskModal(ctx.plugin, project, { task, onSave: () => ctx.onRefresh() })
  })

  if (task.progress > 0) {
    el.createSpan({ text: `${task.progress}%`, cls: 'pm-gantt-label-progress' })
  }

  new IconButton(el)
    .setIcon('plus')
    .setTooltip('Add subtask')
    .setRevealOnHover(true)
    .onClick((e) => {
      e.stopPropagation()
      openTaskModal(ctx.plugin, project, { parentId: task.id, onSave: () => ctx.onRefresh() })
    })
}
