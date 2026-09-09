import type { App } from 'obsidian'
import { TFile, TFolder, normalizePath } from 'obsidian'
import { sanitizeFileName } from '@system-commons/core'

/** A project owns a folder named after it, holding its note and its `_tasks/`. */
export function projectFilePath(projectTitle: string, folder: string): string {
  const name = sanitizeFileName(projectTitle)
  return normalizePath(`${folder}/${name}/${name}.md`)
}

/** The task storage folder beside the project note. */
export const TASK_FOLDER_NAME = '_tasks'

/** The folder holding a path, empty for anything at the vault root. */
export function folderOf(path: string): string {
  const at = path.lastIndexOf('/')
  return at === -1 ? '' : path.slice(0, at)
}

function nameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, '')
}

/**
 * The folder a project owns, holding its note and its `_tasks/`. A project note named
 * after its folder owns it; so does one whose folder nobody else claims and which already
 * holds task storage, which is what a note renamed on its own looks like. Null when the
 * note sits in a folder that is not its own.
 */
export function projectFolderOf(app: App, projectPath: string): string | null {
  const dir = folderOf(projectPath)
  if (!dir) return null
  const folderName = nameOf(dir)
  if (folderName === nameOf(projectPath)) return dir
  if (app.vault.getAbstractFileByPath(`${dir}/${folderName}.md`) instanceof TFile) return null
  return app.vault.getAbstractFileByPath(`${dir}/${TASK_FOLDER_NAME}`) instanceof TFolder ? dir : null
}

/** Where the project's task notes live: `_tasks/` beside the note, wherever the note sits. */
export function projectTaskFolder(projectPath: string): string {
  const dir = folderOf(projectPath)
  return normalizePath(dir ? `${dir}/${TASK_FOLDER_NAME}` : TASK_FOLDER_NAME)
}

/**
 * Keeps a task's attachment folder with its note across renames and archiving. A no-op
 * when there is no such folder or the destination is taken; returns null when nothing moved.
 */
export async function moveTaskAttachmentFolder(
  app: App,
  oldTaskFilePath: string,
  newTaskFilePath: string
): Promise<{ from: string; to: string } | null> {
  const from = normalizePath(oldTaskFilePath.replace(/\.md$/, ''))
  const to = normalizePath(newTaskFilePath.replace(/\.md$/, ''))
  if (from === to) return null
  const folder = app.vault.getAbstractFileByPath(from)
  if (!(folder instanceof TFolder)) return null
  if (app.vault.getAbstractFileByPath(to)) return null
  await app.vault.rename(folder, to)
  return { from, to }
}

/**
 * Keeps a renamed project note attached to its tasks. A note renamed inside the folder it
 * owns takes the folder with it, so the pair keeps matching; a note moved to another folder
 * takes its `_tasks/` along. Returns where the note ended up.
 */
export async function keepProjectStorageWithNote(
  app: App,
  oldProjectPath: string,
  newProjectPath: string,
  markSelfWrite: (path: string) => void
): Promise<string> {
  const oldDir = folderOf(oldProjectPath)
  if (folderOf(newProjectPath) === oldDir) {
    if (!oldDir || nameOf(oldDir) !== nameOf(oldProjectPath)) return newProjectPath
    const target = normalizePath(`${folderOf(oldDir)}/${nameOf(newProjectPath)}`)
    const folder = app.vault.getAbstractFileByPath(oldDir)
    if (!(folder instanceof TFolder) || app.vault.getAbstractFileByPath(target)) return newProjectPath
    markSelfWrite(oldDir)
    markSelfWrite(target)
    await app.vault.rename(folder, target)
    return normalizePath(`${target}/${nameOf(newProjectPath)}.md`)
  }

  const from = projectTaskFolder(oldProjectPath)
  const to = projectTaskFolder(newProjectPath)
  const folder = app.vault.getAbstractFileByPath(from)
  if (from !== to && folder instanceof TFolder && !app.vault.getAbstractFileByPath(to)) {
    markSelfWrite(from)
    markSelfWrite(to)
    await app.vault.rename(folder, to)
  }
  return newProjectPath
}

/**
 * Resolves a frontmatter link to a vault path, accepting a bare name as a linkpath too.
 * A wikilink so Obsidian updates it on rename and shows the edge in the graph; undefined
 * when it points nowhere.
 */
export function resolveVaultLink(app: App, raw: unknown, sourcePath: string): string | undefined {
  if (typeof raw !== 'string') return undefined
  const inner = /^\[\[(.+?)\]\]$/.exec(raw.trim())?.[1] ?? raw.trim()
  const linkpath = inner.split('|')[0].trim()
  if (!linkpath) return undefined
  return app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath)?.path ?? undefined
}

/**
 * `getAbstractFileByPath` is case-sensitive while macOS and Windows filesystems are not,
 * so a settings value of `projects` misses an existing `Projects/` and `createFolder` then
 * throws "Folder already exists". Swallowing that also covers concurrent callers racing.
 */
export async function ensureFolder(app: App, folderPath: string): Promise<void> {
  const normalized = normalizePath(folderPath)
  if (app.vault.getAbstractFileByPath(normalized) instanceof TFolder) return
  try {
    await app.vault.createFolder(normalized)
  } catch (e) {
    if (!isAlreadyExistsError(e)) throw e
  }
}

function isAlreadyExistsError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  return /already exists/i.test(msg)
}
