import { defineTool } from "@deepseek-ai/dsh-tools";
//#region lib/types/tools.js
/** Agent-facing notebook tools with search-first guidance and current-turn image import. */
const name = "notebook-tools";
const inject = [
	"tools",
	"notebook",
	"attachments"
];
const string = {
	type: "string",
	required: true
};
const revision = {
	type: "integer",
	required: true,
	description: "Current note revision returned by notebook_read. Re-read and merge after a conflict."
};
const imageIndexes = {
	type: "array",
	items: { type: "integer" },
	description: "Optional 1-based indexes of relevant images in the current human message. Never pass attachment ids."
};
function currentHumanImages(exec) {
	const agent = exec.agent;
	if (!agent) return [];
	const events = agent.session.snapshotEvents();
	for (let index = events.length - 1; index >= 0; index -= 1) {
		const event = events[index];
		if (event?.type !== "user/message") continue;
		const message = event.data;
		if (message.source?.kind !== "user") continue;
		return (message.content ?? []).filter((part) => part.type === "image" && part.attachment !== void 0).map((part) => part.attachment);
	}
	return [];
}
async function selectedImages(ctx, exec, indexes) {
	if (indexes === void 0 || indexes.length === 0) return [];
	const refs = currentHumanImages(exec);
	const unique = [...new Set(indexes)];
	if (unique.some((index) => !Number.isSafeInteger(index) || index < 1 || index > refs.length)) throw new Error(`imageIndexes must refer to the ${String(refs.length)} images in the current human message`);
	const images = [];
	for (const index of unique) {
		exec.signal.throwIfAborted();
		const stored = await ctx.attachments.readImage(refs[index - 1], exec.signal);
		images.push({
			name: stored.ref.name ?? `image-${String(index)}`,
			mediaType: stored.ref.mediaType,
			data: Buffer.from(stored.data).toString("base64")
		});
	}
	return images;
}
function resultText(note, action, notebookDisposition = "reused") {
	return JSON.stringify({
		action,
		note,
		notebook: {
			id: note.notebookId,
			name: note.notebookName
		},
		notebookDisposition,
		revision: note.revision,
		imageCount: note.imageCount
	});
}
/** Register bounded notebook search, read, write and reversible lifecycle tools. */
function apply(ctx) {
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "notebook_search",
		description: "Search the shared notebook before creating or updating a note. Searches title, Markdown body, tags and notebook name. Use this first for every note-taking request.",
		parameters: {
			query: {
				type: "string",
				description: "Words describing the information to find."
			},
			notebookId: {
				type: "string",
				description: "Optional notebook id filter."
			},
			tags: {
				type: "array",
				items: { type: "string" },
				description: "Tags that must all match."
			},
			archived: {
				type: "boolean",
				description: "True searches only archived notes; default false."
			},
			limit: {
				type: "integer",
				description: "Page size, at most 100."
			},
			offset: {
				type: "integer",
				description: "Zero-based page offset."
			}
		},
		output: {
			schema: { type: "string" },
			render: (_args, result) => [{
				type: "text",
				text: result
			}]
		},
		execute: async (args, exec) => JSON.stringify(await ctx.notebook.search({
			...args,
			notebookId: args.notebookId
		}, exec.signal)),
		presentCall: (args) => ({
			card: "generic",
			title: `Search notebook: ${args.query ?? ""}`,
			kind: "search",
			rawInput: args
		})
	})), "notebook: search tool");
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "notebook_read",
		description: "Read one complete note, including its current revision, Markdown, tags and images. Read a search candidate before updating it.",
		parameters: { id: {
			...string,
			description: "Note id returned by notebook_search."
		} },
		output: {
			schema: { type: "string" },
			render: (_args, result) => [{
				type: "text",
				text: result
			}]
		},
		execute: async (args, exec) => JSON.stringify(await ctx.notebook.read({ id: args.id }, exec.signal)),
		presentCall: (args) => ({
			card: "generic",
			title: `Read note ${args.id}`,
			kind: "read",
			rawInput: args
		})
	})), "notebook: read tool");
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "notebook_note_create",
		description: "Create a Markdown note only after notebook_search. Reuse a notebook by id, or supply notebookName to reuse/create one by name. Attach relevant current-message images by 1-based position.",
		parameters: {
			notebookId: {
				type: "string",
				description: "Existing notebook id. Mutually exclusive with notebookName."
			},
			notebookName: {
				type: "string",
				description: "Existing or new notebook name. Mutually exclusive with notebookId."
			},
			title: string,
			body: {
				...string,
				description: "Complete Markdown body."
			},
			tags: {
				type: "array",
				items: { type: "string" }
			},
			imageIndexes
		},
		output: {
			schema: { type: "string" },
			render: (_args, result) => [{
				type: "text",
				text: result
			}]
		},
		async execute(args, exec) {
			const overview = await ctx.notebook.overview({}, exec.signal);
			const reused = args.notebookId !== void 0 || overview.notebooks.some((notebook) => notebook.name.toLocaleLowerCase() === args.notebookName?.trim().toLocaleLowerCase());
			const input = {
				notebookId: args.notebookId,
				notebookName: args.notebookName,
				title: args.title,
				body: args.body,
				tags: args.tags,
				images: await selectedImages(ctx, exec, args.imageIndexes)
			};
			return resultText(await ctx.notebook.create(input, exec.signal), "created", reused ? "reused" : "created");
		},
		presentCall: (args) => ({
			card: "generic",
			title: `Create note: ${args.title}`,
			kind: "other",
			rawInput: args
		})
	})), "notebook: create tool");
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "notebook_note_update",
		description: "Update a note after notebook_read. append adds Markdown after the current body; replace replaces it. On REVISION_CONFLICT, read again, merge the concurrent edit, and retry. Current-message images use 1-based positions.",
		parameters: {
			id: string,
			expectedRevision: revision,
			mode: {
				type: "string",
				enum: ["append", "replace"],
				required: true
			},
			title: { type: "string" },
			body: {
				type: "string",
				description: "Markdown to append or use as replacement."
			},
			notebookId: { type: "string" },
			notebookName: { type: "string" },
			tags: {
				type: "array",
				items: { type: "string" },
				description: "Complete replacement tag set."
			},
			imageIndexes
		},
		output: {
			schema: { type: "string" },
			render: (_args, result) => [{
				type: "text",
				text: result
			}]
		},
		async execute(args, exec) {
			const input = {
				id: args.id,
				expectedRevision: args.expectedRevision,
				mode: args.mode,
				title: args.title,
				body: args.body,
				notebookId: args.notebookId,
				notebookName: args.notebookName,
				tags: args.tags,
				images: await selectedImages(ctx, exec, args.imageIndexes)
			};
			return resultText(await ctx.notebook.update(input, exec.signal), "updated");
		},
		presentCall: (args) => ({
			card: "generic",
			title: `Update note ${args.id}`,
			kind: "other",
			rawInput: args
		})
	})), "notebook: update tool");
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "notebook_note_archive",
		description: "Archive one note after reading its latest revision. This is reversible and is the normal delete path.",
		parameters: {
			id: string,
			expectedRevision: revision
		},
		output: {
			schema: { type: "string" },
			render: (_args, result) => [{
				type: "text",
				text: result
			}]
		},
		async execute(args, exec) {
			return resultText(await ctx.notebook.archive({
				id: args.id,
				expectedRevision: args.expectedRevision
			}, exec.signal), "archived");
		},
		presentCall: (args) => ({
			card: "generic",
			title: `Archive note ${args.id}`,
			kind: "other",
			rawInput: args
		})
	})), "notebook: archive tool");
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "notebook_note_restore",
		description: "Restore one archived note after reading its latest revision.",
		parameters: {
			id: string,
			expectedRevision: revision
		},
		output: {
			schema: { type: "string" },
			render: (_args, result) => [{
				type: "text",
				text: result
			}]
		},
		async execute(args, exec) {
			return resultText(await ctx.notebook.restore({
				id: args.id,
				expectedRevision: args.expectedRevision
			}, exec.signal), "restored");
		},
		presentCall: (args) => ({
			card: "generic",
			title: `Restore note ${args.id}`,
			kind: "other",
			rawInput: args
		})
	})), "notebook: restore tool");
}
//#endregion
export { apply, inject, name };
