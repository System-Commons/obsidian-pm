import { MarkdownView, Notice, Platform, Plugin } from 'obsidian'
import { bearerAuth } from '@system-commons/api'
import {
  DEFAULT_SETTINGS,
  makeDefaultFilter,
  type PMSettings,
  type Project,
  type Task,
  flattenTasks,
  findTask,
  dedupePeople,
  displayName,
  localApiPortFor
} from '@system-commons/core'
import {
  matchPersonNotes,
  personLink,
  projectFilePath,
  ProjectStore,
  VaultIndex,
  type ProjectRef,
  type TaskSource
} from './store'
import { safeAsync } from '@system-commons/ui'
import { installObsidianPlatform } from './platform'
import { PMSettingTab } from './settings'
import { ProjectView, PM_PROJECT_VIEW_TYPE } from './views/ProjectView'
import { ProjectOverviewView, PM_PROJECT_OVERVIEW_VIEW_TYPE } from './views/ProjectOverviewView'
import { ProjectEditView, PM_PROJECT_EDIT_VIEW_TYPE } from './views/ProjectEditView'
import { TaskView, PM_TASK_VIEW_TYPE } from './views/TaskView'
import { registerStyleguide } from './views/styleguide/StyleguideView'
import { PMViewRouter } from './views/PMViewRouter'
import {
  openTaskModal,
  openPersonLookup,
  openTaskPicker,
  openImportModal,
  confirmDialog,
  promptText
} from './ui/ModalFactory'
import { Notifier } from './components/Notifier'
import { AutoArchiver } from './components/AutoArchiver'
import { LocalApi } from './api/LocalApi'
import { exportViewAsHtml } from './export/exportView'
import { generateToken, LocalApiServer } from './api/LocalApiServer'

export default class PMPlugin extends Plugin {
  settings: PMSettings = { ...DEFAULT_SETTINGS }
  store!: TaskSource
  index!: VaultIndex
  notifier!: Notifier
  autoArchiver!: AutoArchiver
  router!: PMViewRouter
  localApi!: LocalApiServer
  /** Paths deliberately sent to the markdown editor, which the swap then leaves alone. */
  private markdownEscapes = new Set<string>()
  private viewRefreshScheduled = false
  /** The prompt in flight, so two commands at once don't create two projects. */
  private creating: Promise<Project | null> | null = null
  undoStack: Array<{ undo: () => Promise<void>; redo: () => Promise<void> }> = []
  redoStack: Array<{ undo: () => Promise<void>; redo: () => Promise<void> }> = []

  pushUndo(entry: { undo: () => Promise<void>; redo: () => Promise<void> }): void {
    this.undoStack.push(entry)
    if (this.undoStack.length > 20) this.undoStack.shift()
    this.redoStack = []
  }

  async undoLastAction(): Promise<void> {
    const entry = this.undoStack.pop()
    if (entry) {
      await entry.undo()
      this.redoStack.push(entry)
    }
  }

  async redoLastAction(): Promise<void> {
    const entry = this.redoStack.pop()
    if (entry) {
      await entry.redo()
      this.undoStack.push(entry)
    }
  }

  async onload(): Promise<void> {
    installObsidianPlatform()
    await this.loadSettings()
    this.index = new VaultIndex(this.app, () => this.settings)
    // The first sweep can run against a half-filled metadata cache, so it runs again once
    // the index has caught up. Everything in it is safe to repeat.
    this.index.register(this, () => {
      void this.startupSweep()
    })
    this.store = new ProjectStore(this.app, () => this.settings, this.index)
    this.store.registerVaultSync(this)
    this.notifier = new Notifier(this)
    this.autoArchiver = new AutoArchiver(this)
    this.router = new PMViewRouter(this)
    const api = new LocalApi(this)
    this.register(api.attach())
    this.localApi = new LocalApiServer(
      {
        api,
        info: { name: 'project-manager', version: this.manifest.version },
        authorized: bearerAuth(() => this.settings.localApiToken)
      },
      () => this.settings.localApiPort
    )

    this.registerView(PM_PROJECT_VIEW_TYPE, (leaf) => new ProjectView(leaf, this))
    this.registerView(PM_PROJECT_OVERVIEW_VIEW_TYPE, (leaf) => new ProjectOverviewView(leaf, this))
    this.registerView(PM_PROJECT_EDIT_VIEW_TYPE, (leaf) => new ProjectEditView(leaf, this))
    this.registerView(PM_TASK_VIEW_TYPE, (leaf) => new TaskView(leaf, this))
    this.registerTaskNoteSwap()
    if (__STYLEGUIDE__) registerStyleguide(this)

    this.app.workspace.onLayoutReady(
      safeAsync(async () => {
        this.index.build()
        await this.startupSweep()
        await this.syncLocalApi()
      })
    )

    this.addRibbonIcon('chart-gantt', 'Project manager', async () => {
      await this.router.openHome()
    })

    this.addCommand({
      id: 'open-projects',
      name: 'Open project',
      callback: () => {
        void this.router.openHome()
      }
    })

    this.addCommand({
      id: 'new-task',
      name: 'Create new task',
      callback: () => {
        void this.createTask(null)
      }
    })

    this.addCommand({
      id: 'new-subtask',
      name: 'Create new subtask',
      callback: () => {
        void this.createTask('pick-parent')
      }
    })

    this.addCommand({
      id: 'undo-last-action',
      name: 'Undo last action',
      callback: () => {
        void this.undoLastAction()
      }
    })

    this.addCommand({
      id: 'redo-last-action',
      name: 'Redo last action',
      callback: () => {
        void this.redoLastAction()
      }
    })

    this.addCommand({
      id: 'rebuild-project-index',
      name: 'Rebuild project index',
      callback: () => {
        this.index.build()
        const ref = this.projectRef()
        this.showNotice(ref ? `Found "${ref.title}" at ${ref.path}.` : 'No project note found.')
      }
    })

    this.addCommand({
      id: 'archive-completed-tasks',
      name: 'Archive completed tasks',
      callback: () => {
        void this.archiveCompletedTasks()
      }
    })

    this.addCommand({
      id: 'import-notes-as-tasks',
      name: 'Import notes as tasks',
      callback: () => {
        void this.importNotes()
      }
    })

    this.addCommand({
      id: 'create-task-from-selection',
      name: 'Create task from selection',
      editorCheckCallback: (checking, editor) => {
        const selection = editor.getSelection().trim()
        if (!selection) return false
        if (checking) return true
        void this.createTaskFromText(selection)
        return true
      }
    })

    this.registerEvent(
      this.app.workspace.on('editor-menu', (menu, editor) => {
        const selection = editor.getSelection().trim()
        if (!selection) return
        menu.addItem((item) =>
          item
            .setTitle('Create task from selection')
            .setIcon('list-plus')
            .onClick(safeAsync(() => this.createTaskFromText(selection)))
        )
      })
    )

    this.addCommand({
      id: 'export-view-html',
      name: 'Export current view as HTML',
      checkCallback: (checking: boolean) => {
        const view = this.app.workspace.getActiveViewOfType(ProjectView)
        if (!view?.project) return false
        if (checking) return true
        safeAsync(async () => {
          await exportViewAsHtml(this, view)
        })()
        return true
      }
    })

    this.addCommand({
      id: 'open-current-as-project',
      name: 'Open current file as project',
      checkCallback: (checking: boolean) => {
        const md = this.app.workspace.getActiveViewOfType(MarkdownView)
        const file = md?.file
        if (!file) return false
        const cache = this.app.metadataCache.getFileCache(file)
        if (cache?.frontmatter?.['pm-project'] !== true) return false
        if (checking) return true
        const ref = this.projectRef()
        if (ref && ref.path !== file.path) {
          this.showNotice(`This vault's project is "${ref.title}" at ${ref.path}. Only one project note is used.`)
          return true
        }
        void this.router.openHome(md.leaf)
        return true
      }
    })

    this.addCommand({
      id: 'person-tasks',
      name: 'Show tasks assigned to a person',
      callback: () => {
        openPersonLookup(
          this,
          this.index.allAssignees(),
          safeAsync((value) => this.showTasksForPerson(value))
        )
      }
    })

    this.addCommand({
      id: 'person-tasks-this-note',
      name: 'Show tasks assigned to this note',
      checkCallback: (checking: boolean) => {
        const md = this.app.workspace.getActiveViewOfType(MarkdownView)
        const file = md?.file
        if (!file) return false
        const cache = this.app.metadataCache.getFileCache(file)
        if (cache?.frontmatter?.['pm-task'] === true || cache?.frontmatter?.['pm-project'] === true) return false
        if (checking) return true
        void this.showTasksForPerson(personLink(this.app, file, ''))
        return true
      }
    })

    this.addCommand({
      id: 'link-people-to-notes',
      name: 'Link assignees to their person notes',
      callback: () => {
        void this.linkPeopleToNotes()
      }
    })

    this.addSettingTab(new PMSettingTab(this.app, this))
    this.notifier.start()
    this.autoArchiver.start()
  }

  /** The vault's project note, as the index sees it. Null until one exists or the index has read the vault. */
  projectRef(): ProjectRef | null {
    const refs = this.index.projectRefs()
    if (!refs.length) return null
    const folder = this.settings.projectsFolder ? `${this.settings.projectsFolder}/` : ''
    const inFolder = refs.filter((ref) => folder && ref.path.startsWith(folder))
    return (inFolder.length ? inFolder : refs).sort((a, b) => a.path.localeCompare(b.path))[0]
  }

  /** The vault's project, loaded. Null when the vault has none. */
  async project(): Promise<Project | null> {
    const ref = this.projectRef()
    return ref ? this.store.loadProjectByPath(ref.path) : null
  }

  /**
   * The vault's project, created after a prompt when there is none yet. Null when the
   * prompt is cancelled, or the index has not read the vault and creating one now could
   * duplicate a note that is about to turn up.
   */
  async ensureProject(): Promise<Project | null> {
    const existing = await this.project()
    if (existing) return existing
    if (!this.index.ready) {
      this.showNotice('Still looking for a project note. Try again in a moment.')
      return null
    }
    if (this.creating) return this.creating
    this.creating = this.createProjectFlow()
    try {
      return await this.creating
    } finally {
      this.creating = null
    }
  }

  private async createProjectFlow(): Promise<Project | null> {
    const title = await promptText(this.app, "Name this vault's project", 'Project name', this.app.vault.getName())
    if (!title) return null
    const folder = this.settings.projectsFolder
    if (this.app.vault.getAbstractFileByPath(projectFilePath(title, folder))) {
      this.showNotice(`A note named "${title}" already exists there. Choose another name.`)
      return null
    }
    try {
      const project = await this.store.createProject(title, folder)
      this.refreshViews()
      return project
    } catch (e) {
      console.error('[PM] Could not create the project', e)
      this.showNotice('Could not create the project. Check console for details.')
      return null
    }
  }

  onunload(): void {
    this.notifier.stop()
    void this.localApi.stop()
  }

  /** Brings the local API in line with the settings. Mobile has nothing to run. */
  async syncLocalApi(): Promise<void> {
    if (!Platform.isDesktopApp) return
    if (!this.settings.localApiEnabled) {
      await this.localApi.stop()
      return
    }
    try {
      await this.localApi.restart()
    } catch (err: unknown) {
      console.error('[PM] local API failed to start', err)
      new Notice(`The local API could not listen on port ${this.settings.localApiPort}.`)
    }
  }

  /** Opens a task note in Obsidian's own editor, where the swap leaves it alone. */
  async openAsMarkdown(path: string): Promise<void> {
    this.markdownEscapes.add(path)
    await this.app.workspace.openLinkText(path, '', true)
  }

  private registerTaskNoteSwap(): void {
    const swap = (): void => this.swapTaskNotes()
    this.registerEvent(this.app.workspace.on('file-open', swap))
    this.registerEvent(this.app.workspace.on('layout-change', swap))
    this.registerEvent(this.app.workspace.on('active-leaf-change', swap))
  }

  /**
   * Sweeps every markdown leaf rather than the one being opened: a note opened into a
   * background tab reports no file-open at all, and one that replaces the active leaf
   * reports it while Obsidian is still building the view it is about to overwrite.
   */
  private swapTaskNotes(): void {
    if (this.settings.taskEditorSurface !== 'tab') return
    for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
      const view = leaf.view
      if (!(view instanceof MarkdownView)) continue
      const file = view.file
      if (!file || this.markdownEscapes.has(file.path)) continue
      if (this.app.metadataCache.getFileCache(file)?.frontmatter?.['pm-task'] !== true) continue
      void leaf.setViewState({ type: PM_TASK_VIEW_TYPE, state: { filePath: file.path } })
    }
  }

  async loadSettings(): Promise<void> {
    const raw = ((await this.loadData()) ?? {}) as Record<string, unknown>
    // Only the keys the plugin still has, so a setting an earlier version kept stops
    // being carried along. Cloned: a shallow merge would hand the live settings the very
    // arrays and objects DEFAULT_SETTINGS holds, and the first edit would write into them.
    const saved = Object.fromEntries(
      Object.entries(raw).filter(([key]) => key in DEFAULT_SETTINGS)
    ) as Partial<PMSettings>
    this.settings = Object.assign(structuredClone(DEFAULT_SETTINGS), saved)
    if (!saved.statuses?.length) this.settings.statuses = structuredClone(DEFAULT_SETTINGS.statuses)
    if (!saved.priorities?.length) this.settings.priorities = structuredClone(DEFAULT_SETTINGS.priorities)
    if (!Array.isArray(this.settings.collapsedTasks)) this.settings.collapsedTasks = []
    if (!this.settings.filter?.filter) this.settings.filter = structuredClone(DEFAULT_SETTINGS.filter)
    if (!this.settings.excludedFolders) this.settings.excludedFolders = []

    let migrated = Object.keys(raw).length !== Object.keys(saved).length

    for (const s of this.settings.statuses) {
      if (s.complete === undefined) {
        s.complete = s.id === 'done' || s.id === 'cancelled'
        migrated = true
      }
    }

    if (saved.localApiPort === undefined) {
      this.settings.localApiPort = localApiPortFor(this.app.vault.getName())
      migrated = true
    }

    if (!this.settings.localApiToken) {
      this.settings.localApiToken = generateToken()
      migrated = true
    }

    if (migrated) await this.saveSettings()
  }

  /** Archives every finished task, whatever the auto-archive window says. */
  private async archiveCompletedTasks(): Promise<void> {
    const project = await this.ensureProject()
    if (!project) return
    const plans = await this.autoArchiver.plan([project.filePath], true)
    const tasks = plans.reduce((sum, plan) => sum + plan.tasks, 0)
    if (!tasks) {
      this.showNotice('No completed tasks are ready to archive.')
      return
    }
    const ok = await confirmDialog(this.app, `Archive ${tasks} completed task(s)?`, 'Archive')
    if (!ok) return
    await this.autoArchiver.apply(plans)
    this.showNotice(`Archived ${tasks} task(s).`)
  }

  /** The startup work that reads the index: the first due and archive sweeps. */
  private async startupSweep(): Promise<void> {
    this.notifier.check()
    await this.autoArchiver.check()
  }

  applyCollapsedState(project: Project): void {
    const set = new Set(this.settings.collapsedTasks)
    for (const { task } of flattenTasks(project.tasks)) {
      task.collapsed = set.has(task.id)
    }
  }

  /** Call after toggling task.collapsed. */
  async persistCollapsedState(project: Project): Promise<void> {
    this.settings.collapsedTasks = flattenTasks(project.tasks)
      .filter((f) => f.task.collapsed)
      .map((f) => f.task.id)
    await this.saveSettings()
  }

  /** Resolves by id against the live tree, so it works when a view renders filtered clones. */
  async toggleTaskCollapsed(project: Project, taskId: string): Promise<void> {
    const task = findTask(project.tasks, taskId)
    if (!task) return
    task.collapsed = !task.collapsed
    await this.persistCollapsedState(project)
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings)
  }

  showNotice(msg: string, duration = 3000): void {
    new Notice(msg, duration)
  }

  /**
   * A settings edit changed a palette or how a view draws itself. Nothing in the vault
   * moved, so the store's own change events say nothing about it. Coalesced, because a
   * list editor persists on every keystroke.
   */
  refreshViews(): void {
    if (this.viewRefreshScheduled) return
    this.viewRefreshScheduled = true
    window.setTimeout(() => {
      this.viewRefreshScheduled = false
      for (const leaf of this.app.workspace.getLeavesOfType(PM_PROJECT_VIEW_TYPE)) {
        if (leaf.view instanceof ProjectView) leaf.view.redraw()
      }
    }, 0)
  }

  /**
   * Rewrites plain-text assignees and members as links to the notes of the same name, so
   * existing vaults get the graph edges without retyping every task. Names matching no note,
   * or more than one, are left alone and reported.
   */
  private async linkPeopleToNotes(): Promise<void> {
    const plain: string[] = []
    for (const ref of this.index.allTaskRefs()) plain.push(...ref.assignees)
    for (const ref of this.index.projectRefs()) plain.push(...ref.teamMembers)
    const names = dedupePeople(plain.filter((value) => !value.trim().startsWith('[[')))
    if (names.length === 0) {
      this.showNotice('Every assignee already links to a note.')
      return
    }

    const matches = matchPersonNotes(this.app, this.settings.peopleFolder, names)
    const linkable = matches.filter((match) => match.link !== null)
    const ambiguous = matches.filter((match) => match.ambiguous)
    if (linkable.length === 0) {
      this.showNotice(`No note matches any of the ${names.length} name(s) in use.`)
      return
    }

    const linkFor = new Map<string, string>()
    for (const match of linkable) if (match.link) linkFor.set(match.name.trim().toLowerCase(), match.link)
    const mapValue = (value: string): string =>
      value.trim().startsWith('[[') ? value : (linkFor.get(value.trim().toLowerCase()) ?? value)

    const preview = linkable
      .slice(0, 5)
      .map((match) => match.name)
      .join(', ')
    const extra = linkable.length > 5 ? `, and ${linkable.length - 5} more` : ''
    const warn = ambiguous.length ? ` ${ambiguous.length} name(s) match several notes and are left alone.` : ''
    const ok = await confirmDialog(
      this.app,
      `Link ${linkable.length} name(s) to their notes: ${preview}${extra}.${warn}`,
      'Link'
    )
    if (!ok) return

    let tasksChanged = 0
    let projectsChanged = 0
    const byProject = new Map<string, string[]>()
    for (const ref of this.index.allTaskRefs()) {
      if (!ref.projectPath) continue
      if (!ref.assignees.some((value) => linkFor.has(value.trim().toLowerCase()))) continue
      const bucket = byProject.get(ref.projectPath)
      if (bucket) bucket.push(ref.id)
      else byProject.set(ref.projectPath, [ref.id])
    }

    for (const [path, taskIds] of byProject) {
      const project = await this.store.loadProjectByPath(path)
      if (!project) continue
      await this.store.updateTasks(project, taskIds, (task) => ({ assignees: task.assignees.map(mapValue) }))
      tasksChanged += taskIds.length
    }

    for (const ref of this.index.projectRefs()) {
      if (!ref.teamMembers.some((value) => linkFor.has(value.trim().toLowerCase()))) continue
      const project = await this.store.loadProjectByPath(ref.path)
      if (!project) continue
      await this.store.updateProject(project, { teamMembers: project.teamMembers.map(mapValue) })
      projectsChanged++
    }

    this.refreshViews()
    this.showNotice(`Linked ${tasksChanged} task(s) and ${projectsChanged} project(s).`)
  }

  /** Opens the tasks filtered to one person, the way the assignee filter would. */
  private async showTasksForPerson(person: string): Promise<void> {
    const name = displayName(person)
    if (this.index.tasksForPerson(person).length === 0) {
      new Notice(`No tasks assigned to ${name}`)
      return
    }
    this.settings.filter = {
      filter: { ...makeDefaultFilter(), assignees: [person] },
      activeSavedViewId: null
    }
    await this.saveSettings()
    await this.router.openProject()
    for (const leaf of this.app.workspace.getLeavesOfType(PM_PROJECT_VIEW_TYPE)) {
      if (leaf.view instanceof ProjectView) leaf.view.redraw()
    }
  }

  /** Opens the editor for a new task, after picking a parent when creating a subtask. */
  private async createTask(mode: null | 'pick-parent'): Promise<void> {
    const project = await this.ensureProject()
    if (!project) return
    if (mode === 'pick-parent') {
      const flat = flattenTasks(project.tasks)
      if (!flat.length) {
        this.showNotice('No tasks yet. Create a task first.')
        return
      }
      openTaskPicker(
        this,
        flat.map((f) => f.task),
        (parentTask) => {
          this.openTaskModalForProject(project, parentTask.id)
        }
      )
    } else {
      this.openTaskModalForProject(project, null)
    }
  }

  private openTaskModalForProject(project: Project, parentId: string | null, defaults?: Partial<Task>): void {
    openTaskModal(this, project, {
      parentId,
      defaults,
      onSave: async () => {
        await this.store.saveProject(project)
        await this.router.openProject()
      }
    })
  }

  /** Open the task modal pre-filled from selected text. */
  private async createTaskFromText(text: string): Promise<void> {
    const trimmed = text.trim()
    if (!trimmed) return

    const newlineIdx = trimmed.indexOf('\n')
    const defaults: Partial<Task> =
      newlineIdx === -1
        ? { title: trimmed }
        : { title: trimmed.slice(0, newlineIdx).trim(), description: trimmed.slice(newlineIdx + 1).trim() }

    const project = await this.ensureProject()
    if (project) this.openTaskModalForProject(project, null, defaults)
  }

  private async importNotes(): Promise<void> {
    const project = await this.ensureProject()
    if (!project) return
    openImportModal(this, project, async () => {
      await this.router.openProject()
    })
  }
}
