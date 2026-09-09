import type {
  FilterState,
  GanttGranularity,
  GanttWeekLabel,
  LineBorders,
  PriorityIconSet,
  ResolvedProjectConfig,
  Task
} from '@system-commons/core'
import type { SortDir, SortKey } from './tableSort'

export interface ViewProject {
  id: string
  title: string
  color: string
  icon: string
  tasks: Task[]
  config: ResolvedProjectConfig
}

export interface ViewSettings {
  priorityIcons: PriorityIconSet
  showTagColors: boolean
  showSubtreeConnections: boolean
  lineBorders: LineBorders
  kanbanShowSubtasks: boolean
  ganttWeekLabel: GanttWeekLabel
  ganttGranularity: GanttGranularity
}

/**
 * Everything the read-only views need, resolved by whoever holds the data: the plugin
 * from its project, a page from a snapshot.
 */
export interface ViewModel {
  project: ViewProject
  settings: ViewSettings
  filter: FilterState
  sortKey: SortKey
  sortDir: SortDir
}
