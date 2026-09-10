import type { App, TAbstractFile } from 'obsidian'
import { TFolder } from 'obsidian'
import { describe, expect, it } from 'vitest'
import { makeFakeApp } from '../../test/fakeVault'
import { keepProjectStorageWithNote, projectFilePath, projectTaskFolder } from './vaultFs'

function at(app: App, path: string): TAbstractFile {
  const file = app.vault.getAbstractFileByPath(path)
  if (!file) throw new Error(`no file at ${path}`)
  return file
}

async function vaultWith(paths: string[]): Promise<App> {
  const { app, vault } = makeFakeApp()
  for (const path of paths) {
    if (path.endsWith('/')) await vault.createFolder(path.slice(0, -1))
    else await vault.create(path, '')
  }
  return app as unknown as App
}

describe('projectFilePath', () => {
  it('puts the note directly in the project folder', () => {
    expect(projectFilePath('Acme', 'Project')).toBe('Project/Acme.md')
    expect(projectFilePath('Acme: launch', 'Project')).toBe('Project/Acme- launch.md')
  })

  it('uses the vault root when no folder is set', () => {
    expect(projectFilePath('Acme', '')).toBe('Acme.md')
  })
})

describe('projectTaskFolder', () => {
  it('puts task storage beside the note, wherever it sits', () => {
    expect(projectTaskFolder('Project/Acme.md')).toBe('Project/_tasks')
    expect(projectTaskFolder('Projects/Roadmap/Roadmap.md')).toBe('Projects/Roadmap/_tasks')
  })

  it('uses a vault-root folder for a note at the vault root', () => {
    expect(projectTaskFolder('Acme.md')).toBe('_tasks')
  })
})

describe('keepProjectStorageWithNote', () => {
  const noop = (): void => undefined

  it('leaves storage where it is for a note renamed in place', async () => {
    const app = await vaultWith(['Project/Alpha.md', 'Project/_tasks/card.md'])
    await app.vault.rename(at(app, 'Project/Alpha.md'), 'Project/Beta.md')

    const landed = await keepProjectStorageWithNote(app, 'Project/Alpha.md', 'Project/Beta.md', noop)

    expect(landed).toBe('Project/Beta.md')
    expect(app.vault.getAbstractFileByPath('Project/_tasks')).toBeInstanceOf(TFolder)
  })

  it('moves the task folder beside a note that left its folder', async () => {
    const app = await vaultWith(['Project/Alpha.md', 'Project/_tasks/card.md'])
    await app.vault.rename(at(app, 'Project/Alpha.md'), 'Work/Alpha.md')

    const landed = await keepProjectStorageWithNote(app, 'Project/Alpha.md', 'Work/Alpha.md', noop)

    expect(landed).toBe('Work/Alpha.md')
    expect(app.vault.getAbstractFileByPath('Work/_tasks/card.md')).not.toBeNull()
    expect(app.vault.getAbstractFileByPath('Project/_tasks')).toBeNull()
  })

  it('leaves both folders alone when the destination already holds task storage', async () => {
    const app = await vaultWith(['Project/Alpha.md', 'Project/_tasks/card.md', 'Work/_tasks/other.md'])
    await app.vault.rename(at(app, 'Project/Alpha.md'), 'Work/Alpha.md')

    await keepProjectStorageWithNote(app, 'Project/Alpha.md', 'Work/Alpha.md', noop)

    expect(app.vault.getAbstractFileByPath('Project/_tasks/card.md')).not.toBeNull()
    expect(app.vault.getAbstractFileByPath('Work/_tasks/other.md')).not.toBeNull()
  })
})
