/** Bundled dsh-notebook skill provider. */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { BUNDLED_SKILL_RANK, } from '@deepseek-ai/dsh-skill';
const PROVIDER = 'dsh-notebook';
const SKILL = 'dsh-notebook';
const BODY_URL = new URL('../assets/dsh-notebook.md', import.meta.url);
const RESOURCE_BASE = {
    kind: 'directory',
    path: fileURLToPath(new URL('../assets/', import.meta.url)),
};
const DESCRIPTION = '记录和整理可管理的长期笔记：先搜索，再自主新建或复用已有笔记，并安全处理并发与当前轮图片。';
const CANDIDATE = {
    name: SKILL,
    description: DESCRIPTION,
    invocation: { modelInvocable: true, userInvocable: false },
    provider: PROVIDER,
    source: 'bundled',
    resourceBase: RESOURCE_BASE,
    rank: BUNDLED_SKILL_RANK,
    locator: BODY_URL,
};
const provider = {
    name: PROVIDER,
    list: () => Promise.resolve([CANDIDATE]),
    async get() {
        return {
            ...CANDIDATE,
            content: await readFile(BODY_URL, 'utf8'),
        };
    },
};
export const name = 'notebook-skill';
export const inject = ['skills'];
/** Register the bundled notebook workflow. */
export function apply(ctx) {
    ctx.skills.registerProvider(() => provider);
}
