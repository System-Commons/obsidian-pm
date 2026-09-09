import type { App, Plugin, TAbstractFile } from 'obsidian'
import { TFile, normalizePath } from 'obsidian'
import {
  type PMSettings,
  reaches,
  FRONTMATTER_KEY,
  TASK_FRONTMATTER_KEY,
  stringList,
  dedupePeople
} from '@system-commons/core'
import { projectTaskFolder, TASK_FOLDER_NAME } from './vaultFs'
import { refToId } from './refs'
import { personKeyer } from './people'

export interface ProjectRef {
  path: string
  id: string
  title: string
  icon: string
  color: string
  teamMembers: string[]
}

export interface TaskRef {
  id: string
  path: string
  title: string
  status: string
  priority: string
  start: string
  due: string
  completed: string
  dependencies: string[]
  assignees: string[]
  archived: boolean
}

function str(raw: unknown, fallback = ''): string {
  return typeof raw === 'string' ? raw : fallback
}

/** A project note dropped inside task storage is task storage, not a project. */
function insideTaskFolder(path: string): boolean {
  const parts = path.split('/')
  parts.pop()
  return parts.includes(TASK_FOLDER_NAME)
}

function isArchivedPath(path: string): boolean {
  return path.split('/').at(-2) === 'Archive'
}

/**
 * Every `pm-project` and `pm-task` note in the vault, read from the metadata cache and
 * kept current by its events. Nothing here reads a file body, so a whole-vault sweep
 * costs one pass over frontmatter Obsidian has already parsed.
 *
 * The vault holds one project. Every project note found is a candidate; the one under
 * the projects folder wins, then the first by path, and the rest are reported so the
 * user can exclude their folders. A task belongs to the project when its note sits in
 * the project's `_tasks/` folder, so ownership follows from paths alone.
 */
export class VaultIndex {
  private candidates = new Map<string, ProjectRef>()
  private tasks = new Map<string, TaskRef>()
  private changeHandlers = new Set<() => void>()
  private cachedDependents = new Map<string, string[]>()
  private dependentsDirty = true
  /** False until the first build, so a view can tell "none yet" from "none at all". */
  ready = false

  constructor(
    private app: App,
    private getSettings: () => PMSettings
  ) {}

  /** Call once, after the layout is ready. Safe to call again to recover from a bad state. */
  build(): void {
    this.candidates.clear()
    this.tasks.clear()
    this.dependentsDirty = true
    for (const file of this.app.vault.getMarkdownFiles()) this.read(file)
    this.ready = true
    this.emitChange()
  }

  register(plugin: Plugin, onFirstResolve?: () => void): void {
    // On a cold start the metadata cache is still filling when the layout is ready, so
    // the first build can see an empty vault. 'resolved' is Obsidian saying it caught up;
    // after that, 'changed' keeps the index current on its own.
    const onResolved = this.app.metadataCache.on('resolved', () => {
      this.build()
      this.app.metadataCache.offref(onResolved)
      onFirstResolve?.()
    })
    plugin.registerEvent(onResolved)

    plugin.registerEvent(
      this.app.metadataCache.on('changed', (file) => {
        this.read(file)
        this.emitChange()
      })
    )
    plugin.registerEvent(
      this.app.metadataCache.on('deleted', (file) => {
        if (this.forget(file.path)) this.emitChange()
      })
    )
    plugin.registerEvent(
      this.app.vault.on('rename', (file: TAbstractFile, oldPath: string) => {
        // The metadata cache is not keyed by the new path yet when this fires, and a
        // renamed folder reports nothing about the notes inside it, so whatever is already
        // indexed moves by path here rather than being read back from the cache.
        if (!(file instanceof TFile)) {
          if (this.rekeyFolder(oldPath, file.path)) this.emitChange()
          return
        }
        if (this.rekeyFile(oldPath, file.path)) {
          this.emitChange()
          return
        }
        this.read(file)
        if (this.tasks.has(file.path) || this.candidates.has(file.path)) this.emitChange()
      })
    )
  }

  /** Returns the unsubscribe function. */
  onChange(handler: () => void): () => void {
    this.changeHandlers.add(handler)
    return () => this.changeHandlers.delete(handler)
  }

  /** The vault's project note. Null until one exists. */
  get project(): ProjectRef | null {
    if (this.candidates.size === 0) return null
    const refs = [...this.candidates.values()].sort((a, b) => a.path.localeCompare(b.path))
    const folder = this.getSettings().projectsFolder.trim()
    const prefix = folder ? normalizePath(folder) + '/' : ''
    return (prefix && refs.find((ref) => ref.path.startsWith(prefix))) || refs[0]
  }

  /** Project notes the plugin found but does not use, for the user to exclude or remove. */
  extraProjectPaths(): string[] {
    const chosen = this.project?.path
    return [...this.candidates.keys()].filter((path) => path !== chosen).sort()
  }

  /** The project's task notes, archived ones included, in no particular order. */
  taskRefs(): TaskRef[] {
    const project = this.project
    if (!project) return []
    const prefix = projectTaskFolder(project.path) + '/'
    return [...this.tasks.values()].filter((ref) => ref.path.startsWith(prefix))
  }

  task(taskId: string): TaskRef | null {
    return this.taskRefs().find((ref) => ref.id === taskId) ?? null
  }

  /** Status ids that count as finished. */
  completeStatuses(): Set<string> {
    return new Set(
      this.getSettings()
        .statuses.filter((s) => s.complete)
        .map((s) => s.id)
    )
  }

  /** Task totals without loading the project: one per id, archived ones left out. */
  counts(): { total: number; done: number } {
    const complete = this.completeStatuses()
    const seen = new Set<string>()
    let total = 0
    let done = 0
    for (const task of this.taskRefs()) {
      if (task.archived || seen.has(task.id)) continue
      seen.add(task.id)
      total++
      if (complete.has(task.status)) done++
    }
    return { total, done }
  }

  /**
   * Tasks assigned to one person, keyed the way the assignee filter keys them, so a
   * person written as a link, an alias, or plain text all count once.
   */
  tasksForPerson(person: string): TaskRef[] {
    const keyOf = personKeyer(this.app)
    const wanted = keyOf(person)
    return this.taskRefs().filter((ref) => ref.assignees.some((a) => keyOf(a) === wanted))
  }

  /** Everyone named by a task, one entry per person. */
  allAssignees(): string[] {
    const values: string[] = []
    for (const ref of this.taskRefs()) values.push(...ref.assignees)
    return dedupePeople(values, personKeyer(this.app))
  }

  /** Would making `fromId` depend on `toId` close a cycle, following dependencies wherever they lead? */
  wouldCreateCycle(fromId: string, toId: string): boolean {
    return reaches(this.dependentsMap(), fromId, toId)
  }

  /** Tasks that list this one as a dependency. */
  dependents(taskId: string): TaskRef[] {
    return this.taskRefs().filter((ref) => ref.dependencies.includes(taskId))
  }

  /** Predecessor id -> ids of everything waiting on it. */
  dependentsMap(): Map<string, string[]> {
    if (!this.dependentsDirty) return this.cachedDependents
    const map = new Map<string, string[]>()
    for (const ref of this.taskRefs()) {
      for (const depId of ref.dependencies) {
        const list = map.get(depId)
        if (list) list.push(ref.id)
        else map.set(depId, [ref.id])
      }
    }
    this.cachedDependents = map
    this.dependentsDirty = false
    return map
  }

  private read(file: TFile): void {
    const path = normalizePath(file.path)
    const cache = this.app.metadataCache.getFileCache(file)
    // No cache entry at all means Obsidian has not caught up with this path yet, which is
    // where a rename leaves it. Keep what is indexed rather than dropping the note.
    if (!cache) return
    this.forget(path)
    if (this.isExcluded(path)) return
    const frontmatter = cache.frontmatter
    if (!frontmatter) return
    if (frontmatter[FRONTMATTER_KEY] === true && !insideTaskFolder(path)) this.addProject(path, file, frontmatter)
    else if (frontmatter[TASK_FRONTMATTER_KEY] === true) this.addTask(path, frontmatter)
  }

  private addProject(path: string, file: TFile, frontmatter: Record<string, unknown>): void {
    this.candidates.set(path, {
      path,
      id: str(frontmatter.id, file.basename),
      title: str(frontmatter.title, file.basename),
      icon: str(frontmatter.icon, '\u{1F4CB}'),
      color: str(frontmatter.color, '#8b72be'),
      teamMembers: stringList(frontmatter.teamMembers)
    })
    this.dependentsDirty = true
  }

  private addTask(path: string, frontmatter: Record<string, unknown>): void {
    this.tasks.set(path, {
      id: str(frontmatter.id, path),
      path,
      title: str(frontmatter.title, 'Untitled'),
      status: str(frontmatter.status, 'todo'),
      priority: str(frontmatter.priority, 'medium'),
      start: str(frontmatter.start),
      due: str(frontmatter.due),
      completed: str(frontmatter.completed),
      dependencies: stringList(frontmatter.dependencies).map((raw) => refToId(this.app, raw, path)),
      assignees: stringList(frontmatter.assignees),
      archived: isArchivedPath(path)
    })
    this.dependentsDirty = true
  }

  /** Moves an indexed note to its new path. False when the path held nothing indexed. */
  private rekeyFile(oldPath: string, newPath: string): boolean {
    const from = normalizePath(oldPath)
    const to = normalizePath(newPath)
    const project = this.candidates.get(from)
    const task = this.tasks.get(from)
    if (!project && !task) return false
    this.forget(from)
    if (this.isExcluded(to)) return true
    if (project) {
      project.path = to
      this.candidates.set(to, project)
    }
    if (task) {
      task.path = to
      task.archived = isArchivedPath(to)
      this.tasks.set(to, task)
    }
    this.dependentsDirty = true
    return true
  }

  /** Moves everything indexed under a renamed folder to its new path. */
  private rekeyFolder(oldPath: string, newPath: string): boolean {
    const from = normalizePath(oldPath) + '/'
    const to = normalizePath(newPath) + '/'
    const projects = [...this.candidates.values()].filter((ref) => ref.path.startsWith(from))
    const tasks = [...this.tasks.values()].filter((ref) => ref.path.startsWith(from))
    if (!projects.length && !tasks.length) return false
    for (const ref of projects) {
      this.candidates.delete(ref.path)
      ref.path = to + ref.path.slice(from.length)
      this.candidates.set(ref.path, ref)
    }
    for (const ref of tasks) {
      this.tasks.delete(ref.path)
      ref.path = to + ref.path.slice(from.length)
      ref.archived = isArchivedPath(ref.path)
      this.tasks.set(ref.path, ref)
    }
    this.dependentsDirty = true
    return true
  }

  /** Drops whatever was indexed at a path. Reports whether anything was. */
  private forget(path: string): boolean {
    const normalized = normalizePath(path)
    const dropped = this.tasks.delete(normalized) || this.candidates.delete(normalized)
    if (dropped) this.dependentsDirty = true
    return dropped
  }

  private isExcluded(path: string): boolean {
    return this.getSettings().excludedFolders.some((folder) => {
      const normalized = normalizePath(folder)
      return normalized !== '' && (path === normalized || path.startsWith(normalized + '/'))
    })
  }

  private emitChange(): void {
    for (const handler of this.changeHandlers) handler()
  }
}
