/** Notebook Host service shared by Agent tools and the generated Web Remote. */

import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { NotebookStore } from './host/store.ts'
import type {
  CreateNoteInput, DeleteNotebookInput, ImageData, ImageDataInput, MutationResult, Note, NoteIdInput,
  NoteImageInput, NoteLifecycleInput, Notebook, NotebookIdInput, NotebookOverview, NoteRevisionInput,
  NoteRevisionResult, NoteSearchInput, NoteSearchResult, RenameNotebookInput, RestoreRevisionInput,
  UpdateNoteInput,
} from './types.ts'

export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    notebook: NotebookService
  }
}

export interface Config {
  readonly databasePath: string
  readonly imageDirectory: string
  readonly busyTimeoutMs: number
  readonly defaultPageSize: number
  readonly maxPageSize: number
  readonly maxBodyBytes: number
  readonly maxImageBytes: number
  readonly maxImagesPerNote: number
}

/** Persistent notebook service and browser Remote implementation. */
export class NotebookService extends TypertRemoteService {
  static Config: Schema<Config> = Schema.object({
    databasePath: Schema.string().required(),
    imageDirectory: Schema.string().required(),
    busyTimeoutMs: Schema.number().min(1).step(1).default(5000),
    defaultPageSize: Schema.number().min(1).step(1).default(30),
    maxPageSize: Schema.number().min(1).step(1).default(100),
    maxBodyBytes: Schema.number().min(1).step(1).default(1024 * 1024),
    maxImageBytes: Schema.number().min(1).step(1).default(10 * 1024 * 1024),
    maxImagesPerNote: Schema.number().min(1).step(1).default(50),
  })

  readonly store: NotebookStore

  constructor(ctx: Context, config: Config) {
    super(ctx, 'notebook')
    this.store = new NotebookStore(config)
    ctx.effect(() => () => {
      this.store.close()
    }, 'notebook: close store')
  }

  /** Return notebook, tag and lifecycle counts. @param _input Empty request. @param signal Cancellation. @returns Current overview. */
  @Remote
  overview(_input: Record<string, never>, signal: AbortSignal): Promise<NotebookOverview> {
    signal.throwIfAborted()
    return Promise.resolve(this.store.overview())
  }

  /** Search notes with bounded pagination. @param input Filters and query. @param signal Cancellation. @returns Matching summaries. */
  @Remote
  search(input: NoteSearchInput, signal: AbortSignal): Promise<NoteSearchResult> {
    signal.throwIfAborted()
    return Promise.resolve(this.store.search(input))
  }

  /** Read one complete note. @param input Note identity. @param signal Cancellation. @returns Current note. */
  @Remote
  read(input: NoteIdInput, signal: AbortSignal): Promise<Note> {
    signal.throwIfAborted()
    return Promise.resolve(this.store.read(input))
  }

  /** Create one note and optional notebook. @param input Note fields. @param signal Cancellation. @returns Created note. */
  @Remote
  create(input: CreateNoteInput, signal: AbortSignal): Promise<Note> {
    signal.throwIfAborted()
    return this.store.create(input)
  }

  /** Update one note with optimistic concurrency. @param input Replacement or append request. @param signal Cancellation. @returns Updated note. */
  @Remote
  update(input: UpdateNoteInput, signal: AbortSignal): Promise<Note> {
    signal.throwIfAborted()
    return this.store.update(input)
  }

  /** Archive one active note. @param input Identity and revision. @param signal Cancellation. @returns Archived note. */
  @Remote
  archive(input: NoteLifecycleInput, signal: AbortSignal): Promise<Note> {
    signal.throwIfAborted()
    return Promise.resolve(this.store.archive(input))
  }

  /** Restore one archived note. @param input Identity and revision. @param signal Cancellation. @returns Active note. */
  @Remote
  restore(input: NoteLifecycleInput, signal: AbortSignal): Promise<Note> {
    signal.throwIfAborted()
    return Promise.resolve(this.store.restore(input))
  }

  /** Permanently delete one archived note. @param input Identity and revision. @param signal Cancellation. @returns Success. */
  @Remote
  deleteNote(input: NoteLifecycleInput, signal: AbortSignal): Promise<MutationResult> {
    signal.throwIfAborted()
    return Promise.resolve(this.store.deleteNote(input))
  }

  /** Rename one notebook. @param input Identity, revision and name. @param signal Cancellation. @returns Updated notebook. */
  @Remote
  renameNotebook(input: RenameNotebookInput, signal: AbortSignal): Promise<Notebook> {
    signal.throwIfAborted()
    return Promise.resolve(this.store.renameNotebook(input))
  }

  /** Delete one empty notebook. @param input Identity and revision. @param signal Cancellation. @returns Success. */
  @Remote
  deleteNotebook(input: DeleteNotebookInput, signal: AbortSignal): Promise<MutationResult> {
    signal.throwIfAborted()
    return Promise.resolve(this.store.deleteNotebook(input))
  }

  /** List immutable snapshots. @param input Note and pagination. @param signal Cancellation. @returns Revision page. */
  @Remote
  revisions(input: NoteRevisionInput, signal: AbortSignal): Promise<NoteRevisionResult> {
    signal.throwIfAborted()
    return Promise.resolve(this.store.revisions(input))
  }

  /** Restore one snapshot as a new version. @param input Note and revision identities. @param signal Cancellation. @returns Restored note. */
  @Remote
  restoreRevision(input: RestoreRevisionInput, signal: AbortSignal): Promise<Note> {
    signal.throwIfAborted()
    return Promise.resolve(this.store.restoreRevision(input))
  }

  /** Add a panel-uploaded image. @param input Note revision and encoded image. @param signal Cancellation. @returns Updated note. */
  @Remote
  addImage(input: NoteImageInput, signal: AbortSignal): Promise<Note> {
    signal.throwIfAborted()
    return this.store.addImage(input)
  }

  /** Read verified image bytes for panel display. @param input Image identity. @param signal Cancellation. @returns Image metadata and base64. */
  @Remote
  imageData(input: ImageDataInput, signal: AbortSignal): Promise<ImageData> {
    signal.throwIfAborted()
    return Promise.resolve(this.store.imageData(input))
  }

  /** Create an empty notebook for panel navigation. @param input Requested name. @param signal Cancellation. @returns Created notebook. */
  @Remote
  createNotebook(input: { name: string }, signal: AbortSignal): Promise<Notebook> {
    signal.throwIfAborted()
    return Promise.resolve(this.store.createNotebook(input.name))
  }

  /** Check that a notebook exists. @param input Notebook identity. @param signal Cancellation. @returns Current overview entry. */
  @Remote
  notebook(input: NotebookIdInput, signal: AbortSignal): Promise<Notebook> {
    signal.throwIfAborted()
    const notebook = this.store.overview().notebooks.find(item => item.id === input.id)
    if (!notebook) throw new Error(`notebook ${input.id} was not found`)
    return Promise.resolve(notebook)
  }
}

export default NotebookService
