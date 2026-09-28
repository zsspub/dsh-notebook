import type { Context } from '@deepseek-ai/cordis'
import { createAssistantMessage, createToolResultMessage, createUserMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import { Session, SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import { describe, expect, it, vi } from 'vitest'
import { repairInterruptedNotebookCall } from '../src/recovery.ts'

const signal = new AbortController().signal

function failedCall(name: string, args = '{}', withResult = false) {
  const session = Session.create(SessionId('notebook-recovery'))
  const callId = ToolCallId('call-notebook')
  session.append('turn/start', { turn: 1 })
  session.append('step/start', { turn: 1, step: 1 })
  session.append('user/message', createUserMessage({
    source: { kind: 'user' }, content: [{ type: 'text', text: 'Take a note' }],
  }), { surfaceOp: 'append' })
  const assistant = session.append('assistant/message', {
    turn: 1,
    step: 1,
    stream: [],
    message: createAssistantMessage({
      source: { provider: 'test', model: 'test' },
      content: [
        { type: 'reasoning', text: 'Use the notebook.' },
        { type: 'tool-call', id: callId, name, arguments: args },
      ],
    }),
  }, { surfaceOp: 'append' })
  session.append('tool/call', { turn: 1, step: 1, callId, name, arguments: args })
  if (withResult) {
    session.append('tool/result', {
      turn: 1, step: 1,
      message: createToolResultMessage({ callId, content: [{ type: 'text', text: 'Done' }], isError: false }),
    }, { surfaceOp: 'append' })
  }
  session.append('step/end', { turn: 1, step: 1 })
  session.append('turn/end', {
    turn: 1,
    reason: withResult ? { kind: 'completed' } : { kind: 'error', error: { code: 'UNKNOWN', message: 'prepare failed' } },
  })
  session.append('turn/start', { turn: 2 })
  session.append('step/start', { turn: 2, step: 1 })
  session.append('user/message', createUserMessage({
    source: { kind: 'user' }, content: [{ type: 'text', text: 'Please retry' }],
  }), { surfaceOp: 'append' })

  const dispose = vi.fn()
  const observeSession = vi.fn(async () => ({
    events: session.snapshotEvents() as readonly SessionEvent[],
    [Symbol.dispose]: dispose,
  }))
  const ctx = { sessionQuery: { observeSession } } as unknown as Context
  return { session, assistant, ctx, observeSession, dispose }
}

describe('failed notebook call recovery', () => {
  it('replaces the unanswered notebook skill call in model history once and retains its raw event', async () => {
    const { session, assistant, ctx, observeSession, dispose } = failedCall('skill', '{"name":"dsh-notebook"}')
    await repairInterruptedNotebookCall(ctx, session, signal)
    const messages = session.deriveMessages()
    expect(messages.some(message => message.id === assistant.data.message.id)).toBe(false)
    expect(messages.some(message => message.content.some(block =>
      block.type === 'text' && block.text.includes('skill call ended without a result')))).toBe(true)
    expect(session.snapshotEvents()[assistant.seq]).toEqual(assistant)
    expect(session.snapshotEvents().at(-1)).toMatchObject({
      type: 'user/message',
      data: { source: { kind: 'notebook-recovery', form: 'notice', summary: 'Previous notebook call had no result' } },
      surfaceOp: { op: 'replace', startSeq: assistant.seq, endSeq: assistant.seq },
      sourceEventSeqs: [assistant.seq, assistant.seq + 1, assistant.seq + 3],
    })

    await repairInterruptedNotebookCall(ctx, session, signal)
    expect(observeSession).toHaveBeenCalledTimes(1)
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('tells the model to inspect notebook state before retrying an unanswered write', async () => {
    const { session, ctx } = failedCall('notebook_note_create')
    await repairInterruptedNotebookCall(ctx, session, signal)
    expect(session.deriveMessages().some(message => message.content.some(block =>
      block.type === 'text' && block.text.includes('effect is unknown')))).toBe(true)
  })

  it('leaves paired calls and other skills alone', async () => {
    for (const [name, args, paired] of [
      ['skill', '{"name":"dsh-notebook"}', true],
      ['skill', '{"name":"some-other-skill"}', false],
      ['bash', '{}', false],
    ] as const) {
      const { session, ctx, observeSession } = failedCall(name, args, paired)
      const before = session.seq
      await repairInterruptedNotebookCall(ctx, session, signal)
      expect(session.seq).toBe(before)
      expect(observeSession).not.toHaveBeenCalled()
    }
  })
})
