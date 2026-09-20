/** Compact transcript card for notebook tool outcomes. */

import { Archive, BookOpen, NotebookTabs, RotateCcw, Search } from 'lucide-react'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { NS } from './locales.ts'
import { toolCardStyles } from './styles.ts'

type Props = ToolCallViewProps & PropsLocale<typeof NS>

function textResult(block: ToolCallViewProps['block']): string | undefined {
  if (!('kind' in block)) return undefined
  const text = block.content.find(item => item.type === 'text')
  return text?.type === 'text' ? text.text : undefined
}

function parsedResult(block: ToolCallViewProps['block']): Record<string, unknown> | undefined {
  const text = textResult(block)
  if (!text) return undefined
  try {
    const parsed: unknown = JSON.parse(text)
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined
  } catch {
    return undefined
  }
}

export function NotebookToolCard({ toolName, block, t }: Props) {
  const result = parsedResult(block)
  const running = !('kind' in block)
  const note = (result?.note ?? (typeof result?.id === 'string' ? result : undefined)) as Record<string, unknown> | undefined
  const searchResult = toolName === 'notebook_search' ? result : undefined
  const icon = toolName === 'notebook_search' ? <Search size={16} />
    : toolName === 'notebook_note_archive' ? <Archive size={16} />
      : toolName === 'notebook_note_restore' ? <RotateCcw size={16} />
        : toolName === 'notebook_read' ? <BookOpen size={16} /> : <NotebookTabs size={16} />
  const title = toolName === 'notebook_search' ? t('cardSearch')
    : toolName === 'notebook_read' ? t('cardRead')
      : toolName === 'notebook_note_create' ? t('cardCreated')
        : toolName === 'notebook_note_update' ? t('cardUpdated')
          : toolName === 'notebook_note_archive' ? t('cardArchived') : t('cardRestored')
  const subtitle = running ? t('cardRunning')
    : note ? `${String(note.title)} · ${String(note.notebookName)}`
      : searchResult ? t('noteCount', { count: Number(searchResult.total ?? 0) }) : ''
  return <>
    <style>{toolCardStyles}</style>
    <section className="dsh-notebook-tool-card" aria-label={title}>
      {icon}
      <div><strong>{title}</strong><span>{subtitle}</span></div>
      {note && <Tag tone="quiet">r{String(note.revision)}</Tag>}
      {note && Number(note.imageCount) > 0 && <Tag tone="info">{t('imageCount', { count: Number(note.imageCount) })}</Tag>}
    </section>
  </>
}
