import type { Project } from '@system-commons/core'
import { EmptyState, safeAsync } from '@system-commons/ui'
import type PMPlugin from '../main'

/**
 * What every project view shows while the vault has no project note: the one place the
 * project gets created from, so each view offers the same button and the same prompt.
 */
export function renderNoProject(container: HTMLElement, plugin: PMPlugin, onCreated: (project: Project) => void): void {
  const ready = plugin.index.ready
  const empty = new EmptyState(container)
    .setIcon('📋')
    .setTitle(ready ? 'No project yet' : 'Looking for the project')
    .setBody(
      ready
        ? 'This vault has no project note. Create one and the task views open on it.'
        : 'The vault is still being read. This fills in on its own in a moment.'
    )
  if (!ready) return
  empty.setAction(
    'Create project',
    safeAsync(async () => {
      const project = await plugin.ensureProject()
      if (project) onCreated(project)
    })
  )
}
