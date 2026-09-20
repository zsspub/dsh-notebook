import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/** Compact transcript card for notebook tool outcomes. */
import { Archive, BookOpen, NotebookTabs, RotateCcw, Search } from 'lucide-react';
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import { toolCardStyles } from "./styles.js";
function textResult(block) {
    if (!('kind' in block))
        return undefined;
    const text = block.content.find(item => item.type === 'text');
    return text?.type === 'text' ? text.text : undefined;
}
function parsedResult(block) {
    const text = textResult(block);
    if (!text)
        return undefined;
    try {
        const parsed = JSON.parse(text);
        return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed
            : undefined;
    }
    catch {
        return undefined;
    }
}
export function NotebookToolCard({ toolName, block, t }) {
    const result = parsedResult(block);
    const running = !('kind' in block);
    const note = (result?.note ?? (typeof result?.id === 'string' ? result : undefined));
    const searchResult = toolName === 'notebook_search' ? result : undefined;
    const icon = toolName === 'notebook_search' ? _jsx(Search, { size: 16 })
        : toolName === 'notebook_note_archive' ? _jsx(Archive, { size: 16 })
            : toolName === 'notebook_note_restore' ? _jsx(RotateCcw, { size: 16 })
                : toolName === 'notebook_read' ? _jsx(BookOpen, { size: 16 }) : _jsx(NotebookTabs, { size: 16 });
    const title = toolName === 'notebook_search' ? t('cardSearch')
        : toolName === 'notebook_read' ? t('cardRead')
            : toolName === 'notebook_note_create' ? t('cardCreated')
                : toolName === 'notebook_note_update' ? t('cardUpdated')
                    : toolName === 'notebook_note_archive' ? t('cardArchived') : t('cardRestored');
    const subtitle = running ? t('cardRunning')
        : note ? `${String(note.title)} · ${String(note.notebookName)}`
            : searchResult ? t('noteCount', { count: Number(searchResult.total ?? 0) }) : '';
    return _jsxs(_Fragment, { children: [_jsx("style", { children: toolCardStyles }), _jsxs("section", { className: "dsh-notebook-tool-card", "aria-label": title, children: [icon, _jsxs("div", { children: [_jsx("strong", { children: title }), _jsx("span", { children: subtitle })] }), note && _jsxs(Tag, { tone: "quiet", children: ["r", String(note.revision)] }), note && Number(note.imageCount) > 0 && _jsx(Tag, { tone: "info", children: t('imageCount', { count: Number(note.imageCount) }) })] })] });
}
