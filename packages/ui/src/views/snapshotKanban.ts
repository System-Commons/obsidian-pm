import {
  type Task,
  displayName,
  dueUrgency,
  flattenTasks,
  getPriorityConfig,
  matchesFilter,
  totalLoggedHours
} from '@system-commons/core'
import { KanbanColumn, type KanbanCardData } from '../composites/KanbanColumn'
import type { ViewModel } from './model'

const noop = (): void => {}
const noDrop = async (): Promise<void> => {}

function parentTitle(model: ViewModel, taskId: string): string | undefined {
  for (const { task } of flattenTasks(model.project.tasks)) {
    if (task.subtasks.some((sub) => sub.id === taskId)) return task.title
  }
  return undefined
}

function cardData(model: ViewModel, task: Task): KanbanCardData {
  const config = model.project.config
  const priorityConfig = getPriorityConfig(config.priorities, task.priority)
  return {
    task,
    people: task.assignees.map((raw) => ({ name: displayName(raw) })),
    priorityColor:
      priorityConfig && task.priority !== 'medium' && task.priority !== 'low' ? priorityConfig.color : undefined,
    parentTitle: model.settings.kanbanShowSubtasks && task.type === 'subtask' ? parentTitle(model, task.id) : undefined,
    loggedHours: totalLoggedHours(task),
    overdue: dueUrgency(task, config.statuses) === 'overdue',
    showTagColors: model.settings.showTagColors
  }
}

/** The board without drag, menus or editing: one column per status, cards in tree order. */
export function renderSnapshotKanban(container: HTMLElement, model: ViewModel): HTMLElement {
  const config = model.project.config
  container.addClass('pm-kanban-view')
  const board = container.createDiv('pm-kanban-board')
  const candidates = model.settings.kanbanShowSubtasks
    ? flattenTasks(model.project.tasks).map((f) => f.task)
    : model.project.tasks
  for (const status of config.statuses) {
    const cards = candidates
      .filter((task) => task.status === status.id && matchesFilter(task, model.filter, config.statuses))
      .map((task) => cardData(model, task))
    new KanbanColumn(board, {
      status,
      cards,
      onCardClick: noop,
      onCardContextMenu: noop,
      onCardDragStart: noop,
      onCardDragEnd: noop,
      onDrop: noDrop
    })
  }
  return board
}
