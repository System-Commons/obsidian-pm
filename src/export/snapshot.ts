import { getIcon } from 'obsidian'
import { type FilterState, type Project, type ViewMode, flattenTasks, PRIORITY_ICON_SETS } from '@system-commons/core'
import {
  SNAPSHOT_FORMAT,
  SNAPSHOT_VERSION,
  taskResources,
  toProjectResource,
  type ProjectSummary,
  type Snapshot,
  type SnapshotProject
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

function summarize(plugin: PMPlugin, project: Project): ProjectSummary {
  const complete = new Set(
    plugin.store
      .configFor(project)
      .statuses.filter((status) => status.complete)
      .map((status) => status.id)
  )
  const live = flattenTasks(project.tasks).filter((f) => !f.task.archived)
  return {
    id: project.id,
    path: project.filePath,
    title: project.title,
    icon: project.icon,
    color: project.color,
    parentId: plugin.index.parentOf(project.filePath)?.id ?? null,
    taskCount: live.length,
    doneCount: live.filter((f) => complete.has(f.task.status)).length
  }
}

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
  const projects: SnapshotProject[] = [
    {
      ...toProjectResource(project, config, summarize(plugin, project)),
      tasks: taskResources(project, project.id, true)
    }
  ]

  return {
    format: SNAPSHOT_FORMAT,
    version: SNAPSHOT_VERSION,
    generator: { name: 'project-manager', version: plugin.manifest.version },
    exportedAt: new Date().toISOString(),
    title: project.title,
    primaryProjectId: project.id,
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
    projects,
    icons: iconMarkup(iconNames)
  }
}
