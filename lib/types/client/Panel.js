import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/** Responsive notebook manager backed by the Host Remote. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Archive, ArrowLeft, Clock3, FileText, History, Image, NotebookTabs, Plus, RotateCcw, Search, Tag as TagIcon, Trash2, Upload, } from 'lucide-react';
import { Button, DisclosureRow, Input, MarkdownText, Modal, Pill, Tag, Toast, } from '@deepseek-ai/dsh-client-ui-primitives';
import { styles, triggerStyles } from "./styles.js";
const EMPTY_RESULT = { notes: [], total: 0, hasMore: false };
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
function errorText(error, t) {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes('revision conflict') ? t('conflict') : message;
}
function emptyDraft(notebookId = '') {
    return {
        notebookId,
        notebookName: '',
        title: '',
        body: '',
        tags: '',
        uploads: [],
        removedImages: [],
    };
}
function noteDraft(note) {
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
    };
}
async function encodedImages(files, t) {
    const results = [];
    for (const file of Array.from(files)) {
        if (!IMAGE_TYPES.has(file.type))
            throw new Error(t('uploadType'));
        if (file.size > 10 * 1024 * 1024)
            throw new Error(t('uploadTooLarge'));
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 32_768) {
            binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
        }
        results.push({ name: file.name, mediaType: file.type, data: btoa(binary) });
    }
    return results;
}
export function NotebookTrigger({ t, wide, openPanel }) {
    return _jsxs(_Fragment, { children: [_jsx("style", { children: triggerStyles }), _jsxs("button", { type: "button", className: "dsh-notebook-trigger", "data-wide": wide, "aria-label": t('trigger'), title: t('trigger'), onClick: openPanel, children: [_jsx(NotebookTabs, { size: wide ? 16 : 18, strokeWidth: 1.7, "aria-hidden": "true" }), wide && _jsx("span", { children: t('trigger') })] })] });
}
export function NotebookPanel({ t, api, useTabInfo }) {
    const { tab } = useTabInfo();
    const lifetime = useRef(new AbortController());
    const [overview, setOverview] = useState();
    const [result, setResult] = useState(EMPTY_RESULT);
    const [selected, setSelected] = useState();
    const [view, setView] = useState('all');
    const [notebookId, setNotebookId] = useState('');
    const [tag, setTag] = useState('');
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState();
    const [draft, setDraft] = useState();
    const [preview, setPreview] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [revisions, setRevisions] = useState([]);
    const [confirmation, setConfirmation] = useState();
    const [notebookForm, setNotebookForm] = useState();
    const [toast, setToast] = useState();
    const imageUrls = useRef(new Map());
    const selectedId = useRef();
    selectedId.current = selected?.id;
    const run = useCallback(async (operation) => {
        setLoading(true);
        setError(undefined);
        try {
            return await operation(lifetime.current.signal);
        }
        catch (failure) {
            if (!lifetime.current.signal.aborted)
                setError(errorText(failure, t));
            return undefined;
        }
        finally {
            if (!lifetime.current.signal.aborted)
                setLoading(false);
        }
    }, [t]);
    const refresh = useCallback(async (keepSelected = true) => {
        const [nextOverview, nextResult] = await Promise.all([
            api.overview({}, lifetime.current.signal),
            api.search({
                query: query.trim() || undefined,
                notebookId: notebookId ? notebookId : undefined,
                tags: tag ? [tag] : undefined,
                archived: view === 'archived',
                limit: view === 'recent' ? 15 : 100,
            }, lifetime.current.signal),
        ]);
        if (lifetime.current.signal.aborted)
            return;
        setOverview(nextOverview);
        setResult(nextResult);
        if (keepSelected && selectedId.current) {
            const currentId = selectedId.current;
            const stillVisible = nextResult.notes.some(note => note.id === currentId);
            if (stillVisible) {
                const current = await api.read({ id: currentId }, lifetime.current.signal);
                if (!lifetime.current.signal.aborted)
                    setSelected(current);
            }
            else {
                setSelected(undefined);
            }
        }
    }, [api, notebookId, query, tag, view]);
    useEffect(() => () => {
        lifetime.current.abort();
        for (const url of imageUrls.current.values())
            URL.revokeObjectURL(url);
    }, []);
    useEffect(() => {
        if (!tab.visible)
            return;
        void run(async () => refresh());
    }, [refresh, run, tab.visible]);
    useEffect(() => {
        if (!selected)
            return;
        for (const image of selected.images) {
            if (imageUrls.current.has(image.id))
                continue;
            void api.imageData({ id: image.id }, lifetime.current.signal).then(data => {
                if (lifetime.current.signal.aborted)
                    return;
                const binary = atob(data.data);
                const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
                const url = URL.createObjectURL(new Blob([bytes], { type: data.image.mediaType }));
                imageUrls.current.set(image.id, url);
                setSelected(current => current === undefined ? current : { ...current });
            }).catch(failure => setError(errorText(failure, t)));
        }
    }, [api, selected, t]);
    const selectNote = (id) => {
        void run(async (signal) => {
            const note = await api.read({ id }, signal);
            setSelected(note);
            setDraft(undefined);
            setPreview(false);
            setHistoryOpen(false);
        });
    };
    const saveDraft = (event) => {
        event.preventDefault();
        if (!draft || draft.title.trim() === '' || draft.notebookId === '' && draft.notebookName.trim() === '')
            return;
        void run(async (signal) => {
            const tags = draft.tags.split(',').map(value => value.trim()).filter(Boolean);
            const note = draft.id === undefined
                ? await api.create({
                    notebookId: draft.notebookId ? draft.notebookId : undefined,
                    notebookName: draft.notebookName || undefined,
                    title: draft.title,
                    body: draft.body,
                    tags,
                    images: draft.uploads,
                }, signal)
                : await api.update({
                    id: draft.id,
                    expectedRevision: draft.revision,
                    mode: 'replace',
                    notebookId: draft.notebookId,
                    title: draft.title,
                    body: draft.body,
                    tags,
                    images: draft.uploads,
                    removeImageIds: draft.removedImages,
                }, signal);
            setSelected(note);
            setDraft(undefined);
            setPreview(false);
            setToast({ id: Date.now(), text: t('save') });
            await refresh(false);
        });
    };
    const chooseFiles = (event) => {
        if (!draft || !event.currentTarget.files)
            return;
        void encodedImages(event.currentTarget.files, t)
            .then(images => setDraft(current => current === undefined ? current : {
            ...current,
            uploads: [...current.uploads, ...images],
        }))
            .catch(failure => setError(errorText(failure, t)));
        event.currentTarget.value = '';
    };
    const loadHistory = () => {
        if (!selected)
            return;
        setHistoryOpen(open => !open);
        if (historyOpen || revisions.length > 0)
            return;
        void run(async (signal) => {
            const page = await api.revisions({ id: selected.id, limit: 100 }, signal);
            setRevisions(page.revisions);
        });
    };
    const performConfirmation = () => {
        if (!confirmation)
            return;
        void run(async (signal) => {
            if (confirmation.kind === 'note') {
                await api.deleteNote({
                    id: confirmation.note.id,
                    expectedRevision: confirmation.note.revision,
                }, signal);
                setSelected(undefined);
            }
            else if (confirmation.kind === 'notebook') {
                await api.deleteNotebook({
                    id: confirmation.id,
                    expectedRevision: confirmation.revision,
                }, signal);
                if (notebookId === confirmation.id)
                    setNotebookId('');
            }
            else {
                const restored = await api.restoreRevision({
                    id: confirmation.note.id,
                    revision: confirmation.revision.revision,
                    expectedRevision: confirmation.note.revision,
                }, signal);
                setSelected(restored);
                setRevisions([]);
            }
            setConfirmation(undefined);
            await refresh(false);
        });
    };
    const activeNotebook = overview?.notebooks.find(item => item.id === notebookId);
    const markdownLabels = useMemo(() => ({
        code: { copyLabel: t('markdownCopy'), copiedLabel: t('markdownCopied') },
        footnotes: t('markdownFootnotes'),
    }), [t]);
    return _jsxs(_Fragment, { children: [_jsx("style", { children: styles }), _jsxs("main", { className: "dsh-notebook", "data-detail": selected !== undefined || draft !== undefined, children: [_jsxs("nav", { className: "dsh-notebook-nav", "aria-label": t('notebooks'), children: [_jsxs("div", { className: "dsh-notebook-section", children: [_jsxs("div", { className: "dsh-notebook-heading", children: [_jsx("h2", { children: t('title') }), _jsx(Button, { size: "sm", variant: "ghost", icon: _jsx(Plus, { size: 14 }), "aria-label": t('newNotebook'), onClick: () => setNotebookForm({ name: '' }) })] }), _jsx("div", { className: "dsh-notebook-nav-list", children: [
                                            ['all', t('allNotes'), _jsx(FileText, { size: 14 }, "all"), overview?.activeNotes ?? 0],
                                            ['recent', t('recent'), _jsx(Clock3, { size: 14 }, "recent"), undefined],
                                            ['archived', t('archived'), _jsx(Archive, { size: 14 }, "archived"), overview?.archivedNotes ?? 0],
                                        ].map(([id, label, icon, count]) => (_jsxs("button", { type: "button", className: "dsh-notebook-nav-item", "aria-pressed": view === id && notebookId === '', onClick: () => { setView(id); setNotebookId(''); }, children: [_jsxs("span", { className: "dsh-notebook-row", children: [icon, label] }), count !== undefined && _jsx(Tag, { tone: "quiet", children: count })] }, id))) })] }), _jsxs("div", { className: "dsh-notebook-section", children: [_jsx("div", { className: "dsh-notebook-heading", children: _jsx("h3", { children: t('notebooks') }) }), _jsx("div", { className: "dsh-notebook-nav-list", children: overview?.notebooks.map(notebook => (_jsxs("button", { type: "button", className: "dsh-notebook-nav-item", "aria-pressed": notebookId === notebook.id, onClick: () => { setNotebookId(notebook.id); setView('all'); }, children: [_jsx("span", { children: notebook.name }), _jsx(Tag, { tone: "quiet", children: notebook.noteCount })] }, notebook.id))) }), activeNotebook && _jsxs("div", { className: "dsh-notebook-actions", children: [_jsx(Button, { size: "sm", variant: "ghost", onClick: () => setNotebookForm({
                                                    id: activeNotebook.id, revision: activeNotebook.revision, name: activeNotebook.name,
                                                }), children: t('rename') }), _jsx(Button, { size: "sm", variant: "ghost", icon: _jsx(Trash2, { size: 13 }), disabled: activeNotebook.noteCount + activeNotebook.archivedNoteCount > 0, onClick: () => setConfirmation({ kind: 'notebook', id: activeNotebook.id, revision: activeNotebook.revision }), children: t('delete') })] })] }), (overview?.tags.length ?? 0) > 0 && _jsxs("div", { className: "dsh-notebook-section", children: [_jsx("div", { className: "dsh-notebook-heading", children: _jsx("h3", { children: t('tags') }) }), _jsx("div", { className: "dsh-notebook-pills", children: overview?.tags.map(value => _jsx(Pill, { active: tag === value, onClick: () => setTag(current => current === value ? '' : value), children: value }, value)) })] })] }), _jsxs("section", { className: "dsh-notebook-list-pane", children: [_jsxs("header", { className: "dsh-notebook-list-head", children: [_jsxs("div", { className: "dsh-notebook-row", children: [_jsx(Search, { size: 14, "aria-hidden": "true" }), _jsx(Input, { value: query, onChange: event => setQuery(event.currentTarget.value), placeholder: t('search'), "aria-label": t('search') })] }), _jsxs("div", { className: "dsh-notebook-toolbar", children: [_jsx(Button, { size: "sm", variant: "primary", icon: _jsx(Plus, { size: 14 }), onClick: () => setDraft(emptyDraft(notebookId || overview?.notebooks[0]?.id)), children: t('newNote') }), tag && _jsxs(Tag, { tone: "info", children: [_jsx(TagIcon, { size: 11 }), " ", tag] })] })] }), error && _jsxs("div", { className: "dsh-notebook-error", role: "alert", children: [t('error'), ": ", error] }), loading && result.notes.length === 0
                                ? _jsx("div", { className: "dsh-notebook-empty", children: t('loading') })
                                : result.notes.length === 0
                                    ? _jsxs("div", { className: "dsh-notebook-empty", children: [_jsx(NotebookTabs, { size: 36 }), _jsx("h3", { children: query || tag ? t('noMatch') : t('empty') }), _jsx("p", { children: t('emptyHint') })] })
                                    : _jsx("div", { className: "dsh-notebook-list", children: result.notes.map(note => _jsxs("button", { type: "button", className: "dsh-notebook-list-item", "aria-pressed": selected?.id === note.id, onClick: () => selectNote(note.id), children: [_jsx("h3", { children: note.title }), _jsx("p", { children: note.excerpt }), _jsxs("span", { className: "dsh-notebook-meta", children: [_jsx("span", { children: note.notebookName }), _jsxs("span", { children: [t('revision'), " ", note.revision] }), note.imageCount > 0 && _jsxs("span", { children: [_jsx(Image, { size: 11 }), " ", note.imageCount] })] })] }, note.id)) })] }), _jsx("section", { className: "dsh-notebook-detail", children: draft
                            ? _jsxs("form", { onSubmit: saveDraft, className: "dsh-notebook-detail", children: [_jsxs("header", { className: "dsh-notebook-detail-head", children: [_jsxs("div", { children: [_jsx(Button, { className: "dsh-notebook-back", size: "sm", variant: "ghost", icon: _jsx(ArrowLeft, { size: 14 }), onClick: () => setDraft(undefined), children: t('back') }), _jsx("h2", { children: draft.id ? t('edit') : t('newNote') })] }), _jsxs("div", { className: "dsh-notebook-actions", children: [_jsx(Pill, { active: !preview, onClick: () => setPreview(false), children: t('edit') }), _jsx(Pill, { active: preview, onClick: () => setPreview(true), children: t('preview') }), _jsx(Button, { type: "submit", size: "sm", variant: "primary", disabled: loading, children: loading ? t('saving') : t('save') })] })] }), _jsx("div", { className: "dsh-notebook-detail-body", children: preview
                                            ? _jsx("div", { className: "dsh-notebook-preview", children: _jsx(MarkdownText, { text: draft.body, labels: markdownLabels }) })
                                            : _jsxs(_Fragment, { children: [_jsxs("label", { className: "dsh-notebook-field", children: [t('noteTitle'), _jsx(Input, { value: draft.title, onChange: event => setDraft({ ...draft, title: event.currentTarget.value }), required: true })] }), _jsxs("label", { className: "dsh-notebook-field", children: [t('moveTo'), _jsxs("select", { value: draft.notebookId, onChange: event => setDraft({ ...draft, notebookId: event.currentTarget.value, notebookName: '' }), children: [_jsx("option", { value: "", children: t('newNotebook') }), overview?.notebooks.map(notebook => _jsx("option", { value: notebook.id, children: notebook.name }, notebook.id))] })] }), draft.notebookId === '' && _jsxs("label", { className: "dsh-notebook-field", children: [t('notebookName'), _jsx(Input, { value: draft.notebookName, onChange: event => setDraft({ ...draft, notebookName: event.currentTarget.value }), required: true })] }), _jsxs("label", { className: "dsh-notebook-field", children: [t('tags'), _jsx(Input, { value: draft.tags, placeholder: t('tagsPlaceholder'), onChange: event => setDraft({ ...draft, tags: event.currentTarget.value }) })] }), _jsxs("label", { className: "dsh-notebook-field", children: [t('body'), _jsx("textarea", { value: draft.body, onChange: event => setDraft({ ...draft, body: event.currentTarget.value }) })] }), _jsxs("div", { className: "dsh-notebook-actions", children: [_jsx(Button, { size: "sm", variant: "outline", icon: _jsx(Upload, { size: 14 }), onClick: event => {
                                                                    const input = event.currentTarget.nextElementSibling;
                                                                    input?.click();
                                                                }, children: t('addImages') }), _jsx("input", { hidden: true, type: "file", accept: "image/png,image/jpeg,image/webp,image/gif", multiple: true, onChange: chooseFiles }), draft.uploads.length > 0 && _jsx(Tag, { tone: "info", children: t('imageCount', { count: draft.uploads.length }) })] }), selected && selected.images.length > 0 && _jsx("div", { className: "dsh-notebook-images", children: selected.images.map(image => _jsxs("div", { className: "dsh-notebook-image", children: [imageUrls.current.get(image.id) && _jsx("img", { src: imageUrls.current.get(image.id), alt: image.name }), _jsx("span", { children: image.name }), _jsx(Button, { size: "sm", variant: "ghost", onClick: () => setDraft({
                                                                        ...draft,
                                                                        removedImages: draft.removedImages.includes(image.id)
                                                                            ? draft.removedImages.filter(id => id !== image.id)
                                                                            : [...draft.removedImages, image.id],
                                                                    }), children: draft.removedImages.includes(image.id) ? t('restore') : t('remove') })] }, image.id)) })] }) })] })
                            : selected
                                ? _jsxs(_Fragment, { children: [_jsxs("header", { className: "dsh-notebook-detail-head", children: [_jsxs("div", { children: [_jsx(Button, { className: "dsh-notebook-back", size: "sm", variant: "ghost", icon: _jsx(ArrowLeft, { size: 14 }), onClick: () => setSelected(undefined), children: t('back') }), _jsx("h2", { children: selected.title }), _jsxs("div", { className: "dsh-notebook-meta", children: [_jsx(Tag, { tone: "quiet", children: selected.notebookName }), _jsxs("span", { children: [t('revision'), " ", selected.revision] }), _jsxs("span", { children: [t('updated'), " ", new Date(selected.updatedAt).toLocaleString()] })] })] }), _jsxs("div", { className: "dsh-notebook-actions", children: [_jsx(Button, { size: "sm", variant: "outline", onClick: () => setDraft(noteDraft(selected)), children: t('edit') }), selected.archivedAt === null
                                                            ? _jsx(Button, { size: "sm", variant: "ghost", icon: _jsx(Archive, { size: 14 }), onClick: () => void run(async (signal) => {
                                                                    const note = await api.archive({ id: selected.id, expectedRevision: selected.revision }, signal);
                                                                    setSelected(note);
                                                                    await refresh(false);
                                                                }), children: t('archive') })
                                                            : _jsxs(_Fragment, { children: [_jsx(Button, { size: "sm", variant: "ghost", icon: _jsx(RotateCcw, { size: 14 }), onClick: () => void run(async (signal) => {
                                                                            const note = await api.restore({ id: selected.id, expectedRevision: selected.revision }, signal);
                                                                            setSelected(note);
                                                                            await refresh(false);
                                                                        }), children: t('restore') }), _jsx(Button, { size: "sm", variant: "ghost", icon: _jsx(Trash2, { size: 14 }), onClick: () => setConfirmation({ kind: 'note', note: selected }), children: t('delete') })] })] })] }), _jsxs("div", { className: "dsh-notebook-detail-body", children: [_jsx("div", { className: "dsh-notebook-pills", children: selected.tags.map(value => _jsx(Tag, { tone: "neutral", children: value }, value)) }), _jsx(MarkdownText, { text: selected.body, labels: markdownLabels }), selected.images.length > 0 && _jsxs("section", { children: [_jsx("h3", { children: t('images') }), _jsx("div", { className: "dsh-notebook-images", children: selected.images.map(image => _jsxs("figure", { className: "dsh-notebook-image", children: [imageUrls.current.get(image.id) && _jsx("img", { src: imageUrls.current.get(image.id), alt: image.name }), _jsx("span", { children: image.name })] }, image.id)) })] }), _jsx(DisclosureRow, { title: t('history'), icon: _jsx(History, { size: 14 }), open: historyOpen, expandable: true, expandOnRowClick: true, onToggle: loadHistory, children: _jsx("div", { className: "dsh-notebook-history", children: revisions.map(item => _jsxs("div", { className: "dsh-notebook-history-row", children: [_jsxs("div", { children: [_jsxs("strong", { children: [t('revision'), " ", item.revision] }), _jsx("div", { className: "dsh-notebook-meta", children: new Date(item.createdAt).toLocaleString() })] }), item.revision === selected.revision
                                                                    ? _jsx(Tag, { tone: "info", children: t('current') })
                                                                    : _jsx(Button, { size: "sm", variant: "outline", onClick: () => setConfirmation({ kind: 'revision', note: selected, revision: item }), children: t('restoreVersion') })] }, item.id)) }) })] })] })
                                : _jsxs("div", { className: "dsh-notebook-empty", children: [_jsx(FileText, { size: 36 }), _jsx("h3", { children: t('empty') }), _jsx("p", { children: t('emptyHint') })] }) })] }), _jsx(Modal, { open: notebookForm !== undefined, onClose: () => setNotebookForm(undefined), title: notebookForm?.id ? t('rename') : t('newNotebook'), closeLabel: t('close'), footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "ghost", onClick: () => setNotebookForm(undefined), children: t('cancel') }), _jsx(Button, { variant: "primary", onClick: () => void run(async (signal) => {
                                if (!notebookForm)
                                    return;
                                if (notebookForm.id) {
                                    await api.renameNotebook({ id: notebookForm.id, expectedRevision: notebookForm.revision, name: notebookForm.name }, signal);
                                }
                                else {
                                    await api.createNotebook({ name: notebookForm.name }, signal);
                                }
                                setNotebookForm(undefined);
                                await refresh(false);
                            }), children: notebookForm?.id ? t('rename') : t('create') })] }), children: _jsx("div", { className: "dsh-notebook-modal-body", children: _jsx(Input, { value: notebookForm?.name ?? '', "aria-label": t('notebookName'), placeholder: t('notebookName'), onChange: event => setNotebookForm(current => current && ({ ...current, name: event.currentTarget.value })) }) }) }), _jsx(Modal, { open: confirmation !== undefined, onClose: () => setConfirmation(undefined), title: confirmation?.kind === 'revision' ? t('restoreTitle')
                    : confirmation?.kind === 'notebook' ? t('deleteNotebookTitle') : t('deleteNoteTitle'), description: confirmation?.kind === 'revision' ? t('restoreDescription')
                    : confirmation?.kind === 'notebook' ? t('deleteNotebookDescription') : t('deleteNoteDescription'), closeLabel: t('close'), footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "ghost", onClick: () => setConfirmation(undefined), children: t('cancel') }), _jsx(Button, { variant: "primary", onClick: performConfirmation, children: confirmation?.kind === 'revision' ? t('restoreVersion') : t('delete') })] }) }), toast && _jsx(Toast, { text: toast.text, onDone: () => setToast(undefined) }, toast.id)] });
}
