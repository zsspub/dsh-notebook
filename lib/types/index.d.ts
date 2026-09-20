/** Notebook Host service shared by Agent tools and the generated Web Remote. */
import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { NotebookStore } from './host/store.ts';
import type { CreateNoteInput, DeleteNotebookInput, ImageData, ImageDataInput, MutationResult, Note, NoteIdInput, NoteImageInput, NoteLifecycleInput, Notebook, NotebookIdInput, NotebookOverview, NoteRevisionInput, NoteRevisionResult, NoteSearchInput, NoteSearchResult, RenameNotebookInput, RestoreRevisionInput, UpdateNoteInput } from './types.ts';
export type * from './types.ts';
declare module '@deepseek-ai/cordis' {
    interface Context {
        notebook: NotebookService;
    }
}
export interface Config {
    readonly databasePath: string;
    readonly imageDirectory: string;
    readonly busyTimeoutMs: number;
    readonly defaultPageSize: number;
    readonly maxPageSize: number;
    readonly maxBodyBytes: number;
    readonly maxImageBytes: number;
    readonly maxImagesPerNote: number;
}
/** Persistent notebook service and browser Remote implementation. */
export declare class NotebookService extends TypertRemoteService {
    static Config: Schema<Config>;
    readonly store: NotebookStore;
    constructor(ctx: Context, config: Config);
    /** Return notebook, tag and lifecycle counts. @param _input Empty request. @param signal Cancellation. @returns Current overview. */
    overview(_input: Record<string, never>, signal: AbortSignal): Promise<NotebookOverview>;
    /** Search notes with bounded pagination. @param input Filters and query. @param signal Cancellation. @returns Matching summaries. */
    search(input: NoteSearchInput, signal: AbortSignal): Promise<NoteSearchResult>;
    /** Read one complete note. @param input Note identity. @param signal Cancellation. @returns Current note. */
    read(input: NoteIdInput, signal: AbortSignal): Promise<Note>;
    /** Create one note and optional notebook. @param input Note fields. @param signal Cancellation. @returns Created note. */
    create(input: CreateNoteInput, signal: AbortSignal): Promise<Note>;
    /** Update one note with optimistic concurrency. @param input Replacement or append request. @param signal Cancellation. @returns Updated note. */
    update(input: UpdateNoteInput, signal: AbortSignal): Promise<Note>;
    /** Archive one active note. @param input Identity and revision. @param signal Cancellation. @returns Archived note. */
    archive(input: NoteLifecycleInput, signal: AbortSignal): Promise<Note>;
    /** Restore one archived note. @param input Identity and revision. @param signal Cancellation. @returns Active note. */
    restore(input: NoteLifecycleInput, signal: AbortSignal): Promise<Note>;
    /** Permanently delete one archived note. @param input Identity and revision. @param signal Cancellation. @returns Success. */
    deleteNote(input: NoteLifecycleInput, signal: AbortSignal): Promise<MutationResult>;
    /** Rename one notebook. @param input Identity, revision and name. @param signal Cancellation. @returns Updated notebook. */
    renameNotebook(input: RenameNotebookInput, signal: AbortSignal): Promise<Notebook>;
    /** Delete one empty notebook. @param input Identity and revision. @param signal Cancellation. @returns Success. */
    deleteNotebook(input: DeleteNotebookInput, signal: AbortSignal): Promise<MutationResult>;
    /** List immutable snapshots. @param input Note and pagination. @param signal Cancellation. @returns Revision page. */
    revisions(input: NoteRevisionInput, signal: AbortSignal): Promise<NoteRevisionResult>;
    /** Restore one snapshot as a new version. @param input Note and revision identities. @param signal Cancellation. @returns Restored note. */
    restoreRevision(input: RestoreRevisionInput, signal: AbortSignal): Promise<Note>;
    /** Add a panel-uploaded image. @param input Note revision and encoded image. @param signal Cancellation. @returns Updated note. */
    addImage(input: NoteImageInput, signal: AbortSignal): Promise<Note>;
    /** Read verified image bytes for panel display. @param input Image identity. @param signal Cancellation. @returns Image metadata and base64. */
    imageData(input: ImageDataInput, signal: AbortSignal): Promise<ImageData>;
    /** Create an empty notebook for panel navigation. @param input Requested name. @param signal Cancellation. @returns Created notebook. */
    createNotebook(input: {
        name: string;
    }, signal: AbortSignal): Promise<Notebook>;
    /** Check that a notebook exists. @param input Notebook identity. @param signal Cancellation. @returns Current overview entry. */
    notebook(input: NotebookIdInput, signal: AbortSignal): Promise<Notebook>;
}
export default NotebookService;
