# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-09-29

### Added

- Tag-only symbols for the Outline view, Breadcrumbs and Go to Symbol in HTML files.
- `htmlTagOutline.showId` setting to append `#id` to tag names.
- `htmlTagOutline.logTiming` setting to log file size, element count and parse time.
- Status bar toggle and **HTML Tag Outline: Toggle** command to switch between tag-only and built-in symbols.
- Per-document-version cache, so an unchanged document is never parsed twice.

[Unreleased]: https://github.com/paeduh/html-tag-outline/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/paeduh/html-tag-outline/releases/tag/v0.1.0
