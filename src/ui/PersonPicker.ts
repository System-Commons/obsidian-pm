import type PMPlugin from '../main'
import { createPersonLink, personCandidates, personKeyer, type PersonCandidate } from '../store'
import { renderMultiSelect } from '@system-commons/ui'
import { dedupePeople, displayName } from '@system-commons/core'

export interface PeopleSource {
  /** Offered before the user types. */
  known: () => string[]
  /** Person notes matching what the user typed. */
  search: (query: string) => PersonCandidate[]
}

/**
 * The people every picker offers: whatever the caller already knows about (the team, the
 * assignees in use), one entry per person, then the vault's person notes once the user types.
 */
export function peopleSource(plugin: PMPlugin, sourcePath: string, extra: () => string[] = () => []): PeopleSource {
  return {
    known: () => dedupePeople(extra(), personKeyer(plugin.app)),
    search: (query) => personCandidates(plugin.app, plugin.settings.peopleFolder, query, sourcePath)
  }
}

export interface PersonPickerOpts {
  container: HTMLElement
  plugin: PMPlugin
  /** The note the picked value is written into, so its link resolves from there. */
  sourcePath: string
  /** People to offer besides the current value. */
  extra?: () => string[]
  addLabel: string
  selected: () => string[]
  add: (value: string) => void
  remove: (value: string) => void
}

/**
 * The one control for picking people, behind assignees, the team and person custom
 * fields: the known people first, the vault's person notes once the user types, and rows
 * to add a typed name or create the note for it.
 */
export function renderPersonPicker(opts: PersonPickerOpts): void {
  const { plugin } = opts
  const source = peopleSource(plugin, opts.sourcePath, () => [...opts.selected(), ...(opts.extra?.() ?? [])])
  renderMultiSelect({
    container: opts.container,
    avatarStack: true,
    search: true,
    addLabel: opts.addLabel,
    placeholder: 'Search people…',
    selected: opts.selected,
    keyOf: personKeyer(plugin.app),
    labelFor: displayName,
    options: () => source.known().map((member) => ({ id: member, label: displayName(member) })),
    moreOptions: (query) => source.search(query).map((candidate) => ({ id: candidate.link, label: candidate.name })),
    moreHeading: 'People in your vault',
    add: opts.add,
    remove: opts.remove,
    createLabel: (name) => `Add "${name}"`,
    create: opts.add,
    createAlt: {
      label: (name) => `Create person note "${name}"`,
      icon: 'user-plus',
      run: async (name) => {
        opts.add(await createPersonLink(plugin.app, plugin.settings.peopleFolder, name, opts.sourcePath))
      }
    }
  })
}
