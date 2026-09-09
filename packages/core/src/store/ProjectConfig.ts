import type { PMSettings, Project, ResolvedProjectConfig, Task } from '../types'
import { flattenTasks } from './TaskTreeOps'

const FALLBACK_COLOR = '#8a94a0'

/**
 * The settings as the project sees them. Statuses and priorities its tasks still use but
 * the settings no longer define are appended, so nothing vanishes from a board or picker.
 * Read every palette through this, terminal-status checks included.
 */
export function resolveProjectConfig(project: Project, settings: PMSettings): ResolvedProjectConfig {
  return {
    customFields: settings.customFields,
    statuses: withInUseExtras(
      settings.statuses,
      project,
      (task) => task.status,
      (id) => ({ id, label: id, color: FALLBACK_COLOR, icon: '', complete: false })
    ),
    priorities: withInUseExtras(
      settings.priorities,
      project,
      (task) => task.priority,
      (id) => ({ id, label: id, color: FALLBACK_COLOR, icon: '' })
    ),
    priorityIcons: settings.priorityIcons,
    defaultView: settings.defaultView,
    autoSchedule: settings.autoSchedule,
    pullForwardOnEarlyFinish: settings.pullForwardOnEarlyFinish,
    autoArchiveDays: settings.autoArchiveDays,
    showSubtreeConnections: settings.showSubtreeConnections,
    lineBorders: settings.lineBorders,
    kanbanShowSubtasks: settings.kanbanShowSubtasks,
    kanbanShowDescriptionPreview: settings.kanbanShowDescriptionPreview
  }
}

/** Later lists win on a repeated id, keeping the position the first one gave it. */
export function mergeById<T extends { id: string }>(lists: T[][]): T[] {
  const merged: T[] = []
  const positions = new Map<string, number>()
  for (const list of lists) {
    for (const entry of list) {
      const at = positions.get(entry.id)
      if (at === undefined) {
        positions.set(entry.id, merged.length)
        merged.push(entry)
      } else {
        merged[at] = entry
      }
    }
  }
  return merged
}

function withInUseExtras<T extends { id: string }>(
  known: T[],
  project: Project,
  valueOf: (task: Task) => string,
  makeFallback: (id: string) => T
): T[] {
  const seen = new Set(known.map((entry) => entry.id))
  let extras: T[] | null = null
  for (const { task } of flattenTasks(project.tasks)) {
    const id = valueOf(task)
    if (seen.has(id)) continue
    seen.add(id)
    extras ??= []
    extras.push(makeFallback(id))
  }
  return extras ? [...known, ...extras] : known
}
