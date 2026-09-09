import { getIcon } from 'obsidian'
import { type FilterState, type Project, type ViewMode, flattenTasks, PRIORITY_ICON_SETS } from '@system-commons/core'
import {
  SNAPSHOT_FORMAT,
  SNAPSHOT_VERSION,
  projectCounts,
  taskResources,
  toProjectResource,
  type Snapshot
} from '@system-commons/api'
import type { SortDir, SortKey } from '@system-commons/ui'
import type PMPlugin from '../main'

export interface ExportViewState {
  mode: ViewMode
  filter: FilterState
  sortKey: SortKey
  sortDir: SortDir
}

/** Icons the page chrome and the composites ask for by name, whatever the data holds. */
const CHROME_ICONS = [
  'plus',
  'x',
  'check',
  'chevron-down',
  'chevron-right',
  'right-triangle',
  'more-horizontal',
  'calendar',
  'link-2',
  'clock',
  'repeat',
  'table',
  'git-fork',
  'layout-dashboard'
]

function iconMarkup(names: Iterable<string>): Record<string, string> {
  const icons: Record<string, string> = {}
  for (const name of names) {
    if (!name || icons[name] !== undefined) continue
    const svg = getIcon(name)
    if (svg) icons[name] = svg.outerHTML
  }
  return icons
}

export async function buildSnapshot(plugin: PMPlugin, project: Project, view: ExportViewState): Promise<Snapshot> {
  const iconNames = new Set<string>(CHROME_ICONS)
  for (const set of Object.values(PRIORITY_ICON_SETS)) for (const name of set) iconNames.add(name)

  await Promise.all(flattenTasks(project.tasks).map(({ task }) => plugin.store.loadTaskBody(task)))
  const config = plugin.store.configFor(project)
  for (const status of config.statuses) iconNames.add(status.icon)
  for (const priority of config.priorities) iconNames.add(priority.icon)
  for (const field of config.customFields) if (field.icon) iconNames.add(field.icon)
  iconNames.add(project.icon)
  return {
    format: SNAPSHOT_FORMAT,
    version: SNAPSHOT_VERSION,
    generator: { name: 'project-manager', version: plugin.manifest.version },
    exportedAt: new Date().toISOString(),
    title: project.title,
    view: {
      mode: view.mode,
      filter: { ...view.filter },
      sortKey: view.sortKey,
      sortDir: view.sortDir,
      ganttGranularity: plugin.settings.ganttGranularity
    },
    settings: {
      priorityIcons: config.priorityIcons,
      showTagColors: plugin.settings.showTagColors,
      showSubtreeConnections: config.showSubtreeConnections,
      lineBorders: config.lineBorders,
      kanbanShowSubtasks: config.kanbanShowSubtasks,
      ganttWeekLabel: plugin.settings.ganttWeekLabel
    },
    project: {
      ...toProjectResource(project, config, projectCounts(project, config)),
      tasks: taskResources(project, true)
    },
    icons: iconMarkup(iconNames)
  }
}
