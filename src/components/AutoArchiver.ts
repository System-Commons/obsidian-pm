import type PMPlugin from '../main'
import { type Project, today, isTerminalStatus } from '@system-commons/core'
import { collectArchivable, withoutBlockedDependents } from '../store'
import { safeAsync } from '@system-commons/ui'

const CHECK_INTERVAL_MS = 60 * 60 * 1000

export interface ArchivePlan {
  project: Project
  rootIds: string[]
  tasks: number
}

/**
 * Moves tasks complete for longer than the auto-archive window into the archive folder.
 * The pass is keyed on the date rather than on elapsed time, so a vault that stayed closed
 * for a week catches up the next time it opens.
 */
export class AutoArchiver {
  private running = false

  constructor(private plugin: PMPlugin) {}

  /** The first pass runs once the index is built; this only schedules the later ones. */
  start(): void {
    this.plugin.registerInterval(
      window.setInterval(
        safeAsync(() => this.check()),
        CHECK_INTERVAL_MS
      )
    )
  }

  async check(): Promise<void> {
    const settings = this.plugin.settings
    if (settings.autoArchiveDays <= 0) return

    const stamp = today().toString()
    if (settings.lastAutoArchiveDate === stamp || this.running) return
    this.running = true
    try {
      const tasks = await this.apply(await this.plan(false))
      settings.lastAutoArchiveDate = stamp
      await this.plugin.saveSettings()
      if (tasks) this.plugin.showNotice(`Archived ${tasks} completed task(s).`)
    } finally {
      this.running = false
    }
  }

  /**
   * What the sweep would move. The index says whether anything is old enough before the
   * project is loaded, and `includeDisabled` takes in a window that is off, for the
   * command that archives everything finished.
   */
  async plan(includeDisabled: boolean): Promise<ArchivePlan | null> {
    const days = this.plugin.settings.autoArchiveDays
    if (days === 0 && !includeDisabled) return null
    const cutoff = today().subtract({ days }).toString()

    const index = this.plugin.index
    const complete = index.completeStatuses()
    const anyOldEnough = index
      .taskRefs()
      .some((task) => !task.archived && complete.has(task.status) && !!task.completed && task.completed <= cutoff)
    if (!anyOldEnough) return null

    const project = await this.plugin.project()
    if (!project) return null
    const statuses = this.plugin.store.configFor(project).statuses
    const candidates = withoutBlockedDependents(
      collectArchivable(project, (status) => isTerminalStatus(status, statuses), cutoff),
      index
    )
    if (!candidates.length) return null
    return {
      project,
      rootIds: candidates.map((candidate) => candidate.rootId),
      tasks: candidates.reduce((sum, candidate) => sum + candidate.ids.length, 0)
    }
  }

  async apply(plan: ArchivePlan | null): Promise<number> {
    if (!plan) return 0
    await this.plugin.store.archiveTasks(plan.project, plan.rootIds)
    return plan.tasks
  }
}
