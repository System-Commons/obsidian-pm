import { type Project, type ResolvedProjectConfig, type Task, findTaskById } from '@system-commons/core'
import type { TaskSource } from './TaskSource'

/**
 * The project a view renders, with its resolved config kept for the length of a paint.
 * Resolving a config walks the project's tasks, so a row-by-row render must not repeat it.
 */
export class ProjectContext {
  private cached: ResolvedProjectConfig | null = null

  constructor(
    readonly project: Project,
    private store: TaskSource
  ) {}

  /** Drops the resolved config, for when a palette changed under a live view. */
  invalidate(): void {
    this.cached = null
  }

  get config(): ResolvedProjectConfig {
    this.cached ??= this.store.configFor(this.project)
    return this.cached
  }

  tasks(): Task[] {
    return this.project.tasks
  }

  taskById(taskId: string): Task | null {
    return findTaskById(this.project, taskId)
  }
}
