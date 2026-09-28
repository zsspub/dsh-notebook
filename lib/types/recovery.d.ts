/** Repair a failed notebook call in the model surface before its next request. */
import type { Context } from '@deepseek-ai/cordis';
import type { Session } from '@deepseek-ai/dsh-session';
declare module '@deepseek-ai/dsh-llm' {
    interface MessageSourceMap {
        'notebook-recovery': {
            readonly kind: 'notebook-recovery';
            readonly form: 'notice';
            readonly summary: string;
        };
    }
}
/** Replace one ended, unmatched notebook invocation while retaining its raw events. */
export declare function repairInterruptedNotebookCall(ctx: Context, session: Session, signal: AbortSignal): Promise<void>;
