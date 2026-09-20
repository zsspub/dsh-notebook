/** Agent-facing notebook tools with search-first guidance and current-turn image import. */

import type { Context } from '@deepseek-ai/cordis'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { defineTool, type ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { CreateNoteInput, ImageUploadInput, Note, NoteId, NotebookId, UpdateNoteInput } from './types.ts'

export const name = 'notebook-tools'
export const inject = ['tools', 'notebook', 'attachments']

const string = { type: 'string', required: true } as const
const revision = {
  type: 'integer',
  required: true,
  description: 'Current note revision returned by notebook_read. Re-read and merge after a conflict.',
} as const
const imageIndexes = {
  type: 'array',
  items: { type: 'integer' },
  description: 'Optional 1-based indexes of relevant images in the current human message. Never pass attachment ids.',
} as const

interface AgentWithSession {
  readonly session: {
    snapshotEvents(): readonly {
      readonly type: string
      readonly data: unknown
    }[]
  }
}

function currentHumanImages(exec: ToolRunContext): ImageAttachmentRef[] {
  const agent = exec.agent as (AgentWithSession & typeof exec.agent) | undefined
  if (!agent) return []
  const events = agent.session.snapshotEvents()
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event?.type !== 'user/message') continue
    const message = event.data as {
      readonly source?: { readonly kind?: string }
      readonly content?: readonly ({ readonly type?: string; readonly attachment?: ImageAttachmentRef })[]
    }
    if (message.source?.kind !== 'user') continue
    return (message.content ?? [])
      .filter((part): part is { readonly type: 'image'; readonly attachment: ImageAttachmentRef } =>
        part.type === 'image' && part.attachment !== undefined)
      .map(part => part.attachment)
  }
  return []
}

async function selectedImages(
  ctx: Context,
  exec: ToolRunContext,
  indexes: readonly number[] | undefined,
): Promise<ImageUploadInput[]> {
  if (indexes === undefined || indexes.length === 0) return []
  const refs = currentHumanImages(exec)
  const unique = [...new Set(indexes)]
  if (unique.some(index => !Number.isSafeInteger(index) || index < 1 || index > refs.length)) {
    throw new Error(`imageIndexes must refer to the ${String(refs.length)} images in the current human message`)
  }
  const images: ImageUploadInput[] = []
  for (const index of unique) {
    exec.signal.throwIfAborted()
    const stored = await ctx.attachments.readImage(refs[index - 1] as ImageAttachmentRef, exec.signal)
    images.push({
      name: stored.ref.name ?? `image-${String(index)}`,
      mediaType: stored.ref.mediaType,
      data: Buffer.from(stored.data).toString('base64'),
    })
  }
  return images
}

function resultText(
  note: Note,
  action: 'created' | 'updated' | 'archived' | 'restored',
  notebookDisposition: 'created' | 'reused' = 'reused',
): string {
  return JSON.stringify({
    action,
    note,
    notebook: { id: note.notebookId, name: note.notebookName },
    notebookDisposition,
    revision: note.revision,
    imageCount: note.imageCount,
  })
}

/** Register bounded notebook search, read, write and reversible lifecycle tools. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'notebook_search',
    description: 'Search the shared notebook before creating or updating a note. Searches title, Markdown body, tags and notebook name. Use this first for every note-taking request.',
    parameters: {
      query: { type: 'string', description: 'Words describing the information to find.' },
      notebookId: { type: 'string', description: 'Optional notebook id filter.' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Tags that must all match.' },
      archived: { type: 'boolean', description: 'True searches only archived notes; default false.' },
      limit: { type: 'integer', description: 'Page size, at most 100.' },
      offset: { type: 'integer', description: 'Zero-based page offset.' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, result) => [{ type: 'text', text: result }],
    },
    execute: async (args, exec) => JSON.stringify(await ctx.notebook.search({
        ...args,
        notebookId: args.notebookId as NotebookId | undefined,
      }, exec.signal)),
    presentCall: args => ({ card: 'generic', title: `Search notebook: ${args.query ?? ''}`, kind: 'search', rawInput: args }),
  })), 'notebook: search tool')

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'notebook_read',
    description: 'Read one complete note, including its current revision, Markdown, tags and images. Read a search candidate before updating it.',
    parameters: { id: { ...string, description: 'Note id returned by notebook_search.' } },
    output: {
      schema: { type: 'string' },
      render: (_args, result) => [{ type: 'text', text: result }],
    },
    execute: async (args, exec) => JSON.stringify(await ctx.notebook.read({ id: args.id as NoteId }, exec.signal)),
    presentCall: args => ({ card: 'generic', title: `Read note ${args.id}`, kind: 'read', rawInput: args }),
  })), 'notebook: read tool')

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'notebook_note_create',
    description: 'Create a Markdown note only after notebook_search. Reuse a notebook by id, or supply notebookName to reuse/create one by name. Attach relevant current-message images by 1-based position.',
    parameters: {
      notebookId: { type: 'string', description: 'Existing notebook id. Mutually exclusive with notebookName.' },
      notebookName: { type: 'string', description: 'Existing or new notebook name. Mutually exclusive with notebookId.' },
      title: string,
      body: { ...string, description: 'Complete Markdown body.' },
      tags: { type: 'array', items: { type: 'string' } },
      imageIndexes,
    },
    output: {
      schema: { type: 'string' },
      render: (_args, result) => [{ type: 'text', text: result }],
    },
    async execute(args, exec) {
      const overview = await ctx.notebook.overview({}, exec.signal)
      const reused = args.notebookId !== undefined
        || overview.notebooks.some(notebook => notebook.name.toLocaleLowerCase() === args.notebookName?.trim().toLocaleLowerCase())
      const input: CreateNoteInput = {
        notebookId: args.notebookId as NotebookId | undefined,
        notebookName: args.notebookName,
        title: args.title,
        body: args.body,
        tags: args.tags,
        images: await selectedImages(ctx, exec, args.imageIndexes),
      }
      const note = await ctx.notebook.create(input, exec.signal)
      return resultText(note, 'created', reused ? 'reused' : 'created')
    },
    presentCall: args => ({ card: 'generic', title: `Create note: ${args.title}`, kind: 'other', rawInput: args }),
  })), 'notebook: create tool')

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'notebook_note_update',
    description: 'Update a note after notebook_read. append adds Markdown after the current body; replace replaces it. On REVISION_CONFLICT, read again, merge the concurrent edit, and retry. Current-message images use 1-based positions.',
    parameters: {
      id: string,
      expectedRevision: revision,
      mode: { type: 'string', enum: ['append', 'replace'], required: true },
      title: { type: 'string' },
      body: { type: 'string', description: 'Markdown to append or use as replacement.' },
      notebookId: { type: 'string' },
      notebookName: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Complete replacement tag set.' },
      imageIndexes,
    },
    output: {
      schema: { type: 'string' },
      render: (_args, result) => [{ type: 'text', text: result }],
    },
    async execute(args, exec) {
      const input: UpdateNoteInput = {
        id: args.id as NoteId,
        expectedRevision: args.expectedRevision,
        mode: args.mode,
        title: args.title,
        body: args.body,
        notebookId: args.notebookId as NotebookId | undefined,
        notebookName: args.notebookName,
        tags: args.tags,
        images: await selectedImages(ctx, exec, args.imageIndexes),
      }
      const note = await ctx.notebook.update(input, exec.signal)
      return resultText(note, 'updated')
    },
    presentCall: args => ({ card: 'generic', title: `Update note ${args.id}`, kind: 'other', rawInput: args }),
  })), 'notebook: update tool')

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'notebook_note_archive',
    description: 'Archive one note after reading its latest revision. This is reversible and is the normal delete path.',
    parameters: { id: string, expectedRevision: revision },
    output: {
      schema: { type: 'string' },
      render: (_args, result) => [{ type: 'text', text: result }],
    },
    async execute(args, exec) {
      const note = await ctx.notebook.archive({ id: args.id as NoteId, expectedRevision: args.expectedRevision }, exec.signal)
      return resultText(note, 'archived')
    },
    presentCall: args => ({ card: 'generic', title: `Archive note ${args.id}`, kind: 'other', rawInput: args }),
  })), 'notebook: archive tool')

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'notebook_note_restore',
    description: 'Restore one archived note after reading its latest revision.',
    parameters: { id: string, expectedRevision: revision },
    output: {
      schema: { type: 'string' },
      render: (_args, result) => [{ type: 'text', text: result }],
    },
    async execute(args, exec) {
      const note = await ctx.notebook.restore({ id: args.id as NoteId, expectedRevision: args.expectedRevision }, exec.signal)
      return resultText(note, 'restored')
    },
    presentCall: args => ({ card: 'generic', title: `Restore note ${args.id}`, kind: 'other', rawInput: args }),
  })), 'notebook: restore tool')
}
