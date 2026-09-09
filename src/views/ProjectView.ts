import { ButtonComponent, ExtraButtonComponent, ItemView, Scope, WorkspaceLeaf } from 'obsidian'
import type PMPlugin from '../main'
import {
  type Project,
  type ViewMode,
  type FilterState,
  type SavedView,
  makeDefaultFilter,
  makeId,
  truncateTitle
} from '@system-commons/core'
import { personKeyer, ProjectContext } from '../store'
import { safeAsync, ViewSwitcher, ProjectHeader, renderGlyph } from '@system-commons/ui'
import type { SubView } from './SubView'
import { TableView } from './table/TableView'
import type { TableViewState } from './table/TableView'
import type { ExportViewState } from '../export/snapshot'
import { GanttView } from './gantt/GanttView'
import { KanbanView } from './KanbanView'
import { openTaskModal } from '../ui/ModalFactory'
import { renderNoProject } from './noProject'

export const PM_PROJECT_VIEW_TYPE = 'pm-project'

/** Carries nothing: the view always shows the vault's project. Older layouts' keys are ignored. */
interface ProjectViewState {
  [key: string]: unknown
}

export class ProjectView extends ItemView {
  plugin: PMPlugin
  project: Project | null = null
  context: ProjectContext | null = null
  currentView: ViewMode
  filter: FilterState = makeDefaultFilter()
  activeSavedViewId: string | null = null
  private subview: SubView | null = null
  private savedTableViewState: TableViewState | null = null
  private toolbarEl!: HTMLElement
  private headerEl!: HTMLElement
  private bodyEl!: HTMLElement
  private header: ProjectHeader | null = null
  private keyScope: Scope
  private pendingRefresh: Promise<void> | null = null
  private initialized = false
  /** Set once the default view mode is applied, so reloads don't undo a mode switch. */
  private defaultViewAppliedFor: string | null = null
  /**
   * The path the current load covers, claimed before it starts. Loading a project can
   * write to it, and that write comes back as an index change, so comparing against the
   * project already in hand would reload on top of a load that has not finished.
   */
  private loadedPath: string | null = null

  constructor(leaf: WorkspaceLeaf, plugin: PMPlugin) {
    super(leaf)
    this.plugin = plugin
    this.currentView = plugin.settings.defaultView
    this.navigation = false
    this.keyScope = new Scope(this.app.scope)
    this.scope = this.keyScope
  }

  getViewType(): string {
    return PM_PROJECT_VIEW_TYPE
  }
  getDisplayText(): string {
    return truncateTitle(this.project?.title ?? 'Project', 10)
  }

  /** The mode, filter and sort a reader of an export starts from. */
  exportState(): ExportViewState {
    const table = this.subview instanceof TableView ? this.subview.getViewState() : this.savedTableViewState
    return {
      mode: this.currentView,
      filter: { ...this.filter },
      sortKey: table?.sortKey ?? 'title',
      sortDir: table?.sortDir ?? 'asc'
    }
  }
  getIcon(): string {
    return 'chart-gantt'
  }

  async setState(state: ProjectViewState, result: unknown): Promise<void> {
    if (!this.project) await this.loadProject()
    await super.setState(state, result as import('obsidian').ViewStateResult)
  }

  getState(): ProjectViewState {
    return {}
  }

  onOpen(): Promise<void> {
    // Setup only. setState is the sole loader; this just guarantees the scaffold and
    // listeners exist for hosts that open the view without it.
    this.ensureInitialized()
    return Promise.resolve()
  }

  onClose(): Promise<void> {
    this.subview?.destroy?.()
    this.subview = null
    return Promise.resolve()
  }

  // Pane Relief and Hover Editor restore a deferred leaf via setState without ever
  // calling onOpen, so the one-time setup runs from whichever fires first.
  private ensureInitialized(): void {
    if (this.initialized) return
    this.initialized = true

    this.containerEl.addClass('pm-view')
    const root = this.contentEl
    root.empty()
    root.addClass('pm-root')
    this.toolbarEl = root.createDiv('pm-toolbar')
    this.headerEl = root.createDiv('pm-project-header-mount')
    this.bodyEl = root.createDiv('pm-content')

    this.register(
      this.plugin.store.onProjectChanged((path) => {
        if (path === this.project?.filePath) this.redraw()
      })
    )
    // The project appears once the index has caught up with the vault, and goes away
    // when its note does.
    this.register(
      this.plugin.index.onChange(() => {
        if ((this.plugin.projectRef()?.path ?? null) !== this.loadedPath) void this.loadProject()
      })
    )
  }

  /**
   * Something outside the DOM changed: the project, or a setting that decides how it is
   * drawn. The store keeps one instance per file, so the project is already current and
   * only the DOM needs catching up.
   */
  redraw(): void {
    if (!this.context) return
    // A settings edit may have changed a palette, which the context has resolved and kept.
    this.context.invalidate()
    // Rebuilding the chrome would drop the caret out of the title or search box.
    const focused = activeDocument.activeElement
    if (!this.toolbarEl.contains(focused) && !this.headerEl.contains(focused)) {
      this.renderProjectToolbar()
      this.renderProjectHeader()
    }
    void this.refreshProject()
  }

  private async loadProject(): Promise<void> {
    this.ensureInitialized()
    this.loadedPath = this.plugin.projectRef()?.path ?? null
    const project = await this.plugin.project()
    this.show(project)
  }

  private show(project: Project | null): void {
    this.project = project
    this.context = project ? new ProjectContext(project, this.plugin.store) : null
    if (!project || !this.context) {
      this.renderEmpty()
      return
    }
    this.plugin.applyCollapsedState(project)
    if (this.defaultViewAppliedFor !== project.filePath) {
      this.defaultViewAppliedFor = project.filePath
      this.currentView = this.context.config.defaultView
    }
    this.loadFilterFromSettings()
    ;(this.leaf as WorkspaceLeaf & { updateHeader?: () => void }).updateHeader?.()
    this.renderProjectToolbar()
    this.renderProjectHeader()
    this.renderCurrentView()
  }

  private loadFilterFromSettings(): void {
    const saved = this.plugin.settings.filter
    this.filter = saved.filter
    this.activeSavedViewId = saved.activeSavedViewId
  }

  private async persistFilter(): Promise<void> {
    this.plugin.settings.filter = { filter: this.filter, activeSavedViewId: this.activeSavedViewId }
    await this.plugin.saveSettings()
  }

  private savedViews(): SavedView[] {
    return this.project?.savedViews ?? []
  }

  private async persistSavedViews(views: SavedView[]): Promise<void> {
    if (!this.project) return
    this.project.savedViews = views
    await this.plugin.store.saveProject(this.project)
  }

  private renderEmpty(): void {
    this.subview?.destroy?.()
    this.subview = null
    this.toolbarEl.empty()
    this.headerEl.empty()
    this.header = null
    this.bodyEl.empty()
    ;(this.leaf as WorkspaceLeaf & { updateHeader?: () => void }).updateHeader?.()
    renderNoProject(this.bodyEl, this.plugin, (project) => {
      this.loadedPath = project.filePath
      this.show(project)
    })
  }

  private renderProjectHeader(): void {
    if (!this.context) return
    this.headerEl.empty()
    const config = this.context.config
    this.header = new ProjectHeader(this.headerEl, {
      tasks: this.context.tasks(),
      savedViews: this.savedViews(),
      statuses: config.statuses,
      priorities: config.priorities,
      priorityIcons: config.priorityIcons,
      filter: this.filter,
      personKeyOf: personKeyer(this.plugin.app),
      activeSavedViewId: this.activeSavedViewId,
      onFilterChange: () => this.handleFilterMutation(),
      onClearFilter: () => this.handleClearFilter(),
      onSavedViewSelect: (id) => this.handleSavedViewSelect(id),
      onSavedViewSave: (name) => this.handleSavedViewSave(name),
      onSavedViewUpdate: (id) => this.handleSavedViewUpdate(id),
      onSavedViewDelete: (id) => this.handleSavedViewDelete(id)
    })
  }

  private handleFilterMutation(): void {
    if (this.activeSavedViewId !== null) {
      this.activeSavedViewId = null
      this.header?.setActiveSavedViewId(null)
    } else {
      this.header?.notifyMutation()
    }
    void this.persistFilter()
    this.refreshSubview()
  }

  private handleClearFilter(): void {
    Object.assign(this.filter, makeDefaultFilter())
    this.activeSavedViewId = null
    void this.persistFilter()
    this.header?.refresh()
    this.refreshSubview()
  }

  private handleSavedViewSelect(id: string | null): void {
    if (!this.context) return
    if (id === null) {
      Object.assign(this.filter, makeDefaultFilter())
      this.activeSavedViewId = null
    } else {
      const sv = this.savedViews().find((v) => v.id === id)
      if (!sv) return
      Object.assign(this.filter, sv.filter)
      this.activeSavedViewId = sv.id
      if (sv.viewMode && sv.viewMode !== this.currentView) {
        this.currentView = sv.viewMode
        this.renderProjectToolbar()
      }
      if (this.subview instanceof TableView) {
        this.savedTableViewState = { sortKey: sv.sortKey as TableViewState['sortKey'], sortDir: sv.sortDir }
      }
    }
    void this.persistFilter()
    this.header?.refresh()
    this.renderCurrentView()
  }

  private async handleSavedViewSave(name: string): Promise<void> {
    if (!this.context) return
    const sortMeta =
      this.subview instanceof TableView ? this.subview.getViewState() : { sortKey: 'status', sortDir: 'asc' as const }
    const sv: SavedView = {
      id: makeId(),
      name,
      filter: { ...this.filter },
      sortKey: sortMeta.sortKey,
      sortDir: sortMeta.sortDir,
      viewMode: this.currentView
    }
    this.activeSavedViewId = sv.id
    await this.persistSavedViews([...this.savedViews(), sv])
    void this.persistFilter()
    this.renderProjectHeader()
  }

  private async handleSavedViewUpdate(id: string): Promise<void> {
    const views = this.savedViews()
    const sv = views.find((v) => v.id === id)
    if (!sv) return
    sv.filter = { ...this.filter }
    sv.viewMode = this.currentView
    if (this.subview instanceof TableView) {
      const ts = this.subview.getViewState()
      sv.sortKey = ts.sortKey
      sv.sortDir = ts.sortDir
    }
    await this.persistSavedViews(views)
    this.header?.refresh()
  }

  private async handleSavedViewDelete(id: string): Promise<void> {
    if (this.activeSavedViewId === id) this.activeSavedViewId = null
    await this.persistSavedViews(this.savedViews().filter((v) => v.id !== id))
    void this.persistFilter()
    this.renderProjectHeader()
  }

  private refreshSubview(): void {
    this.subview?.render()
  }

  private renderProjectToolbar(): void {
    const project = this.project
    if (!project) return
    this.toolbarEl.empty()

    const left = this.toolbarEl.createDiv('pm-toolbar-left')
    const openOverview = safeAsync(() => this.plugin.router.openProjectOverview())
    const iconEl = left.createSpan({
      cls: 'pm-toolbar-icon',
      attr: { 'aria-label': 'Open project page', role: 'button', tabindex: '0' }
    })
    renderGlyph(iconEl, { icon: project.icon, color: project.color })
    iconEl.addEventListener('click', openOverview)

    const titleEl = left.createEl('h2', { text: project.title, cls: 'pm-toolbar-title pm-toolbar-title--link' })
    titleEl.setAttrs({ 'aria-label': 'Open project page', role: 'button', tabindex: '0' })
    titleEl.addEventListener('click', openOverview)

    new ViewSwitcher<ViewMode>(this.toolbarEl, {
      options: [
        { id: 'table', icon: 'table', label: 'Table' },
        { id: 'gantt', icon: 'git-fork', label: 'Gantt' },
        { id: 'kanban', icon: 'layout-dashboard', label: 'Board' }
      ],
      active: this.currentView,
      onChange: (mode) => {
        this.currentView = mode
        this.renderCurrentView()
      }
    })

    const right = this.toolbarEl.createDiv('pm-toolbar-right')
    new ButtonComponent(right)
      .setButtonText('+ add task')
      .setCta()
      .onClick(() => this.addTask())

    if (this.currentView === 'gantt') {
      new ButtonComponent(right).setButtonText('+ milestone').onClick(() => this.addTask({ type: 'milestone' }))
    }

    new ExtraButtonComponent(right)
      .setIcon('settings')
      .setTooltip('Project settings')
      .onClick(safeAsync(() => this.plugin.router.openProjectEdit()))
  }

  private addTask(defaults?: Parameters<typeof openTaskModal>[2]['defaults']): void {
    if (!this.project) return
    openTaskModal(this.plugin, this.project, {
      defaults,
      onSave: async () => {
        await this.refreshProject()
      }
    })
  }

  private renderCurrentView(): void {
    const context = this.context
    if (!context) return

    let savedGanttScroll: ReturnType<GanttView['getScrollPosition']> | null = null
    let savedGanttLabelWidth: number | null = null
    if (this.currentView === 'gantt' && this.subview instanceof GanttView) {
      savedGanttScroll = this.subview.getScrollPosition()
      savedGanttLabelWidth = this.subview.getLabelWidth()
    }

    let savedTableScrollTop: number | null = null
    if (this.subview instanceof TableView) {
      this.savedTableViewState = this.subview.getViewState()
      if (this.currentView === 'table') {
        savedTableScrollTop = this.subview.getScrollTop()
      }
    } else if (this.currentView !== 'table') {
      this.savedTableViewState = null
    }

    this.subview?.destroy?.()
    this.bodyEl.empty()
    this.subview = null

    switch (this.currentView) {
      case 'table': {
        const table = new TableView(
          this.bodyEl,
          context,
          this.plugin,
          () => this.refreshProject(),
          this.filter,
          this.keyScope,
          this.savedTableViewState ?? undefined
        )
        if (savedTableScrollTop !== null) table.setPendingScrollTop(savedTableScrollTop)
        this.subview = table
        break
      }
      case 'gantt': {
        const gantt = new GanttView(
          this.bodyEl,
          context,
          this.plugin,
          () => this.refreshProject(),
          this.filter,
          this.keyScope
        )
        if (savedGanttScroll) gantt.setPendingScroll(savedGanttScroll)
        if (savedGanttLabelWidth !== null) gantt.setLabelWidth(savedGanttLabelWidth)
        this.subview = gantt
        break
      }
      case 'kanban':
        this.subview = new KanbanView(this.bodyEl, context, this.plugin, () => this.refreshProject(), this.filter)
        break
    }
    this.bodyEl.toggleClass('pm-content--kanban', this.currentView === 'kanban')
    this.subview?.render()
  }

  /**
   * Re-render from the project in memory. Coalesced, so a mutation reporting back
   * through both its own callback and the store's change event paints once.
   */
  refreshProject(): Promise<void> {
    if (this.pendingRefresh) return this.pendingRefresh
    this.pendingRefresh = new Promise((resolve) => {
      window.setTimeout(() => {
        this.pendingRefresh = null
        if (this.context) {
          if (this.subview?.refresh) this.subview.refresh()
          else if (this.subview) this.subview.render()
          else this.renderCurrentView()
        }
        resolve()
      }, 0)
    })
    return this.pendingRefresh
  }
}
