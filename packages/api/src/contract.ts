import type { CustomFieldDef, PriorityConfig, Recurrence, StatusConfig, TaskType, TimeLog } from '@system-commons/core'

/** The vault's project: what a client needs before it writes tasks, plus the counts a listing shows. */
export interface ProjectResource {
  id: string
  path: string
  title: string
  icon: string
  color: string
  description: string
  teamMembers: string[]
  customFields: CustomFieldDef[]
  statuses: StatusConfig[]
  priorities: PriorityConfig[]
  taskCount: number
  doneCount: number
  createdAt: string
  updatedAt: string
}

export interface TaskResource {
  id: string
  parentId: string | null
  /** Index among its siblings. */
  position: number
  path: string
  title: string
  description: string
  type: TaskType
  status: string
  priority: string
  start: string
  due: string
  completed: string
  progress: number
  assignees: string[]
  tags: string[]
  dependencies: string[]
  recurrence: Recurrence | null
  timeEstimate: number | null
  timeLogs: TimeLog[]
  customFields: Record<string, unknown>
  archived: boolean
  createdAt: string
  updatedAt: string
}

/** The fields a client may write. Everything else is derived or owned by the host. */
export interface TaskWrite {
  title?: string
  description?: string
  type?: TaskType
  status?: string
  priority?: string
  start?: string
  due?: string
  progress?: number
  assignees?: string[]
  tags?: string[]
  dependencies?: string[]
  recurrence?: Recurrence | null
  timeEstimate?: number | null
  customFields?: Record<string, unknown>
}

export interface TaskCreate extends TaskWrite {
  title: string
  parentId?: string | null
}

export interface TaskMove {
  parentId?: string | null
  before?: string
  after?: string
}

export interface TaskSearch {
  query?: string
  status?: string
  assignee?: string
  includeArchived?: boolean
  limit?: number
}

export interface Change {
  seq: number
  at: string
  kind: 'project' | 'task'
  op: 'upsert' | 'delete'
  id: string
}

export interface ChangePage {
  cursor: number
  changes: Change[]
  /** The cursor asked for is older than what is kept; refetch instead of applying. */
  reset: boolean
}

export type ApiErrorCode = 'invalid' | 'unauthorized' | 'not_found' | 'conflict' | 'unavailable'

export class ApiRequestError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

export const ERROR_STATUS: Record<ApiErrorCode, number> = {
  invalid: 400,
  unauthorized: 401,
  not_found: 404,
  conflict: 412,
  unavailable: 503
}

/**
 * The contract every host implements: the plugin over the vault today, a server later.
 * The vault holds one project, so nothing is addressed by project; task ids are the only
 * identity, and paths are attributes. Writes take the raw client input (`TaskCreate`,
 * `TaskWrite`, `TaskMove` shaped) and validate it against the project, since only the
 * host knows its statuses. Every client mistake rejects with an `ApiRequestError`.
 */
export interface DomainApi {
  getProject(): Promise<ProjectResource>
  listTasks(includeArchived?: boolean): Promise<TaskResource[]>
  getTask(taskId: string): Promise<TaskResource>
  searchTasks(search: TaskSearch): Promise<TaskResource[]>
  createTask(input: unknown): Promise<TaskResource>
  /** `expectedUpdatedAt` makes the write conditional: a mismatch rejects with `conflict`. */
  updateTask(taskId: string, input: unknown, expectedUpdatedAt?: string): Promise<TaskResource>
  moveTask(taskId: string, input: unknown): Promise<TaskResource>
  archiveTask(taskId: string, archived: boolean): Promise<TaskResource>
  deleteTask(taskId: string): Promise<void>
  changes(since: number | null): Promise<ChangePage>
}
