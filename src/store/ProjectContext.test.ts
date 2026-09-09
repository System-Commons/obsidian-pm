import type { App } from 'obsidian'
import { beforeEach, describe, expect, it } from 'vitest'
import { makeFakeApp } from '../../test/fakeVault'
import { DEFAULT_SETTINGS, makeTask, type PMSettings, type Project } from '@system-commons/core'
import { ProjectStore } from './ProjectStore'
import { ProjectContext } from './ProjectContext'

describe('ProjectContext', () => {
  let settings: PMSettings
  let store: ProjectStore
  let project: Project

  beforeEach(async () => {
    settings = structuredClone(DEFAULT_SETTINGS)
    const { app } = makeFakeApp()
    store = new ProjectStore(app as unknown as App, () => settings)
    project = await store.createProject('Alpha', 'Projects')
    await store.insertTask(project, makeTask({ title: 'Alpha one' }))
  })

  it('reads exactly like the project', () => {
    const ctx = new ProjectContext(project, store)
    expect(ctx.tasks()).toBe(project.tasks)
    expect(ctx.taskById(project.tasks[0].id)).toBe(project.tasks[0])
    expect(ctx.taskById('nope')).toBeNull()
    expect(ctx.config).toEqual(store.configFor(project))
  })

  it('keeps the resolved config until it is invalidated', () => {
    const ctx = new ProjectContext(project, store)
    const before = ctx.config
    settings.statuses = [
      ...settings.statuses,
      { id: 'shipped', label: 'Shipped', color: '#0a0', icon: '', complete: true }
    ]
    expect(ctx.config).toBe(before)
    ctx.invalidate()
    expect(ctx.config.statuses.some((s) => s.id === 'shipped')).toBe(true)
  })
})
