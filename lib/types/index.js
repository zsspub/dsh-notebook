/** Notebook Host service shared by Agent tools and the generated Web Remote. */
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
import Schema from '@deepseek-ai/schemastery';
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { NotebookStore } from "./host/store.js";
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
            __esDecorate(this, null, _overview_decorators, { kind: "method", name: "overview", static: false, private: false, access: { has: obj => "overview" in obj, get: obj => obj.overview }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _search_decorators, { kind: "method", name: "search", static: false, private: false, access: { has: obj => "search" in obj, get: obj => obj.search }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _read_decorators, { kind: "method", name: "read", static: false, private: false, access: { has: obj => "read" in obj, get: obj => obj.read }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _create_decorators, { kind: "method", name: "create", static: false, private: false, access: { has: obj => "create" in obj, get: obj => obj.create }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _update_decorators, { kind: "method", name: "update", static: false, private: false, access: { has: obj => "update" in obj, get: obj => obj.update }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _archive_decorators, { kind: "method", name: "archive", static: false, private: false, access: { has: obj => "archive" in obj, get: obj => obj.archive }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _restore_decorators, { kind: "method", name: "restore", static: false, private: false, access: { has: obj => "restore" in obj, get: obj => obj.restore }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _deleteNote_decorators, { kind: "method", name: "deleteNote", static: false, private: false, access: { has: obj => "deleteNote" in obj, get: obj => obj.deleteNote }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _renameNotebook_decorators, { kind: "method", name: "renameNotebook", static: false, private: false, access: { has: obj => "renameNotebook" in obj, get: obj => obj.renameNotebook }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _deleteNotebook_decorators, { kind: "method", name: "deleteNotebook", static: false, private: false, access: { has: obj => "deleteNotebook" in obj, get: obj => obj.deleteNotebook }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _revisions_decorators, { kind: "method", name: "revisions", static: false, private: false, access: { has: obj => "revisions" in obj, get: obj => obj.revisions }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _restoreRevision_decorators, { kind: "method", name: "restoreRevision", static: false, private: false, access: { has: obj => "restoreRevision" in obj, get: obj => obj.restoreRevision }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _addImage_decorators, { kind: "method", name: "addImage", static: false, private: false, access: { has: obj => "addImage" in obj, get: obj => obj.addImage }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _imageData_decorators, { kind: "method", name: "imageData", static: false, private: false, access: { has: obj => "imageData" in obj, get: obj => obj.imageData }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _createNotebook_decorators, { kind: "method", name: "createNotebook", static: false, private: false, access: { has: obj => "createNotebook" in obj, get: obj => obj.createNotebook }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _notebook_decorators, { kind: "method", name: "notebook", static: false, private: false, access: { has: obj => "notebook" in obj, get: obj => obj.notebook }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        static Config = Schema.object({
            databasePath: Schema.string().required(),
            imageDirectory: Schema.string().required(),
            busyTimeoutMs: Schema.number().min(1).step(1).default(5000),
            defaultPageSize: Schema.number().min(1).step(1).default(30),
            maxPageSize: Schema.number().min(1).step(1).default(100),
            maxBodyBytes: Schema.number().min(1).step(1).default(1024 * 1024),
            maxImageBytes: Schema.number().min(1).step(1).default(10 * 1024 * 1024),
            maxImagesPerNote: Schema.number().min(1).step(1).default(50),
        });
        store = __runInitializers(this, _instanceExtraInitializers);
        constructor(ctx, config) {
            super(ctx, 'notebook');
            this.store = new NotebookStore(config);
            ctx.effect(() => () => {
                this.store.close();
            }, 'notebook: close store');
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
            const notebook = this.store.overview().notebooks.find(item => item.id === input.id);
            if (!notebook)
                throw new Error(`notebook ${input.id} was not found`);
            return Promise.resolve(notebook);
        }
    };
})();
export { NotebookService };
export default NotebookService;
