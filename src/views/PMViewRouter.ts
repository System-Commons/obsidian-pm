import type { WorkspaceLeaf } from 'obsidian'
import type PMPlugin from '../main'
import { PM_PROJECT_EDIT_VIEW_TYPE } from './ProjectEditView'
import { PM_PROJECT_OVERVIEW_VIEW_TYPE } from './ProjectOverviewView'
import { PM_PROJECT_VIEW_TYPE } from './ProjectView'
import { PM_TASK_VIEW_TYPE, type TaskViewState } from './TaskView'

export class PMViewRouter {
  constructor(private plugin: PMPlugin) {}

  /**
   * Pass a leaf to navigate within it instead of opening a tab. The project views carry
   * no state, so one already open is brought forward rather than opened again.
   */
  private async open(type: string, state: Record<string, unknown>, leaf?: WorkspaceLeaf, reuse = false): Promise<void> {
    const ws = this.plugin.app.workspace
    const existing = reuse && !leaf ? ws.getLeavesOfType(type)[0] : undefined
    const target = leaf ?? existing ?? ws.getLeaf('tab')
    if (target !== existing) await target.setViewState({ type, state })
    await ws.revealLeaf(target)
  }

  /** Where the project opens from the ribbon and its links, per the open project in setting. */
  async openHome(leaf?: WorkspaceLeaf): Promise<void> {
    if (this.plugin.settings.projectSurface === 'tasks') await this.openProject(leaf)
    else await this.openProjectOverview(leaf)
  }

  async openProject(leaf?: WorkspaceLeaf): Promise<void> {
    await this.open(PM_PROJECT_VIEW_TYPE, {}, leaf, true)
  }

  async openProjectOverview(leaf?: WorkspaceLeaf): Promise<void> {
    await this.open(PM_PROJECT_OVERVIEW_VIEW_TYPE, {}, leaf, true)
  }

  async openProjectEdit(leaf?: WorkspaceLeaf): Promise<void> {
    await this.open(PM_PROJECT_EDIT_VIEW_TYPE, {}, leaf, true)
  }

  async openTask(state: TaskViewState): Promise<void> {
    await this.open(PM_TASK_VIEW_TYPE, state)
  }
}
