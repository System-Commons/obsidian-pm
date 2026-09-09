import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PRIORITIES,
  DEFAULT_SETTINGS,
  DEFAULT_STATUSES,
  makeProject,
  makeTask,
  type CustomFieldDef,
  type PMSettings,
  type PriorityConfig,
  type StatusConfig
} from '../types'
import { mergeById, resolveProjectConfig } from './ProjectConfig'

const CUSTOM_STATUSES: StatusConfig[] = [
  { id: 'idea', label: 'Idea', color: '#888', icon: '', complete: false },
  { id: 'shipped', label: 'Shipped', color: '#0a0', icon: '', complete: true }
]

const CUSTOM_PRIORITIES: PriorityConfig[] = [
  { id: 'urgent', label: 'Urgent', color: '#f00', icon: '' },
  { id: 'later', label: 'Later', color: '#888', icon: '' }
]

const FIELD: CustomFieldDef = { id: 'cf-budget', name: 'Budget', type: 'number' }

function settingsWith(patch: Partial<PMSettings>): PMSettings {
  return { ...DEFAULT_SETTINGS, ...patch }
}

describe('resolveProjectConfig', () => {
  it('reads everything from the settings', () => {
    const resolved = resolveProjectConfig(makeProject('P', 'Projects/P/P.md'), DEFAULT_SETTINGS)
    expect(resolved.statuses).toEqual(DEFAULT_STATUSES)
    expect(resolved.priorities).toEqual(DEFAULT_PRIORITIES)
    expect(resolved.customFields).toEqual([])
    expect(resolved.defaultView).toBe(DEFAULT_SETTINGS.defaultView)
    expect(resolved.priorityIcons).toBe(DEFAULT_SETTINGS.priorityIcons)
    expect(resolved.autoSchedule).toBe(DEFAULT_SETTINGS.autoSchedule)
    expect(resolved.pullForwardOnEarlyFinish).toBe(DEFAULT_SETTINGS.pullForwardOnEarlyFinish)
    expect(resolved.autoArchiveDays).toBe(DEFAULT_SETTINGS.autoArchiveDays)
    expect(resolved.showSubtreeConnections).toBe(DEFAULT_SETTINGS.showSubtreeConnections)
    expect(resolved.lineBorders).toBe(DEFAULT_SETTINGS.lineBorders)
    expect(resolved.kanbanShowSubtasks).toBe(DEFAULT_SETTINGS.kanbanShowSubtasks)
    expect(resolved.kanbanShowDescriptionPreview).toBe(DEFAULT_SETTINGS.kanbanShowDescriptionPreview)
  })

  it('follows the palettes and fields the settings define', () => {
    const resolved = resolveProjectConfig(
      makeProject('P', 'Projects/P/P.md'),
      settingsWith({ statuses: CUSTOM_STATUSES, priorities: CUSTOM_PRIORITIES, customFields: [FIELD] })
    )
    expect(resolved.statuses.map((s) => s.id)).toEqual(['idea', 'shipped'])
    expect(resolved.statuses[1].complete).toBe(true)
    expect(resolved.priorities.map((p) => p.id)).toEqual(['urgent', 'later'])
    expect(resolved.customFields).toEqual([FIELD])
  })

  it('synthesizes a placeholder for in-use values the settings no longer define', () => {
    const project = makeProject('P', 'Projects/P/P.md')
    const parent = makeTask({ status: 'todo' })
    parent.subtasks.push(makeTask({ status: 'mystery', priority: 'whenever' }))
    project.tasks.push(parent)
    const resolved = resolveProjectConfig(project, DEFAULT_SETTINGS)
    expect(resolved.statuses.map((s) => s.id)).toEqual([...DEFAULT_STATUSES.map((s) => s.id), 'mystery'])
    expect(resolved.statuses.find((s) => s.id === 'mystery')).toEqual({
      id: 'mystery',
      label: 'mystery',
      color: '#8a94a0',
      icon: '',
      complete: false
    })
    expect(resolved.priorities.find((p) => p.id === 'whenever')).toEqual({
      id: 'whenever',
      label: 'whenever',
      color: '#8a94a0',
      icon: ''
    })
  })

  it('hands back the settings lists untouched when every value in use is known', () => {
    const project = makeProject('P', 'Projects/P/P.md')
    project.tasks.push(makeTask({ status: 'done', priority: 'high' }))
    const resolved = resolveProjectConfig(project, DEFAULT_SETTINGS)
    expect(resolved.statuses).toBe(DEFAULT_SETTINGS.statuses)
    expect(resolved.priorities).toBe(DEFAULT_SETTINGS.priorities)
  })
})

describe('mergeById', () => {
  it('lets later lists replace an entry without moving it', () => {
    const renamed = { ...FIELD, name: 'Cost' }
    const other: CustomFieldDef = { id: 'cf-owner', name: 'Owner', type: 'person' }
    expect(mergeById([[FIELD, other], [renamed]])).toEqual([renamed, other])
  })
})
