import { ButtonComponent, ItemView, WorkspaceLeaf } from 'obsidian'
import type PMPlugin from '../main'
import { type Project, type ProjectPatch, collectAllAssignees, truncateTitle } from '@system-commons/core'
import { safeAsync, renderPropRow, renderGlyph, renderIconControl, renderInputControl } from '@system-commons/ui'
import { confirmDialog } from '../ui/ModalFactory'
import { renderPersonPicker } from '../ui/PersonPicker'
import { renderNoProject } from './noProject'

export const PM_PROJECT_EDIT_VIEW_TYPE = 'pm-project-edit'

/** Carries nothing: the view always edits the vault's project. */
export interface ProjectEditState {
  [key: string]: unknown
}

export class ProjectEditView extends ItemView {
  plugin: PMPlugin
  private project: Project | null = null
  private container!: HTMLElement

  constructor(leaf: WorkspaceLeaf, plugin: PMPlugin) {
    super(leaf)
    this.plugin = plugin
    this.navigation = false
  }

  getViewType(): string {
    return PM_PROJECT_EDIT_VIEW_TYPE
  }
  getDisplayText(): string {
    return truncateTitle(this.project?.title ?? 'Project', 10)
  }
  getIcon(): string {
    return 'settings'
  }

  async setState(state: ProjectEditState, result: unknown): Promise<void> {
    if (!this.project) await this.loadProject()
    await super.setState(state, result as import('obsidian').ViewStateResult)
  }

  getState(): ProjectEditState {
    return {}
  }

  onOpen(): Promise<void> {
    this.containerEl.addClass('pm-view')
    this.contentEl.empty()
    this.contentEl.addClass('pm-root')
    this.container = this.contentEl.createDiv('pm-edit')
    this.register(
      this.plugin.index.onChange(() => {
        if ((this.plugin.projectRef()?.path ?? null) !== (this.project?.filePath ?? null)) void this.loadProject()
      })
    )
    return Promise.resolve()
  }

  onClose(): Promise<void> {
    this.contentEl.empty()
    return Promise.resolve()
  }

  private async loadProject(): Promise<void> {
    this.project = await this.plugin.project()
    if (!this.project) {
      this.container.empty()
      renderNoProject(
        this.container,
        this.plugin,
        safeAsync(() => this.loadProject())
      )
      return
    }
    await this.plugin.store.loadProjectBody(this.project)
    ;(this.leaf as WorkspaceLeaf & { updateHeader?: () => void }).updateHeader?.()
    this.render()
  }

  private readonly save = safeAsync(async (patch: ProjectPatch) => {
    if (this.project) await this.plugin.store.updateProject(this.project, patch)
  })

  private section(title: string, hint = ''): HTMLElement {
    const section = this.container.createDiv('pm-edit-section')
    section.createDiv({ cls: 'pm-section-label', text: title })
    if (hint) section.createDiv({ cls: 'pm-modal-hint', text: hint })
    return section
  }

  render(): void {
    const project = this.project
    if (!project) return
    this.container.empty()

    this.renderHeader(project)
    this.renderGeneral(project)
    this.renderMembers(project)
    this.renderDangerZone(project)
  }

  private renderHeader(project: Project): void {
    const header = this.container.createDiv('pm-edit-header')
    const tile = header.createDiv({ cls: 'pm-overview-icon' })
    tile.style.setProperty('--pm-overview-tint', project.color)
    renderGlyph(tile, { icon: project.icon, color: project.color })
    const identity = header.createDiv('pm-overview-identity')
    identity.createDiv({ cls: 'pm-overview-title', text: project.title })
    identity.createDiv({
      cls: 'pm-overview-subline',
      text: 'Project settings. Statuses, priorities, custom fields and views are in the plugin settings.'
    })
    new ButtonComponent(header)
      .setButtonText('Done')
      .setCta()
      .onClick(safeAsync(() => this.plugin.router.openProjectOverview(this.leaf)))
  }

  private renderGeneral(project: Project): void {
    const section = this.section('General')
    const props = section.createDiv('pm-edit-props')

    renderPropRow(props, 'Name', () => {
      const cell = createDiv('pm-prop-value')
      renderInputControl({
        container: cell,
        value: project.title,
        placeholder: 'Project name',
        onChange: (value) => {
          const title = value.trim()
          if (!title || title === project.title) return
          this.save({ title })
          this.render()
        }
      })
      return cell
    })

    renderPropRow(props, 'Icon', () => {
      const cell = createDiv('pm-prop-value')
      renderIconControl({
        container: cell,
        value: project.icon,
        color: project.color,
        onChange: (icon) => {
          this.save({ icon })
          this.render()
        }
      })
      return cell
    })

    renderPropRow(props, 'Color', () => {
      const cell = createDiv('pm-prop-value')
      const picker = cell.createEl('input', { type: 'color', cls: 'pm-color-custom' })
      picker.value = project.color
      picker.title = 'Project color'
      picker.addEventListener('change', () => {
        this.save({ color: picker.value })
        this.render()
      })
      return cell
    })

    const desc = section.createDiv('pm-edit-block')
    desc.createEl('label', { text: 'Description', cls: 'pm-label' })
    const area = desc.createEl('textarea', { cls: 'pm-input pm-edit-desc' })
    area.placeholder = 'What is this project about?'
    area.value = project.description
    area.addEventListener('change', () => {
      this.save({ description: area.value })
    })
  }

  private renderMembers(project: Project): void {
    const section = this.section('Team', 'Who works on this project. Offered as assignees everywhere.')
    renderPersonPicker({
      container: section.createDiv('pm-prop-value'),
      plugin: this.plugin,
      sourcePath: project.filePath,
      extra: () => collectAllAssignees(project.tasks),
      addLabel: 'Add member',
      selected: () => project.teamMembers,
      add: (value) => this.save({ teamMembers: [...project.teamMembers, value] }),
      remove: (value) => this.save({ teamMembers: project.teamMembers.filter((name) => name !== value) })
    })
  }

  private renderDangerZone(project: Project): void {
    const section = this.container.createDiv('pm-edit-danger')
    const text = section.createDiv('pm-edit-danger-text')
    text.createDiv({ cls: 'pm-edit-danger-title', text: 'Delete project' })
    text.createDiv({
      cls: 'pm-modal-hint',
      text: 'Removes the project note and its task folder. The vault then offers to create a new project.'
    })
    new ButtonComponent(section)
      .setButtonText('Delete project')
      .setDestructive()
      .onClick(
        safeAsync(async () => {
          const ok = await confirmDialog(this.app, `Delete "${project.title}" and every task in it?`)
          if (!ok) return
          await this.plugin.store.deleteProject(project)
          this.leaf.detach()
        })
      )
  }
}
