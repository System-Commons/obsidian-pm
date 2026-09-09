import type { App, TAbstractFile } from 'obsidian'
import { TFolder } from 'obsidian'
import { describe, expect, it } from 'vitest'
import { makeFakeApp } from '../../test/fakeVault'
import { keepProjectStorageWithNote, projectFolderOf, projectTaskFolder } from './vaultFs'

function at(app: App, path: string): TAbstractFile {
  const file = app.vault.getAbstractFileByPath(path)
  if (!file) throw new Error(`no file at `)
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

describe('projectTaskFolder', () => {
  it('puts task storage beside the note, wherever it sits', () => {
    expect(projectTaskFolder('Projects/Roadmap/Roadmap.md')).toBe('Projects/Roadmap/_tasks')
    expect(projectTaskFolder('Projects/Roadmap/Plan.md')).toBe('Projects/Roadmap/_tasks')
    expect(projectTaskFolder('Roadmap/Roadmap.md')).toBe('Roadmap/_tasks')
  })

  it('uses a vault-root folder for a note at the vault root', () => {
    expect(projectTaskFolder('Roadmap.md')).toBe('_tasks')
  })
})

describe('projectFolderOf', () => {
  it('is the folder named after the note', async () => {
    const app = await vaultWith(['Projects/Roadmap/Roadmap.md'])
    expect(projectFolderOf(app, 'Projects/Roadmap/Roadmap.md')).toBe('Projects/Roadmap')
  })

  it('is the folder a renamed note kept its storage in', async () => {
    const app = await vaultWith(['Projects/Roadmap/Plan.md', 'Projects/Roadmap/_tasks/'])
    expect(projectFolderOf(app, 'Projects/Roadmap/Plan.md')).toBe('Projects/Roadmap')
  })

  it('is null for a note sitting in a folder another note owns, or at the vault root', async () => {
    const app = await vaultWith([
      'Projects/Roadmap/Roadmap.md',
      'Projects/Roadmap/_tasks/',
      'Projects/Roadmap/Loose.md'
    ])
    expect(projectFolderOf(app, 'Projects/Roadmap/Loose.md')).toBeNull()
    expect(projectFolderOf(app, 'Roadmap.md')).toBeNull()
  })
})

describe('keepProjectStorageWithNote', () => {
  const noop = (): void => undefined

  it('renames the folder with a note renamed inside the folder it owns', async () => {
    const app = await vaultWith(['Projects/Alpha/Alpha.md', 'Projects/Alpha/_tasks/card.md'])
    await app.vault.rename(at(app, 'Projects/Alpha/Alpha.md'), 'Projects/Alpha/Beta.md')

    const landed = await keepProjectStorageWithNote(app, 'Projects/Alpha/Alpha.md', 'Projects/Alpha/Beta.md', noop)

    expect(landed).toBe('Projects/Beta/Beta.md')
    expect(app.vault.getAbstractFileByPath('Projects/Beta/_tasks')).toBeInstanceOf(TFolder)
  })

  it('moves the task folder beside a note that left its folder', async () => {
    const app = await vaultWith(['Projects/Alpha/Alpha.md', 'Projects/Alpha/_tasks/card.md'])
    await app.vault.rename(at(app, 'Projects/Alpha/Alpha.md'), 'Work/Alpha.md')

    const landed = await keepProjectStorageWithNote(app, 'Projects/Alpha/Alpha.md', 'Work/Alpha.md', noop)

    expect(landed).toBe('Work/Alpha.md')
    expect(app.vault.getAbstractFileByPath('Work/_tasks/card.md')).not.toBeNull()
    expect(app.vault.getAbstractFileByPath('Projects/Alpha/_tasks')).toBeNull()
  })

  it('leaves storage alone for a note renamed inside a folder it never owned', async () => {
    const app = await vaultWith(['Projects/Alpha/Loose.md', 'Projects/Alpha/_tasks/'])
    await app.vault.rename(at(app, 'Projects/Alpha/Loose.md'), 'Projects/Alpha/Renamed.md')

    const landed = await keepProjectStorageWithNote(app, 'Projects/Alpha/Loose.md', 'Projects/Alpha/Renamed.md', noop)

    expect(landed).toBe('Projects/Alpha/Renamed.md')
    expect(app.vault.getAbstractFileByPath('Projects/Alpha/_tasks')).toBeInstanceOf(TFolder)
  })
})
