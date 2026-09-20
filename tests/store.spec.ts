import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NOTEBOOK_SCHEMA_VERSION, NotebookError, NotebookStore } from '../src/host/store.ts'
import type { ImageUploadInput } from '../src/types.ts'

let root: string
let store: NotebookStore
let counter: number

function config() {
  return {
    databasePath: join(root, 'notebook.sqlite3'),
    imageDirectory: join(root, 'images'),
    busyTimeoutMs: 5000,
    defaultPageSize: 2,
    maxPageSize: 10,
    maxBodyBytes: 1024 * 1024,
    maxImageBytes: 10 * 1024 * 1024,
    maxImagesPerNote: 50,
  }
}

async function png(name = 'diagram.png'): Promise<ImageUploadInput> {
  const data = await sharp({
    create: { width: 4, height: 3, channels: 4, background: '#336699' },
  }).png().toBuffer()
  return { name, mediaType: 'image/png', data: data.toString('base64') }
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dsh-notebook-test-'))
  counter = 0
  store = new NotebookStore(config(), {
    now: () => 1_700_000_000_000 + counter,
    createId: () => `id-${String(++counter)}`,
  })
})

afterEach(async () => {
  store.close()
  await rm(root, { recursive: true, force: true })
})

describe('NotebookStore', () => {
  it('creates schema with required SQLite settings and searchable note fields', async () => {
    const note = await store.create({
      notebookName: 'Architecture',
      title: 'Remote persistence',
      body: 'Use optimistic revision checks for every write.',
      tags: ['sqlite', 'concurrency'],
    })
    const database = new DatabaseSync(config().databasePath)
    expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version)
      .toBe(NOTEBOOK_SCHEMA_VERSION)
    expect((database.prepare('PRAGMA journal_mode').get() as { journal_mode: string }).journal_mode)
      .toBe('wal')
    expect((database.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }).foreign_keys)
      .toBe(1)
    database.close()

    expect(store.search({ query: 'optimistic' }).notes.map(item => item.id)).toEqual([note.id])
    expect(store.search({ query: 'concur' }).notes.map(item => item.id)).toEqual([note.id])
    expect(store.search({ query: 'Architecture' }).notes.map(item => item.id)).toEqual([note.id])
  })

  it('paginates newest first and filters by notebook, tags and archive state', async () => {
    const first = await store.create({ notebookName: 'Work', title: 'First', body: 'one', tags: ['alpha'] })
    const second = await store.create({ notebookName: 'Work', title: 'Second', body: 'two', tags: ['beta'] })
    const third = await store.create({ notebookName: 'Home', title: 'Third', body: 'three', tags: ['alpha'] })
    const page = store.search({ limit: 2 })
    expect(page.total).toBe(3)
    expect(page.notes.map(note => note.id)).toEqual([third.id, second.id])
    expect(page.hasMore).toBe(true)
    expect(store.search({ offset: 2 }).notes.map(note => note.id)).toEqual([first.id])
    expect(store.search({ notebookId: first.notebookId }).total).toBe(2)
    expect(store.search({ tags: ['alpha'] }).total).toBe(2)

    store.archive({ id: first.id, expectedRevision: first.revision })
    expect(store.search({}).notes.map(note => note.id)).not.toContain(first.id)
    expect(store.search({ archived: true }).notes.map(note => note.id)).toEqual([first.id])
  })

  it('rejects stale revisions and preserves concurrent content', async () => {
    const note = await store.create({ notebookName: 'Work', title: 'Plan', body: 'A' })
    const updated = await store.update({
      id: note.id,
      expectedRevision: note.revision,
      mode: 'append',
      body: 'B',
    })
    expect(updated.body).toBe('A\n\nB')
    await expect(store.update({
      id: note.id,
      expectedRevision: note.revision,
      mode: 'replace',
      body: 'stale',
    })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' })
    expect(store.read({ id: note.id }).body).toBe('A\n\nB')
  })

  it('stores complete revisions and restores a snapshot as a new revision', async () => {
    const note = await store.create({
      notebookName: 'Research',
      title: 'Draft',
      body: 'version one',
      tags: ['one'],
      images: [await png()],
    })
    const changed = await store.update({
      id: note.id,
      expectedRevision: note.revision,
      mode: 'replace',
      title: 'Final',
      body: 'version two',
      tags: ['two'],
      removeImageIds: [note.images[0]!.id],
    })
    const revisions = store.revisions({ id: note.id, limit: 10 })
    expect(revisions.revisions.map(item => item.revision)).toEqual([2, 1])
    expect(revisions.revisions.find(item => item.revision === 1)).toMatchObject({
      title: 'Draft',
      body: 'version one',
      tags: ['one'],
    })
    expect(revisions.revisions.find(item => item.revision === 1)?.images).toHaveLength(1)

    const restored = store.restoreRevision({
      id: note.id,
      revision: 1,
      expectedRevision: changed.revision,
    })
    expect(restored).toMatchObject({
      title: 'Draft',
      body: 'version one',
      tags: ['one'],
      revision: 3,
      imageCount: 1,
    })
    expect(store.revisions({ id: note.id, limit: 10 }).revisions.map(item => item.revision)).toEqual([3, 2, 1])
  })

  it('validates image bytes, keeps history images, and removes them after permanent deletion', async () => {
    const note = await store.create({
      notebookName: 'Visual',
      title: 'Diagram',
      body: 'A diagram',
      images: [await png('../unsafe name.png')],
    })
    const encoded = store.imageData({ id: note.images[0]!.id })
    expect(encoded.image).toMatchObject({ width: 4, height: 3, mediaType: 'image/png' })
    expect(Buffer.from(encoded.data, 'base64')).toEqual(Buffer.from(await readFile(join(root, 'images', note.images[0]!.digest + `-${note.images[0]!.id}.png`))))

    const withoutImage = await store.update({
      id: note.id,
      expectedRevision: note.revision,
      mode: 'replace',
      removeImageIds: [note.images[0]!.id],
    })
    expect(withoutImage.images).toEqual([])
    const historyImage = store.revisions({ id: note.id }).revisions.find(item => item.revision === 1)?.images[0]
    expect(historyImage).toBeDefined()
    const imagePath = join(root, 'images', `${historyImage!.digest}-${historyImage!.id}.png`)
    expect(existsSync(imagePath)).toBe(true)

    const archived = store.archive({ id: note.id, expectedRevision: withoutImage.revision })
    store.deleteNote({ id: note.id, expectedRevision: archived.revision })
    expect(existsSync(imagePath)).toBe(false)
  })

  it('restores staged trash on startup when the database still references the image', async () => {
    const note = await store.create({
      notebookName: 'Recovery',
      title: 'Image',
      body: '',
      images: [await png()],
    })
    const imageName = `${note.images[0]!.digest}-${note.images[0]!.id}.png`
    const imagePath = join(root, 'images', imageName)
    const trash = join(root, 'images', '.trash', `interrupted--${imageName}`)
    store.close()
    mkdirSync(dirname(trash), { recursive: true })
    writeFileSync(trash, await readFile(imagePath))
    await rm(imagePath)

    store = new NotebookStore(config())
    expect(existsSync(imagePath)).toBe(true)
    expect(existsSync(trash)).toBe(false)
  })

  it('requires archive before permanent deletion and refuses non-empty notebook deletion', async () => {
    const note = await store.create({ notebookName: 'Protected', title: 'Keep', body: '' })
    expect(() => store.deleteNote({ id: note.id, expectedRevision: note.revision }))
      .toThrowError(NotebookError)
    expect(() => store.deleteNotebook({ id: note.notebookId, expectedRevision: 2 }))
      .toThrow(/non-empty/)
    const archived = store.archive({ id: note.id, expectedRevision: note.revision })
    store.deleteNote({ id: note.id, expectedRevision: archived.revision })
    const notebook = store.overview().notebooks[0]!
    expect(store.deleteNotebook({ id: notebook.id, expectedRevision: notebook.revision })).toEqual({ ok: true })
  })

  it('rejects invalid images before publishing a note', async () => {
    await expect(store.create({
      notebookName: 'Bad',
      title: 'Not an image',
      body: '',
      images: [{ name: 'bad.png', mediaType: 'image/png', data: Buffer.from('not png').toString('base64') }],
    })).rejects.toThrow()
    expect(store.overview().activeNotes).toBe(0)
  })

  it('refuses databases from a future schema version', () => {
    store.close()
    const database = new DatabaseSync(config().databasePath)
    database.exec(`PRAGMA user_version = ${String(NOTEBOOK_SCHEMA_VERSION + 1)}`)
    database.close()
    expect(() => new NotebookStore(config())).toThrow(/newer than supported/)
    store = { close() {} } as NotebookStore
  })
})
