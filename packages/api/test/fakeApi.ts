import { DEFAULT_PRIORITIES, DEFAULT_STATUSES, makeProject, makeTask, type Project } from '@system-commons/core'
import type { Change, ChangePage, DomainApi, ProjectResource, TaskResource, TaskSearch } from '../src/contract'
import { ApiRequestError } from '../src/contract'
import {
  parseTaskCreate,
  parseTaskMove,
  parseTaskWrite,
  taskPatch,
  taskResources,
  toTaskResource
} from '../src/resources'

const CONFIG = {
  statuses: DEFAULT_STATUSES,
  priorities: DEFAULT_PRIORITIES,
  priorityIcons: 'chevrons' as const,
  customFields: [],
  defaultView: 'table' as const,
  autoSchedule: false,
  pullForwardOnEarlyFinish: false,
  autoArchiveDays: 0,
  showSubtreeConnections: true,
  lineBorders: 'none' as const,
  kanbanShowSubtasks: false,
  kanbanShowDescriptionPreview: false
}

/** An in-memory host for testing the transports: one project, tasks as a flat list. */
export class FakeApi implements DomainApi {
  project: Project = makeProject('Demo', 'Projects/Demo/Demo.md')
  calls: string[] = []
  changeLog: Change[] = []

  constructor() {
    this.project.id = 'p1'
    this.project.tasks = [
      makeTask({ id: 't1', title: 'First' }),
      makeTask({ id: 't2', title: 'Second', status: 'done' })
    ]
  }

  private find(taskId: string): TaskResource {
    const index = this.project.tasks.findIndex((t) => t.id === taskId)
    if (index < 0) throw new ApiRequestError('not_found', `task ${taskId} not found`)
    return toTaskResource(this.project.tasks[index], null, index)
  }

  async getProject(): Promise<ProjectResource> {
    this.calls.push('getProject')
    return {
      id: this.project.id,
      path: this.project.filePath,
      title: this.project.title,
      icon: this.project.icon,
      color: this.project.color,
      taskCount: this.project.tasks.length,
      doneCount: this.project.tasks.filter((t) => t.status === 'done').length,
      description: this.project.description,
      teamMembers: [],
      customFields: [],
      statuses: CONFIG.statuses,
      priorities: CONFIG.priorities,
      createdAt: this.project.createdAt,
      updatedAt: this.project.updatedAt
    }
  }

  async listTasks(includeArchived = false): Promise<TaskResource[]> {
    this.calls.push('listTasks')
    return taskResources(this.project, includeArchived)
  }

  async getTask(taskId: string): Promise<TaskResource> {
    this.calls.push(`getTask ${taskId}`)
    return this.find(taskId)
  }

  async searchTasks(search: TaskSearch): Promise<TaskResource[]> {
    this.calls.push(`searchTasks ${JSON.stringify(search)}`)
    const q = search.query?.toLowerCase()
    return taskResources(this.project, true).filter((t) => !q || t.title.toLowerCase().includes(q))
  }

  async createTask(input: unknown): Promise<TaskResource> {
    this.calls.push('createTask')
    const create = parseTaskCreate(input, CONFIG)
    const task = makeTask({ id: `t${this.project.tasks.length + 1}`, ...taskPatch(create) })
    this.project.tasks.push(task)
    return this.find(task.id)
  }

  async updateTask(taskId: string, input: unknown, expectedUpdatedAt?: string): Promise<TaskResource> {
    this.calls.push(`updateTask ${taskId}${expectedUpdatedAt ? ` if ${expectedUpdatedAt}` : ''}`)
    const current = this.find(taskId)
    if (expectedUpdatedAt !== undefined && expectedUpdatedAt !== current.updatedAt) {
      throw new ApiRequestError('conflict', 'task changed')
    }
    const write = parseTaskWrite(input, CONFIG)
    Object.assign(this.project.tasks[current.position], taskPatch(write), { updatedAt: '2030-01-01T00:00:00.000Z' })
    return this.find(taskId)
  }

  async moveTask(taskId: string, input: unknown): Promise<TaskResource> {
    this.calls.push(`moveTask ${taskId} ${JSON.stringify(parseTaskMove(input))}`)
    return this.find(taskId)
  }

  async archiveTask(taskId: string, archived: boolean): Promise<TaskResource> {
    this.calls.push(`archiveTask ${taskId} ${archived}`)
    this.project.tasks[this.find(taskId).position].archived = archived
    return this.find(taskId)
  }

  async deleteTask(taskId: string): Promise<void> {
    this.calls.push(`deleteTask ${taskId}`)
    this.project.tasks.splice(this.find(taskId).position, 1)
  }

  async changes(since: number | null): Promise<ChangePage> {
    this.calls.push(`changes ${since}`)
    return {
      cursor: this.changeLog.length,
      changes: this.changeLog.filter((c) => since !== null && c.seq > since),
      reset: false
    }
  }
}
