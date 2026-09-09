import type { App, Plugin } from 'obsidian'
import { TFile } from 'obsidian'
import { beforeEach, describe, expect, it } from 'vitest'
import { makeFakeApp, type FakeVault } from '../../test/fakeVault'
import { DEFAULT_SETTINGS, type PMSettings } from '@system-commons/core'
import { VaultIndex } from './VaultIndex'

const expectDefined = <T>(value: T | null | undefined, message = 'expected value to be defined'): T => {
  if (value == null) throw new Error(message)
  return value
}

function projectNote(id: string, title: string, extra = ''): string {
  return `---\npm-project: true\nid: ${id}\ntitle: ${title}\n${extra}---\n\n# ${title}\n`
}

function taskNote(id: string, title: string, status = 'todo', due = ''): string {
  const dueLine = due ? `due: ${due}\n` : ''
  return `---\npm-task: true\nid: ${id}\ntitle: ${title}\nstatus: ${status}\n${dueLine}---\n\n`
}

/** Collects the registrations a Plugin would clean up, so events can be driven in tests. */
function fakePlugin(): Plugin {
  return { registerEvent: () => undefined } as unknown as Plugin
}

const ROADMAP = 'Projects/Roadmap/Roadmap.md'
const TASKS = 'Projects/Roadmap/_tasks'

describe('VaultIndex', () => {
  let vault: FakeVault
  let app: App
  let settings: PMSettings
  let index: VaultIndex

  beforeEach(() => {
    const fake = makeFakeApp({ liveMetadataCache: true })
    vault = fake.vault
    app = fake.app as unknown as App
    settings = { ...DEFAULT_SETTINGS }
    index = new VaultIndex(app, () => settings)
  })

  it('finds the project anywhere in the vault, not just under the projects folder', async () => {
    await vault.create('Work/Clients/Acme/Acme.md', projectNote('p2', 'Acme'))
    await vault.create('Inbox/note.md', '# just a note\n')
    index.build()

    expect(index.project?.path).toBe('Work/Clients/Acme/Acme.md')
    expect(index.ready).toBe(true)
  })

  it('has no project until a note carries pm-project', async () => {
    await vault.create('Inbox/note.md', '# just a note\n')
    index.build()

    expect(index.project).toBeNull()
    expect(index.taskRefs()).toEqual([])
    expect(index.counts()).toEqual({ total: 0, done: 0 })
  })

  it('prefers a project note under the projects folder, then the first by path', async () => {
    await vault.create('Archive/Old/Old.md', projectNote('p0', 'Old'))
    await vault.create(ROADMAP, projectNote('p1', 'Roadmap'))
    await vault.create('Work/Side/Side.md', projectNote('p2', 'Side'))
    index.build()

    expect(index.project?.path).toBe(ROADMAP)
    expect(index.extraProjectPaths()).toEqual(['Archive/Old/Old.md', 'Work/Side/Side.md'])

    settings = { ...settings, projectsFolder: 'Nowhere' }
    expect(index.project?.path).toBe('Archive/Old/Old.md')
  })

  it('ignores a project note living inside task storage', async () => {
    await vault.create(ROADMAP, projectNote('p1', 'Roadmap'))
    await vault.create(`${TASKS}/nested.md`, projectNote('p2', 'Nested'))
    index.build()

    expect(index.extraProjectPaths()).toEqual([])
  })

  it('skips excluded folders', async () => {
    await vault.create(ROADMAP, projectNote('p1', 'Roadmap'))
    await vault.create('Templates/Project template.md', projectNote('tpl', 'Template'))
    settings = { ...settings, excludedFolders: ['Templates'] }
    index.build()

    expect(index.project?.path).toBe(ROADMAP)
    expect(index.extraProjectPaths()).toEqual([])
  })

  it('owns the tasks in the project task folder, archived ones included', async () => {
    await vault.create(ROADMAP, projectNote('p1', 'Roadmap'))
    await vault.create(`${TASKS}/one.md`, taskNote('t1', 'One'))
    await vault.create(`${TASKS}/Archive/two.md`, taskNote('t2', 'Two'))
    await vault.create('Elsewhere/stray.md', taskNote('t3', 'Stray'))
    index.build()

    const refs = index.taskRefs()
    expect(refs.map((r) => r.id).sort()).toEqual(['t1', 't2'])
    expect(refs.find((r) => r.id === 't2')?.archived).toBe(true)
    expect(index.task('t3')).toBeNull()
  })

  it('owns a task indexed before its project note', async () => {
    await vault.create(`${TASKS}/one.md`, taskNote('t1', 'One'))
    await vault.create(ROADMAP, projectNote('p1', 'Roadmap'))
    index.build()

    expect(index.taskRefs().map((r) => r.id)).toEqual(['t1'])
  })

  it('counts against the settings palette and leaves archived tasks out', async () => {
    await vault.create(ROADMAP, projectNote('p1', 'Roadmap'))
    await vault.create(`${TASKS}/a.md`, taskNote('t1', 'A'))
    await vault.create(`${TASKS}/b.md`, taskNote('t2', 'B', 'done'))
    await vault.create(`${TASKS}/Archive/c.md`, taskNote('t3', 'C', 'done'))
    index.build()

    expect(index.counts()).toEqual({ total: 2, done: 1 })
  })

  it('reads only the usable names from a hand-edited team member list', async () => {
    const members = 'teamMembers:\n  - id: m1\n    name: John Doe\n  - Alice\n'
    await vault.create(ROADMAP, projectNote('p1', 'Roadmap', members))
    index.build()

    expect(expectDefined(index.project).teamMembers).toEqual(['Alice'])
  })

  it('counts a task once when a sync conflict leaves two notes with its id', async () => {
    await vault.create(ROADMAP, projectNote('p1', 'Roadmap'))
    await vault.create(`${TASKS}/a.md`, taskNote('t1', 'A'))
    await vault.create(`${TASKS}/a (conflict).md`, taskNote('t1', 'A'))
    index.build()

    expect(index.counts()).toEqual({ total: 1, done: 0 })
  })

  describe('dependencies', () => {
    beforeEach(async () => {
      await vault.create(ROADMAP, projectNote('p1', 'Roadmap'))
      await vault.create(`${TASKS}/one.md`, taskNote('t1', 'One'))
      await vault.create(
        `${TASKS}/two.md`,
        `---\npm-task: true\nid: t2\ntitle: Two\nstatus: todo\ndependencies:\n  - t1\n---\n`
      )
      index.build()
    })

    it('resolves a task id', () => {
      expect(index.task('t1')?.path).toBe(`${TASKS}/one.md`)
      expect(index.task('nope')).toBeNull()
    })

    it('reports what depends on a task', () => {
      expect(index.dependents('t1').map((r) => r.id)).toEqual(['t2'])
      expect(index.dependents('t2')).toEqual([])
    })

    it('sees a cycle', () => {
      // t2 already depends on t1, so making t1 depend on t2 closes the loop.
      expect(index.wouldCreateCycle('t1', 't2')).toBe(true)
      expect(index.wouldCreateCycle('t2', 't1')).toBe(false)
    })

    it('picks up a dependency added after the first read', async () => {
      index.register(fakePlugin())
      expect(index.dependentsMap().get('t2')).toBeUndefined()

      await vault.modify(
        expectDefined(vault.getAbstractFileByPath(`${TASKS}/one.md`) as TFile | null),
        `---\npm-task: true\nid: t1\ntitle: One\nstatus: todo\ndependencies:\n  - t2\n---\n`
      )

      expect(index.dependentsMap().get('t2')).toEqual(['t1'])
    })
  })

  describe('incremental maintenance', () => {
    beforeEach(async () => {
      await vault.create(ROADMAP, projectNote('p1', 'Roadmap'))
      index.build()
      index.register(fakePlugin())
    })

    it('notices a second project note created after the build', async () => {
      await vault.create('Later/Side quest/Side quest.md', projectNote('p2', 'Side quest'))
      expect(index.project?.path).toBe(ROADMAP)
      expect(index.extraProjectPaths()).toEqual(['Later/Side quest/Side quest.md'])
    })

    it('picks up a task created after the build', async () => {
      await vault.create(`${TASKS}/a.md`, taskNote('t1', 'A'))
      expect(index.taskRefs().map((r) => r.id)).toEqual(['t1'])
    })

    it('follows a status edit', async () => {
      const file = await vault.create(`${TASKS}/a.md`, taskNote('t1', 'A'))
      await vault.process(file, (c) => c.replace('status: todo', 'status: done'))
      expect(index.counts()).toEqual({ total: 1, done: 1 })
    })

    it('drops a note that stops being a project', async () => {
      const file = expectDefined(vault.getAbstractFileByPath(ROADMAP) as TFile | null)
      await vault.process(file, (c) => c.replace('pm-project: true', 'pm-project: false'))
      expect(index.project).toBeNull()
    })

    it('drops a deleted project', async () => {
      await vault.trashFile(expectDefined(vault.getAbstractFileByPath(ROADMAP)))
      expect(index.project).toBeNull()
    })

    it('follows a renamed project note and keeps its tasks', async () => {
      await vault.create(`${TASKS}/a.md`, taskNote('t1', 'A'))
      await vault.rename(expectDefined(vault.getAbstractFileByPath(ROADMAP)), 'Projects/Roadmap/Plan.md')

      expect(index.project?.path).toBe('Projects/Roadmap/Plan.md')
      expect(index.taskRefs().map((r) => r.id)).toEqual(['t1'])
      expect(index.counts()).toEqual({ total: 1, done: 0 })
    })

    it('follows a project moved with its folder', async () => {
      await vault.create(`${TASKS}/a.md`, taskNote('t1', 'A'))
      await vault.rename(expectDefined(vault.getAbstractFileByPath('Projects/Roadmap')), 'Projects/Plan')

      expect(index.project?.path).toBe('Projects/Plan/Roadmap.md')
      expect(expectDefined(index.task('t1')).path).toBe('Projects/Plan/_tasks/a.md')
    })

    it('marks a task archived when it moves into the archive folder', async () => {
      await vault.create(`${TASKS}/a.md`, taskNote('t1', 'A'))
      await vault.rename(expectDefined(vault.getAbstractFileByPath(`${TASKS}/a.md`)), `${TASKS}/Archive/a.md`)

      expect(expectDefined(index.task('t1')).archived).toBe(true)
    })

    it('reports changes to subscribers', async () => {
      let calls = 0
      index.onChange(() => calls++)
      await vault.create(`${TASKS}/a.md`, taskNote('t1', 'A'))
      expect(calls).toBe(1)
    })
  })
})

describe('VaultIndex people queries', () => {
  let vault: FakeVault
  let app: App
  let index: VaultIndex

  const assignedNote = (id: string, assignees: string): string =>
    `---\npm-task: true\nid: ${id}\ntitle: T${id}\nstatus: todo\nassignees: ${assignees}\n---\n\n`

  beforeEach(async () => {
    const fake = makeFakeApp({ liveMetadataCache: true })
    vault = fake.vault
    app = fake.app as unknown as App
    index = new VaultIndex(app, () => ({ ...DEFAULT_SETTINGS }))
    await vault.create('People/Jane Doe.md', '')
    await vault.create('Contacts/Jane Doe.md', '')
    await vault.create(ROADMAP, projectNote('p1', 'Roadmap'))
    await vault.create(`${TASKS}/a.md`, assignedNote('a', '["[[People/Jane Doe|Jane Doe]]"]'))
    await vault.create(`${TASKS}/b.md`, assignedNote('b', '["[[Contacts/Jane Doe|Jane Doe]]"]'))
    await vault.create(`${TASKS}/c.md`, assignedNote('c', '["Bob Plain"]'))
    index.build()
  })

  it('reads assignees onto the task ref', () => {
    expect(expectDefined(index.task('c')).assignees).toEqual(['Bob Plain'])
  })

  it('finds the tasks assigned to one person', () => {
    const found = index.tasksForPerson('[[People/Jane Doe]]')
    expect(found.map((ref) => ref.id)).toEqual(['a'])
  })

  it('keeps two people with the same name apart', () => {
    expect(index.tasksForPerson('[[Contacts/Jane Doe]]').map((ref) => ref.id)).toEqual(['b'])
  })

  it('finds a person named as plain text', () => {
    expect(index.tasksForPerson('Bob Plain').map((ref) => ref.id)).toEqual(['c'])
  })

  it('lists everyone once', () => {
    expect(index.allAssignees()).toHaveLength(3)
  })
})
