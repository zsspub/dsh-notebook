/** JSON-serializable contracts shared by the Notebook Host, tools and Web panel. */
import type { Branded } from '@deepseek-ai/dsh-brand';
export type NotebookId = Branded<'NotebookId'>;
export type NoteId = Branded<'NoteId'>;
export type NoteRevisionId = Branded<'NoteRevisionId'>;
export type NoteImageId = Branded<'NoteImageId'>;
export declare const IMAGE_MEDIA_TYPES: readonly ["image/png", "image/jpeg", "image/webp", "image/gif"];
export type NotebookImageMediaType = (typeof IMAGE_MEDIA_TYPES)[number];
export interface Notebook {
    readonly id: NotebookId;
    readonly name: string;
    readonly revision: number;
    readonly noteCount: number;
    readonly archivedNoteCount: number;
    readonly createdAt: string;
    readonly updatedAt: string;
}
export interface NoteImage {
    readonly id: NoteImageId;
    readonly noteId: NoteId;
    readonly name: string;
    readonly mediaType: NotebookImageMediaType;
    readonly bytes: number;
    readonly width: number;
    readonly height: number;
    readonly digest: string;
    readonly position: number;
    readonly createdAt: string;
}
export interface NoteSummary {
    readonly id: NoteId;
    readonly notebookId: NotebookId;
    readonly notebookName: string;
    readonly title: string;
    readonly excerpt: string;
    readonly tags: string[];
    readonly imageCount: number;
    readonly revision: number;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly archivedAt: string | null;
}
export interface Note extends NoteSummary {
    readonly body: string;
    readonly images: NoteImage[];
}
export interface NoteRevision {
    readonly id: NoteRevisionId;
    readonly noteId: NoteId;
    readonly revision: number;
    readonly notebookId: NotebookId;
    readonly notebookName: string;
    readonly title: string;
    readonly body: string;
    readonly tags: string[];
    readonly images: NoteImage[];
    readonly archivedAt: string | null;
    readonly createdAt: string;
}
export interface NotebookOverview {
    readonly notebooks: Notebook[];
    readonly tags: string[];
    readonly activeNotes: number;
    readonly archivedNotes: number;
}
export interface NoteSearchInput {
    readonly query?: string;
    readonly notebookId?: NotebookId;
    readonly tags?: readonly string[];
    readonly archived?: boolean;
    readonly limit?: number;
    readonly offset?: number;
}
export interface NoteSearchResult {
    readonly notes: NoteSummary[];
    readonly total: number;
    readonly hasMore: boolean;
}
export interface NoteIdInput {
    readonly id: NoteId;
}
export interface NotebookIdInput {
    readonly id: NotebookId;
}
export interface CreateNoteInput {
    readonly notebookId?: NotebookId;
    readonly notebookName?: string;
    readonly title: string;
    readonly body: string;
    readonly tags?: readonly string[];
    readonly images?: readonly ImageUploadInput[];
}
export interface UpdateNoteInput {
    readonly id: NoteId;
    readonly expectedRevision: number;
    readonly mode: 'append' | 'replace';
    readonly title?: string;
    readonly body?: string;
    readonly notebookId?: NotebookId;
    readonly notebookName?: string;
    readonly tags?: readonly string[];
    readonly images?: readonly ImageUploadInput[];
    readonly removeImageIds?: readonly NoteImageId[];
}
export interface NoteRevisionInput extends NoteIdInput {
    readonly limit?: number;
    readonly offset?: number;
}
export interface NoteRevisionResult {
    readonly revisions: NoteRevision[];
    readonly total: number;
    readonly hasMore: boolean;
}
export interface RestoreRevisionInput {
    readonly id: NoteId;
    readonly revision: number;
    readonly expectedRevision: number;
}
export interface NoteLifecycleInput extends NoteIdInput {
    readonly expectedRevision: number;
}
export interface DeleteNotebookInput extends NotebookIdInput {
    readonly expectedRevision: number;
}
export interface RenameNotebookInput extends NotebookIdInput {
    readonly expectedRevision: number;
    readonly name: string;
}
export interface ImageUploadInput {
    readonly name: string;
    readonly mediaType: NotebookImageMediaType;
    readonly data: string;
}
export interface NoteImageInput {
    readonly noteId: NoteId;
    readonly expectedRevision: number;
    readonly image: ImageUploadInput;
}
export interface ImageDataInput {
    readonly id: NoteImageId;
}
export interface ImageData {
    readonly image: NoteImage;
    readonly data: string;
}
export interface MutationResult {
    readonly ok: true;
}
