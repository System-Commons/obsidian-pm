<div align="center">

# Project Manager for Obsidian
*Full-featured project management, natively in your vault.*

[![Release](https://img.shields.io/github/v/release/System-Commons/obsidian-pm?style=for-the-badge&color=7c3aed)](https://github.com/System-Commons/obsidian-pm/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/System-Commons/obsidian-pm/total?style=for-the-badge&color=2ea44f)](https://github.com/System-Commons/obsidian-pm/releases)
[![Build](https://img.shields.io/github/actions/workflow/status/System-Commons/obsidian-pm/build.yml?style=for-the-badge)](https://github.com/System-Commons/obsidian-pm/actions/workflows/build.yml)

**[Install via BRAT](#via-brat-recommended)** · **[Changelog](CHANGELOG.md)**

</div>

Table views, Gantt charts, Kanban boards, custom fields, time tracking, smart scheduling — all stored as plain Markdown with YAML frontmatter. No external services. No sync subscriptions. Your data stays yours.

<img width="1422" height="791" alt="Project Manager dashboard" src="https://github.com/user-attachments/assets/ca6bc67f-e656-45be-b93a-17410555ec1a" />

## What's inside

- **Plain-text data** — Projects and tasks live as `.md` files in your vault. Portable, searchable, version-controllable. No lock-in, ever.
- **Three powerful views** — Table, Gantt, and Kanban. Switch freely; same data, different lenses.
- **Real project management** — Not just checkboxes. Dependencies, milestones, subtasks, time tracking, recurring tasks, smart scheduling, bulk actions.
- **Customizable everything** — Custom fields, statuses, priorities, saved views — adapt the tool to your workflow, not the other way around.
- **Works offline** — No cloud, no API calls, no accounts. Just Obsidian.

## Views

### Table

Sortable, filterable task grid with inline editing. Save custom filter/sort combinations as named views. Quick-add tasks from the top bar. Select multiple tasks and apply bulk actions — change status, priority, assignee, or delete in one move.

<video src="https://github.com/user-attachments/assets/104bd993-d4c1-42e7-9d6a-ae46fd7ce6a8" autoplay loop muted playsinline width="400"></video>

### Gantt

Interactive timeline with draggable bars, resizable edges, and dependency arrows. Zoom from day to year. Drag to reschedule, resize to adjust duration. Milestones render as diamonds. A "today" line keeps you oriented.

<video src="https://github.com/user-attachments/assets/916f7100-44ef-401c-abb3-e003a0f7720a" autoplay loop muted playsinline width="400"></video>

### Kanban

Card-based board grouped by status. Drag cards between columns to update status instantly. Cards show priority, assignees, and tags at a glance.

<video src="https://github.com/user-attachments/assets/316fc43b-6915-499a-a6ad-0680c462d014" autoplay loop muted playsinline width="400"></video>

## Features

### Task management
- **Subtasks** — Nest tasks to any depth. Collapse/expand hierarchies across all views.
- **Dependencies** — Link blocking/dependent tasks. Visualized as arrows on the Gantt chart.
- **Milestones** — Zero-duration tasks for key dates and deliverables.
- **Archive** — Archive completed tasks without deleting. Toggle visibility at any time. Completed tasks can also be archived automatically once they have been done for a set number of days, or on demand with **Project Manager: Archive completed tasks**.

### Scheduling & time
- **Drag-and-drop scheduling** — Reschedule tasks by dragging bars on the Gantt chart.
- **Smart scheduling** — Auto-adjust dependent task dates when a blocker's dates change. Cycle detection prevents circular dependencies. Optionally pull dependents earlier when a blocker is completed ahead of its due date.
- **Recurring tasks** — Daily, weekly, monthly, or yearly recurrence with configurable end dates.
- **Time estimates & logging** — Set estimated hours, log actual time with date and notes. Visual progress bar shows logged vs. estimated.
- **Due date notifications** — Get reminders before tasks are due. Configurable lead time.

### Customization
- **Custom fields** — Add fields to every task: text, number, date, select, multi-select, person, checkbox, URL.
- **Custom statuses & priorities** — Edit labels, colors, and icons for each status and priority level.
- **Saved views** — Save filter/sort combinations in Table view and switch between them instantly.
- **Team roster** — Keep the project's team on the project note; everyone on it is offered wherever a person is picked.

### Bulk operations
- Multi-select tasks in Table view for batch actions:
  - Set status, priority, assignee, tag, or due date
  - Adjust progress
  - Archive/unarchive
  - Set a parent task
  - Delete

### Import
You can add any existing note from your vault to the project as a task. Run **Project Manager: Import notes as tasks** in the Command Palette, select files, then choose default status, default priority, and whether to **move** files into the task folder or **copy** them. Already-imported notes are skipped.

https://github.com/user-attachments/assets/64e386c5-09b5-42a6-9599-089cc54c98eb

The project is the vault's one project note. If the vault has none yet, the command offers to create it first.


## Collaboration over the Project

The vault is the database. Anything that syncs your vault syncs your projects.

**Git** works well. Commit your projects folder, push, pull. Sync conflicts show up as regular Markdown conflicts. Resolve them like any other file.
**Obsidian Sync, iCloud, Dropbox, Syncthing** all work without extra setup.

For teams:

- Add people to the team on the project's settings page.
- Assign tasks via the Assignees field. Filter by assignee in the Table view.
- Notifications are local. Each person sees their own due date reminders.

There is no real-time multi-user editing. Two people editing the same task at once produces a sync conflict, same as any Markdown note.

## Share a view as a page

The command **Export current view as HTML** writes the table, timeline or board you are looking at to one HTML file next to the project note, with every task, the filter you had on, and the icons it needs inside it. It opens in any browser without Obsidian, works offline, and switches between the three views on the page. Send it to someone or drop it on any web host; nothing in it calls home.

## Local API and MCP

Other programs on the same computer can read and edit your tasks: a coding agent through the Model Context Protocol, a script over plain HTTP. Turn it on in **Settings > Local API**. It is off by default and only exists on desktop.

When it is on, the plugin listens on `127.0.0.1` on the port shown in settings. Each vault starts with its own port, derived from the vault name so two open vaults never want the same one, and you can change it. Nothing outside this computer can connect, and every request needs the token shown next to the port. Point an MCP client at `http://127.0.0.1:<port>/mcp` with `Authorization: Bearer <token>`; Claude Code, for example:

```sh
claude mcp add --transport http project-manager http://127.0.0.1:<port>/mcp --header "Authorization: Bearer <token>"
```

Everything a client changes goes through the same code the views use, so it shows up in Obsidian at once. The endpoints, the MCP tools and the change feed are documented in [docs/api.md](docs/api.md).

## Using with TaskNotes

Project Manager works alongside the [TaskNotes](https://github.com/callumalpass/tasknotes) plugin (4.10 or newer).

### Import TaskNotes tasks

The regular **Import notes as tasks** command recognizes TaskNotes tasks and converts them with their fields intact:

- scheduled and due dates map to start and due
- `blockedBy` dependencies between imported notes become task dependencies
- project links between imported notes become parent/subtask relationships
- tags, time estimates, completion dates, simple recurrence, and archive state carry over
- statuses and priorities the imported tasks use are added to your palettes automatically

Choose **move** to turn the TaskNotes notes into task files inside the project's task folder, or **copy** to keep the originals untouched.

### Align statuses and priorities

**Settings > Import from TaskNotes** copies TaskNotes' status and priority palettes into Project Manager, so both plugins use the same values, names, and colors. Entries TaskNotes doesn't know are kept.

### Let TaskNotes see Project Manager tasks

TaskNotes can be configured to list and edit Project Manager tasks in place, without conversion:

1. In TaskNotes settings, set task identification to **property** with name `pm-task` and value `true`.
2. In its field mapping, map **scheduled** to `start`.
3. Add your Project Manager status and priority values to TaskNotes' palettes.

Task hierarchy and dependencies don't resolve on the TaskNotes side (it uses project links and `blockedBy`, Project Manager uses id references), but both plugins edit frontmatter non-destructively, so each one's extra fields survive the other's writes.

## Settings

| Setting | Description |
|---|---|
| Project folder | Where the project note is created when the vault has none |
| People folder | Where person notes are looked for and created |
| Open projects in | Overview page, or straight to the project's tasks |
| Default tasks view | Table, Gantt, or Kanban |
| Open tasks in | Modal or tab. On tab, task notes open in the task editor instead of Obsidian's. |
| Gantt granularity | Default timeline scale (day / week / month / quarter / year) |
| Gantt week labels | Week number, date range, or both |
| Due date notifications | Reminders N days before due dates |
| Notifications on/off | Master switch for due date reminders, separate from lead time |
| Auto-schedule | When a blocking task moves, its dependents shift to match. Cycles are refused. |
| Pull dependents forward on early finish | Off by default. When a task is completed before its due date, its dependents move earlier by the days it saved, keeping any slack they already had. |
| Auto-archive completed tasks | Move completed tasks to the project's archive after this many days. Set it to 0 to keep them in place. |
| Hide done in Gantt | Skip completed and cancelled tasks on the timeline |
| Show subtasks in Kanban | Render subtasks as their own cards, not just inside the parent |
| Custom statuses | Edit labels, colors, and icons for each status |
| Custom priorities | Edit labels, colors, and icons for each priority |

## Task properties

Each task is a `.md` file in your vault supporting:

| Property | Description |
|---|---|
| Title | Task name |
| Description | Rich text body (Markdown) |
| Type | Task, Subtask, or Milestone |
| Status | To do, In progress, Blocked, In review, Done, Cancelled |
| Priority | Critical, High, Medium, Low |
| Start / Due date | Schedule boundaries |
| Progress | 0–100% completion |
| Time estimate | Estimated hours |
| Time logs | Logged hours with date and notes |
| Assignees | One or more team members |
| Tags | Freeform labels |
| Subtasks | Nested child tasks |
| Dependencies | Blocking/dependent task links |
| Recurrence | Repeat interval and end date |
| Custom fields | Any fields you define in the settings |

## Installation

This plugin is not in the Obsidian community plugin directory. Install it through BRAT, which also keeps it up to date as new releases are published here.

### Via BRAT (recommended)

1. Install the [BRAT plugin](https://github.com/TfTHacker/obsidian42-brat) from the community store.
2. Open BRAT settings > **Add Beta Plugin**.
3. Enter: `https://github.com/System-Commons/obsidian-pm`
4. Enable the plugin in **Settings > Community plugins**.

BRAT checks this repository for new releases and updates the plugin automatically.

### Manual

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/System-Commons/obsidian-pm/releases/latest).
2. Create a folder: `<vault>/.obsidian/plugins/project-manager-system-commons/`
3. Copy the three files into that folder.
4. Reload Obsidian and enable the plugin under **Settings > Community plugins**.

## Quick start

1. Click the ribbon icon (or run **Open project** from the command palette).
2. Click **Create project** and name it; the name defaults to the vault's.
3. Open the tasks — they open in Table view by default.
4. Press **+ Add task** to create your first task.
5. Switch views using the Table / Gantt / Kanban tabs at the top.

**Commands:**
| Command | What it does |
|---|---|
| Open project | Open the project's overview, or its tasks per the setting |
| Create new task | Create a task |
| Create new subtask | Pick a parent task, then create a task under it |
| Import notes as tasks | Convert Markdown notes into tasks |
| Open current file as project | Open the active note as a project (needs `pm-project: true`) |
| Undo last action | Revert the last change |
| Redo last action | Reapply an undone change |

## Data format

Everything is stored as Markdown files with YAML frontmatter in a configurable vault folder (default: `Project/`): the project note, a `_tasks/` folder with one note per task, and by default a `People/` folder for person notes. Plain text — readable, portable, and version-controllable.

```yaml
---
pm-task: true
title: "Ship v1.0"
status: in-progress
priority: high
due: "2026-04-01"
progress: 60
assignees: ["alice", "bob"]
tags: ["launch"]
dependencies: ["task-abc123"]
---

Task description in Markdown goes here.
```

## Requirements

- Obsidian **1.13.0** or later
- Desktop and mobile supported (the local API and MCP server are desktop only)

## Development

```sh
pnpm install
pnpm dev      # rebuild on change; set VAULT_PATH to write straight into a vault
pnpm check    # lint, format and type checks
pnpm test
pnpm build
```

To publish a release, bump the version in `manifest.json`, `package.json` and `versions.json`, then push a tag with the same number. The release workflow builds the plugin, attaches `main.js`, `manifest.json` and `styles.css` to a GitHub release, and BRAT picks it up from there.

## Contributing

1. **Pass the CI:** run `pnpm check`, `pnpm check:submission`, and `pnpm test` locally before pushing.
2. **Keep it small:** PRs should be focused on a single change.

## License

MIT. This plugin is maintained by System Commons and is a fork of [dotpm/obsidian-pm](https://github.com/dotpm/obsidian-pm); the upstream copyright notice is retained in [LICENSE](LICENSE).
