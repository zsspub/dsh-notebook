/** Repair a failed notebook call in the model surface before its next request. */

import type { Context } from '@deepseek-ai/cordis'
import { createUserMessage, type Message, type ToolCallBlock } from '@deepseek-ai/dsh-llm'
import type { Session } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-query'

const NOTEBOOK_TOOLS = new Set([
  'notebook_search',
  'notebook_read',
  'notebook_note_create',
  'notebook_note_update',
  'notebook_note_archive',
  'notebook_note_restore',
])

function notebookCall(message: Message): ToolCallBlock | undefined {
  if (message.role !== 'assistant') return undefined
  const calls = message.content.filter((block): block is ToolCallBlock => block.type === 'tool-call')
  if (calls.length !== 1 || message.content.some(block => block.type !== 'reasoning' && block.type !== 'tool-call')) {
    return undefined
  }
  const call = calls[0]
  if (call === undefined) return undefined
  if (NOTEBOOK_TOOLS.has(call.name)) return call
  if (call.name !== 'skill') return undefined
  try {
    const args: unknown = JSON.parse(call.arguments)
    return typeof args === 'object' && args !== null && 'name' in args && args.name === 'dsh-notebook'
      ? call
      : undefined
  } catch (error) {
    if (error instanceof SyntaxError) return undefined
    throw error
  }
}

/** Replace one ended, unmatched notebook invocation while retaining its raw events. */
export async function repairInterruptedNotebookCall(ctx: Context, session: Session, signal: AbortSignal): Promise<void> {
  const messages = session.deriveMessages()
  const assistantIndex = messages.findLastIndex(message => message.role === 'assistant')
  const assistant = messages[assistantIndex]
  const call = assistant === undefined ? undefined : notebookCall(assistant)
  if (call === undefined || messages.slice(assistantIndex + 1).some(message =>
    message.source.kind === 'tool' && message.source.callId === call.id)) return

  signal.throwIfAborted()
  const observation = await ctx.sessionQuery.observeSession(session.id, { signal, projectionMode: 'none' })
  try {
    signal.throwIfAborted()
    const assistantEvent = observation.events.findLast(event =>
      event.type === 'assistant/message' && event.data.message.id === assistant.id)
    if (assistantEvent?.type !== 'assistant/message' || notebookCall(assistantEvent.data.message)?.id !== call.id
      || !session.surface.nodes.includes(assistantEvent.seq)) return

    const following = observation.events.slice(assistantEvent.seq + 1)
    const callEvent = following.find(event => event.type === 'tool/call'
      && event.data.turn === assistantEvent.data.turn
      && event.data.callId === call.id
      && event.data.name === call.name)
    const turnEnd = following.find(event => event.type === 'turn/end'
      && event.data.turn === assistantEvent.data.turn)
    if (callEvent?.type !== 'tool/call' || turnEnd?.type !== 'turn/end'
      || callEvent.seq >= turnEnd.seq
      || !['error', 'aborted', 'interrupted'].includes(turnEnd.data.reason.kind)) return

    signal.throwIfAborted()
    const message = createUserMessage({
      source: { kind: 'plugin', plugin: 'dsh-notebook', form: 'notice', summary: 'Previous notebook call had no result' },
      content: [{ type: 'text', text: call.name === 'skill'
        ? 'The previous dsh-notebook skill call ended without a result. Invoke it again if this request still needs notebook access.'
        : 'The previous notebook tool call ended without a result. Its effect is unknown; search and read the notebook before retrying a write.' }],
    })
    session.append('user/message', message, {
      surfaceOp: { op: 'replace', startSeq: assistantEvent.seq, endSeq: assistantEvent.seq },
      sourceEventSeqs: [assistantEvent.seq, callEvent.seq, turnEnd.seq],
    })
  } finally {
    observation[Symbol.dispose]()
  }
}
