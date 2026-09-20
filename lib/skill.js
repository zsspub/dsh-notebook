import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { BUNDLED_SKILL_RANK } from "@deepseek-ai/dsh-skill";
//#region lib/types/skill.js
/** Bundled dsh-notebook skill provider. */
const PROVIDER = "dsh-notebook";
const SKILL = "dsh-notebook";
const BODY_URL = new URL("../assets/dsh-notebook.md", import.meta.url);
const CANDIDATE = {
	name: SKILL,
	description: "记录和整理可管理的长期笔记：先搜索，再自主新建或复用已有笔记，并安全处理并发与当前轮图片。",
	invocation: {
		modelInvocable: true,
		userInvocable: false
	},
	provider: PROVIDER,
	source: "bundled",
	resourceBase: {
		kind: "directory",
		path: fileURLToPath(new URL("../assets/", import.meta.url))
	},
	rank: BUNDLED_SKILL_RANK,
	locator: BODY_URL
};
const provider = {
	name: PROVIDER,
	list: () => Promise.resolve([CANDIDATE]),
	async get() {
		return {
			...CANDIDATE,
			content: await readFile(BODY_URL, "utf8")
		};
	}
};
const name = "notebook-skill";
const inject = ["skills"];
/** Register the bundled notebook workflow. */
function apply(ctx) {
	ctx.skills.registerProvider(() => provider);
}
//#endregion
export { apply, inject, name };
