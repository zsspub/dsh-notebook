import type { Context } from '@deepseek-ai/cordis'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { describe, expect, it, vi } from 'vitest'
import { apply } from '../src/tools.ts'
import type { Note } from '../src/types.ts'

const signal = new AbortController().signal
const imageRef = {
  attachmentId: 'digest' as ImageAttachmentRef['attachmentId'],
  mediaType: 'image/png',
  bytes: 8,
  width: 2,
  height: 1,
  name: 'capture.png',
} as const satisfies ImageAttachmentRef

function note(overrides: Partial<Note> = {}): Note {
  return {
    id: 'note-1' as Note['id'],
    notebookId: 'book-1' as Note['notebookId'],
    notebookName: 'Research',
    title: 'Agent notes',
    body: 'Body',
    excerpt: 'Body',
    tags: ['agent'],
    images: [],
    imageCount: 0,
    revision: 1,
    createdAt: '2026-09-20T00:00:00.000Z',
    updatedAt: '2026-09-20T00:00:00.000Z',
    archivedAt: null,
    ...overrides,
  }
}

function harness() {
  const definitions = new Map<string, ToolDefinition>()
  const notebook = {
    overview: vi.fn(async () => ({
      notebooks: [{ id: 'book-1', name: 'Research' }],
      tags: [],
      activeNotes: 0,
      archivedNotes: 0,
    })),
    search: vi.fn(async () => ({ notes: [], total: 0, hasMore: false })),
    read: vi.fn(async () => note()),
    create: vi.fn(async () => note()),
    update: vi.fn(async () => note({ revision: 2 })),
    archive: vi.fn(async () => note({ revision: 2, archivedAt: '2026-09-20T00:00:01.000Z' })),
    restore: vi.fn(async () => note({ revision: 3 })),
  }
  const attachments = {
    readImage: vi.fn(async () => ({
      ref: imageRef,
      data: Uint8Array.from([137, 80, 78, 71]),
    })),
  }
  const ctx = {
    notebook,
    attachments,
    tools: {
      register(definition: ToolDefinition) {
        definitions.set(definition.name, definition)
        return () => definitions.delete(definition.name)
      },
    },
    effect(register: () => unknown) {
      return register()
    },
  } as unknown as Context
  apply(ctx)
  return { definitions, notebook, attachments }
}

function execution(events: readonly unknown[] = []): ToolRunContext {
  return {
    signal,
    concludeTurn() {},
    deferContext() {},
    callId: 'call' as ToolRunContext['callId'],
    rootCallId: 'call' as ToolRunContext['rootCallId'],
    token: Symbol('tool') as ToolRunContext['token'],
    name: 'test',
    arguments: {},
    agent: {
      session: { snapshotEvents: () => events },
    },
  } as unknown as ToolRunContext
}

describe('notebook Agent tools', () => {
  it('registers the complete public tool set without destructive panel-only operations', () => {
    const { definitions } = harness()
    expect([...definitions.keys()]).toEqual([
      'notebook_search',
      'notebook_read',
      'notebook_note_create',
      'notebook_note_update',
      'notebook_note_archive',
      'notebook_note_restore',
    ])
    expect([...definitions.keys()]).not.toContain('notebook_note_delete')
    expect([...definitions.keys()]).not.toContain('notebook_revision_restore')
  })

  it('returns bounded JSON for search and full JSON for read', async () => {
    const { definitions, notebook } = harness()
    notebook.search.mockResolvedValueOnce({ notes: [note()] as never[], total: 1, hasMore: false })
    const search = definitions.get('notebook_search')!
    const read = definitions.get('notebook_read')!
    const searchValue = await search.execute({ query: 'agent', limit: 5 }, execution())
    const readValue = await read.execute({ id: 'note-1' }, execution())
    expect(JSON.parse(String(searchValue))).toMatchObject({ total: 1, hasMore: false })
    expect(JSON.parse(String(readValue))).toMatchObject({ id: 'note-1', revision: 1 })
  })

  it('copies selected images from only the latest human message when creating', async () => {
    const { definitions, notebook, attachments } = harness()
    const create = definitions.get('notebook_note_create')!
    const value = await create.execute({
      notebookName: 'Ideas',
      title: 'Sketch',
      body: 'See image.',
      tags: ['visual'],
      imageIndexes: [1],
    }, execution([
      {
        type: 'user/message',
        data: { source: { kind: 'user' }, content: [{ type: 'image', attachment: imageRef }] },
      },
      {
        type: 'user/message',
        data: { source: { kind: 'plugin' }, content: [{ type: 'text', text: 'skill' }] },
      },
    ]))
    expect(attachments.readImage).toHaveBeenCalledWith(imageRef, signal)
    expect(notebook.create).toHaveBeenCalledWith(expect.objectContaining({
      notebookName: 'Ideas',
      images: [{
        name: 'capture.png',
        mediaType: 'image/png',
        data: Buffer.from([137, 80, 78, 71]).toString('base64'),
      }],
    }), signal)
    expect(JSON.parse(String(value))).toMatchObject({
      action: 'created',
      notebookDisposition: 'created',
      imageCount: 0,
    })
  })

  it('reports notebook reuse and passes append updates with optimistic revision', async () => {
    const { definitions, notebook } = harness()
    const create = definitions.get('notebook_note_create')!
    const update = definitions.get('notebook_note_update')!
    expect(JSON.parse(String(await create.execute({
      notebookName: 'research',
      title: 'Existing book',
      body: 'Text',
    }, execution())))).toMatchObject({ notebookDisposition: 'reused' })
    await update.execute({
      id: 'note-1',
      expectedRevision: 7,
      mode: 'append',
      body: 'More',
      tags: ['merged'],
    }, execution())
    expect(notebook.update).toHaveBeenCalledWith(expect.objectContaining({
      id: 'note-1',
      expectedRevision: 7,
      mode: 'append',
      body: 'More',
      tags: ['merged'],
    }), signal)
  })

  it('rejects image indexes not present in the current human message', async () => {
    const { definitions, notebook } = harness()
    await expect(definitions.get('notebook_note_create')!.execute({
      notebookName: 'Ideas',
      title: 'No image',
      body: '',
      imageIndexes: [2],
    }, execution([{
      type: 'user/message',
      data: { source: { kind: 'user' }, content: [{ type: 'image', attachment: imageRef }] },
    }]))).rejects.toThrow(/1 images/)
    expect(notebook.create).not.toHaveBeenCalled()
  })
})
