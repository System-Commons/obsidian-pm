import type { Project, Task } from '@system-commons/core'
import type { Change, ChangePage } from '@system-commons/api'

interface Snapshot {
  projectId: string
  updatedAt: string
  /** Task id to a fingerprint of what a client would see for it. */
  tasks: Map<string, string>
}

function fingerprints(tasks: Task[], parentId: string | null, out: Map<string, string>): void {
  tasks.forEach((task, position) => {
    out.set(task.id, `${task.updatedAt}|${parentId ?? ''}|${position}|${task.archived ? 'a' : ''}`)
    fingerprints(task.subtasks, task.id, out)
  })
}

/**
 * A bounded log of what changed, for clients polling `changes`. It learns about
 * changes by comparing the project against the last time it saw it, so it starts
 * recording once the project has been read in this session.
 */
export class ChangeLog {
  private seq = 0
  private entries: Change[] = []
  private snapshot: Snapshot | null = null

  constructor(private readonly capacity = 1000) {}

  get cursor(): number {
    return this.seq
  }

  /** Whether the project has been seen, and so is being compared against. */
  get tracking(): boolean {
    return this.snapshot !== null
  }

  /**
   * Compares the project with its last snapshot and records the differences. The first
   * sight records nothing unless `announce` is set, since a client that never fetched
   * the project has nothing to update.
   */
  observe(project: Project, announce: boolean): void {
    const next: Snapshot = { projectId: project.id, updatedAt: project.updatedAt, tasks: new Map() }
    fingerprints(project.tasks, null, next.tasks)
    const prev = this.snapshot
    this.snapshot = next
    if (!prev) {
      if (announce) this.push('project', 'upsert', project.id)
      return
    }
    if (prev.updatedAt !== next.updatedAt || prev.projectId !== next.projectId) {
      this.push('project', 'upsert', project.id)
    }
    for (const [id, fingerprint] of next.tasks) {
      if (prev.tasks.get(id) !== fingerprint) this.push('task', 'upsert', id)
    }
    for (const id of prev.tasks.keys()) {
      if (!next.tasks.has(id)) this.push('task', 'delete', id)
    }
  }

  /** The project is gone: its tasks go with it. */
  forget(): void {
    const prev = this.snapshot
    if (!prev) return
    this.snapshot = null
    for (const id of prev.tasks.keys()) this.push('task', 'delete', id)
    this.push('project', 'delete', prev.projectId)
  }

  since(cursor: number | null): ChangePage {
    if (cursor === null) return { cursor: this.seq, changes: [], reset: false }
    const oldest = this.entries[0]?.seq ?? this.seq + 1
    if (cursor < oldest - 1) return { cursor: this.seq, changes: [], reset: true }
    return { cursor: this.seq, changes: this.entries.filter((change) => change.seq > cursor), reset: false }
  }

  private push(kind: Change['kind'], op: Change['op'], id: string): void {
    this.seq++
    this.entries.push({ seq: this.seq, at: new Date().toISOString(), kind, op, id })
    if (this.entries.length > this.capacity) this.entries.splice(0, this.entries.length - this.capacity)
  }
}
