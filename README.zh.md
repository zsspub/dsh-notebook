# dsh-notebook

[English](README.md) | 中文

为 DeepSeek Harness 提供持久化笔记本。你可以在原生右侧面板中管理 Markdown 笔记、标签、图片、归档、搜索和修订历史，也可以让 Agent 帮你记录信息，由 Agent 自主决定新建笔记或更新已有笔记。

## 环境要求

- DeepSeek Harness `0.1.6-alpha.2`
- Node.js `^22.19.0 || >=24.0.0`
- 支持右侧面板的 Web profile

## 安装

安装固定的 GitHub revision，让 DSH 直接使用仓库中提交的 Host、Remote 和浏览器构建产物：

```sh
dsh plugin --profile web add github:zsspub/dsh-notebook#<commit-sha>
```

重启 profile 并刷新浏览器，然后从侧栏底部打开**笔记本**。

本地开发安装：

```sh
pnpm install --frozen-lockfile
pnpm run build
dsh plugin --profile web add /absolute/path/to/dsh-notebook
```

## 使用

右侧面板通过紧凑的范围菜单切换笔记本、全部笔记、最近更新和归档区，主体只保留笔记列表与详情双栏，同时提供标签筛选、全文搜索、Markdown 编辑和预览、图片画廊及修订恢复。侧栏较窄时切换为单栏返回流。

归档是常规删除方式，可以随时恢复。永久删除笔记和删除笔记本都需要在面板中显式确认；只有不包含任何活动或归档笔记的笔记本才能删除。恢复历史版本会创建新修订，不会覆盖已有历史。

## Agent 工作流

内置 `dsh-notebook` Skill 要求 Agent：

1. 每次记笔记前先调用 `notebook_search`。
2. 候选内容需要完整确认时调用 `notebook_read`。
3. 自主决定新建笔记或更新已有笔记。
4. 遇到 revision 冲突时重新读取、合并并重试。
5. 自动关联当前用户消息中的相关图片，并在回复中说明关联数量。

| 工具 | 用途 |
| --- | --- |
| `notebook_search` | 分页搜索标题、Markdown 正文、标签和笔记本名称。 |
| `notebook_read` | 读取完整笔记、标签、图片和当前 revision。 |
| `notebook_note_create` | 创建笔记，并按名称复用或创建笔记本。 |
| `notebook_note_update` | 追加或替换 Markdown、移动笔记、替换标签或关联当前消息图片。 |
| `notebook_note_archive` | 将活动笔记移入归档区。 |
| `notebook_note_restore` | 恢复归档笔记。 |

永久删除、修订恢复和笔记本删除只允许通过面板执行。Agent 图片参数使用当前用户消息中图片的 1-based 序号，调用方不提供附件 ID。

## 存储

默认数据库位于 `$DSH_HOME/notebook/notebook.sqlite3`，图片文件位于 `$DSH_HOME/notebook/images/`。使用同一个 DSH Home 的所有 workspace 和会话共享这些数据。卸载插件不会删除数据。

SQLite 使用 WAL、外键、五秒 busy timeout、事务、FTS5 和单调 schema 版本。笔记使用乐观 revision。标题、正文、标签、所属笔记本、归档状态或图片发生变化时，都会写入一个完整且不可变的快照。

图片支持 PNG、JPEG、WebP 和 GIF，默认单图不超过 10 MiB，每篇笔记最多 50 张。Host 会校验真实解码格式、尺寸、SHA-256 摘要和安全存储名称。当前版本与历史版本共同引用图片；只有永久删除整篇笔记及其全部修订后才会清理文件。临时垃圾目录用于在启动时恢复中断的文件清理。

插件不会把笔记自动注入每次模型请求。只有 Agent 主动搜索或读取时，笔记内容才进入模型上下文。首版不支持页面树、PDF 或任意文件、云同步、协作编辑、Embedding 检索，以及 Markdown 正文中的任意图片行内定位。

## 配置

内置 Bundle 使用以下默认值：

| 字段 | 默认值 | 含义 |
| --- | --- | --- |
| `databasePath` | `$DSH_HOME/notebook/notebook.sqlite3` | SQLite 数据库绝对路径。 |
| `imageDirectory` | `$DSH_HOME/notebook/images` | 受管理的图片目录绝对路径。 |
| `busyTimeoutMs` | `5000` | SQLite 等待写锁的毫秒数。 |
| `defaultPageSize` | `30` | 搜索和修订列表的默认页大小。 |
| `maxPageSize` | `100` | 允许的最大页大小。 |
| `maxBodyBytes` | `1048576` | Markdown 正文的最大 UTF-8 字节数。 |
| `maxImageBytes` | `10485760` | 每张图片解码后的最大字节数。 |
| `maxImagesPerNote` | `50` | 单篇笔记当前版本允许的最大图片数。 |

部署策略需要其他限制或路径时，覆盖 profile patch 中的 `notebook` 条目。

## 开发

```sh
pnpm install --frozen-lockfile
pnpm run check
pnpm run artifacts:check
```

`pnpm run check` 会构建 Host、Typert 和 Web 产物，检查源码与测试类型，执行 lint 和聚焦覆盖率，约束 Lucide 与 DSH Primitive 的使用，把 tarball 安装到隔离 DSH Home，并验证包内容。仓库提交 `lib/`，因此可直接从 GitHub commit 安装，不依赖 lifecycle build。

## 许可证

[MIT](LICENSE)
