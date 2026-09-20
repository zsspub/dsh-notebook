/** SQLite-backed notebook storage with immutable revisions and managed image files. */
import type { CreateNoteInput, DeleteNotebookInput, ImageData, MutationResult, Note, NoteIdInput, NoteImageId, NoteImageInput, NoteLifecycleInput, Notebook, NotebookOverview, NoteRevisionInput, NoteRevisionResult, NoteSearchInput, NoteSearchResult, RenameNotebookInput, RestoreRevisionInput, UpdateNoteInput } from '../types.ts';
export declare const NOTEBOOK_SCHEMA_VERSION = 1;
export interface NotebookStoreConfig {
    readonly databasePath: string;
    readonly imageDirectory: string;
    readonly busyTimeoutMs: number;
    readonly defaultPageSize: number;
    readonly maxPageSize: number;
    readonly maxBodyBytes: number;
    readonly maxImageBytes: number;
    readonly maxImagesPerNote: number;
}
interface NotebookStoreDependencies {
    readonly now?: () => number;
    readonly createId?: () => string;
}
/** Stable business failure returned through tools and Remote calls. */
export declare class NotebookError extends Error {
    readonly code: string;
    constructor(message: string, code?: string);
}
/** Synchronous storage. Each public mutation commits one SQLite transaction. */
export declare class NotebookStore {
    readonly config: NotebookStoreConfig;
    private readonly database;
    private readonly now;
    private readonly createId;
    private readonly trashDirectory;
    private closed;
    constructor(config: NotebookStoreConfig, dependencies?: NotebookStoreDependencies);
    private initialize;
    private recoverTrash;
    private transaction;
    private ensureOpen;
    private notebookRow;
    private noteRow;
    private tags;
    private imageRows;
    private toImage;
    private toNote;
    private resolveNotebook;
    private replaceTags;
    private refreshSearch;
    private imageSnapshot;
    private recordRevision;
    private assertRevision;
    private prepareImage;
    private publishImages;
    private insertImages;
    private cleanupPublished;
    /** Return notebook counts and the complete active tag vocabulary. */
    overview(): NotebookOverview;
    /** Create one empty notebook. */
    createNotebook(nameInput: string): Notebook;
    /** Search title, body, tags and notebook name with bounded pagination. */
    search(input: NoteSearchInput): NoteSearchResult;
    /** Read one complete note. */
    read(input: NoteIdInput): Note;
    /** Create a note, creating its named notebook when absent. */
    create(input: CreateNoteInput): Promise<Note>;
    /** Update note content and metadata with optimistic concurrency. */
    update(input: UpdateNoteInput): Promise<Note>;
    /** Archive one active note. */
    archive(input: NoteLifecycleInput): Note;
    /** Restore one archived note. */
    restore(input: NoteLifecycleInput): Note;
    private setArchived;
    /** List immutable note snapshots newest first. */
    revisions(input: NoteRevisionInput): NoteRevisionResult;
    /** Restore a historical snapshot as a new current revision. */
    restoreRevision(input: RestoreRevisionInput): Note;
    /** Rename a notebook with optimistic concurrency. */
    renameNotebook(input: RenameNotebookInput): Notebook;
    /** Delete an empty notebook. */
    deleteNotebook(input: DeleteNotebookInput): MutationResult;
    /** Permanently delete one archived note and collect unreferenced image files. */
    deleteNote(input: NoteLifecycleInput): MutationResult;
    /** Add one validated image and create a new note revision. */
    addImage(input: NoteImageInput): Promise<Note>;
    /** Return one image as canonical base64 after digest verification. */
    imageData(input: {
        id: NoteImageId;
    }): ImageData;
    /** Close the SQLite connection. */
    close(): void;
}
export {};
