# Contributing

Thanks for helping to improve HTML Tag Outline! Bug reports, ideas and pull requests are all welcome.

## Reporting bugs

[Open an issue](https://github.com/paeduh/html-tag-outline/issues/new/choose) and include:

- a small HTML snippet that reproduces the problem,
- what the Outline or Breadcrumbs show, and what you expected,
- your VS Code version, extension version and operating system.

For performance problems, set `htmlTagOutline.logTiming` to `true` and paste the lines from the **HTML Tag Outline** output channel.

## Development

### Requirements

- [Node.js](https://nodejs.org) 22.18 or later (tests and scripts run TypeScript files directly)
- [VS Code](https://code.visualstudio.com) 1.80 or later

### Setup

```sh
git clone https://github.com/paeduh/html-tag-outline.git
cd html-tag-outline
npm install
```

### Scripts

| Command                | Description                                                       |
| ---------------------- | ----------------------------------------------------------------- |
| `npm run build`        | Bundle `src/extension.ts` into `dist/extension.js` with tsup      |
| `npm run watch`        | Rebuild on every change                                           |
| `npm test`             | Run the unit tests with the built-in Node.js test runner          |
| `npm run typecheck`    | Type check the project with `tsc`                                 |
| `npm run package`      | Build a `.vsix` with `vsce`                                       |
| `npm run screenshots`  | Regenerate `images/*.png` (macOS, needs Google Chrome)            |

### Running the extension

Open the folder in VS Code and press <kbd>F5</kbd>. This builds the extension and starts an **Extension Development Host** window with it loaded. Open any HTML file there to test your changes.

### Project structure

```text
src/
  parser.ts      HTML tag parser. Plain TypeScript with no VS Code dependency.
  extension.ts   VS Code integration: symbol provider, cache, status bar toggle, logging.
test/            Unit tests for the parser (node:test).
scripts/         Screenshot and icon generator for the README.
images/          Icon and screenshots.
```

Most behaviour changes belong in `src/parser.ts`. Since it doesn't depend on VS Code, you can cover every case with a unit test in `test/parser.test.ts`.

### How the parser works

[`src/parser.ts`](src/parser.ts) turns HTML text into a tree of `TagNode`s. [`src/extension.ts`](src/extension.ts) then converts that tree into VS Code `DocumentSymbol`s. The parser doesn't build a full DOM. It does only what the Outline needs: element names, nesting and source ranges.

**1. Tokenizing.** A single global regex (`TOKEN`) scans the text from left to right and matches one of these:

- comments `<!-- … -->`, CDATA `<![CDATA[ … ]]>` and declarations such as `<!doctype html>`, which are skipped,
- start tags `<div …>` and end tags `</div>`, which capture the tag name and the attribute text.

Quoted attribute values may contain `>`. They may contain `<` only when it doesn't start a tag, so an unclosed quote can't swallow the rest of the file.

**2. Building the tree.** The parser keeps a stack of open elements:

| Token                    | Action                                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------------------- |
| Start tag                | Create a node, add it to the current parent (top of the stack), and push it.                             |
| Void or self-closing tag | Create a node but don't push it (`img`, `br`, `input`, `meta`, … or `<x-icon />`).                       |
| End tag                  | Pop up to the nearest open element with the same name. Elements above it end where the end tag starts.  |
| Stray end tag            | Ignored (no matching open element).                                                                      |
| End of file              | Any element still open runs to the end of the document.                                                  |

**3. Implied end tags.** HTML lets you leave out some end tags. The `IMPLIED` table lists, for each start tag, which open elements it closes and where the search stops:

- `<li>` closes an open `<li>`, but not past `<ul>`, `<ol>` or `<menu>`,
- `<p>` is closed by block elements such as `<div>`, `<section>`, `<ul>` and `<table>`,
- `<dt>`/`<dd>`, `<tr>`/`<td>`/`<th>`, `<thead>`/`<tbody>`/`<tfoot>` and `<option>`/`<optgroup>` follow the same pattern.

This way `<ul><li>a<li>b</ul>` gives two sibling `li` nodes instead of nested ones.

**4. Raw text.** After `<script>` or `<style>`, the parser jumps straight to the matching `</script>` or `</style>`. Code such as `if (a < b)` or `"<div>"` in a string is therefore never read as a tag.

**5. Names and ranges.** Each node stores:

- `name`: the tag as written in the source, plus `#id` if `showId` is on and the element has an `id` attribute (quoted or unquoted),
- `start` / `end`: character offsets of the whole element, used for the symbol range and Breadcrumbs,
- `nameStart` / `nameLength`: offsets of the tag name, used as the selection range.

Classes are never read. Leaving them out is the whole point of the extension.

**Performance.** Parsing is a single pass with no backtracking over the document and no dependencies. Tag names are lowercased individually, never the whole text. The optional `stats` argument counts elements for the `logTiming` output. Caching isn't part of the parser: `extension.ts` stores the result for each document version and returns it until the document changes.

**Adding a rule.** Most fixes are a new entry in `VOID`, `RAW_TEXT` or `IMPLIED`. Add a test case to [`test/parser.test.ts`](test/parser.test.ts) that shows the markup and the expected tree, using the `names()` helper there.

## Pull requests

1. Fork the repository and create a branch from `main`.
2. Add or update tests when you change the parser.
3. Make sure `npm run typecheck` and `npm test` pass.
4. Add a line to the **Unreleased** section of [CHANGELOG.md](CHANGELOG.md).
5. Open the pull request and describe what changed and why.

## Releasing (maintainers)

1. Move the **Unreleased** entries in `CHANGELOG.md` under a new version heading.
2. Bump the version: `npm version <patch|minor|major>`. This commits and creates the tag.
3. Push the commit and the tag: `git push --follow-tags`.

The [Release workflow](.github/workflows/release.yml) then publishes to the VS Code Marketplace and creates a GitHub release with the `.vsix` attached. It needs a `VSCE_PAT` repository secret: an Azure DevOps personal access token with the **Marketplace › Manage** scope for the `paeduh` publisher.

## License

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE).
