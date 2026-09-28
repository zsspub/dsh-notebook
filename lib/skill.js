import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { BUNDLED_SKILL_RANK } from "@deepseek-ai/dsh-skill";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
//#region lib/types/recovery.js
/** Repair a failed notebook call in the model surface before its next request. */
const NOTEBOOK_TOOLS = /* @__PURE__ */ new Set([
	"notebook_search",
	"notebook_read",
	"notebook_note_create",
	"notebook_note_update",
	"notebook_note_archive",
	"notebook_note_restore"
]);
function notebookCall(message) {
	if (message.role !== "assistant") return void 0;
	const calls = message.content.filter((block) => block.type === "tool-call");
	if (calls.length !== 1 || message.content.some((block) => block.type !== "reasoning" && block.type !== "tool-call")) return;
	const call = calls[0];
	if (call === void 0) return void 0;
	if (NOTEBOOK_TOOLS.has(call.name)) return call;
	if (call.name !== "skill") return void 0;
	try {
		const args = JSON.parse(call.arguments);
		return typeof args === "object" && args !== null && "name" in args && args.name === "dsh-notebook" ? call : void 0;
	} catch (error) {
		if (error instanceof SyntaxError) return void 0;
		throw error;
	}
}
/** Replace one ended, unmatched notebook invocation while retaining its raw events. */
async function repairInterruptedNotebookCall(ctx, session, signal) {
	const messages = session.deriveMessages();
	const assistantIndex = messages.findLastIndex((message) => message.role === "assistant");
	const assistant = messages[assistantIndex];
	const call = assistant === void 0 ? void 0 : notebookCall(assistant);
	if (call === void 0 || messages.slice(assistantIndex + 1).some((message) => message.source.kind === "tool" && message.source.callId === call.id)) return;
	signal.throwIfAborted();
	const observation = await ctx.sessionQuery.observeSession(session.id, {
		signal,
		projectionMode: "none"
	});
	try {
		signal.throwIfAborted();
		const assistantEvent = observation.events.findLast((event) => event.type === "assistant/message" && event.data.message.id === assistant.id);
		if (assistantEvent?.type !== "assistant/message" || notebookCall(assistantEvent.data.message)?.id !== call.id || !session.surface.nodes.includes(assistantEvent.seq)) return;
		const following = observation.events.slice(assistantEvent.seq + 1);
		const callEvent = following.find((event) => event.type === "tool/call" && event.data.turn === assistantEvent.data.turn && event.data.callId === call.id && event.data.name === call.name);
		const turnEnd = following.find((event) => event.type === "turn/end" && event.data.turn === assistantEvent.data.turn);
		if (callEvent?.type !== "tool/call" || turnEnd?.type !== "turn/end" || callEvent.seq >= turnEnd.seq || ![
			"error",
			"aborted",
			"interrupted"
		].includes(turnEnd.data.reason.kind)) return;
		signal.throwIfAborted();
		const message = createUserMessage({
			source: {
				kind: "notebook-recovery",
				form: "notice",
				summary: "Previous notebook call had no result"
			},
			content: [{
				type: "text",
				text: call.name === "skill" ? "The previous dsh-notebook skill call ended without a result. Invoke it again if this request still needs notebook access." : "The previous notebook tool call ended without a result. Its effect is unknown; search and read the notebook before retrying a write."
			}]
		});
		session.append("user/message", message, {
			surfaceOp: {
				op: "replace",
				startSeq: assistantEvent.seq,
				endSeq: assistantEvent.seq
			},
			sourceEventSeqs: [
				assistantEvent.seq,
				callEvent.seq,
				turnEnd.seq
			]
		});
	} finally {
		observation[Symbol.dispose]();
	}
}
//#endregion
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
const inject = ["skills", "sessionQuery"];
/** Register the bundled notebook workflow. */
function apply(ctx) {
	ctx.skills.registerProvider(() => provider);
	ctx.on("agent/request", async ({ agent, signal }, next) => {
		await repairInterruptedNotebookCall(ctx, agent.session, signal);
		return next();
	});
}
//#endregion
export { apply, inject, name };
