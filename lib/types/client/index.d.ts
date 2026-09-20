/** Mount the Notebook Remote and register its sidebar and tool-card contributions. */
import type { Context } from '@deepseek-ai/cordis';
import type { CreateNoteInput, DeleteNotebookInput, ImageData, ImageDataInput, MutationResult, Note, NoteIdInput, NoteImageInput, NoteLifecycleInput, Notebook, NotebookIdInput, NotebookOverview, NoteRevisionInput, NoteRevisionResult, NoteSearchInput, NoteSearchResult, RenameNotebookInput, RestoreRevisionInput, UpdateNoteInput } from '../types.ts';
import { type NotebookLocaleKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        notebook: NotebookLocaleKey;
    }
}
export interface NotebookApi {
    overview(input: Record<string, never>, signal: AbortSignal): Promise<NotebookOverview>;
    search(input: NoteSearchInput, signal: AbortSignal): Promise<NoteSearchResult>;
    read(input: NoteIdInput, signal: AbortSignal): Promise<Note>;
    create(input: CreateNoteInput, signal: AbortSignal): Promise<Note>;
    update(input: UpdateNoteInput, signal: AbortSignal): Promise<Note>;
    archive(input: NoteLifecycleInput, signal: AbortSignal): Promise<Note>;
    restore(input: NoteLifecycleInput, signal: AbortSignal): Promise<Note>;
    deleteNote(input: NoteLifecycleInput, signal: AbortSignal): Promise<MutationResult>;
    createNotebook(input: {
        name: string;
    }, signal: AbortSignal): Promise<Notebook>;
    renameNotebook(input: RenameNotebookInput, signal: AbortSignal): Promise<Notebook>;
    deleteNotebook(input: DeleteNotebookInput, signal: AbortSignal): Promise<MutationResult>;
    notebook(input: NotebookIdInput, signal: AbortSignal): Promise<Notebook>;
    revisions(input: NoteRevisionInput, signal: AbortSignal): Promise<NoteRevisionResult>;
    restoreRevision(input: RestoreRevisionInput, signal: AbortSignal): Promise<Note>;
    addImage(input: NoteImageInput, signal: AbortSignal): Promise<Note>;
    imageData(input: ImageDataInput, signal: AbortSignal): Promise<ImageData>;
}
export declare const inject: string[];
/** Register all client contributions and dispose them together. */
export declare function apply(ctx: Context): Promise<() => Promise<void>>;
