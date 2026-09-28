// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import React, { type ComponentProps } from 'react'
import { createPortal } from 'react-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NotebookApi } from '../src/client/index.ts'
import { NotebookPanel } from '../src/client/Panel.tsx'
import { en } from '../src/client/locales.ts'
import type { Note, Notebook, NoteRevision, NoteSearchInput } from '../src/types.ts'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({ icon, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ReactNode }) =>
    <button type="button" {...props}>{icon}{children}</button>,
  DisclosureRow: ({ title, icon, open, onToggle, children }: {
    title: string
    icon?: React.ReactNode
    open: boolean
    onToggle: () => void
    children?: React.ReactNode
  }) => <section><button type="button" onClick={onToggle}>{icon}{title}</button>{open && children}</section>,
  Input: ({ icon, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { icon?: React.ReactNode }) =>
    <span>{icon}<input {...props} /></span>,
  MarkdownText: ({ text }: { text: string }) => <article data-testid="markdown">{text}</article>,
  Menu: ({ open, anchor, items, onSelect }: {
    open: boolean
    anchor: React.ReactNode
    items: readonly ({ id: string; label?: React.ReactNode; type?: string })[]
    onSelect: (id: string) => void
  }) => <>{anchor}{open && <div role="menu">{items.filter(item => item.type === undefined).map(item =>
    <button key={item.id} type="button" role="menuitem" onClick={() => onSelect(item.id)}>{item.label}</button>)}</div>}</>,
  Modal: ({ open, onClose, title, closeLabel, description, children, footer }: {
    open: boolean
    onClose: () => void
    title: string
    closeLabel?: string
    description?: string
    children?: React.ReactNode
    footer?: React.ReactNode
  }) => open ? createPortal(<div role="dialog" aria-label={title}>
    <button type="button" aria-label={closeLabel ?? title} onClick={onClose}>×</button>
    {description && <p>{description}</p>}
    {children}
    {footer}
  </div>, document.body) : null,
  Pill: ({ children, onClick, active, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) =>
    onClick ? <button type="button" data-active={active} onClick={onClick} {...props}>{children}</button> : <span>{children}</span>,
  Tag: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  Toast: ({ text }: { text: string }) => <div role="status">{text}</div>,
}))

type PanelProps = ComponentProps<typeof NotebookPanel>
type MutableNote = {
  -readonly [Key in keyof Note]: Note[Key]
}

const t = ((key: keyof typeof en, values?: Record<string, string | number>) => {
  let text: string = en[key]
  for (const [name, value] of Object.entries(values ?? {})) text = text.replace(`{${name}}`, String(value))
  return text
}) as PanelProps['t']

function note(overrides: Partial<Note> = {}): Note {
  return {
    id: 'note-1' as Note['id'],
    notebookId: 'book-1' as Note['notebookId'],
    notebookName: 'Work',
    title: 'Launch notes',
    body: '# Checklist\n\nShip it.',
    excerpt: 'Checklist Ship it.',
    tags: ['release'],
    images: [],
    imageCount: 0,
    revision: 2,
    createdAt: '2026-09-20T00:00:00.000Z',
    updatedAt: '2026-09-20T01:00:00.000Z',
    archivedAt: null,
    ...overrides,
  }
}

function notebook(): Notebook {
  return {
    id: 'book-1' as Notebook['id'],
    name: 'Work',
    revision: 2,
    noteCount: 1,
    archivedNoteCount: 0,
    createdAt: '2026-09-20T00:00:00.000Z',
    updatedAt: '2026-09-20T01:00:00.000Z',
  }
}

function revision(current: Note, value: number): NoteRevision {
  return {
    id: `revision-${String(value)}` as NoteRevision['id'],
    noteId: current.id,
    revision: value,
    notebookId: current.notebookId,
    notebookName: current.notebookName,
    title: value === 1 ? 'Original notes' : current.title,
    body: value === 1 ? 'Original body' : current.body,
    tags: value === 1 ? ['draft'] : current.tags,
    images: [],
    archivedAt: null,
    createdAt: `2026-09-20T0${String(value)}:00:00.000Z`,
  }
}

function api(initial = note()) {
  let current: MutableNote = { ...initial }
  const book = notebook()
  const service = {
    overview: vi.fn(async () => ({
      notebooks: [{ ...book, noteCount: current.archivedAt === null ? 1 : 0, archivedNoteCount: current.archivedAt === null ? 0 : 1 }],
      tags: current.tags,
      activeNotes: current.archivedAt === null ? 1 : 0,
      archivedNotes: current.archivedAt === null ? 0 : 1,
    })),
    search: vi.fn(async (input: NoteSearchInput) => ({
      notes: (input.archived === true) === (current.archivedAt !== null) ? [current] : [],
      total: (input.archived === true) === (current.archivedAt !== null) ? 1 : 0,
      hasMore: false,
    })),
    read: vi.fn(async () => current),
    create: vi.fn(async (input: {
      title: string
      body: string
      tags?: readonly string[]
      images?: readonly unknown[]
    }) => {
      current = {
        ...current,
        id: 'note-created' as Note['id'],
        title: input.title,
        body: input.body,
        excerpt: input.body,
        tags: [...(input.tags ?? [])],
        imageCount: input.images?.length ?? 0,
        revision: 1,
      }
      return current
    }),
    update: vi.fn(async (input: { title?: string; body?: string; tags?: readonly string[] }) => {
      current = {
        ...current,
        title: input.title ?? current.title,
        body: input.body ?? current.body,
        tags: input.tags === undefined ? current.tags : [...input.tags],
        revision: current.revision + 1,
      }
      return current
    }),
    archive: vi.fn(async () => {
      current = { ...current, archivedAt: '2026-09-20T02:00:00.000Z', revision: current.revision + 1 }
      return current
    }),
    restore: vi.fn(async () => {
      current = { ...current, archivedAt: null, revision: current.revision + 1 }
      return current
    }),
    deleteNote: vi.fn(async () => ({ ok: true as const })),
    createNotebook: vi.fn(async ({ name }: { name: string }) => ({ ...book, name })),
    renameNotebook: vi.fn(async ({ name }: { name: string }) => ({ ...book, name, revision: 3 })),
    deleteNotebook: vi.fn(async () => ({ ok: true as const })),
    notebook: vi.fn(async () => book),
    revisions: vi.fn(async () => ({
      revisions: [revision(current, current.revision), revision(current, 1)],
      total: 2,
      hasMore: false,
    })),
    restoreRevision: vi.fn(async () => {
      current = { ...current, title: 'Original notes', body: 'Original body', revision: current.revision + 1 }
      return current
    }),
    addImage: vi.fn(async () => current),
    imageData: vi.fn(),
  } satisfies NotebookApi
  return service
}

function renderPanel(service: NotebookApi) {
  return render(<NotebookPanel {...{
    api: service,
    t,
    useTabInfo: () => ({ tab: { visible: true } }),
  } as PanelProps} />)
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('NotebookPanel', () => {
  it('starts a note from the empty state', async () => {
    const user = userEvent.setup()
    renderPanel(api(note({ archivedAt: '2026-09-20T02:00:00.000Z' })))
    const empty = await screen.findByRole('heading', { name: 'No notes yet' })
    await user.click(within(empty.parentElement as HTMLElement).getByRole('button', { name: 'New note' }))
    expect(screen.getByRole('heading', { name: 'New note' })).toBeDefined()
  })

  it('replaces the note list while drafting and restores it when returning', async () => {
    const user = userEvent.setup()
    const service = api()
    renderPanel(service)
    await screen.findByRole('button', { name: /Launch notes/ })

    const list = document.querySelector('.dsh-notebook-list-pane') as HTMLElement
    const detail = document.querySelector('.dsh-notebook > .dsh-notebook-detail') as HTMLElement
    await user.click(screen.getByRole('button', { name: 'New note' }))

    expect(list.hidden).toBe(true)
    expect(detail.hidden).toBe(false)
    expect(screen.getByRole('heading', { name: 'New note' })).toBeDefined()
    await user.type(screen.getByLabelText('Note title'), 'Unsaved note')
    await user.click(screen.getByRole('button', { name: 'Back to notes' }))

    expect(list.hidden).toBe(false)
    expect(detail.hidden).toBe(true)
    expect(screen.queryByRole('heading', { name: 'New note' })).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'New note' }))
    expect(service.create).not.toHaveBeenCalled()
  })

  it('opens the note in place and returns through edit to the list', async () => {
    const user = userEvent.setup()
    renderPanel(api())
    const listButton = await screen.findByRole('button', { name: /Launch notes/ })
    const list = document.querySelector('.dsh-notebook-list-pane') as HTMLElement
    const detail = document.querySelector('.dsh-notebook > .dsh-notebook-detail') as HTMLElement

    expect(list.hidden).toBe(false)
    expect(detail.hidden).toBe(true)
    await user.click(listButton)
    expect(await screen.findByRole('heading', { name: 'Launch notes' })).toBeDefined()
    expect(list.hidden).toBe(true)
    expect(detail.hidden).toBe(false)
    expect(screen.queryByRole('button', { name: /Launch notes/ })).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Back to notes' }))

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByRole('heading', { name: 'Edit' })).toBeDefined()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Back to note' }))
    await user.click(screen.getByRole('button', { name: 'Back to note' }))
    expect(screen.getByRole('heading', { name: 'Launch notes' })).toBeDefined()
    expect(list.hidden).toBe(true)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Back to notes' }))

    await user.click(screen.getByRole('button', { name: 'Back to notes' }))
    expect(list.hidden).toBe(false)
    expect(detail.hidden).toBe(true)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Launch notes/ }))
  })

  it('creates and previews Markdown with tags and an uploaded image', async () => {
    const user = userEvent.setup()
    const service = api()
    renderPanel(service)
    await screen.findByRole('button', { name: /Launch notes/ })
    await user.click(screen.getByRole('button', { name: 'New note' }))
    await user.type(screen.getByLabelText('Note title'), 'Meeting notes')
    await user.type(screen.getByLabelText('Markdown'), '# Decisions')
    await user.type(screen.getByLabelText('Tags'), 'team, decision')

    const upload = document.querySelector('input[type=file]') as HTMLInputElement
    const file = new File([Uint8Array.from([137, 80, 78, 71])], 'diagram.png', { type: 'image/png' })
    Object.defineProperty(file, 'arrayBuffer', {
      value: async () => Uint8Array.from([137, 80, 78, 71]).buffer,
    })
    await user.upload(upload, file)
    await screen.findByText('1 images')
    await user.click(screen.getByRole('button', { name: 'Preview' }))
    expect(screen.getByTestId('markdown').textContent).toBe('# Decisions')
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(service.create).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Meeting notes',
      body: '# Decisions',
      tags: ['team', 'decision'],
      images: [expect.objectContaining({ name: 'diagram.png', mediaType: 'image/png' })],
    }), expect.any(AbortSignal)))
  })

  it('archives, restores and permanently deletes through confirmation', async () => {
    const user = userEvent.setup()
    const service = api()
    renderPanel(service)
    await user.click(await screen.findByRole('button', { name: /Launch notes/ }))
    await user.click(screen.getByRole('button', { name: 'Archive' }))
    await waitFor(() => expect(service.archive).toHaveBeenCalled())

    await user.click(screen.getByRole('button', { name: 'Back to notes' }))
    await user.click(screen.getByRole('button', { name: 'Note scope' }))
    await user.click(screen.getByRole('menuitem', { name: /Archive 1/ }))
    await user.click(await screen.findByRole('button', { name: /Launch notes/ }))
    await user.click(screen.getByRole('button', { name: 'Restore' }))
    await waitFor(() => expect(service.restore).toHaveBeenCalled())

    await user.click(screen.getByRole('button', { name: 'Archive' }))
    await user.click(screen.getByRole('button', { name: 'Back to notes' }))
    await user.click(screen.getByRole('button', { name: 'Note scope' }))
    await user.click(screen.getByRole('menuitem', { name: /Archive 1/ }))
    await user.click(await screen.findByRole('button', { name: /Launch notes/ }))
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }))
    const dialog = await screen.findByRole('dialog', { name: 'Permanently delete note?' })
    await user.click(within(dialog).getByRole('button', { name: 'Delete permanently' }))
    await waitFor(() => expect(service.deleteNote).toHaveBeenCalled())
  })

  it('switches notebooks through one scope menu instead of a third navigation column', async () => {
    const user = userEvent.setup()
    const service = api()
    renderPanel(service)
    await screen.findByRole('button', { name: /Launch notes/ })

    expect(document.querySelector('.dsh-notebook-nav')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Note scope' }))
    await user.click(screen.getByRole('menuitem', { name: /Work 1/ }))

    await waitFor(() => expect(service.search).toHaveBeenLastCalledWith(expect.objectContaining({
      notebookId: 'book-1',
      archived: false,
    }), expect.any(AbortSignal)))
  })

  it('shows a readable excerpt without repeating the Markdown heading', async () => {
    renderPanel(api(note({ excerpt: '# Launch notes Keep **important** [links](https://example.com) in view.' })))
    const item = await screen.findByRole('button', { name: /Launch notes/ })
    expect(within(item).getByText('Keep important links in view.')).toBeDefined()
    expect(within(item).queryByText(/# Launch notes/)).toBeNull()
  })

  it('debounces search and offers a way back from empty results', async () => {
    const user = userEvent.setup()
    const service = api()
    const first = note()
    service.search.mockImplementation(async input => input.query === 'missing'
      ? { notes: [], total: 0, hasMore: false }
      : { notes: [first], total: 1, hasMore: false })
    renderPanel(service)
    await screen.findByRole('button', { name: /Launch notes/ })

    await user.type(screen.getByRole('searchbox', { name: 'Search notes' }), 'missing')
    expect(await screen.findByRole('heading', { name: 'No matching notes' })).toBeDefined()
    expect(service.search).toHaveBeenLastCalledWith(expect.objectContaining({ query: 'missing' }), expect.any(AbortSignal))

    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect((screen.getByRole('searchbox', { name: 'Search notes' }) as HTMLInputElement).value).toBe('')
    expect(await screen.findByRole('button', { name: /Launch notes/ })).toBeDefined()
  })

  it('loads the next page of notes from the list', async () => {
    const user = userEvent.setup()
    const service = api()
    const first = note()
    const second = note({ id: 'note-2' as Note['id'], title: 'Second note' })
    service.search.mockImplementation(async input => input.offset === 1
      ? { notes: [second], total: 2, hasMore: false }
      : { notes: [first], total: 2, hasMore: true })
    renderPanel(service)
    await screen.findByRole('button', { name: /Launch notes/ })

    await user.click(screen.getByRole('button', { name: 'Load more' }))
    expect(await screen.findByRole('button', { name: /Second note/ })).toBeDefined()
    expect(service.search).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 1 }), expect.any(AbortSignal))
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull()
  })

  it('creates a notebook after entering a name in the dialog', async () => {
    const user = userEvent.setup()
    const service = api()
    renderPanel(service)
    await screen.findByRole('button', { name: /Launch notes/ })

    await user.click(screen.getByRole('button', { name: 'New notebook' }))
    const dialog = await screen.findByRole('dialog', { name: 'New notebook' })
    const create = within(dialog).getByRole('button', { name: 'Create' }) as HTMLButtonElement
    expect(create.disabled).toBe(true)
    await user.type(within(dialog).getByRole('textbox', { name: 'Notebook name' }), 'Research')
    expect(create.disabled).toBe(false)
    await user.click(create)

    await waitFor(() => expect(service.createNotebook).toHaveBeenCalledWith({ name: 'Research' }, expect.any(AbortSignal)))
  })

  it('loads history and restores an earlier revision as a new revision', async () => {
    const user = userEvent.setup()
    const service = api()
    renderPanel(service)
    await user.click(await screen.findByRole('button', { name: /Launch notes/ }))
    await user.click(screen.getByRole('button', { name: 'History' }))
    await waitFor(() => expect(service.revisions).toHaveBeenCalled())
    await user.click(screen.getByRole('button', { name: 'Restore this version' }))
    const dialog = await screen.findByRole('dialog', { name: 'Restore revision?' })
    await user.click(within(dialog).getByRole('button', { name: 'Restore this version' }))
    await waitFor(() => expect(service.restoreRevision).toHaveBeenCalledWith(expect.objectContaining({
      revision: 1,
      expectedRevision: 2,
    }), expect.any(AbortSignal)))
  })
})
