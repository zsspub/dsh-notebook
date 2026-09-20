// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { describe, expect, it } from 'vitest'
import { NotebookToolCard } from '../src/client/ToolCard.tsx'
import { en } from '../src/client/locales.ts'

const translate = (key: keyof typeof en, values?: Record<string, string | number>): string => {
  let value: string = en[key]
  for (const [name, replacement] of Object.entries(values ?? {})) {
    value = value.replace(`{${name}}`, String(replacement))
  }
  return value
}
const t = translate as PropsLocale<'notebook'>['t']

describe('NotebookToolCard', () => {
  it('shows the target note, notebook, revision and image count', () => {
    const props = {
      toolName: 'notebook_note_update',
      callId: 'call',
      cwd: '/tmp',
      openFile: () => undefined,
      loadImage: async () => ({ kind: 'missing' } as never),
      t,
      block: {
        kind: 'settled',
        call: { argsRaw: '{}' },
        content: [{
          type: 'text',
          text: JSON.stringify({
            note: { title: 'Design notes', notebookName: 'Work', revision: 4, imageCount: 2 },
          }),
        }],
        isError: false,
      },
    } as unknown as ComponentProps<typeof NotebookToolCard>
    render(<NotebookToolCard {...props} />)
    expect(screen.getByText('Updated note')).toBeTruthy()
    expect(screen.getByText('Design notes · Work')).toBeTruthy()
    expect(screen.getByText('r4')).toBeTruthy()
    expect(screen.getByText('2 images')).toBeTruthy()
  })

  it('shows a bounded search result count', () => {
    const props = {
      toolName: 'notebook_search',
      callId: 'call',
      cwd: '/tmp',
      openFile: () => undefined,
      loadImage: async () => ({ kind: 'missing' } as never),
      t,
      block: {
        kind: 'settled',
        call: { argsRaw: '{"query":"design"}' },
        content: [{ type: 'text', text: JSON.stringify({ notes: [], total: 12, hasMore: true }) }],
        isError: false,
      },
    } as unknown as ComponentProps<typeof NotebookToolCard>
    render(<NotebookToolCard {...props} />)
    expect(screen.getByText('Notebook search')).toBeTruthy()
    expect(screen.getByText('12 notes')).toBeTruthy()
  })
})
