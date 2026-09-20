/** Mount the Notebook Remote and register its sidebar and tool-card contributions. */
import remote from 'dsh-notebook/remote';
import { NotebookPanel, NotebookTrigger } from "./Panel.js";
import { NotebookToolCard } from "./ToolCard.js";
import { en, NS, zh } from "./locales.js";
export const inject = ['slots', 'locale', 'remote', 'sidebarRight', 'sidebarRightTabs'];
function unwrap(result) {
    if (!result.ok)
        throw result.error;
    return result.value;
}
/** Register all client contributions and dispose them together. */
export async function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'notebook: locales');
    const t = ctx.locale.bind(NS);
    const unmount = await ctx.remote.$mount(remote);
    const fiber = ctx.inject(['remote.notebook'], scope => {
        scope.effect(() => scope.sidebarRightTabs.register({
            id: 'dsh-notebook',
            kind: 'notebook',
            title: () => t('title'),
        }), 'notebook: tab');
        const api = {
            overview: async (input, signal) => unwrap(await scope.remote.notebook.overview(input, signal)),
            search: async (input, signal) => unwrap(await scope.remote.notebook.search(input, signal)),
            read: async (input, signal) => unwrap(await scope.remote.notebook.read(input, signal)),
            create: async (input, signal) => unwrap(await scope.remote.notebook.create(input, signal)),
            update: async (input, signal) => unwrap(await scope.remote.notebook.update(input, signal)),
            archive: async (input, signal) => unwrap(await scope.remote.notebook.archive(input, signal)),
            restore: async (input, signal) => unwrap(await scope.remote.notebook.restore(input, signal)),
            deleteNote: async (input, signal) => unwrap(await scope.remote.notebook.deleteNote(input, signal)),
            createNotebook: async (input, signal) => unwrap(await scope.remote.notebook.createNotebook(input, signal)),
            renameNotebook: async (input, signal) => unwrap(await scope.remote.notebook.renameNotebook(input, signal)),
            deleteNotebook: async (input, signal) => unwrap(await scope.remote.notebook.deleteNotebook(input, signal)),
            notebook: async (input, signal) => unwrap(await scope.remote.notebook.notebook(input, signal)),
            revisions: async (input, signal) => unwrap(await scope.remote.notebook.revisions(input, signal)),
            restoreRevision: async (input, signal) => unwrap(await scope.remote.notebook.restoreRevision(input, signal)),
            addImage: async (input, signal) => unwrap(await scope.remote.notebook.addImage(input, signal)),
            imageData: async (input, signal) => unwrap(await scope.remote.notebook.imageData(input, signal)),
        };
        scope.slots.inject('sidebar.footer.action', () => scope.slots.register({
            name: 'sidebar.footer.action',
            id: 'notebook',
            order: 55,
            locale: NS,
            inject: () => ({
                openPanel: () => {
                    try {
                        scope.sidebarRight.openTab('notebook');
                    }
                    catch (error) {
                        if (error instanceof Error && error.message === 'sidebarRight: no session surface is mounted')
                            return;
                        throw error;
                    }
                },
            }),
        }, NotebookTrigger));
        scope.slots.inject('sidebar.right.pane.tab', () => scope.slots.register({
            name: 'sidebar.right.pane.tab',
            key: 'dsh-notebook',
            locale: NS,
            inject: () => ({ api }),
        }, NotebookPanel));
        const toolNames = [
            'notebook_search', 'notebook_read', 'notebook_note_create',
            'notebook_note_update', 'notebook_note_archive', 'notebook_note_restore',
        ];
        scope.slots.inject('tool.call.toolview', function* () {
            for (const key of toolNames) {
                yield scope.slots.register({ name: 'tool.call.toolview', key, locale: NS }, NotebookToolCard);
            }
        });
    });
    try {
        await fiber;
    }
    catch (error) {
        await unmount();
        throw error;
    }
    return async () => {
        await fiber.dispose();
        await unmount();
    };
}
