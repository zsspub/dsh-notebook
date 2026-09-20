/** Compact transcript card for notebook tool outcomes. */
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import { NS } from './locales.ts';
type Props = ToolCallViewProps & PropsLocale<typeof NS>;
export declare function NotebookToolCard({ toolName, block, t }: Props): import("react/jsx-runtime").JSX.Element;
export {};
