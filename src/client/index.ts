/** Mount the Notebook Remote and register its sidebar and tool-card contributions. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import remote from 'dsh-notebook/remote'
import type {
  CreateNoteInput, DeleteNotebookInput, ImageData, ImageDataInput, MutationResult, Note, NoteIdInput,
  NoteImageInput, NoteLifecycleInput, Notebook, NotebookIdInput, NotebookOverview, NoteRevisionInput,
  NoteRevisionResult, NoteSearchInput, NoteSearchResult, RenameNotebookInput, RestoreRevisionInput,
  UpdateNoteInput,
} from '../types.ts'
import { NotebookPanel, NotebookTrigger } from './Panel.tsx'
import { NotebookToolCard } from './ToolCard.tsx'
import { en, NS, zh, type NotebookLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    notebook: NotebookLocaleKey
  }
}

export interface NotebookApi {
  overview(input: Record<string, never>, signal: AbortSignal): Promise<NotebookOverview>
  search(input: NoteSearchInput, signal: AbortSignal): Promise<NoteSearchResult>
  read(input: NoteIdInput, signal: AbortSignal): Promise<Note>
  create(input: CreateNoteInput, signal: AbortSignal): Promise<Note>
  update(input: UpdateNoteInput, signal: AbortSignal): Promise<Note>
  archive(input: NoteLifecycleInput, signal: AbortSignal): Promise<Note>
  restore(input: NoteLifecycleInput, signal: AbortSignal): Promise<Note>
  deleteNote(input: NoteLifecycleInput, signal: AbortSignal): Promise<MutationResult>
  createNotebook(input: { name: string }, signal: AbortSignal): Promise<Notebook>
  renameNotebook(input: RenameNotebookInput, signal: AbortSignal): Promise<Notebook>
  deleteNotebook(input: DeleteNotebookInput, signal: AbortSignal): Promise<MutationResult>
  notebook(input: NotebookIdInput, signal: AbortSignal): Promise<Notebook>
  revisions(input: NoteRevisionInput, signal: AbortSignal): Promise<NoteRevisionResult>
  restoreRevision(input: RestoreRevisionInput, signal: AbortSignal): Promise<Note>
  addImage(input: NoteImageInput, signal: AbortSignal): Promise<Note>
  imageData(input: ImageDataInput, signal: AbortSignal): Promise<ImageData>
}

export const inject = ['slots', 'locale', 'remote', 'sidebarRight', 'sidebarRightTabs']

function unwrap<Value>(result: { ok: true; value: Value } | { ok: false; error: Error }): Value {
  if (!result.ok) throw result.error
  return result.value
}

/** Register all client contributions and dispose them together. */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'notebook: locales')
  const t = ctx.locale.bind(NS)
  const unmount = await ctx.remote.$mount(remote)
  const fiber = ctx.inject(['remote.notebook'], scope => {
    scope.effect(() => scope.sidebarRightTabs.register({
      id: 'dsh-notebook',
      kind: 'notebook',
      title: () => t('title'),
    }), 'notebook: tab')
    const api: NotebookApi = {
      overview: async (input, signal) => unwrap(await scope.remote.notebook.overview(input, signal)),
      search: async (input, signal) => unwrap(await scope.remote.notebook.search(input, signal)),
      read: async (input, signal) => unwrap(await scope.remote.notebook.read(input, signal)),
      create: async (input, signal) => unwrap(await scope.remote.notebook.create(input, signal)),
      update: async (input, signal) => unwrap(await scope.remote.notebook.update(input, signal)),
      archive: async (input, signal) => unwrap(await scope.remote.notebook.archive(input, signal)),
      restore: async (input, signal) => unwrap(await scope.remote.notebook.restore(input, signal)),
      deleteNote: async (input, signal) => unwrap(await scope.remote.notebook.deleteNote(input, signal)),
      createNotebook: async (input, signal) => unwrap(await scope.remote.notebook.createNotebook(input, signal)),
      renameNotebook: async (input, signal) => unwrap(await scope.remote.notebook.renameNotebook(input, signal)),
      deleteNotebook: async (input, signal) => unwrap(await scope.remote.notebook.deleteNotebook(input, signal)),
      notebook: async (input, signal) => unwrap(await scope.remote.notebook.notebook(input, signal)),
      revisions: async (input, signal) => unwrap(await scope.remote.notebook.revisions(input, signal)),
      restoreRevision: async (input, signal) => unwrap(await scope.remote.notebook.restoreRevision(input, signal)),
      addImage: async (input, signal) => unwrap(await scope.remote.notebook.addImage(input, signal)),
      imageData: async (input, signal) => unwrap(await scope.remote.notebook.imageData(input, signal)),
    }
    scope.slots.inject('sidebar.footer.action', () => scope.slots.register({
      name: 'sidebar.footer.action',
      id: 'notebook',
      order: 55,
      locale: NS,
      inject: () => ({
        openPanel: () => {
          try {
            scope.sidebarRight.openTab('notebook')
          } catch (error) {
            if (error instanceof Error && error.message === 'sidebarRight: no session surface is mounted') return
            throw error
          }
        },
      }),
    }, NotebookTrigger))
    scope.slots.inject('sidebar.right.pane.tab', () => scope.slots.register({
      name: 'sidebar.right.pane.tab',
      key: 'dsh-notebook',
      locale: NS,
      inject: () => ({ api }),
    }, NotebookPanel))
    const toolNames = [
      'notebook_search', 'notebook_read', 'notebook_note_create',
      'notebook_note_update', 'notebook_note_archive', 'notebook_note_restore',
    ]
    scope.slots.inject('tool.call.toolview', function* () {
      for (const key of toolNames) {
        yield scope.slots.register({ name: 'tool.call.toolview', key, locale: NS }, NotebookToolCard)
      }
    })
  })
  try {
    await fiber
  } catch (error) {
    await unmount()
    throw error
  }
  return async () => {
    await fiber.dispose()
    await unmount()
  }
}
