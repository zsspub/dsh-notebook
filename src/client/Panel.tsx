/** Responsive notebook manager backed by the Host Remote. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import {
  Archive, ArrowLeft, ChevronDown, Clock3, FileText, History, Image, NotebookTabs, Pencil,
  Plus, RotateCcw, Search, Tag as TagIcon, Trash2, Upload,
} from 'lucide-react'
import {
  Button, DisclosureRow, Input, MarkdownText, Menu, Modal, Pill, Tag, Toast,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  ImageUploadInput, Note, NoteImageId, NoteRevision, NoteSearchInput, NoteSearchResult, NotebookId, NotebookOverview,
} from '../types.ts'
import type { NotebookApi } from './index.ts'
import { NS, type NotebookLocaleKey } from './locales.ts'
import { styles, triggerStyles } from './styles.ts'

type Translate = (key: NotebookLocaleKey, values?: Record<string, string | number>) => string
type PanelProps = PropsLocale<typeof NS> & PropsRuntime<'sidebar.right.pane.tab'> & { api: NotebookApi }
type TriggerProps = PropsLocale<typeof NS> & PropsRuntime<'sidebar.footer.action'> & { openPanel: () => void }
type View = 'all' | 'recent' | 'archived'
type Draft = {
  id?: Note['id']
  revision?: number
  notebookId: string
  notebookName: string
  title: string
  body: string
  tags: string
  uploads: ImageUploadInput[]
  removedImages: NoteImageId[]
}
type Confirmation =
  | { kind: 'note'; note: Note }
  | { kind: 'notebook'; id: NotebookId; revision: number }
  | { kind: 'revision'; note: Note; revision: NoteRevision }

const EMPTY_RESULT: NoteSearchResult = { notes: [], total: 0, hasMore: false }
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

function errorText(error: unknown, t: Translate): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('revision conflict') ? t('conflict') : message
}

function emptyDraft(notebookId = ''): Draft {
  return {
    notebookId,
    notebookName: '',
    title: '',
    body: '',
    tags: '',
    uploads: [],
    removedImages: [],
  }
}

function noteDraft(note: Note): Draft {
  return {
    id: note.id,
    revision: note.revision,
    notebookId: note.notebookId,
    notebookName: '',
    title: note.title,
    body: note.body,
    tags: note.tags.join(', '),
    uploads: [],
    removedImages: [],
  }
}

function previewExcerpt(excerpt: string, title: string): string {
  const plain = excerpt
    .replace(/!?\[([^\]]+)\]\([^)]+\)/gu, '$1')
    .replace(/(^|\s)#{1,6}\s+/gu, '$1')
    .replace(/[*_`~]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
  const heading = title.trim()
  return plain === heading || plain.startsWith(`${heading} `) ? plain.slice(heading.length).trim() : plain
}

async function encodedImages(files: FileList, t: Translate): Promise<ImageUploadInput[]> {
  const results: ImageUploadInput[] = []
  for (const file of Array.from(files)) {
    if (!IMAGE_TYPES.has(file.type)) throw new Error(t('uploadType'))
    if (file.size > 10 * 1024 * 1024) throw new Error(t('uploadTooLarge'))
    const bytes = new Uint8Array(await file.arrayBuffer())
    let binary = ''
    for (let offset = 0; offset < bytes.length; offset += 32_768) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768))
    }
    results.push({ name: file.name, mediaType: file.type as ImageUploadInput['mediaType'], data: btoa(binary) })
  }
  return results
}

export function NotebookTrigger({ t, wide, openPanel }: TriggerProps) {
  return <>
    <style>{triggerStyles}</style>
    <button
      type="button"
      className="dsh-notebook-trigger"
      data-wide={wide}
      aria-label={t('trigger')}
      title={t('trigger')}
      onClick={openPanel}
    >
      <NotebookTabs size={wide ? 16 : 18} strokeWidth={1.7} aria-hidden="true" />
      {wide && <span>{t('trigger')}</span>}
    </button>
  </>
}

export function NotebookPanel({ t, api, useTabInfo }: PanelProps) {
  const { tab } = useTabInfo()
  const lifetime = useRef(new AbortController())
  const [overview, setOverview] = useState<NotebookOverview>()
  const [result, setResult] = useState(EMPTY_RESULT)
  const [selected, setSelected] = useState<Note>()
  const [view, setView] = useState<View>('all')
  const [notebookId, setNotebookId] = useState('')
  const [tag, setTag] = useState('')
  const [query, setQuery] = useState('')
  const [settledQuery, setSettledQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string>()
  const [draft, setDraft] = useState<Draft>()
  const [preview, setPreview] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [revisions, setRevisions] = useState<NoteRevision[]>([])
  const [confirmation, setConfirmation] = useState<Confirmation>()
  const [notebookForm, setNotebookForm] = useState<{ id?: NotebookId; revision?: number; name: string }>()
  const [toast, setToast] = useState<{ id: number; text: string }>()
  const [scopeMenuOpen, setScopeMenuOpen] = useState(false)
  const imageUrls = useRef(new Map<NoteImageId, string>())
  const selectedId = useRef<Note['id']>()
  const refreshVersion = useRef(0)
  const pendingRuns = useRef(0)
  const listPane = useRef<HTMLElement>(null)
  const detailPane = useRef<HTMLElement>(null)
  const lastListAction = useRef<Note['id'] | 'new'>('new')
  const page = draft !== undefined ? 'draft' : selected !== undefined ? 'detail' : 'list'
  const previousPage = useRef(page)
  selectedId.current = selected?.id

  const searchInput = useMemo<NoteSearchInput>(() => ({
    query: settledQuery || undefined,
    notebookId: notebookId ? notebookId as NotebookId : undefined,
    tags: tag ? [tag] : undefined,
    archived: view === 'archived',
    limit: view === 'recent' ? 15 : 100,
  }), [notebookId, settledQuery, tag, view])

  const run = useCallback(async <Value,>(operation: (signal: AbortSignal) => Promise<Value>): Promise<Value | undefined> => {
    pendingRuns.current += 1
    setLoading(true)
    setError(undefined)
    try {
      return await operation(lifetime.current.signal)
    } catch (failure) {
      if (!lifetime.current.signal.aborted) setError(errorText(failure, t))
      return undefined
    } finally {
      pendingRuns.current -= 1
      if (!lifetime.current.signal.aborted) setLoading(pendingRuns.current > 0)
    }
  }, [t])

  const refresh = useCallback(async (keepSelected = true): Promise<void> => {
    const version = ++refreshVersion.current
    setLoadingMore(false)
    const [nextOverview, nextResult] = await Promise.all([
      api.overview({}, lifetime.current.signal),
      api.search(searchInput, lifetime.current.signal),
    ])
    if (lifetime.current.signal.aborted || version !== refreshVersion.current) return
    setOverview(nextOverview)
    setResult(nextResult)
    if (keepSelected && selectedId.current) {
      const currentId = selectedId.current
      const stillVisible = nextResult.notes.some(note => note.id === currentId)
      if (stillVisible) {
        const current = await api.read({ id: currentId }, lifetime.current.signal)
        if (!lifetime.current.signal.aborted && version === refreshVersion.current) setSelected(current)
      } else {
        setSelected(undefined)
      }
    }
  }, [api, searchInput])

  useEffect(() => {
    const timeout = setTimeout(() => setSettledQuery(query.trim()), 250)
    return () => clearTimeout(timeout)
  }, [query])

  useEffect(() => () => {
    lifetime.current.abort()
    for (const url of imageUrls.current.values()) URL.revokeObjectURL(url)
  }, [])

  useEffect(() => {
    if (!tab.visible) return
    void run(async () => refresh())
  }, [refresh, run, tab.visible])

  useEffect(() => {
    if (previousPage.current === page) return
    previousPage.current = page
    if (page === 'list') {
      const previousNote = lastListAction.current === 'new' ? undefined
        : Array.from(listPane.current?.querySelectorAll<HTMLButtonElement>('.dsh-notebook-list-item') ?? [])
          .find(button => button.dataset.noteId === lastListAction.current)
      const target = previousNote ?? listPane.current?.querySelector<HTMLButtonElement>('.dsh-notebook-new-note')
      target?.focus()
    } else {
      detailPane.current?.querySelector<HTMLButtonElement>('.dsh-notebook-back')?.focus()
    }
  }, [page])

  useEffect(() => {
    if (!selected) return
    for (const image of selected.images) {
      if (imageUrls.current.has(image.id)) continue
      void api.imageData({ id: image.id }, lifetime.current.signal).then(data => {
        if (lifetime.current.signal.aborted) return
        const binary = atob(data.data)
        const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
        const url = URL.createObjectURL(new Blob([bytes], { type: data.image.mediaType }))
        imageUrls.current.set(image.id, url)
        setSelected(current => current === undefined ? current : { ...current })
      }).catch(failure => setError(errorText(failure, t)))
    }
  }, [api, selected, t])

  const selectNote = (id: Note['id']): void => {
    lastListAction.current = id
    void run(async signal => {
      const note = await api.read({ id }, signal)
      setSelected(note)
      setDraft(undefined)
      setPreview(false)
      setHistoryOpen(false)
    })
  }

  const startNewNote = (): void => {
    lastListAction.current = 'new'
    setPreview(false)
    setDraft(emptyDraft(notebookId || overview?.notebooks[0]?.id))
  }

  const saveDraft = (event: FormEvent): void => {
    event.preventDefault()
    if (!draft || draft.title.trim() === '' || draft.notebookId === '' && draft.notebookName.trim() === '') return
    void run(async signal => {
      const tags = draft.tags.split(',').map(value => value.trim()).filter(Boolean)
      const note = draft.id === undefined
        ? await api.create({
            notebookId: draft.notebookId ? draft.notebookId as NotebookId : undefined,
            notebookName: draft.notebookName || undefined,
            title: draft.title,
            body: draft.body,
            tags,
            images: draft.uploads,
          }, signal)
        : await api.update({
            id: draft.id,
            expectedRevision: draft.revision as number,
            mode: 'replace',
            notebookId: draft.notebookId as NotebookId,
            title: draft.title,
            body: draft.body,
            tags,
            images: draft.uploads,
            removeImageIds: draft.removedImages,
          }, signal)
      setSelected(note)
      setDraft(undefined)
      setPreview(false)
      setToast({ id: Date.now(), text: t('save') })
      await refresh(false)
    })
  }

  const chooseFiles = (event: ChangeEvent<HTMLInputElement>): void => {
    if (!draft || !event.currentTarget.files) return
    void encodedImages(event.currentTarget.files, t)
      .then(images => setDraft(current => current === undefined ? current : {
        ...current,
        uploads: [...current.uploads, ...images],
      }))
      .catch(failure => setError(errorText(failure, t)))
    event.currentTarget.value = ''
  }

  const loadHistory = (): void => {
    if (!selected) return
    setHistoryOpen(open => !open)
    if (historyOpen || revisions.length > 0) return
    void run(async signal => {
      const page = await api.revisions({ id: selected.id, limit: 100 }, signal)
      setRevisions(page.revisions)
    })
  }

  const performConfirmation = (): void => {
    if (!confirmation) return
    void run(async signal => {
      if (confirmation.kind === 'note') {
        await api.deleteNote({
          id: confirmation.note.id,
          expectedRevision: confirmation.note.revision,
        }, signal)
        setSelected(undefined)
      } else if (confirmation.kind === 'notebook') {
        await api.deleteNotebook({
          id: confirmation.id,
          expectedRevision: confirmation.revision,
        }, signal)
        if (notebookId === confirmation.id) setNotebookId('')
      } else {
        const restored = await api.restoreRevision({
          id: confirmation.note.id,
          revision: confirmation.revision.revision,
          expectedRevision: confirmation.note.revision,
        }, signal)
        setSelected(restored)
        setRevisions([])
      }
      setConfirmation(undefined)
      await refresh(false)
    })
  }

  const loadMore = (): void => {
    if (loadingMore || !result.hasMore) return
    const version = refreshVersion.current
    setLoadingMore(true)
    setError(undefined)
    void api.search({ ...searchInput, offset: result.notes.length }, lifetime.current.signal)
      .then(next => {
        if (lifetime.current.signal.aborted || version !== refreshVersion.current) return
        setResult(current => ({ ...next, notes: [...current.notes, ...next.notes] }))
      })
      .catch(failure => {
        if (!lifetime.current.signal.aborted && version === refreshVersion.current) setError(errorText(failure, t))
      })
      .finally(() => {
        if (!lifetime.current.signal.aborted && version === refreshVersion.current) setLoadingMore(false)
      })
  }

  const clearFilters = (): void => {
    setView('all')
    setNotebookId('')
    setTag('')
    setQuery('')
    setSettledQuery('')
  }

  const activeNotebook = overview?.notebooks.find(item => item.id === notebookId)
  const hasFilters = view !== 'all' || notebookId !== '' || tag !== '' || query.trim() !== ''
  const scopeId = notebookId ? `notebook:${notebookId}` : `view:${view}`
  const scopeLabel = activeNotebook?.name ?? (view === 'recent' ? t('recent') : view === 'archived' ? t('archived') : t('allNotes'))
  const scopeItems = useMemo<readonly MenuEntry[]>(() => [
    {
      id: 'view:all',
      label: <span className="dsh-notebook-menu-label"><span>{t('allNotes')}</span><span>{overview?.activeNotes ?? 0}</span></span>,
      icon: <FileText size={14} />,
    },
    {
      id: 'view:recent',
      label: t('recent'),
      icon: <Clock3 size={14} />,
    },
    {
      id: 'view:archived',
      label: <span className="dsh-notebook-menu-label"><span>{t('archived')}</span><span>{overview?.archivedNotes ?? 0}</span></span>,
      icon: <Archive size={14} />,
    },
    { type: 'separator', id: 'scope-separator' },
    { type: 'label', id: 'notebook-label', text: t('notebooks') },
    ...(overview?.notebooks.map(notebook => ({
      id: `notebook:${notebook.id}`,
      label: <span className="dsh-notebook-menu-label"><span>{notebook.name}</span><span>{notebook.noteCount}</span></span>,
      icon: <NotebookTabs size={14} />,
    })) ?? []),
  ], [overview, t])
  const markdownLabels = useMemo(() => ({
    code: { copyLabel: t('markdownCopy'), copiedLabel: t('markdownCopied') },
    footnotes: t('markdownFootnotes'),
  }), [t])
  const showingDetail = page !== 'list'

  return <>
    <style>{styles}</style>
    <main className="dsh-notebook">
      <section ref={listPane} className="dsh-notebook-list-pane" hidden={showingDetail}>
        <header className="dsh-notebook-list-head">
          <div className="dsh-notebook-toolbar">
            <div className="dsh-notebook-scope">
              <Menu
                open={scopeMenuOpen}
                onClose={() => setScopeMenuOpen(false)}
                items={scopeItems}
                selectedId={scopeId}
                onSelect={(id) => {
                  if (id.startsWith('notebook:')) {
                    setNotebookId(id.slice('notebook:'.length))
                    setView('all')
                  } else {
                    setNotebookId('')
                    setView(id.slice('view:'.length) as View)
                  }
                  setSelected(undefined)
                  setDraft(undefined)
                  setScopeMenuOpen(false)
                }}
                portal
                dense
                anchor={<Button className="dsh-notebook-scope-select" size="sm" variant="outline"
                  icon={activeNotebook ? <NotebookTabs size={14} /> : view === 'archived' ? <Archive size={14} />
                    : view === 'recent' ? <Clock3 size={14} /> : <FileText size={14} />}
                  aria-label={t('scope')} aria-haspopup="menu" aria-expanded={scopeMenuOpen}
                  onClick={() => setScopeMenuOpen(open => !open)}>
                  <span className="dsh-notebook-scope-label">{scopeLabel}</span><ChevronDown size={13} />
                </Button>}
              />
              {activeNotebook && <div className="dsh-notebook-scope-actions">
                <Button size="sm" variant="ghost" icon={<Pencil size={13} />} aria-label={t('rename')}
                  title={t('rename')} onClick={() => {
                    setError(undefined)
                    setNotebookForm({ id: activeNotebook.id, revision: activeNotebook.revision, name: activeNotebook.name })
                  }} />
                <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} aria-label={t('delete')}
                  title={t('delete')} disabled={activeNotebook.noteCount + activeNotebook.archivedNoteCount > 0}
                  onClick={() => setConfirmation({ kind: 'notebook', id: activeNotebook.id, revision: activeNotebook.revision })} />
              </div>}
            </div>
            <div className="dsh-notebook-toolbar-actions">
              <Button size="sm" variant="outline" icon={<Plus size={14} />}
                onClick={() => {
                  setError(undefined)
                  setNotebookForm({ name: '' })
                }}>{t('newNotebook')}</Button>
              <Button className="dsh-notebook-new-note" size="sm" variant="primary" icon={<Plus size={14} />}
                onClick={startNewNote}>{t('newNote')}</Button>
            </div>
          </div>
          <Input className="dsh-notebook-search" icon={<Search size={16} aria-hidden="true" />}
            type="search" value={query} onChange={event => setQuery(event.currentTarget.value)}
            placeholder={t('search')} aria-label={t('search')} />
          {(overview?.tags.length ?? 0) > 0 && <div className="dsh-notebook-tags">
            <span className="dsh-notebook-tags-label"><TagIcon size={13} aria-hidden="true" />{t('tags')}</span>
            {overview?.tags.map(value => <Pill key={value} active={tag === value} aria-pressed={tag === value}
              onClick={() => setTag(current => current === value ? '' : value)}>{value}</Pill>)}
          </div>}
        </header>
        {error && !notebookForm && <div className="dsh-notebook-error" role="alert">{t('error')}: {error}</div>}
        {overview && <div className="dsh-notebook-list-summary">
          <span role="status">{t('noteCount', { count: result.total })}</span>
          {hasFilters && result.notes.length > 0 && <Button size="sm" variant="ghost" onClick={clearFilters}>{t('clearFilters')}</Button>}
        </div>}
        {loading && result.notes.length === 0
          ? <div className="dsh-notebook-empty">{t('loading')}</div>
          : result.notes.length === 0
            ? <div className="dsh-notebook-empty"><NotebookTabs size={36} />
                <h3>{settledQuery || tag ? t('noMatch') : t('empty')}</h3>
                <p>{settledQuery || tag ? t('noMatchHint') : t('emptyHint')}</p>
                <div className="dsh-notebook-actions">
                  {!settledQuery && !tag && view !== 'archived' && <Button size="sm" variant="primary" onClick={startNewNote}>{t('newNote')}</Button>}
                  {hasFilters && <Button size="sm" variant="outline" onClick={clearFilters}>{t('clearFilters')}</Button>}
                </div>
              </div>
            : <div className="dsh-notebook-list" aria-busy={loading || loadingMore}>
                {result.notes.map(note => {
                  const excerpt = previewExcerpt(note.excerpt, note.title)
                  return <button key={note.id} type="button" className="dsh-notebook-list-item"
                    data-note-id={note.id} aria-pressed={selected?.id === note.id} onClick={() => selectNote(note.id)}>
                    <span className="dsh-notebook-list-top">
                      <h3>{note.title}</h3>
                      <time dateTime={note.updatedAt}>{new Date(note.updatedAt).toLocaleDateString()}</time>
                    </span>
                    {excerpt && <p>{excerpt}</p>}
                    <span className="dsh-notebook-meta">
                      <span>{note.notebookName}</span>
                      <span>{t('revision')} {note.revision}</span>
                      {note.imageCount > 0 && <span><Image size={11} /> {note.imageCount}</span>}
                    </span>
                  </button>
                })}
                {result.hasMore && <div className="dsh-notebook-list-more">
                  <Button size="sm" variant="outline" disabled={loadingMore} onClick={loadMore}>
                    {loadingMore ? t('loadingMore') : t('loadMore')}
                  </Button>
                </div>}
              </div>}
      </section>

      <section ref={detailPane} className="dsh-notebook-detail" hidden={!showingDetail}>
        {error && <div className="dsh-notebook-error" role="alert">{t('error')}: {error}</div>}
        {draft
          ? <form onSubmit={saveDraft} className="dsh-notebook-detail">
              <header className="dsh-notebook-detail-head">
                <div><Button type="button" className="dsh-notebook-back" size="sm" variant="ghost" icon={<ArrowLeft size={14} />}
                  onClick={() => {
                    setDraft(undefined)
                    setPreview(false)
                  }}>{draft.id ? t('backToNote') : t('back')}</Button><h2>{draft.id ? t('edit') : t('newNote')}</h2></div>
                <div className="dsh-notebook-actions">
                  <Pill active={!preview} onClick={() => setPreview(false)}>{t('edit')}</Pill>
                  <Pill active={preview} onClick={() => setPreview(true)}>{t('preview')}</Pill>
                  <Button type="submit" size="sm" variant="primary" disabled={loading}>{loading ? t('saving') : t('save')}</Button>
                </div>
              </header>
              <div className="dsh-notebook-detail-body">
                {preview
                  ? <div className="dsh-notebook-preview"><MarkdownText text={draft.body} labels={markdownLabels} /></div>
                  : <>
                      <label className="dsh-notebook-field">{t('noteTitle')}
                        <Input value={draft.title} onChange={event => setDraft({ ...draft, title: event.currentTarget.value })} required />
                      </label>
                      <label className="dsh-notebook-field">{t('moveTo')}
                        <select value={draft.notebookId} onChange={event => setDraft({ ...draft, notebookId: event.currentTarget.value, notebookName: '' })}>
                          <option value="">{t('newNotebook')}</option>
                          {overview?.notebooks.map(notebook => <option key={notebook.id} value={notebook.id}>{notebook.name}</option>)}
                        </select>
                      </label>
                      {draft.notebookId === '' && <label className="dsh-notebook-field">{t('notebookName')}
                        <Input value={draft.notebookName} onChange={event => setDraft({ ...draft, notebookName: event.currentTarget.value })} required />
                      </label>}
                      <label className="dsh-notebook-field">{t('tags')}
                        <Input value={draft.tags} placeholder={t('tagsPlaceholder')}
                          onChange={event => setDraft({ ...draft, tags: event.currentTarget.value })} />
                      </label>
                      <label className="dsh-notebook-field">{t('body')}
                        <textarea value={draft.body} onChange={event => setDraft({ ...draft, body: event.currentTarget.value })} />
                      </label>
                      <div className="dsh-notebook-actions">
                        <Button size="sm" variant="outline" icon={<Upload size={14} />} onClick={event => {
                          const input = event.currentTarget.nextElementSibling as HTMLInputElement | null
                          input?.click()
                        }}>{t('addImages')}</Button>
                        <input hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple onChange={chooseFiles} />
                        {draft.uploads.length > 0 && <Tag tone="info">{t('imageCount', { count: draft.uploads.length })}</Tag>}
                      </div>
                      {selected && selected.images.length > 0 && <div className="dsh-notebook-images">
                        {selected.images.map(image => <div className="dsh-notebook-image" key={image.id}>
                          {imageUrls.current.get(image.id) && <img src={imageUrls.current.get(image.id)} alt={image.name} />}
                          <span>{image.name}</span>
                          <Button size="sm" variant="ghost" onClick={() => setDraft({
                            ...draft,
                            removedImages: draft.removedImages.includes(image.id)
                              ? draft.removedImages.filter(id => id !== image.id)
                              : [...draft.removedImages, image.id],
                          })}>{draft.removedImages.includes(image.id) ? t('restore') : t('remove')}</Button>
                        </div>)}
                      </div>}
                    </>}
              </div>
            </form>
          : selected
            ? <>
                <header className="dsh-notebook-detail-head">
                  <div>
                    <Button className="dsh-notebook-back" size="sm" variant="ghost" icon={<ArrowLeft size={14} />}
                      onClick={() => setSelected(undefined)}>{t('back')}</Button>
                    <h2>{selected.title}</h2>
                    <div className="dsh-notebook-meta">
                      <Tag tone="quiet">{selected.notebookName}</Tag>
                      <span>{t('revision')} {selected.revision}</span>
                      <span>{t('updated')} {new Date(selected.updatedAt).toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="dsh-notebook-actions">
                    <Button size="sm" variant="outline" onClick={() => {
                      setPreview(false)
                      setDraft(noteDraft(selected))
                    }}>{t('edit')}</Button>
                    {selected.archivedAt === null
                      ? <Button size="sm" variant="ghost" icon={<Archive size={14} />} onClick={() => void run(async signal => {
                          const note = await api.archive({ id: selected.id, expectedRevision: selected.revision }, signal)
                          setSelected(note)
                          await refresh(false)
                        })}>{t('archive')}</Button>
                      : <>
                          <Button size="sm" variant="ghost" icon={<RotateCcw size={14} />} onClick={() => void run(async signal => {
                            const note = await api.restore({ id: selected.id, expectedRevision: selected.revision }, signal)
                            setSelected(note)
                            await refresh(false)
                          })}>{t('restore')}</Button>
                          <Button size="sm" variant="ghost" icon={<Trash2 size={14} />}
                            onClick={() => setConfirmation({ kind: 'note', note: selected })}>{t('delete')}</Button>
                        </>}
                  </div>
                </header>
                <div className="dsh-notebook-detail-body">
                  <div className="dsh-notebook-pills">{selected.tags.map(value => <Tag key={value} tone="neutral">{value}</Tag>)}</div>
                  <MarkdownText text={selected.body} labels={markdownLabels} />
                  {selected.images.length > 0 && <section>
                    <h3>{t('images')}</h3>
                    <div className="dsh-notebook-images">
                      {selected.images.map(image => <figure className="dsh-notebook-image" key={image.id}>
                        {imageUrls.current.get(image.id) && <img src={imageUrls.current.get(image.id)} alt={image.name} />}
                        <span>{image.name}</span>
                      </figure>)}
                    </div>
                  </section>}
                  <DisclosureRow title={t('history')} icon={<History size={14} />} open={historyOpen}
                    expandable expandOnRowClick onToggle={loadHistory}>
                    <div className="dsh-notebook-history">
                      {revisions.map(item => <div className="dsh-notebook-history-row" key={item.id}>
                        <div><strong>{t('revision')} {item.revision}</strong><div className="dsh-notebook-meta">{new Date(item.createdAt).toLocaleString()}</div></div>
                        {item.revision === selected.revision
                          ? <Tag tone="info">{t('current')}</Tag>
                          : <Button size="sm" variant="outline" onClick={() => setConfirmation({ kind: 'revision', note: selected, revision: item })}>{t('restoreVersion')}</Button>}
                      </div>)}
                    </div>
                  </DisclosureRow>
                </div>
              </>
            : null}
      </section>
    </main>

    <Modal open={notebookForm !== undefined} onClose={() => setNotebookForm(undefined)}
      title={notebookForm?.id ? t('rename') : t('newNotebook')} closeLabel={t('close')}
      footer={<><Button variant="ghost" onClick={() => setNotebookForm(undefined)}>{t('cancel')}</Button>
        <Button variant="primary" disabled={loading || !notebookForm?.name.trim()} onClick={() => void run(async signal => {
          if (!notebookForm) return
          if (notebookForm.id) {
            await api.renameNotebook({ id: notebookForm.id, expectedRevision: notebookForm.revision as number, name: notebookForm.name }, signal)
          } else {
            await api.createNotebook({ name: notebookForm.name }, signal)
          }
          setNotebookForm(undefined)
          await refresh(false)
        })}>{notebookForm?.id ? t('rename') : t('create')}</Button></>}>
      <div className="dsh-notebook-modal-body"><Input value={notebookForm?.name ?? ''}
        aria-label={t('notebookName')} placeholder={t('notebookName')}
        onChange={event => {
          const name = event.currentTarget.value
          setNotebookForm(current => current && ({ ...current, name }))
        }} />
        {error && <div className="dsh-notebook-error" role="alert">{t('error')}: {error}</div>}
      </div>
    </Modal>

    <Modal open={confirmation !== undefined} onClose={() => setConfirmation(undefined)}
      title={confirmation?.kind === 'revision' ? t('restoreTitle')
        : confirmation?.kind === 'notebook' ? t('deleteNotebookTitle') : t('deleteNoteTitle')}
      description={confirmation?.kind === 'revision' ? t('restoreDescription')
        : confirmation?.kind === 'notebook' ? t('deleteNotebookDescription') : t('deleteNoteDescription')}
      closeLabel={t('close')}
      footer={<><Button variant="ghost" onClick={() => setConfirmation(undefined)}>{t('cancel')}</Button>
        <Button variant="primary" onClick={performConfirmation}>
          {confirmation?.kind === 'revision' ? t('restoreVersion') : t('delete')}
        </Button></>} />

    {toast && <Toast key={toast.id} text={toast.text} onDone={() => setToast(undefined)} />}
  </>
}
