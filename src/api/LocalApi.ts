import type { Project, Task } from '@system-commons/core'
import { displayName, findParentId, findTaskById, flattenTasks, makeTask } from '@system-commons/core'
import {
  ApiRequestError,
  parseTaskCreate,
  parseTaskMove,
  parseTaskWrite,
  projectCounts,
  taskPatch,
  taskResources,
  toProjectResource,
  toTaskResource,
  type ChangePage,
  type DomainApi,
  type ProjectResource,
  type TaskResource,
  type TaskSearch,
  type TaskWrite
} from '@system-commons/api'
import type PMPlugin from '../main'
import { ChangeLog } from './ChangeLog'

const SCHEDULE_FIELDS: Array<keyof TaskWrite> = ['start', 'due', 'dependencies', 'status', 'type']

function notFound(what: string, id: string): never {
  throw new ApiRequestError('not_found', `${what} ${id} not found`)
}

/** The contract over this vault: the one project, read and written through the store. */
export class LocalApi implements DomainApi {
  readonly changeLog = new ChangeLog()

  constructor(private readonly plugin: PMPlugin) {}

  /** Feeds the change log from the store and the index. Returns the unsubscribe function. */
  attach(): () => void {
    const offStore = this.plugin.store.onProjectChanged((path) => {
      void (async () => {
        if (path !== this.plugin.projectRef()?.path) return
        const project = await this.plugin.store.loadProjectByPath(path)
        if (project) this.changeLog.observe(project, true)
      })()
    })
    const offIndex = this.plugin.index.onChange(() => {
      if (this.changeLog.tracking && !this.plugin.projectRef()) this.changeLog.forget()
    })
    return () => {
      offStore()
      offIndex()
    }
  }

  async getProject(): Promise<ProjectResource> {
    const project = await this.load()
    const config = this.plugin.store.configFor(project)
    return toProjectResource(project, config, projectCounts(project, config))
  }

  async listTasks(includeArchived = false): Promise<TaskResource[]> {
    const project = await this.load()
    await Promise.all(flattenTasks(project.tasks).map(({ task }) => this.plugin.store.loadTaskBody(task)))
    return taskResources(project, includeArchived)
  }

  async getTask(taskId: string): Promise<TaskResource> {
    const { project, task } = await this.locate(taskId)
    return this.serve(project, task)
  }

  async searchTasks(search: TaskSearch): Promise<TaskResource[]> {
    const project = await this.load()
    const query = search.query?.toLowerCase()
    const assignee = search.assignee ? displayName(search.assignee).toLowerCase() : undefined
    const limit = search.limit ?? 50
    const hits = flattenTasks(project.tasks)
      .map(({ task }) => task)
      .filter((task) => {
        if (task.archived && !search.includeArchived) return false
        if (search.status && task.status !== search.status) return false
        if (query && !task.title.toLowerCase().includes(query)) return false
        if (assignee && !task.assignees.some((raw) => displayName(raw).toLowerCase() === assignee)) return false
        return true
      })
      .slice(0, limit)
    const out: TaskResource[] = []
    for (const task of hits) out.push(await this.serve(project, task))
    return out
  }

  async createTask(input: unknown): Promise<TaskResource> {
    const project = await this.load()
    const create = parseTaskCreate(input, this.plugin.store.configFor(project))
    if (create.parentId && !findTaskById(project, create.parentId)) notFound('parent task', create.parentId)
    const task = makeTask(taskPatch(create))
    await this.plugin.store.insertTask(project, task, create.parentId ?? null)
    await this.plugin.store.scheduleAfterChange(project, task.id)
    this.plugin.refreshViews()
    return this.serve(project, this.taskOf(project, task.id))
  }

  async updateTask(taskId: string, input: unknown, expectedUpdatedAt?: string): Promise<TaskResource> {
    const { project, task } = await this.locate(taskId)
    if (expectedUpdatedAt !== undefined && expectedUpdatedAt !== task.updatedAt) {
      throw new ApiRequestError('conflict', `task ${taskId} changed at ${task.updatedAt}`)
    }
    const write = parseTaskWrite(input, this.plugin.store.configFor(project))
    await this.plugin.store.updateTask(project, taskId, taskPatch(write))
    if (SCHEDULE_FIELDS.some((field) => write[field] !== undefined)) {
      await this.plugin.store.scheduleAfterChange(project, taskId)
    }
    this.plugin.refreshViews()
    return this.serve(project, this.taskOf(project, taskId))
  }

  async moveTask(taskId: string, input: unknown): Promise<TaskResource> {
    const move = parseTaskMove(input)
    const { project, task } = await this.locate(taskId)
    const store = this.plugin.store

    if (move.parentId !== undefined && move.parentId !== findParentId(project, taskId)) {
      if (move.parentId && !findTaskById(project, move.parentId)) notFound('parent task', move.parentId)
      if (move.parentId && this.inSubtree(task, move.parentId)) {
        throw new ApiRequestError('invalid', 'a task cannot be moved under itself')
      }
      await store.moveTask(project, taskId, move.parentId)
    }

    const sibling = move.before ?? move.after
    if (sibling) {
      if (!findTaskById(project, sibling)) notFound('sibling task', sibling)
      if (findParentId(project, sibling) !== findParentId(project, taskId)) {
        throw new ApiRequestError('invalid', 'before and after must name a sibling; pass parentId to re-parent first')
      }
      await store.reorderTask(project, taskId, sibling, move.before ? 'before' : 'after')
    }
    this.plugin.refreshViews()
    return this.serve(project, this.taskOf(project, taskId))
  }

  async archiveTask(taskId: string, archived: boolean): Promise<TaskResource> {
    const { project, task } = await this.locate(taskId)
    if (archived && !task.archived) await this.plugin.store.archiveTask(project, taskId)
    if (!archived && task.archived) await this.plugin.store.unarchiveTask(project, taskId)
    this.plugin.refreshViews()
    return this.serve(project, this.taskOf(project, taskId))
  }

  async deleteTask(taskId: string): Promise<void> {
    const { project } = await this.locate(taskId)
    await this.plugin.store.deleteTask(project, taskId)
    this.plugin.refreshViews()
  }

  async changes(since: number | null): Promise<ChangePage> {
    return this.changeLog.since(since)
  }

  /** The live project, baselined for the change log on every read. */
  private async load(): Promise<Project> {
    const project = await this.plugin.project()
    if (!project) throw new ApiRequestError('not_found', 'this vault has no project yet')
    this.changeLog.observe(project, false)
    return project
  }

  private async locate(taskId: string): Promise<{ project: Project; task: Task }> {
    const project = await this.load()
    return { project, task: this.taskOf(project, taskId) }
  }

  private taskOf(project: Project, taskId: string): Task {
    return findTaskById(project, taskId) ?? notFound('task', taskId)
  }

  /** The task as a client sees it, with its note body loaded. */
  private async serve(project: Project, task: Task): Promise<TaskResource> {
    await this.plugin.store.loadTaskBody(task)
    const parentId = findParentId(project, task.id)
    const siblings = parentId ? (findTaskById(project, parentId)?.subtasks ?? []) : project.tasks
    return toTaskResource(task, parentId, siblings.indexOf(task))
  }

  private inSubtree(root: Task, id: string): boolean {
    return root.id === id || root.subtasks.some((sub) => this.inSubtree(sub, id))
  }
}
