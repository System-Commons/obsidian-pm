# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- The internal packages, the MCP resource URIs (`project-manager://`) and the HTML export format id no longer carry the upstream name

## [2.4.0] - 2026-09-09

First release published by System Commons. The plugin id is `project-manager-system-commons`, so it installs alongside the upstream plugin rather than replacing it.

### Added

- A view can be exported as a self-contained HTML page that shows the table, timeline and board in any browser
- Other apps on the same computer can read and edit tasks over a local HTTP and MCP server when it is turned on in settings

### Changed

- Notices, the local API health endpoint and the MCP server identify themselves as Project Manager
