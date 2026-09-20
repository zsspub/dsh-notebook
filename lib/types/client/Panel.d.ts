/** Responsive notebook manager backed by the Host Remote. */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { NotebookApi } from './index.ts';
import { NS } from './locales.ts';
type PanelProps = PropsLocale<typeof NS> & PropsRuntime<'sidebar.right.pane.tab'> & {
    api: NotebookApi;
};
type TriggerProps = PropsLocale<typeof NS> & PropsRuntime<'sidebar.footer.action'> & {
    openPanel: () => void;
};
export declare function NotebookTrigger({ t, wide, openPanel }: TriggerProps): import("react/jsx-runtime").JSX.Element;
export declare function NotebookPanel({ t, api, useTabInfo }: PanelProps): import("react/jsx-runtime").JSX.Element;
export {};
