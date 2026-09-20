/** Agent-facing notebook tools with search-first guidance and current-turn image import. */
import type { Context } from '@deepseek-ai/cordis';
export declare const name = "notebook-tools";
export declare const inject: string[];
/** Register bounded notebook search, read, write and reversible lifecycle tools. */
export declare function apply(ctx: Context): void;
