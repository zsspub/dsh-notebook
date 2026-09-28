/** Repair a failed notebook call in the model surface before its next request. */
import type { Context } from '@deepseek-ai/cordis';
import type { Session } from '@deepseek-ai/dsh-session';
/** Replace one ended, unmatched notebook invocation while retaining its raw events. */
export declare function repairInterruptedNotebookCall(ctx: Context, session: Session, signal: AbortSignal): Promise<void>;
