# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

One vault is one project. The plugin no longer manages several projects side by side, and everything that only existed for that is gone.

### Changed

- The vault's single project note is the project. The ribbon and every command work on it, and offer to create it when the vault has none
- Statuses, priorities, custom fields, views and scheduling are the plugin settings; a project note no longer carries its own overrides. Custom fields an earlier version kept on the note move into the settings the first time it is read
- The team lives on the project note; the global team members setting is gone
- Filters and collapsed tasks are stored once, not per project
- The local API and MCP server address the one project: `GET /v1/project`, `GET /v1/tasks`, `POST /v1/tasks`, and the `get_project`, `list_tasks` and `create_task` tools take no project id. Task resources and the change feed no longer carry a project id. The project resource is `project-manager://project`
- The HTML export format is version 2 and carries one project. Pages exported earlier still open, since each embeds its own viewer
- Task notes no longer carry a `projectId` property; a task belongs to the project by sitting in its `_tasks` folder
- A new project note is created directly in the project folder, as `Project/<name>.md` beside `Project/_tasks/`, rather than in a folder of its own. Renaming the note no longer renames the folder around it. Existing notes stay where they are
- The default project folder is `Project` and the default people folder is `Project/People`
- The internal packages, the MCP resource URIs (`project-manager://`) and the HTML export format id no longer carry the upstream name

### Removed

- The project list, the project picker, sub-projects, the "open all projects" view, project duplication, moving a task to another project, and repair of ids duplicated by copying a project folder
- Support for the pre-2.0 note layouts (tasks embedded in the project note, a `<name>_tasks` folder beside the note). A task file named the old way is renamed the next time that task is saved

## [2.4.0] - 2026-09-09

First release published by System Commons. The plugin id is `project-manager-system-commons`, so it installs alongside the upstream plugin rather than replacing it.

### Added

- A view can be exported as a self-contained HTML page that shows the table, timeline and board in any browser
- Other apps on the same computer can read and edit tasks over a local HTTP and MCP server when it is turned on in settings

### Changed

- Notices, the local API health endpoint and the MCP server identify themselves as Project Manager
