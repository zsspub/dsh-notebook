/** SQLite-backed notebook storage with immutable revisions and managed image files. */

import { createHash, randomUUID } from 'node:crypto'
import {
  chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync,
} from 'node:fs'
import { basename, dirname, isAbsolute, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import sharp from 'sharp'
import type {
  CreateNoteInput, DeleteNotebookInput, ImageData, ImageUploadInput, MutationResult, Note, NoteId, NoteIdInput,
  NoteImage, NoteImageId, NoteImageInput, NoteLifecycleInput, Notebook, NotebookId,
  NotebookImageMediaType, NotebookOverview, NoteRevision, NoteRevisionInput, NoteRevisionResult,
  NoteSearchInput, NoteSearchResult, RenameNotebookInput, RestoreRevisionInput, UpdateNoteInput,
} from '../types.ts'
import { IMAGE_MEDIA_TYPES } from '../types.ts'

export const NOTEBOOK_SCHEMA_VERSION = 1

export interface NotebookStoreConfig {
  readonly databasePath: string
  readonly imageDirectory: string
  readonly busyTimeoutMs: number
  readonly defaultPageSize: number
  readonly maxPageSize: number
  readonly maxBodyBytes: number
  readonly maxImageBytes: number
  readonly maxImagesPerNote: number
}

interface NotebookStoreDependencies {
  readonly now?: () => number
  readonly createId?: () => string
}

interface NotebookRow {
  readonly id: string
  readonly name: string
  readonly revision: number
  readonly created_at: number
  readonly updated_at: number
}

interface NoteRow {
  readonly id: string
  readonly notebook_id: string
  readonly title: string
  readonly body: string
  readonly revision: number
  readonly created_at: number
  readonly updated_at: number
  readonly archived_at: number | null
}

interface ImageRow {
  readonly id: string
  readonly note_id: string
  readonly name: string
  readonly media_type: NotebookImageMediaType
  readonly bytes: number
  readonly width: number
  readonly height: number
  readonly digest: string
  readonly storage_name: string
  readonly position: number
  readonly created_at: number
}

interface RevisionRow {
  readonly id: string
  readonly note_id: string
  readonly revision: number
  readonly notebook_id: string
  readonly notebook_name: string
  readonly title: string
  readonly body: string
  readonly tags_json: string
  readonly images_json: string
  readonly archived_at: number | null
  readonly created_at: number
}

interface ImageSnapshot {
  readonly id: string
  readonly noteId: string
  readonly name: string
  readonly mediaType: NotebookImageMediaType
  readonly bytes: number
  readonly width: number
  readonly height: number
  readonly digest: string
  readonly storageName: string
  readonly position: number
  readonly createdAt: number
}

interface PendingImage {
  readonly id: NoteImageId
  readonly noteId: NoteId
  readonly name: string
  readonly mediaType: NotebookImageMediaType
  readonly bytes: number
  readonly width: number
  readonly height: number
  readonly digest: string
  readonly storageName: string
  readonly position: number
  readonly createdAt: number
  readonly data: Uint8Array
}

const MEDIA_TYPES = new Set<string>(IMAGE_MEDIA_TYPES)
const IMAGE_EXTENSIONS: Record<NotebookImageMediaType, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
}

/** Stable business failure returned through tools and Remote calls. */
export class NotebookError extends Error {
  constructor(message: string, readonly code = 'NOTEBOOK_ERROR') {
    super(message)
    this.name = 'NotebookError'
  }
}

function requiredText(name: string, value: string, maxLength: number): string {
  const result = value.trim()
  if (result.length === 0 || result.length > maxLength) {
    throw new NotebookError(`${name} must contain 1 to ${String(maxLength)} characters`)
  }
  return result
}

function bodyText(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, 'utf8') > maxBytes) {
    throw new NotebookError(`body must not exceed ${String(maxBytes)} UTF-8 bytes`)
  }
  return value
}

function normalizedTags(values: readonly string[] | undefined): string[] {
  if (values === undefined) return []
  if (values.length > 50) throw new NotebookError('tags must contain at most 50 entries')
  const tags = new Set<string>()
  for (const raw of values) {
    const tag = requiredText('tag', raw, 64).toLocaleLowerCase()
    tags.add(tag)
  }
  return [...tags].sort()
}

function positiveInteger(name: string, value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new NotebookError(`${name} must be a positive integer`)
  return value
}

function nonNegativeInteger(name: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new NotebookError(`${name} must be a non-negative integer`)
  return value
}

function iso(value: number | null): string | null {
  return value === null ? null : new Date(value).toISOString()
}

function assertAbsolute(name: string, value: string): void {
  if (value !== ':memory:' && !isAbsolute(value)) throw new NotebookError(`${name} must be absolute or :memory:`)
}

function safeName(name: string, fallback: string): string {
  const leaf = basename(name).normalize('NFKC').replace(/[^\p{L}\p{N}._ -]+/gu, '-').replace(/\s+/gu, ' ').trim()
  return (leaf.length === 0 ? fallback : leaf).slice(0, 160)
}

function escapeFtsQuery(query: string): string {
  return query.trim().split(/\s+/u).filter(Boolean).map(token => `"${token.replaceAll('"', '""')}"*`).join(' AND ')
}

function parseJsonArray(value: string, label: string): unknown[] {
  const parsed: unknown = JSON.parse(value)
  if (!Array.isArray(parsed)) throw new NotebookError(`invalid ${label} snapshot`)
  return parsed
}

function asNoteImage(snapshot: ImageSnapshot): NoteImage {
  return {
    id: snapshot.id as NoteImageId,
    noteId: snapshot.noteId as NoteId,
    name: snapshot.name,
    mediaType: snapshot.mediaType,
    bytes: snapshot.bytes,
    width: snapshot.width,
    height: snapshot.height,
    digest: snapshot.digest,
    position: snapshot.position,
    createdAt: new Date(snapshot.createdAt).toISOString(),
  }
}

/** Synchronous storage. Each public mutation commits one SQLite transaction. */
export class NotebookStore {
  private readonly database: DatabaseSync
  private readonly now: () => number
  private readonly createId: () => string
  private readonly trashDirectory: string
  private closed = false

  constructor(readonly config: NotebookStoreConfig, dependencies: NotebookStoreDependencies = {}) {
    assertAbsolute('databasePath', config.databasePath)
    assertAbsolute('imageDirectory', config.imageDirectory)
    positiveInteger('busyTimeoutMs', config.busyTimeoutMs)
    positiveInteger('defaultPageSize', config.defaultPageSize)
    positiveInteger('maxPageSize', config.maxPageSize)
    positiveInteger('maxBodyBytes', config.maxBodyBytes)
    positiveInteger('maxImageBytes', config.maxImageBytes)
    positiveInteger('maxImagesPerNote', config.maxImagesPerNote)
    if (config.defaultPageSize > config.maxPageSize) throw new NotebookError('defaultPageSize cannot exceed maxPageSize')
    this.now = dependencies.now ?? Date.now
    this.createId = dependencies.createId ?? randomUUID
    this.trashDirectory = join(config.imageDirectory, '.trash')
    if (config.databasePath !== ':memory:') mkdirSync(dirname(config.databasePath), { recursive: true, mode: 0o700 })
    mkdirSync(config.imageDirectory, { recursive: true, mode: 0o700 })
    mkdirSync(this.trashDirectory, { recursive: true, mode: 0o700 })
    const existed = config.databasePath === ':memory:' || existsSync(config.databasePath)
    this.database = new DatabaseSync(config.databasePath, { timeout: config.busyTimeoutMs })
    try {
      if (!existed && config.databasePath !== ':memory:') chmodSync(config.databasePath, 0o600)
      this.initialize()
      this.recoverTrash()
    } catch (error) {
      this.database.close()
      this.closed = true
      throw error
    }
  }

  private initialize(): void {
    this.database.exec('PRAGMA foreign_keys = ON')
    this.database.exec('PRAGMA journal_mode = WAL')
    this.database.exec(`PRAGMA busy_timeout = ${String(this.config.busyTimeoutMs)}`)
    const { user_version: version } = this.database.prepare('PRAGMA user_version').get() as { user_version: number }
    if (version > NOTEBOOK_SCHEMA_VERSION) {
      throw new NotebookError(`notebook schema ${String(version)} is newer than supported ${String(NOTEBOOK_SCHEMA_VERSION)}`)
    }
    if (version === NOTEBOOK_SCHEMA_VERSION) return
    this.transaction(() => {
      this.database.exec(`
        CREATE TABLE notebooks (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL COLLATE NOCASE UNIQUE,
          revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE TABLE notes (
          id TEXT PRIMARY KEY,
          notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE RESTRICT,
          title TEXT NOT NULL,
          body TEXT NOT NULL,
          revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          archived_at INTEGER
        );
        CREATE INDEX notes_notebook_updated ON notes(notebook_id, archived_at, updated_at DESC, id);
        CREATE TABLE tags (
          name TEXT PRIMARY KEY COLLATE NOCASE
        );
        CREATE TABLE note_tags (
          note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
          tag_name TEXT NOT NULL REFERENCES tags(name) ON DELETE CASCADE,
          PRIMARY KEY(note_id, tag_name)
        );
        CREATE TABLE note_images (
          id TEXT PRIMARY KEY,
          note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          media_type TEXT NOT NULL,
          bytes INTEGER NOT NULL,
          width INTEGER NOT NULL,
          height INTEGER NOT NULL,
          digest TEXT NOT NULL,
          storage_name TEXT NOT NULL UNIQUE,
          position INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          UNIQUE(note_id, position)
        );
        CREATE TABLE note_revisions (
          id TEXT PRIMARY KEY,
          note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
          revision INTEGER NOT NULL,
          notebook_id TEXT NOT NULL,
          notebook_name TEXT NOT NULL,
          title TEXT NOT NULL,
          body TEXT NOT NULL,
          tags_json TEXT NOT NULL,
          images_json TEXT NOT NULL,
          archived_at INTEGER,
          created_at INTEGER NOT NULL,
          UNIQUE(note_id, revision)
        );
        CREATE VIRTUAL TABLE note_search USING fts5(
          note_id UNINDEXED,
          title,
          body,
          tags,
          notebook
        );
        PRAGMA user_version = 1;
      `)
    })
  }

  private recoverTrash(): void {
    const rows = this.database.prepare('SELECT storage_name FROM note_images').all() as { storage_name: string }[]
    const live = new Set(rows.map(row => row.storage_name))
    const revisions = this.database.prepare('SELECT images_json FROM note_revisions').all() as { images_json: string }[]
    for (const revision of revisions) {
      for (const image of parseJsonArray(revision.images_json, 'image')) live.add((image as ImageSnapshot).storageName)
    }
    for (const entry of readdirSync(this.trashDirectory)) {
      const original = entry.replace(/^[^.]+--/u, '')
      const trashPath = join(this.trashDirectory, entry)
      if (live.has(original)) {
        const target = join(this.config.imageDirectory, original)
        if (!existsSync(target)) renameSync(trashPath, target)
        else rmSync(trashPath, { force: true })
      } else {
        rmSync(trashPath, { force: true })
      }
    }
  }

  private transaction<Result>(operation: () => Result): Result {
    this.ensureOpen()
    this.database.exec('BEGIN IMMEDIATE')
    try {
      const result = operation()
      this.database.exec('COMMIT')
      return result
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  private ensureOpen(): void {
    if (this.closed) throw new NotebookError('notebook store is closed')
  }

  private notebookRow(id: NotebookId): NotebookRow {
    const row = this.database.prepare('SELECT * FROM notebooks WHERE id = ?').get(id) as NotebookRow | undefined
    if (!row) throw new NotebookError(`notebook ${id} was not found`, 'NOT_FOUND')
    return row
  }

  private noteRow(id: NoteId): NoteRow {
    const row = this.database.prepare('SELECT * FROM notes WHERE id = ?').get(id) as NoteRow | undefined
    if (!row) throw new NotebookError(`note ${id} was not found`, 'NOT_FOUND')
    return row
  }

  private tags(noteId: NoteId): string[] {
    return (this.database.prepare('SELECT tag_name FROM note_tags WHERE note_id = ? ORDER BY tag_name').all(noteId) as { tag_name: string }[])
      .map(row => row.tag_name)
  }

  private imageRows(noteId: NoteId): ImageRow[] {
    return this.database.prepare('SELECT * FROM note_images WHERE note_id = ? ORDER BY position, id').all(noteId) as unknown as ImageRow[]
  }

  private toImage(row: ImageRow): NoteImage {
    return {
      id: row.id as NoteImageId,
      noteId: row.note_id as NoteId,
      name: row.name,
      mediaType: row.media_type,
      bytes: row.bytes,
      width: row.width,
      height: row.height,
      digest: row.digest,
      position: row.position,
      createdAt: new Date(row.created_at).toISOString(),
    }
  }

  private toNote(row: NoteRow): Note {
    const notebook = this.notebookRow(row.notebook_id as NotebookId)
    const images = this.imageRows(row.id as NoteId).map(image => this.toImage(image))
    return {
      id: row.id as NoteId,
      notebookId: row.notebook_id as NotebookId,
      notebookName: notebook.name,
      title: row.title,
      body: row.body,
      excerpt: row.body.replace(/\s+/gu, ' ').trim().slice(0, 240),
      tags: this.tags(row.id as NoteId),
      images,
      imageCount: images.length,
      revision: row.revision,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      archivedAt: iso(row.archived_at),
    }
  }

  private resolveNotebook(input: { notebookId?: NotebookId; notebookName?: string }, timestamp: number): NotebookRow {
    if (input.notebookId !== undefined && input.notebookName !== undefined) {
      throw new NotebookError('provide notebookId or notebookName, not both')
    }
    if (input.notebookId !== undefined) return this.notebookRow(input.notebookId)
    const name = requiredText('notebookName', input.notebookName ?? 'Notebook', 120)
    const existing = this.database.prepare('SELECT * FROM notebooks WHERE name = ? COLLATE NOCASE').get(name) as NotebookRow | undefined
    if (existing) return existing
    const id = this.createId()
    this.database.prepare('INSERT INTO notebooks(id, name, revision, created_at, updated_at) VALUES (?, ?, 1, ?, ?)')
      .run(id, name, timestamp, timestamp)
    return this.notebookRow(id as NotebookId)
  }

  private replaceTags(noteId: NoteId, tags: readonly string[]): void {
    this.database.prepare('DELETE FROM note_tags WHERE note_id = ?').run(noteId)
    const insertTag = this.database.prepare('INSERT OR IGNORE INTO tags(name) VALUES (?)')
    const link = this.database.prepare('INSERT INTO note_tags(note_id, tag_name) VALUES (?, ?)')
    for (const tag of tags) {
      insertTag.run(tag)
      link.run(noteId, tag)
    }
    this.database.exec('DELETE FROM tags WHERE NOT EXISTS (SELECT 1 FROM note_tags WHERE note_tags.tag_name = tags.name)')
  }

  private refreshSearch(noteId: NoteId): void {
    const note = this.noteRow(noteId)
    const notebook = this.notebookRow(note.notebook_id as NotebookId)
    this.database.prepare('DELETE FROM note_search WHERE note_id = ?').run(noteId)
    this.database.prepare('INSERT INTO note_search(note_id, title, body, tags, notebook) VALUES (?, ?, ?, ?, ?)')
      .run(noteId, note.title, note.body, this.tags(noteId).join(' '), notebook.name)
  }

  private imageSnapshot(row: ImageRow): ImageSnapshot {
    return {
      id: row.id,
      noteId: row.note_id,
      name: row.name,
      mediaType: row.media_type,
      bytes: row.bytes,
      width: row.width,
      height: row.height,
      digest: row.digest,
      storageName: row.storage_name,
      position: row.position,
      createdAt: row.created_at,
    }
  }

  private recordRevision(noteId: NoteId): void {
    const note = this.noteRow(noteId)
    const notebook = this.notebookRow(note.notebook_id as NotebookId)
    const images = this.imageRows(noteId).map(row => this.imageSnapshot(row))
    this.database.prepare(`
      INSERT INTO note_revisions(
        id, note_id, revision, notebook_id, notebook_name, title, body,
        tags_json, images_json, archived_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      this.createId(), noteId, note.revision, note.notebook_id, notebook.name, note.title, note.body,
      JSON.stringify(this.tags(noteId)), JSON.stringify(images), note.archived_at, this.now(),
    )
  }

  private assertRevision(actual: number, expected: number): void {
    positiveInteger('expectedRevision', expected)
    if (actual !== expected) {
      throw new NotebookError(`revision conflict: expected ${String(expected)}, current ${String(actual)}`, 'REVISION_CONFLICT')
    }
  }

  private async prepareImage(noteId: NoteId, input: ImageUploadInput, position: number): Promise<PendingImage> {
    if (!MEDIA_TYPES.has(input.mediaType)) throw new NotebookError(`unsupported image type ${input.mediaType}`)
    let data: Uint8Array
    try {
      data = Buffer.from(input.data, 'base64')
    } catch {
      throw new NotebookError('image data must be valid base64')
    }
    if (data.byteLength === 0 || data.byteLength > this.config.maxImageBytes) {
      throw new NotebookError(`image must contain 1 to ${String(this.config.maxImageBytes)} bytes`)
    }
    const metadata = await sharp(data, { failOn: 'error', animated: true, limitInputPixels: true }).metadata()
    const mediaType = metadata.format === undefined ? undefined : `image/${metadata.format}`
    if (mediaType !== input.mediaType || metadata.width === undefined || metadata.height === undefined) {
      throw new NotebookError('declared image type does not match decoded image bytes')
    }
    const digest = createHash('sha256').update(data).digest('hex')
    const id = this.createId() as NoteImageId
    const storageName = `${digest}-${id}${IMAGE_EXTENSIONS[input.mediaType]}`
    return {
      id,
      noteId,
      name: safeName(input.name, `image${IMAGE_EXTENSIONS[input.mediaType]}`),
      mediaType: input.mediaType,
      bytes: data.byteLength,
      width: metadata.width,
      height: metadata.height,
      digest,
      storageName,
      position,
      createdAt: this.now(),
      data,
    }
  }

  private publishImages(images: readonly PendingImage[]): void {
    for (const image of images) {
      const temporary = join(this.config.imageDirectory, `.${image.storageName}.${randomUUID()}.tmp`)
      writeFileSync(temporary, image.data, { mode: 0o600, flag: 'wx' })
      renameSync(temporary, join(this.config.imageDirectory, image.storageName))
    }
  }

  private insertImages(images: readonly PendingImage[]): void {
    const statement = this.database.prepare(`
      INSERT INTO note_images(
        id, note_id, name, media_type, bytes, width, height, digest, storage_name, position, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    for (const image of images) {
      statement.run(
        image.id, image.noteId, image.name, image.mediaType, image.bytes, image.width, image.height,
        image.digest, image.storageName, image.position, image.createdAt,
      )
    }
  }

  private cleanupPublished(images: readonly PendingImage[]): void {
    for (const image of images) rmSync(join(this.config.imageDirectory, image.storageName), { force: true })
  }

  /** Return notebook counts and the complete active tag vocabulary. */
  overview(): NotebookOverview {
    this.ensureOpen()
    const rows = this.database.prepare(`
      SELECT n.*,
        SUM(CASE WHEN notes.id IS NOT NULL AND notes.archived_at IS NULL THEN 1 ELSE 0 END) AS active_count,
        SUM(CASE WHEN notes.id IS NOT NULL AND notes.archived_at IS NOT NULL THEN 1 ELSE 0 END) AS archived_count
      FROM notebooks n LEFT JOIN notes ON notes.notebook_id = n.id
      GROUP BY n.id ORDER BY n.updated_at DESC, n.name COLLATE NOCASE
    `).all() as unknown as (NotebookRow & { active_count: number; archived_count: number })[]
    const counts = this.database.prepare(`
      SELECT
        SUM(CASE WHEN archived_at IS NULL THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN archived_at IS NOT NULL THEN 1 ELSE 0 END) AS archived
      FROM notes
    `).get() as { active: number | null; archived: number | null }
    const tags = (this.database.prepare('SELECT name FROM tags ORDER BY name COLLATE NOCASE').all() as { name: string }[]).map(row => row.name)
    return {
      notebooks: rows.map(row => ({
        id: row.id as NotebookId,
        name: row.name,
        revision: row.revision,
        noteCount: row.active_count ?? 0,
        archivedNoteCount: row.archived_count ?? 0,
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
      })),
      tags,
      activeNotes: counts.active ?? 0,
      archivedNotes: counts.archived ?? 0,
    }
  }

  /** Create one empty notebook. */
  createNotebook(nameInput: string): Notebook {
    const timestamp = this.now()
    const name = requiredText('name', nameInput, 120)
    const id = this.createId() as NotebookId
    this.transaction(() => {
      this.database.prepare('INSERT INTO notebooks(id, name, revision, created_at, updated_at) VALUES (?, ?, 1, ?, ?)')
        .run(id, name, timestamp, timestamp)
    })
    const notebook = this.overview().notebooks.find(item => item.id === id)
    if (!notebook) throw new NotebookError('created notebook is unavailable')
    return notebook
  }

  /** Search title, body, tags and notebook name with bounded pagination. */
  search(input: NoteSearchInput): NoteSearchResult {
    this.ensureOpen()
    const limit = Math.min(positiveInteger('limit', input.limit ?? this.config.defaultPageSize), this.config.maxPageSize)
    const offset = nonNegativeInteger('offset', input.offset ?? 0)
    const tags = normalizedTags(input.tags)
    const clauses = [input.archived === true ? 'n.archived_at IS NOT NULL' : 'n.archived_at IS NULL']
    const parameters: (string | number)[] = []
    if (input.notebookId !== undefined) {
      clauses.push('n.notebook_id = ?')
      parameters.push(input.notebookId)
    }
    for (const tag of tags) {
      clauses.push('EXISTS (SELECT 1 FROM note_tags nt WHERE nt.note_id = n.id AND nt.tag_name = ? COLLATE NOCASE)')
      parameters.push(tag)
    }
    const query = input.query?.trim()
    if (query) {
      clauses.push('n.id IN (SELECT note_id FROM note_search WHERE note_search MATCH ?)')
      parameters.push(escapeFtsQuery(query))
    }
    const where = clauses.join(' AND ')
    const total = (this.database.prepare(`SELECT COUNT(*) AS total FROM notes n WHERE ${where}`).get(...parameters) as { total: number }).total
    const rows = this.database.prepare(`
      SELECT n.* FROM notes n
      WHERE ${where}
      ORDER BY n.updated_at DESC, n.id
      LIMIT ? OFFSET ?
    `).all(...parameters, limit, offset) as unknown as NoteRow[]
    return {
      notes: rows.map(row => {
        const note = this.toNote(row)
        return {
          id: note.id,
          notebookId: note.notebookId,
          notebookName: note.notebookName,
          title: note.title,
          excerpt: note.excerpt,
          tags: note.tags,
          imageCount: note.imageCount,
          revision: note.revision,
          createdAt: note.createdAt,
          updatedAt: note.updatedAt,
          archivedAt: note.archivedAt,
        }
      }),
      total,
      hasMore: offset + rows.length < total,
    }
  }

  /** Read one complete note. */
  read(input: NoteIdInput): Note {
    this.ensureOpen()
    return this.toNote(this.noteRow(input.id))
  }

  /** Create a note, creating its named notebook when absent. */
  async create(input: CreateNoteInput): Promise<Note> {
    const timestamp = this.now()
    const title = requiredText('title', input.title, 240)
    const body = bodyText(input.body, this.config.maxBodyBytes)
    const tags = normalizedTags(input.tags)
    const noteId = this.createId() as NoteId
    const uploads = input.images ?? []
    if (uploads.length > this.config.maxImagesPerNote) throw new NotebookError('too many images for one note')
    const images = await Promise.all(uploads.map((image, index) => this.prepareImage(noteId, image, index)))
    this.publishImages(images)
    try {
      this.transaction(() => {
        const notebook = this.resolveNotebook(input, timestamp)
        this.database.prepare(`
          INSERT INTO notes(id, notebook_id, title, body, revision, created_at, updated_at, archived_at)
          VALUES (?, ?, ?, ?, 1, ?, ?, NULL)
        `).run(noteId, notebook.id, title, body, timestamp, timestamp)
        this.replaceTags(noteId, tags)
        this.insertImages(images)
        this.refreshSearch(noteId)
        this.recordRevision(noteId)
        this.database.prepare('UPDATE notebooks SET revision = revision + 1, updated_at = ? WHERE id = ?').run(timestamp, notebook.id)
      })
    } catch (error) {
      this.cleanupPublished(images)
      throw error
    }
    return this.read({ id: noteId })
  }

  /** Update note content and metadata with optimistic concurrency. */
  async update(input: UpdateNoteInput): Promise<Note> {
    const previous = this.noteRow(input.id)
    this.assertRevision(previous.revision, input.expectedRevision)
    const title = input.title === undefined ? previous.title : requiredText('title', input.title, 240)
    const nextBody = input.body === undefined
      ? previous.body
      : input.mode === 'append'
        ? bodyText(`${previous.body}${previous.body.length === 0 ? '' : '\n\n'}${input.body}`, this.config.maxBodyBytes)
        : bodyText(input.body, this.config.maxBodyBytes)
    const tags = input.tags === undefined ? this.tags(input.id) : normalizedTags(input.tags)
    const currentImages = this.imageRows(input.id)
    const removedIds = new Set((input.removeImageIds ?? []).map(String))
    const retained = currentImages.filter(image => !removedIds.has(image.id))
    if (removedIds.size !== currentImages.length - retained.length) throw new NotebookError('removeImageIds contains an unknown image')
    const uploads = input.images ?? []
    if (retained.length + uploads.length > this.config.maxImagesPerNote) throw new NotebookError('too many images for one note')
    const images = await Promise.all(uploads.map((image, index) => this.prepareImage(input.id, image, retained.length + index)))
    this.publishImages(images)
    try {
      this.transaction(() => {
        const current = this.noteRow(input.id)
        this.assertRevision(current.revision, input.expectedRevision)
        const notebook = input.notebookId === undefined && input.notebookName === undefined
          ? this.notebookRow(current.notebook_id as NotebookId)
          : this.resolveNotebook(input, this.now())
        this.database.prepare(`
          UPDATE notes SET notebook_id = ?, title = ?, body = ?, revision = revision + 1, updated_at = ?
          WHERE id = ?
        `).run(notebook.id, title, nextBody, this.now(), input.id)
        this.replaceTags(input.id, tags)
        if (removedIds.size > 0) {
          this.database.prepare(`DELETE FROM note_images WHERE note_id = ? AND id IN (${[...removedIds].map(() => '?').join(',')})`)
            .run(input.id, ...removedIds)
        }
        this.insertImages(images)
        this.refreshSearch(input.id)
        this.recordRevision(input.id)
        this.database.prepare('UPDATE notebooks SET revision = revision + 1, updated_at = ? WHERE id IN (?, ?)')
          .run(this.now(), current.notebook_id, notebook.id)
      })
    } catch (error) {
      this.cleanupPublished(images)
      throw error
    }
    return this.read({ id: input.id })
  }

  /** Archive one active note. */
  archive(input: NoteLifecycleInput): Note {
    return this.setArchived(input, this.now())
  }

  /** Restore one archived note. */
  restore(input: NoteLifecycleInput): Note {
    return this.setArchived(input, null)
  }

  private setArchived(input: NoteLifecycleInput, archivedAt: number | null): Note {
    this.transaction(() => {
      const note = this.noteRow(input.id)
      this.assertRevision(note.revision, input.expectedRevision)
      if ((note.archived_at !== null) === (archivedAt !== null)) throw new NotebookError('note already has the requested archive state')
      this.database.prepare('UPDATE notes SET archived_at = ?, revision = revision + 1, updated_at = ? WHERE id = ?')
        .run(archivedAt, this.now(), input.id)
      this.recordRevision(input.id)
      this.database.prepare('UPDATE notebooks SET revision = revision + 1, updated_at = ? WHERE id = ?')
        .run(this.now(), note.notebook_id)
    })
    return this.read({ id: input.id })
  }

  /** List immutable note snapshots newest first. */
  revisions(input: NoteRevisionInput): NoteRevisionResult {
    this.noteRow(input.id)
    const limit = Math.min(positiveInteger('limit', input.limit ?? this.config.defaultPageSize), this.config.maxPageSize)
    const offset = nonNegativeInteger('offset', input.offset ?? 0)
    const total = (this.database.prepare('SELECT COUNT(*) AS total FROM note_revisions WHERE note_id = ?').get(input.id) as { total: number }).total
    const rows = this.database.prepare(`
      SELECT * FROM note_revisions WHERE note_id = ? ORDER BY revision DESC LIMIT ? OFFSET ?
    `).all(input.id, limit, offset) as unknown as RevisionRow[]
    return {
      revisions: rows.map(row => ({
        id: row.id as NoteRevision['id'],
        noteId: row.note_id as NoteId,
        revision: row.revision,
        notebookId: row.notebook_id as NotebookId,
        notebookName: row.notebook_name,
        title: row.title,
        body: row.body,
        tags: parseJsonArray(row.tags_json, 'tag').map(String),
        images: parseJsonArray(row.images_json, 'image').map(value => asNoteImage(value as ImageSnapshot)),
        archivedAt: iso(row.archived_at),
        createdAt: new Date(row.created_at).toISOString(),
      })),
      total,
      hasMore: offset + rows.length < total,
    }
  }

  /** Restore a historical snapshot as a new current revision. */
  restoreRevision(input: RestoreRevisionInput): Note {
    this.transaction(() => {
      const note = this.noteRow(input.id)
      this.assertRevision(note.revision, input.expectedRevision)
      const snapshot = this.database.prepare('SELECT * FROM note_revisions WHERE note_id = ? AND revision = ?')
        .get(input.id, input.revision) as RevisionRow | undefined
      if (!snapshot) throw new NotebookError(`revision ${String(input.revision)} was not found`, 'NOT_FOUND')
      const images = parseJsonArray(snapshot.images_json, 'image').map(value => value as ImageSnapshot)
      for (const image of images) {
        if (!existsSync(join(this.config.imageDirectory, image.storageName))) {
          throw new NotebookError(`revision image ${image.id} is unavailable`)
        }
      }
      const existingNotebook = this.database.prepare('SELECT * FROM notebooks WHERE id = ?')
        .get(snapshot.notebook_id) as NotebookRow | undefined
      const notebook = existingNotebook ?? this.resolveNotebook({ notebookName: snapshot.notebook_name }, this.now())
      this.database.prepare(`
        UPDATE notes SET notebook_id = ?, title = ?, body = ?, archived_at = ?, revision = revision + 1, updated_at = ?
        WHERE id = ?
      `).run(notebook.id, snapshot.title, snapshot.body, snapshot.archived_at, this.now(), input.id)
      this.replaceTags(input.id, parseJsonArray(snapshot.tags_json, 'tag').map(String))
      this.database.prepare('DELETE FROM note_images WHERE note_id = ?').run(input.id)
      const insert = this.database.prepare(`
        INSERT INTO note_images(id, note_id, name, media_type, bytes, width, height, digest, storage_name, position, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      for (const image of images) {
        insert.run(
          image.id, input.id, image.name, image.mediaType, image.bytes, image.width, image.height,
          image.digest, image.storageName, image.position, image.createdAt,
        )
      }
      this.refreshSearch(input.id)
      this.recordRevision(input.id)
    })
    return this.read({ id: input.id })
  }

  /** Rename a notebook with optimistic concurrency. */
  renameNotebook(input: RenameNotebookInput): Notebook {
    this.transaction(() => {
      const notebook = this.notebookRow(input.id)
      this.assertRevision(notebook.revision, input.expectedRevision)
      const name = requiredText('name', input.name, 120)
      this.database.prepare('UPDATE notebooks SET name = ?, revision = revision + 1, updated_at = ? WHERE id = ?')
        .run(name, this.now(), input.id)
      const notes = this.database.prepare('SELECT id FROM notes WHERE notebook_id = ?').all(input.id) as { id: string }[]
      for (const note of notes) this.refreshSearch(note.id as NoteId)
    })
    return this.overview().notebooks.find(notebook => notebook.id === input.id) as Notebook
  }

  /** Delete an empty notebook. */
  deleteNotebook(input: DeleteNotebookInput): MutationResult {
    this.transaction(() => {
      const notebook = this.notebookRow(input.id)
      this.assertRevision(notebook.revision, input.expectedRevision)
      const { count } = this.database.prepare('SELECT COUNT(*) AS count FROM notes WHERE notebook_id = ?').get(input.id) as { count: number }
      if (count > 0) throw new NotebookError('non-empty notebooks cannot be deleted')
      this.database.prepare('DELETE FROM notebooks WHERE id = ?').run(input.id)
    })
    return { ok: true }
  }

  /** Permanently delete one archived note and collect unreferenced image files. */
  deleteNote(input: NoteLifecycleInput): MutationResult {
    const staged: { storageName: string; trashPath: string }[] = []
    try {
      this.transaction(() => {
        const note = this.noteRow(input.id)
        this.assertRevision(note.revision, input.expectedRevision)
        if (note.archived_at === null) throw new NotebookError('archive a note before permanent deletion')
        const current = this.imageRows(input.id).map(row => row.storage_name)
        const revisions = this.database.prepare('SELECT images_json FROM note_revisions WHERE note_id = ?').all(input.id) as { images_json: string }[]
        const names = new Set(current)
        for (const revision of revisions) {
          for (const image of parseJsonArray(revision.images_json, 'image')) names.add((image as ImageSnapshot).storageName)
        }
        for (const storageName of names) {
          const source = join(this.config.imageDirectory, storageName)
          if (!existsSync(source)) continue
          const trashPath = join(this.trashDirectory, `${randomUUID()}--${storageName}`)
          renameSync(source, trashPath)
          staged.push({ storageName, trashPath })
        }
        this.database.prepare('DELETE FROM note_search WHERE note_id = ?').run(input.id)
        this.database.prepare('DELETE FROM notes WHERE id = ?').run(input.id)
      })
    } catch (error) {
      for (const file of staged) {
        if (existsSync(file.trashPath)) renameSync(file.trashPath, join(this.config.imageDirectory, file.storageName))
      }
      throw error
    }
    for (const file of staged) rmSync(file.trashPath, { force: true })
    return { ok: true }
  }

  /** Add one validated image and create a new note revision. */
  async addImage(input: NoteImageInput): Promise<Note> {
    return this.update({
      id: input.noteId,
      expectedRevision: input.expectedRevision,
      mode: 'replace',
      images: [input.image],
    })
  }

  /** Return one image as canonical base64 after digest verification. */
  imageData(input: { id: NoteImageId }): ImageData {
    const row = this.database.prepare('SELECT * FROM note_images WHERE id = ?').get(input.id) as ImageRow | undefined
    if (!row) throw new NotebookError(`image ${input.id} was not found`, 'NOT_FOUND')
    const data = readFileSync(join(this.config.imageDirectory, row.storage_name))
    const digest = createHash('sha256').update(data).digest('hex')
    if (digest !== row.digest || statSync(join(this.config.imageDirectory, row.storage_name)).size !== row.bytes) {
      throw new NotebookError(`image ${input.id} failed integrity verification`)
    }
    return { image: this.toImage(row), data: data.toString('base64') }
  }

  /** Close the SQLite connection. */
  close(): void {
    if (this.closed) return
    this.database.close()
    this.closed = true
  }
}
