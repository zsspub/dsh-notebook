# dsh-notebook

English | [中文](README.zh.md)

Persistent notebooks for DeepSeek Harness. Manage Markdown notes, tags, images, archives, search, and revision history in the native right sidebar, or ask the Agent to remember information and let it decide whether to create a note or update an existing one.

## Requirements

- DeepSeek Harness `0.1.6-alpha.2`
- Node.js `^22.19.0 || >=24.0.0`
- A Web profile with the right-sidebar UI

## Install

Install a pinned GitHub revision so DSH uses the committed Host, Remote, and browser build artifacts:

```sh
dsh plugin --profile web add github:zsspub/dsh-notebook#<commit-sha>
```

Restart the profile and refresh the browser. Open **Notebook** at the bottom of the sidebar.

For local development:

```sh
pnpm install --frozen-lockfile
pnpm run build
dsh plugin --profile web add /absolute/path/to/dsh-notebook
```

## Use

The right-side panel uses a compact scope menu to switch between notebooks, all notes, recent updates, and the archive. The main surface stays focused on a list-and-detail layout with tag filters, full-text search, Markdown editing and preview, image galleries, and revision restoration. It switches to a single-column back flow when the sidebar is narrow.

Archiving is the normal delete path and remains reversible. Permanent note deletion and notebook deletion require explicit panel confirmation. A notebook must contain no active or archived notes before it can be deleted. Restoring a revision creates a new revision instead of overwriting history.

## Agent Workflow

The bundled `dsh-notebook` Skill instructs the Agent to:

1. Call `notebook_search` for every note-taking request.
2. Call `notebook_read` when a candidate needs full inspection.
3. Decide whether to create a note or update an existing note.
4. Re-read and merge after a revision conflict.
5. Attach relevant images from the current human message and report the attached count.

| Tool | Purpose |
| --- | --- |
| `notebook_search` | Search titles, Markdown bodies, tags, and notebook names with bounded pagination. |
| `notebook_read` | Read one full note with tags, images, and its current revision. |
| `notebook_note_create` | Create a note and reuse or create a notebook by name. |
| `notebook_note_update` | Append or replace Markdown, move the note, replace tags, or attach current-message images. |
| `notebook_note_archive` | Move an active note into the archive. |
| `notebook_note_restore` | Restore an archived note. |

Permanent deletion, revision restoration, and notebook deletion are panel-only operations. Agent image parameters are 1-based positions in the current human message; callers do not provide attachment IDs.

## Storage

The default database is `$DSH_HOME/notebook/notebook.sqlite3`, and image files are stored under `$DSH_HOME/notebook/images/`. Data is shared by all workspaces and sessions that use the same DSH Home. Uninstalling the plugin does not delete it.

SQLite uses WAL, foreign keys, a five-second busy timeout, transactions, FTS5, and monotonic schema versioning. Notes carry optimistic revisions. Every title, body, tag, notebook, archive state, or image change records a complete immutable snapshot.

Supported image formats are PNG, JPEG, WebP, and GIF. The defaults allow up to 10 MiB per image and 50 images per note. The Host verifies decoded format, dimensions, SHA-256 digest, and safe storage names. Current and historical revisions retain image references; permanent note deletion removes files only after every revision is deleted. A temporary trash directory allows startup recovery from interrupted file cleanup.

The plugin does not inject notebook contents into every model request. Notes enter model context only when the Agent searches or reads them. This release does not provide page trees, PDF or arbitrary-file storage, cloud sync, collaborative editing, embedding search, or arbitrary inline image placement in Markdown.

## Configuration

The included bundle supplies these defaults:

| Field | Default | Meaning |
| --- | --- | --- |
| `databasePath` | `$DSH_HOME/notebook/notebook.sqlite3` | Absolute SQLite database path. |
| `imageDirectory` | `$DSH_HOME/notebook/images` | Absolute managed image directory. |
| `busyTimeoutMs` | `5000` | SQLite lock wait in milliseconds. |
| `defaultPageSize` | `30` | Default search and revision page size. |
| `maxPageSize` | `100` | Maximum accepted page size. |
| `maxBodyBytes` | `1048576` | Maximum Markdown body size in UTF-8 bytes. |
| `maxImageBytes` | `10485760` | Maximum decoded bytes per image. |
| `maxImagesPerNote` | `50` | Maximum images in one current note revision. |

Override the `notebook` entry in the profile patch when deployment policy requires different limits or paths.

## Development

```sh
pnpm install --frozen-lockfile
pnpm run check
pnpm run artifacts:check
```

`pnpm run check` builds Host, Typert, and Web artifacts; typechecks source and tests; lints; runs focused coverage; enforces Lucide and DSH Primitive use; installs a packed tarball into an isolated DSH Home; and checks package contents. The repository commits `lib/`, so a GitHub commit can be installed without a lifecycle build.

## License

[MIT](LICENSE)
