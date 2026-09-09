import type PMPlugin from '../../main'
import type { StatusConfig, FlatTask } from '@system-commons/core'
import type { ProjectContext } from '../../store'
import type { GanttCanvas } from '@system-commons/ui'
import type { DragState } from './GanttDragHandler'
import type { LinkState } from './GanttLinkHandler'

export { renderGridLines, renderTodayLine, renderTimelineHeader } from '@system-commons/ui'
export { renderTaskBar, renderMilestoneLabels, renderDependencyArrows } from './GanttTaskBarRenderer'

/** The drawing surfaces plus everything the interactive layer needs to edit through them. */
export interface RendererContext extends GanttCanvas {
  plugin: PMPlugin
  scope: ProjectContext
  /** Resolved once per render pass. */
  statuses: StatusConfig[]
  flatTasks: FlatTask[]
  drag: DragState
  link: LinkState
  onRefresh: () => Promise<void>
  cleanupFns: (() => void)[]
}
