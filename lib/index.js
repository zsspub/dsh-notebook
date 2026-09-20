import Schema from "@deepseek-ai/schemastery";
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import sharp from "sharp";
const MEDIA_TYPES = /* @__PURE__ */ new Set([
	"image/png",
	"image/jpeg",
	"image/webp",
	"image/gif"
]);
const IMAGE_EXTENSIONS = {
	"image/png": ".png",
	"image/jpeg": ".jpg",
	"image/webp": ".webp",
	"image/gif": ".gif"
};
/** Stable business failure returned through tools and Remote calls. */
var NotebookError = class extends Error {
	code;
	constructor(message, code = "NOTEBOOK_ERROR") {
		super(message);
		this.code = code;
		this.name = "NotebookError";
	}
};
function requiredText(name, value, maxLength) {
	const result = value.trim();
	if (result.length === 0 || result.length > maxLength) throw new NotebookError(`${name} must contain 1 to ${String(maxLength)} characters`);
	return result;
}
function bodyText(value, maxBytes) {
	if (Buffer.byteLength(value, "utf8") > maxBytes) throw new NotebookError(`body must not exceed ${String(maxBytes)} UTF-8 bytes`);
	return value;
}
function normalizedTags(values) {
	if (values === void 0) return [];
	if (values.length > 50) throw new NotebookError("tags must contain at most 50 entries");
	const tags = /* @__PURE__ */ new Set();
	for (const raw of values) {
		const tag = requiredText("tag", raw, 64).toLocaleLowerCase();
		tags.add(tag);
	}
	return [...tags].sort();
}
function positiveInteger(name, value) {
	if (!Number.isSafeInteger(value) || value <= 0) throw new NotebookError(`${name} must be a positive integer`);
	return value;
}
function nonNegativeInteger(name, value) {
	if (!Number.isSafeInteger(value) || value < 0) throw new NotebookError(`${name} must be a non-negative integer`);
	return value;
}
function iso(value) {
	return value === null ? null : new Date(value).toISOString();
}
function assertAbsolute(name, value) {
	if (value !== ":memory:" && !isAbsolute(value)) throw new NotebookError(`${name} must be absolute or :memory:`);
}
function safeName(name, fallback) {
	const leaf = basename(name).normalize("NFKC").replace(/[^\p{L}\p{N}._ -]+/gu, "-").replace(/\s+/gu, " ").trim();
	return (leaf.length === 0 ? fallback : leaf).slice(0, 160);
}
function escapeFtsQuery(query) {
	return query.trim().split(/\s+/u).filter(Boolean).map((token) => `"${token.replaceAll("\"", "\"\"")}"*`).join(" AND ");
}
function parseJsonArray(value, label) {
	const parsed = JSON.parse(value);
	if (!Array.isArray(parsed)) throw new NotebookError(`invalid ${label} snapshot`);
	return parsed;
}
function asNoteImage(snapshot) {
	return {
		id: snapshot.id,
		noteId: snapshot.noteId,
		name: snapshot.name,
		mediaType: snapshot.mediaType,
		bytes: snapshot.bytes,
		width: snapshot.width,
		height: snapshot.height,
		digest: snapshot.digest,
		position: snapshot.position,
		createdAt: new Date(snapshot.createdAt).toISOString()
	};
}
/** Synchronous storage. Each public mutation commits one SQLite transaction. */
var NotebookStore = class {
	config;
	database;
	now;
	createId;
	trashDirectory;
	closed = false;
	constructor(config, dependencies = {}) {
		this.config = config;
		assertAbsolute("databasePath", config.databasePath);
		assertAbsolute("imageDirectory", config.imageDirectory);
		positiveInteger("busyTimeoutMs", config.busyTimeoutMs);
		positiveInteger("defaultPageSize", config.defaultPageSize);
		positiveInteger("maxPageSize", config.maxPageSize);
		positiveInteger("maxBodyBytes", config.maxBodyBytes);
		positiveInteger("maxImageBytes", config.maxImageBytes);
		positiveInteger("maxImagesPerNote", config.maxImagesPerNote);
		if (config.defaultPageSize > config.maxPageSize) throw new NotebookError("defaultPageSize cannot exceed maxPageSize");
		this.now = dependencies.now ?? Date.now;
		this.createId = dependencies.createId ?? randomUUID;
		this.trashDirectory = join(config.imageDirectory, ".trash");
		if (config.databasePath !== ":memory:") mkdirSync(dirname(config.databasePath), {
			recursive: true,
			mode: 448
		});
		mkdirSync(config.imageDirectory, {
			recursive: true,
			mode: 448
		});
		mkdirSync(this.trashDirectory, {
			recursive: true,
			mode: 448
		});
		const existed = config.databasePath === ":memory:" || existsSync(config.databasePath);
		this.database = new DatabaseSync(config.databasePath, { timeout: config.busyTimeoutMs });
		try {
			if (!existed && config.databasePath !== ":memory:") chmodSync(config.databasePath, 384);
			this.initialize();
			this.recoverTrash();
		} catch (error) {
			this.database.close();
			this.closed = true;
			throw error;
		}
	}
	initialize() {
		this.database.exec("PRAGMA foreign_keys = ON");
		this.database.exec("PRAGMA journal_mode = WAL");
		this.database.exec(`PRAGMA busy_timeout = ${String(this.config.busyTimeoutMs)}`);
		const { user_version: version } = this.database.prepare("PRAGMA user_version").get();
		if (version > 1) throw new NotebookError(`notebook schema ${String(version)} is newer than supported ${String(1)}`);
		if (version === 1) return;
		this.transaction(() => {
			this.database.exec(`
        CREATE TABLE notebooks (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL COLLATE NOCASE UNIQUE,
          revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE TABLE notes (
          id TEXT PRIMARY KEY,
          notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE RESTRICT,
          title TEXT NOT NULL,
          body TEXT NOT NULL,
          revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          archived_at INTEGER
        );
        CREATE INDEX notes_notebook_updated ON notes(notebook_id, archived_at, updated_at DESC, id);
        CREATE TABLE tags (
          name TEXT PRIMARY KEY COLLATE NOCASE
        );
        CREATE TABLE note_tags (
          note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
          tag_name TEXT NOT NULL REFERENCES tags(name) ON DELETE CASCADE,
          PRIMARY KEY(note_id, tag_name)
        );
        CREATE TABLE note_images (
          id TEXT PRIMARY KEY,
          note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          media_type TEXT NOT NULL,
          bytes INTEGER NOT NULL,
          width INTEGER NOT NULL,
          height INTEGER NOT NULL,
          digest TEXT NOT NULL,
          storage_name TEXT NOT NULL UNIQUE,
          position INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          UNIQUE(note_id, position)
        );
        CREATE TABLE note_revisions (
          id TEXT PRIMARY KEY,
          note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
          revision INTEGER NOT NULL,
          notebook_id TEXT NOT NULL,
          notebook_name TEXT NOT NULL,
          title TEXT NOT NULL,
          body TEXT NOT NULL,
          tags_json TEXT NOT NULL,
          images_json TEXT NOT NULL,
          archived_at INTEGER,
          created_at INTEGER NOT NULL,
          UNIQUE(note_id, revision)
        );
        CREATE VIRTUAL TABLE note_search USING fts5(
          note_id UNINDEXED,
          title,
          body,
          tags,
          notebook
        );
        PRAGMA user_version = 1;
      `);
		});
	}
	recoverTrash() {
		const rows = this.database.prepare("SELECT storage_name FROM note_images").all();
		const live = new Set(rows.map((row) => row.storage_name));
		const revisions = this.database.prepare("SELECT images_json FROM note_revisions").all();
		for (const revision of revisions) for (const image of parseJsonArray(revision.images_json, "image")) live.add(image.storageName);
		for (const entry of readdirSync(this.trashDirectory)) {
			const original = entry.replace(/^[^.]+--/u, "");
			const trashPath = join(this.trashDirectory, entry);
			if (live.has(original)) {
				const target = join(this.config.imageDirectory, original);
				if (!existsSync(target)) renameSync(trashPath, target);
				else rmSync(trashPath, { force: true });
			} else rmSync(trashPath, { force: true });
		}
	}
	transaction(operation) {
		this.ensureOpen();
		this.database.exec("BEGIN IMMEDIATE");
		try {
			const result = operation();
			this.database.exec("COMMIT");
			return result;
		} catch (error) {
			this.database.exec("ROLLBACK");
			throw error;
		}
	}
	ensureOpen() {
		if (this.closed) throw new NotebookError("notebook store is closed");
	}
	notebookRow(id) {
		const row = this.database.prepare("SELECT * FROM notebooks WHERE id = ?").get(id);
		if (!row) throw new NotebookError(`notebook ${id} was not found`, "NOT_FOUND");
		return row;
	}
	noteRow(id) {
		const row = this.database.prepare("SELECT * FROM notes WHERE id = ?").get(id);
		if (!row) throw new NotebookError(`note ${id} was not found`, "NOT_FOUND");
		return row;
	}
	tags(noteId) {
		return this.database.prepare("SELECT tag_name FROM note_tags WHERE note_id = ? ORDER BY tag_name").all(noteId).map((row) => row.tag_name);
	}
	imageRows(noteId) {
		return this.database.prepare("SELECT * FROM note_images WHERE note_id = ? ORDER BY position, id").all(noteId);
	}
	toImage(row) {
		return {
			id: row.id,
			noteId: row.note_id,
			name: row.name,
			mediaType: row.media_type,
			bytes: row.bytes,
			width: row.width,
			height: row.height,
			digest: row.digest,
			position: row.position,
			createdAt: new Date(row.created_at).toISOString()
		};
	}
	toNote(row) {
		const notebook = this.notebookRow(row.notebook_id);
		const images = this.imageRows(row.id).map((image) => this.toImage(image));
		return {
			id: row.id,
			notebookId: row.notebook_id,
			notebookName: notebook.name,
			title: row.title,
			body: row.body,
			excerpt: row.body.replace(/\s+/gu, " ").trim().slice(0, 240),
			tags: this.tags(row.id),
			images,
			imageCount: images.length,
			revision: row.revision,
			createdAt: new Date(row.created_at).toISOString(),
			updatedAt: new Date(row.updated_at).toISOString(),
			archivedAt: iso(row.archived_at)
		};
	}
	resolveNotebook(input, timestamp) {
		if (input.notebookId !== void 0 && input.notebookName !== void 0) throw new NotebookError("provide notebookId or notebookName, not both");
		if (input.notebookId !== void 0) return this.notebookRow(input.notebookId);
		const name = requiredText("notebookName", input.notebookName ?? "Notebook", 120);
		const existing = this.database.prepare("SELECT * FROM notebooks WHERE name = ? COLLATE NOCASE").get(name);
		if (existing) return existing;
		const id = this.createId();
		this.database.prepare("INSERT INTO notebooks(id, name, revision, created_at, updated_at) VALUES (?, ?, 1, ?, ?)").run(id, name, timestamp, timestamp);
		return this.notebookRow(id);
	}
	replaceTags(noteId, tags) {
		this.database.prepare("DELETE FROM note_tags WHERE note_id = ?").run(noteId);
		const insertTag = this.database.prepare("INSERT OR IGNORE INTO tags(name) VALUES (?)");
		const link = this.database.prepare("INSERT INTO note_tags(note_id, tag_name) VALUES (?, ?)");
		for (const tag of tags) {
			insertTag.run(tag);
			link.run(noteId, tag);
		}
		this.database.exec("DELETE FROM tags WHERE NOT EXISTS (SELECT 1 FROM note_tags WHERE note_tags.tag_name = tags.name)");
	}
	refreshSearch(noteId) {
		const note = this.noteRow(noteId);
		const notebook = this.notebookRow(note.notebook_id);
		this.database.prepare("DELETE FROM note_search WHERE note_id = ?").run(noteId);
		this.database.prepare("INSERT INTO note_search(note_id, title, body, tags, notebook) VALUES (?, ?, ?, ?, ?)").run(noteId, note.title, note.body, this.tags(noteId).join(" "), notebook.name);
	}
	imageSnapshot(row) {
		return {
			id: row.id,
			noteId: row.note_id,
			name: row.name,
			mediaType: row.media_type,
			bytes: row.bytes,
			width: row.width,
			height: row.height,
			digest: row.digest,
			storageName: row.storage_name,
			position: row.position,
			createdAt: row.created_at
		};
	}
	recordRevision(noteId) {
		const note = this.noteRow(noteId);
		const notebook = this.notebookRow(note.notebook_id);
		const images = this.imageRows(noteId).map((row) => this.imageSnapshot(row));
		this.database.prepare(`
      INSERT INTO note_revisions(
        id, note_id, revision, notebook_id, notebook_name, title, body,
        tags_json, images_json, archived_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(this.createId(), noteId, note.revision, note.notebook_id, notebook.name, note.title, note.body, JSON.stringify(this.tags(noteId)), JSON.stringify(images), note.archived_at, this.now());
	}
	assertRevision(actual, expected) {
		positiveInteger("expectedRevision", expected);
		if (actual !== expected) throw new NotebookError(`revision conflict: expected ${String(expected)}, current ${String(actual)}`, "REVISION_CONFLICT");
	}
	async prepareImage(noteId, input, position) {
		if (!MEDIA_TYPES.has(input.mediaType)) throw new NotebookError(`unsupported image type ${input.mediaType}`);
		let data;
		try {
			data = Buffer.from(input.data, "base64");
		} catch {
			throw new NotebookError("image data must be valid base64");
		}
		if (data.byteLength === 0 || data.byteLength > this.config.maxImageBytes) throw new NotebookError(`image must contain 1 to ${String(this.config.maxImageBytes)} bytes`);
		const metadata = await sharp(data, {
			failOn: "error",
			animated: true,
			limitInputPixels: true
		}).metadata();
		if ((metadata.format === void 0 ? void 0 : `image/${metadata.format}`) !== input.mediaType || metadata.width === void 0 || metadata.height === void 0) throw new NotebookError("declared image type does not match decoded image bytes");
		const digest = createHash("sha256").update(data).digest("hex");
		const id = this.createId();
		const storageName = `${digest}-${id}${IMAGE_EXTENSIONS[input.mediaType]}`;
		return {
			id,
			noteId,
			name: safeName(input.name, `image${IMAGE_EXTENSIONS[input.mediaType]}`),
			mediaType: input.mediaType,
			bytes: data.byteLength,
			width: metadata.width,
			height: metadata.height,
			digest,
			storageName,
			position,
			createdAt: this.now(),
			data
		};
	}
	publishImages(images) {
		for (const image of images) {
			const temporary = join(this.config.imageDirectory, `.${image.storageName}.${randomUUID()}.tmp`);
			writeFileSync(temporary, image.data, {
				mode: 384,
				flag: "wx"
			});
			renameSync(temporary, join(this.config.imageDirectory, image.storageName));
		}
	}
	insertImages(images) {
		const statement = this.database.prepare(`
      INSERT INTO note_images(
        id, note_id, name, media_type, bytes, width, height, digest, storage_name, position, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
		for (const image of images) statement.run(image.id, image.noteId, image.name, image.mediaType, image.bytes, image.width, image.height, image.digest, image.storageName, image.position, image.createdAt);
	}
	cleanupPublished(images) {
		for (const image of images) rmSync(join(this.config.imageDirectory, image.storageName), { force: true });
	}
	/** Return notebook counts and the complete active tag vocabulary. */
	overview() {
		this.ensureOpen();
		const rows = this.database.prepare(`
      SELECT n.*,
        SUM(CASE WHEN notes.id IS NOT NULL AND notes.archived_at IS NULL THEN 1 ELSE 0 END) AS active_count,
        SUM(CASE WHEN notes.id IS NOT NULL AND notes.archived_at IS NOT NULL THEN 1 ELSE 0 END) AS archived_count
      FROM notebooks n LEFT JOIN notes ON notes.notebook_id = n.id
      GROUP BY n.id ORDER BY n.updated_at DESC, n.name COLLATE NOCASE
    `).all();
		const counts = this.database.prepare(`
      SELECT
        SUM(CASE WHEN archived_at IS NULL THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN archived_at IS NOT NULL THEN 1 ELSE 0 END) AS archived
      FROM notes
    `).get();
		const tags = this.database.prepare("SELECT name FROM tags ORDER BY name COLLATE NOCASE").all().map((row) => row.name);
		return {
			notebooks: rows.map((row) => ({
				id: row.id,
				name: row.name,
				revision: row.revision,
				noteCount: row.active_count ?? 0,
				archivedNoteCount: row.archived_count ?? 0,
				createdAt: new Date(row.created_at).toISOString(),
				updatedAt: new Date(row.updated_at).toISOString()
			})),
			tags,
			activeNotes: counts.active ?? 0,
			archivedNotes: counts.archived ?? 0
		};
	}
	/** Create one empty notebook. */
	createNotebook(nameInput) {
		const timestamp = this.now();
		const name = requiredText("name", nameInput, 120);
		const id = this.createId();
		this.transaction(() => {
			this.database.prepare("INSERT INTO notebooks(id, name, revision, created_at, updated_at) VALUES (?, ?, 1, ?, ?)").run(id, name, timestamp, timestamp);
		});
		const notebook = this.overview().notebooks.find((item) => item.id === id);
		if (!notebook) throw new NotebookError("created notebook is unavailable");
		return notebook;
	}
	/** Search title, body, tags and notebook name with bounded pagination. */
	search(input) {
		this.ensureOpen();
		const limit = Math.min(positiveInteger("limit", input.limit ?? this.config.defaultPageSize), this.config.maxPageSize);
		const offset = nonNegativeInteger("offset", input.offset ?? 0);
		const tags = normalizedTags(input.tags);
		const clauses = [input.archived === true ? "n.archived_at IS NOT NULL" : "n.archived_at IS NULL"];
		const parameters = [];
		if (input.notebookId !== void 0) {
			clauses.push("n.notebook_id = ?");
			parameters.push(input.notebookId);
		}
		for (const tag of tags) {
			clauses.push("EXISTS (SELECT 1 FROM note_tags nt WHERE nt.note_id = n.id AND nt.tag_name = ? COLLATE NOCASE)");
			parameters.push(tag);
		}
		const query = input.query?.trim();
		if (query) {
			clauses.push("n.id IN (SELECT note_id FROM note_search WHERE note_search MATCH ?)");
			parameters.push(escapeFtsQuery(query));
		}
		const where = clauses.join(" AND ");
		const total = this.database.prepare(`SELECT COUNT(*) AS total FROM notes n WHERE ${where}`).get(...parameters).total;
		const rows = this.database.prepare(`
      SELECT n.* FROM notes n
      WHERE ${where}
      ORDER BY n.updated_at DESC, n.id
      LIMIT ? OFFSET ?
    `).all(...parameters, limit, offset);
		return {
			notes: rows.map((row) => {
				const note = this.toNote(row);
				return {
					id: note.id,
					notebookId: note.notebookId,
					notebookName: note.notebookName,
					title: note.title,
					excerpt: note.excerpt,
					tags: note.tags,
					imageCount: note.imageCount,
					revision: note.revision,
					createdAt: note.createdAt,
					updatedAt: note.updatedAt,
					archivedAt: note.archivedAt
				};
			}),
			total,
			hasMore: offset + rows.length < total
		};
	}
	/** Read one complete note. */
	read(input) {
		this.ensureOpen();
		return this.toNote(this.noteRow(input.id));
	}
	/** Create a note, creating its named notebook when absent. */
	async create(input) {
		const timestamp = this.now();
		const title = requiredText("title", input.title, 240);
		const body = bodyText(input.body, this.config.maxBodyBytes);
		const tags = normalizedTags(input.tags);
		const noteId = this.createId();
		const uploads = input.images ?? [];
		if (uploads.length > this.config.maxImagesPerNote) throw new NotebookError("too many images for one note");
		const images = await Promise.all(uploads.map((image, index) => this.prepareImage(noteId, image, index)));
		this.publishImages(images);
		try {
			this.transaction(() => {
				const notebook = this.resolveNotebook(input, timestamp);
				this.database.prepare(`
          INSERT INTO notes(id, notebook_id, title, body, revision, created_at, updated_at, archived_at)
          VALUES (?, ?, ?, ?, 1, ?, ?, NULL)
        `).run(noteId, notebook.id, title, body, timestamp, timestamp);
				this.replaceTags(noteId, tags);
				this.insertImages(images);
				this.refreshSearch(noteId);
				this.recordRevision(noteId);
				this.database.prepare("UPDATE notebooks SET revision = revision + 1, updated_at = ? WHERE id = ?").run(timestamp, notebook.id);
			});
		} catch (error) {
			this.cleanupPublished(images);
			throw error;
		}
		return this.read({ id: noteId });
	}
	/** Update note content and metadata with optimistic concurrency. */
	async update(input) {
		const previous = this.noteRow(input.id);
		this.assertRevision(previous.revision, input.expectedRevision);
		const title = input.title === void 0 ? previous.title : requiredText("title", input.title, 240);
		const nextBody = input.body === void 0 ? previous.body : input.mode === "append" ? bodyText(`${previous.body}${previous.body.length === 0 ? "" : "\n\n"}${input.body}`, this.config.maxBodyBytes) : bodyText(input.body, this.config.maxBodyBytes);
		const tags = input.tags === void 0 ? this.tags(input.id) : normalizedTags(input.tags);
		const currentImages = this.imageRows(input.id);
		const removedIds = new Set((input.removeImageIds ?? []).map(String));
		const retained = currentImages.filter((image) => !removedIds.has(image.id));
		if (removedIds.size !== currentImages.length - retained.length) throw new NotebookError("removeImageIds contains an unknown image");
		const uploads = input.images ?? [];
		if (retained.length + uploads.length > this.config.maxImagesPerNote) throw new NotebookError("too many images for one note");
		const images = await Promise.all(uploads.map((image, index) => this.prepareImage(input.id, image, retained.length + index)));
		this.publishImages(images);
		try {
			this.transaction(() => {
				const current = this.noteRow(input.id);
				this.assertRevision(current.revision, input.expectedRevision);
				const notebook = input.notebookId === void 0 && input.notebookName === void 0 ? this.notebookRow(current.notebook_id) : this.resolveNotebook(input, this.now());
				this.database.prepare(`
          UPDATE notes SET notebook_id = ?, title = ?, body = ?, revision = revision + 1, updated_at = ?
          WHERE id = ?
        `).run(notebook.id, title, nextBody, this.now(), input.id);
				this.replaceTags(input.id, tags);
				if (removedIds.size > 0) this.database.prepare(`DELETE FROM note_images WHERE note_id = ? AND id IN (${[...removedIds].map(() => "?").join(",")})`).run(input.id, ...removedIds);
				this.insertImages(images);
				this.refreshSearch(input.id);
				this.recordRevision(input.id);
				this.database.prepare("UPDATE notebooks SET revision = revision + 1, updated_at = ? WHERE id IN (?, ?)").run(this.now(), current.notebook_id, notebook.id);
			});
		} catch (error) {
			this.cleanupPublished(images);
			throw error;
		}
		return this.read({ id: input.id });
	}
	/** Archive one active note. */
	archive(input) {
		return this.setArchived(input, this.now());
	}
	/** Restore one archived note. */
	restore(input) {
		return this.setArchived(input, null);
	}
	setArchived(input, archivedAt) {
		this.transaction(() => {
			const note = this.noteRow(input.id);
			this.assertRevision(note.revision, input.expectedRevision);
			if (note.archived_at !== null === (archivedAt !== null)) throw new NotebookError("note already has the requested archive state");
			this.database.prepare("UPDATE notes SET archived_at = ?, revision = revision + 1, updated_at = ? WHERE id = ?").run(archivedAt, this.now(), input.id);
			this.recordRevision(input.id);
			this.database.prepare("UPDATE notebooks SET revision = revision + 1, updated_at = ? WHERE id = ?").run(this.now(), note.notebook_id);
		});
		return this.read({ id: input.id });
	}
	/** List immutable note snapshots newest first. */
	revisions(input) {
		this.noteRow(input.id);
		const limit = Math.min(positiveInteger("limit", input.limit ?? this.config.defaultPageSize), this.config.maxPageSize);
		const offset = nonNegativeInteger("offset", input.offset ?? 0);
		const total = this.database.prepare("SELECT COUNT(*) AS total FROM note_revisions WHERE note_id = ?").get(input.id).total;
		const rows = this.database.prepare(`
      SELECT * FROM note_revisions WHERE note_id = ? ORDER BY revision DESC LIMIT ? OFFSET ?
    `).all(input.id, limit, offset);
		return {
			revisions: rows.map((row) => ({
				id: row.id,
				noteId: row.note_id,
				revision: row.revision,
				notebookId: row.notebook_id,
				notebookName: row.notebook_name,
				title: row.title,
				body: row.body,
				tags: parseJsonArray(row.tags_json, "tag").map(String),
				images: parseJsonArray(row.images_json, "image").map((value) => asNoteImage(value)),
				archivedAt: iso(row.archived_at),
				createdAt: new Date(row.created_at).toISOString()
			})),
			total,
			hasMore: offset + rows.length < total
		};
	}
	/** Restore a historical snapshot as a new current revision. */
	restoreRevision(input) {
		this.transaction(() => {
			const note = this.noteRow(input.id);
			this.assertRevision(note.revision, input.expectedRevision);
			const snapshot = this.database.prepare("SELECT * FROM note_revisions WHERE note_id = ? AND revision = ?").get(input.id, input.revision);
			if (!snapshot) throw new NotebookError(`revision ${String(input.revision)} was not found`, "NOT_FOUND");
			const images = parseJsonArray(snapshot.images_json, "image").map((value) => value);
			for (const image of images) if (!existsSync(join(this.config.imageDirectory, image.storageName))) throw new NotebookError(`revision image ${image.id} is unavailable`);
			const notebook = this.database.prepare("SELECT * FROM notebooks WHERE id = ?").get(snapshot.notebook_id) ?? this.resolveNotebook({ notebookName: snapshot.notebook_name }, this.now());
			this.database.prepare(`
        UPDATE notes SET notebook_id = ?, title = ?, body = ?, archived_at = ?, revision = revision + 1, updated_at = ?
        WHERE id = ?
      `).run(notebook.id, snapshot.title, snapshot.body, snapshot.archived_at, this.now(), input.id);
			this.replaceTags(input.id, parseJsonArray(snapshot.tags_json, "tag").map(String));
			this.database.prepare("DELETE FROM note_images WHERE note_id = ?").run(input.id);
			const insert = this.database.prepare(`
        INSERT INTO note_images(id, note_id, name, media_type, bytes, width, height, digest, storage_name, position, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
			for (const image of images) insert.run(image.id, input.id, image.name, image.mediaType, image.bytes, image.width, image.height, image.digest, image.storageName, image.position, image.createdAt);
			this.refreshSearch(input.id);
			this.recordRevision(input.id);
		});
		return this.read({ id: input.id });
	}
	/** Rename a notebook with optimistic concurrency. */
	renameNotebook(input) {
		this.transaction(() => {
			const notebook = this.notebookRow(input.id);
			this.assertRevision(notebook.revision, input.expectedRevision);
			const name = requiredText("name", input.name, 120);
			this.database.prepare("UPDATE notebooks SET name = ?, revision = revision + 1, updated_at = ? WHERE id = ?").run(name, this.now(), input.id);
			const notes = this.database.prepare("SELECT id FROM notes WHERE notebook_id = ?").all(input.id);
			for (const note of notes) this.refreshSearch(note.id);
		});
		return this.overview().notebooks.find((notebook) => notebook.id === input.id);
	}
	/** Delete an empty notebook. */
	deleteNotebook(input) {
		this.transaction(() => {
			const notebook = this.notebookRow(input.id);
			this.assertRevision(notebook.revision, input.expectedRevision);
			const { count } = this.database.prepare("SELECT COUNT(*) AS count FROM notes WHERE notebook_id = ?").get(input.id);
			if (count > 0) throw new NotebookError("non-empty notebooks cannot be deleted");
			this.database.prepare("DELETE FROM notebooks WHERE id = ?").run(input.id);
		});
		return { ok: true };
	}
	/** Permanently delete one archived note and collect unreferenced image files. */
	deleteNote(input) {
		const staged = [];
		try {
			this.transaction(() => {
				const note = this.noteRow(input.id);
				this.assertRevision(note.revision, input.expectedRevision);
				if (note.archived_at === null) throw new NotebookError("archive a note before permanent deletion");
				const current = this.imageRows(input.id).map((row) => row.storage_name);
				const revisions = this.database.prepare("SELECT images_json FROM note_revisions WHERE note_id = ?").all(input.id);
				const names = new Set(current);
				for (const revision of revisions) for (const image of parseJsonArray(revision.images_json, "image")) names.add(image.storageName);
				for (const storageName of names) {
					const source = join(this.config.imageDirectory, storageName);
					if (!existsSync(source)) continue;
					const trashPath = join(this.trashDirectory, `${randomUUID()}--${storageName}`);
					renameSync(source, trashPath);
					staged.push({
						storageName,
						trashPath
					});
				}
				this.database.prepare("DELETE FROM note_search WHERE note_id = ?").run(input.id);
				this.database.prepare("DELETE FROM notes WHERE id = ?").run(input.id);
			});
		} catch (error) {
			for (const file of staged) if (existsSync(file.trashPath)) renameSync(file.trashPath, join(this.config.imageDirectory, file.storageName));
			throw error;
		}
		for (const file of staged) rmSync(file.trashPath, { force: true });
		return { ok: true };
	}
	/** Add one validated image and create a new note revision. */
	async addImage(input) {
		return this.update({
			id: input.noteId,
			expectedRevision: input.expectedRevision,
			mode: "replace",
			images: [input.image]
		});
	}
	/** Return one image as canonical base64 after digest verification. */
	imageData(input) {
		const row = this.database.prepare("SELECT * FROM note_images WHERE id = ?").get(input.id);
		if (!row) throw new NotebookError(`image ${input.id} was not found`, "NOT_FOUND");
		const data = readFileSync(join(this.config.imageDirectory, row.storage_name));
		if (createHash("sha256").update(data).digest("hex") !== row.digest || statSync(join(this.config.imageDirectory, row.storage_name)).size !== row.bytes) throw new NotebookError(`image ${input.id} failed integrity verification`);
		return {
			image: this.toImage(row),
			data: data.toString("base64")
		};
	}
	/** Close the SQLite connection. */
	close() {
		if (this.closed) return;
		this.database.close();
		this.closed = true;
	}
};
//#endregion
//#region lib/types/index.js
/** Notebook Host service shared by Agent tools and the generated Web Remote. */
var __runInitializers = function(thisArg, initializers, value) {
	var useValue = arguments.length > 2;
	for (var i = 0; i < initializers.length; i++) value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
	return useValue ? value : void 0;
};
var __esDecorate = function(ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
	function accept(f) {
		if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected");
		return f;
	}
	var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
	var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
	var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
	var _, done = false;
	for (var i = decorators.length - 1; i >= 0; i--) {
		var context = {};
		for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
		for (var p in contextIn.access) context.access[p] = contextIn.access[p];
		context.addInitializer = function(f) {
			if (done) throw new TypeError("Cannot add initializers after decoration has completed");
			extraInitializers.push(accept(f || null));
		};
		var result = (0, decorators[i])(kind === "accessor" ? {
			get: descriptor.get,
			set: descriptor.set
		} : descriptor[key], context);
		if (kind === "accessor") {
			if (result === void 0) continue;
			if (result === null || typeof result !== "object") throw new TypeError("Object expected");
			if (_ = accept(result.get)) descriptor.get = _;
			if (_ = accept(result.set)) descriptor.set = _;
			if (_ = accept(result.init)) initializers.unshift(_);
		} else if (_ = accept(result)) if (kind === "field") initializers.unshift(_);
		else descriptor[key] = _;
	}
	if (target) Object.defineProperty(target, contextIn.name, descriptor);
	done = true;
};
/** Persistent notebook service and browser Remote implementation. */
let NotebookService = (() => {
	let _classSuper = TypertRemoteService;
	let _instanceExtraInitializers = [];
	let _overview_decorators;
	let _search_decorators;
	let _read_decorators;
	let _create_decorators;
	let _update_decorators;
	let _archive_decorators;
	let _restore_decorators;
	let _deleteNote_decorators;
	let _renameNotebook_decorators;
	let _deleteNotebook_decorators;
	let _revisions_decorators;
	let _restoreRevision_decorators;
	let _addImage_decorators;
	let _imageData_decorators;
	let _createNotebook_decorators;
	let _notebook_decorators;
	return class NotebookService extends _classSuper {
		static {
			const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
			_overview_decorators = [Remote];
			_search_decorators = [Remote];
			_read_decorators = [Remote];
			_create_decorators = [Remote];
			_update_decorators = [Remote];
			_archive_decorators = [Remote];
			_restore_decorators = [Remote];
			_deleteNote_decorators = [Remote];
			_renameNotebook_decorators = [Remote];
			_deleteNotebook_decorators = [Remote];
			_revisions_decorators = [Remote];
			_restoreRevision_decorators = [Remote];
			_addImage_decorators = [Remote];
			_imageData_decorators = [Remote];
			_createNotebook_decorators = [Remote];
			_notebook_decorators = [Remote];
			__esDecorate(this, null, _overview_decorators, {
				kind: "method",
				name: "overview",
				static: false,
				private: false,
				access: {
					has: (obj) => "overview" in obj,
					get: (obj) => obj.overview
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _search_decorators, {
				kind: "method",
				name: "search",
				static: false,
				private: false,
				access: {
					has: (obj) => "search" in obj,
					get: (obj) => obj.search
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _read_decorators, {
				kind: "method",
				name: "read",
				static: false,
				private: false,
				access: {
					has: (obj) => "read" in obj,
					get: (obj) => obj.read
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _create_decorators, {
				kind: "method",
				name: "create",
				static: false,
				private: false,
				access: {
					has: (obj) => "create" in obj,
					get: (obj) => obj.create
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _update_decorators, {
				kind: "method",
				name: "update",
				static: false,
				private: false,
				access: {
					has: (obj) => "update" in obj,
					get: (obj) => obj.update
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _archive_decorators, {
				kind: "method",
				name: "archive",
				static: false,
				private: false,
				access: {
					has: (obj) => "archive" in obj,
					get: (obj) => obj.archive
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _restore_decorators, {
				kind: "method",
				name: "restore",
				static: false,
				private: false,
				access: {
					has: (obj) => "restore" in obj,
					get: (obj) => obj.restore
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _deleteNote_decorators, {
				kind: "method",
				name: "deleteNote",
				static: false,
				private: false,
				access: {
					has: (obj) => "deleteNote" in obj,
					get: (obj) => obj.deleteNote
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _renameNotebook_decorators, {
				kind: "method",
				name: "renameNotebook",
				static: false,
				private: false,
				access: {
					has: (obj) => "renameNotebook" in obj,
					get: (obj) => obj.renameNotebook
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _deleteNotebook_decorators, {
				kind: "method",
				name: "deleteNotebook",
				static: false,
				private: false,
				access: {
					has: (obj) => "deleteNotebook" in obj,
					get: (obj) => obj.deleteNotebook
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _revisions_decorators, {
				kind: "method",
				name: "revisions",
				static: false,
				private: false,
				access: {
					has: (obj) => "revisions" in obj,
					get: (obj) => obj.revisions
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _restoreRevision_decorators, {
				kind: "method",
				name: "restoreRevision",
				static: false,
				private: false,
				access: {
					has: (obj) => "restoreRevision" in obj,
					get: (obj) => obj.restoreRevision
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _addImage_decorators, {
				kind: "method",
				name: "addImage",
				static: false,
				private: false,
				access: {
					has: (obj) => "addImage" in obj,
					get: (obj) => obj.addImage
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _imageData_decorators, {
				kind: "method",
				name: "imageData",
				static: false,
				private: false,
				access: {
					has: (obj) => "imageData" in obj,
					get: (obj) => obj.imageData
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _createNotebook_decorators, {
				kind: "method",
				name: "createNotebook",
				static: false,
				private: false,
				access: {
					has: (obj) => "createNotebook" in obj,
					get: (obj) => obj.createNotebook
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _notebook_decorators, {
				kind: "method",
				name: "notebook",
				static: false,
				private: false,
				access: {
					has: (obj) => "notebook" in obj,
					get: (obj) => obj.notebook
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			if (_metadata) Object.defineProperty(this, Symbol.metadata, {
				enumerable: true,
				configurable: true,
				writable: true,
				value: _metadata
			});
		}
		static Config = Schema.object({
			databasePath: Schema.string().required(),
			imageDirectory: Schema.string().required(),
			busyTimeoutMs: Schema.number().min(1).step(1).default(5e3),
			defaultPageSize: Schema.number().min(1).step(1).default(30),
			maxPageSize: Schema.number().min(1).step(1).default(100),
			maxBodyBytes: Schema.number().min(1).step(1).default(1024 * 1024),
			maxImageBytes: Schema.number().min(1).step(1).default(10 * 1024 * 1024),
			maxImagesPerNote: Schema.number().min(1).step(1).default(50)
		});
		store = __runInitializers(this, _instanceExtraInitializers);
		constructor(ctx, config) {
			super(ctx, "notebook");
			this.store = new NotebookStore(config);
			ctx.effect(() => () => {
				this.store.close();
			}, "notebook: close store");
		}
		/** Return notebook, tag and lifecycle counts. @param _input Empty request. @param signal Cancellation. @returns Current overview. */
		overview(_input, signal) {
			signal.throwIfAborted();
			return Promise.resolve(this.store.overview());
		}
		/** Search notes with bounded pagination. @param input Filters and query. @param signal Cancellation. @returns Matching summaries. */
		search(input, signal) {
			signal.throwIfAborted();
			return Promise.resolve(this.store.search(input));
		}
		/** Read one complete note. @param input Note identity. @param signal Cancellation. @returns Current note. */
		read(input, signal) {
			signal.throwIfAborted();
			return Promise.resolve(this.store.read(input));
		}
		/** Create one note and optional notebook. @param input Note fields. @param signal Cancellation. @returns Created note. */
		create(input, signal) {
			signal.throwIfAborted();
			return this.store.create(input);
		}
		/** Update one note with optimistic concurrency. @param input Replacement or append request. @param signal Cancellation. @returns Updated note. */
		update(input, signal) {
			signal.throwIfAborted();
			return this.store.update(input);
		}
		/** Archive one active note. @param input Identity and revision. @param signal Cancellation. @returns Archived note. */
		archive(input, signal) {
			signal.throwIfAborted();
			return Promise.resolve(this.store.archive(input));
		}
		/** Restore one archived note. @param input Identity and revision. @param signal Cancellation. @returns Active note. */
		restore(input, signal) {
			signal.throwIfAborted();
			return Promise.resolve(this.store.restore(input));
		}
		/** Permanently delete one archived note. @param input Identity and revision. @param signal Cancellation. @returns Success. */
		deleteNote(input, signal) {
			signal.throwIfAborted();
			return Promise.resolve(this.store.deleteNote(input));
		}
		/** Rename one notebook. @param input Identity, revision and name. @param signal Cancellation. @returns Updated notebook. */
		renameNotebook(input, signal) {
			signal.throwIfAborted();
			return Promise.resolve(this.store.renameNotebook(input));
		}
		/** Delete one empty notebook. @param input Identity and revision. @param signal Cancellation. @returns Success. */
		deleteNotebook(input, signal) {
			signal.throwIfAborted();
			return Promise.resolve(this.store.deleteNotebook(input));
		}
		/** List immutable snapshots. @param input Note and pagination. @param signal Cancellation. @returns Revision page. */
		revisions(input, signal) {
			signal.throwIfAborted();
			return Promise.resolve(this.store.revisions(input));
		}
		/** Restore one snapshot as a new version. @param input Note and revision identities. @param signal Cancellation. @returns Restored note. */
		restoreRevision(input, signal) {
			signal.throwIfAborted();
			return Promise.resolve(this.store.restoreRevision(input));
		}
		/** Add a panel-uploaded image. @param input Note revision and encoded image. @param signal Cancellation. @returns Updated note. */
		addImage(input, signal) {
			signal.throwIfAborted();
			return this.store.addImage(input);
		}
		/** Read verified image bytes for panel display. @param input Image identity. @param signal Cancellation. @returns Image metadata and base64. */
		imageData(input, signal) {
			signal.throwIfAborted();
			return Promise.resolve(this.store.imageData(input));
		}
		/** Create an empty notebook for panel navigation. @param input Requested name. @param signal Cancellation. @returns Created notebook. */
		createNotebook(input, signal) {
			signal.throwIfAborted();
			return Promise.resolve(this.store.createNotebook(input.name));
		}
		/** Check that a notebook exists. @param input Notebook identity. @param signal Cancellation. @returns Current overview entry. */
		notebook(input, signal) {
			signal.throwIfAborted();
			const notebook = this.store.overview().notebooks.find((item) => item.id === input.id);
			if (!notebook) throw new Error(`notebook ${input.id} was not found`);
			return Promise.resolve(notebook);
		}
	};
})();
//#endregion
export { NotebookService, NotebookService as default };
