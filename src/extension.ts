import * as vscode from "vscode";
import { performance } from "node:perf_hooks";
import { parseTags, type ParseStats, type TagNode } from "./parser";

function toSymbols(doc: vscode.TextDocument, nodes: TagNode[]): vscode.DocumentSymbol[] {
  return nodes.map((n) => {
    const sym = new vscode.DocumentSymbol(
      n.name,
      "",
      vscode.SymbolKind.Field,
      new vscode.Range(doc.positionAt(n.start), doc.positionAt(n.end)),
      new vscode.Range(doc.positionAt(n.nameStart), doc.positionAt(n.nameStart + n.nameLength)),
    );
    sym.children = toSymbols(doc, n.children);
    return sym;
  });
}

interface CacheEntry {
  version: number;
  showId: boolean;
  result: vscode.DocumentSymbol[];
}

export function activate(context: vscode.ExtensionContext): void {
  const log = vscode.window.createOutputChannel("HTML Tag Outline");
  context.subscriptions.push(log);

  // One entry per open HTML document
  const cache = new Map<string, CacheEntry>();
  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((d) => cache.delete(d.uri.toString())),
  );

  const provider: vscode.DocumentSymbolProvider = {
    provideDocumentSymbols(document) {
      try {
        const cfg = vscode.workspace.getConfiguration("htmlTagOutline");
        const showId = cfg.get("showId", true);
        const logTiming = cfg.get("logTiming", false);

        // Reuse the result if the same document version was already parsed
        const key = document.uri.toString();
        const hit = cache.get(key);
        if (hit && hit.version === document.version && hit.showId === showId) {
          return hit.result;
        }

        const stats: ParseStats = { elements: 0 };
        const t0 = performance.now();
        const text = document.getText();
        const result = toSymbols(document, parseTags(text, showId, stats));
        cache.set(key, { version: document.version, showId, result });

        if (logTiming) {
          const ms = performance.now() - t0;
          const kb = Math.round(Buffer.byteLength(text, "utf8") / 1024);
          const name = document.uri.path.split("/").pop();
          log.appendLine(
            `${name}: parsed, ${kb} KB, ${stats.elements} elements, ${ms.toFixed(1)} ms`,
          );
        }
        return result;
      } catch (err) {
        const detail = err instanceof Error ? err.stack : String(err);
        log.appendLine(`Failed to parse ${document.uri.toString()}: ${detail}`);
        return [];
      }
    },
  };

  // Scheme makes this selector more specific than the built-in { language: 'html' },
  // which helps it take priority for Outline and Breadcrumbs.
  const selector: vscode.DocumentSelector = [
    { language: "html", scheme: "file" },
    { language: "html", scheme: "untitled" },
  ];

  // The provider is registered only while enabled, so switching it off leaves just
  // the built-in symbols in Outline and Breadcrumbs.
  let registration: vscode.Disposable | null = null;
  const isEnabled = () => vscode.workspace.getConfiguration("htmlTagOutline").get("enabled", true);

  // Status bar toggle, shown only while an HTML file is active
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = "htmlTagOutline.toggle";
  context.subscriptions.push(statusBar);

  const updateStatusBar = () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== "html") {
      statusBar.hide();
      return;
    }
    const on = isEnabled();
    statusBar.text = `$(list-tree) Tag Outline: ${on ? "On" : "Off"}`;
    statusBar.tooltip = on
      ? "HTML Tag Outline is active. Click to switch to the built-in symbols."
      : "HTML Tag Outline is off. Click to turn it on.";
    statusBar.show();
  };

  const applyEnabled = () => {
    const enabled = isEnabled();
    if (enabled && !registration) {
      registration = vscode.languages.registerDocumentSymbolProvider(selector, provider, {
        label: "HTML Tag Outline",
      });
    } else if (!enabled && registration) {
      registration.dispose();
      registration = null;
      cache.clear();
    }
    updateStatusBar();
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("htmlTagOutline.toggle", () =>
      vscode.workspace
        .getConfiguration("htmlTagOutline")
        .update("enabled", !isEnabled(), vscode.ConfigurationTarget.Global),
    ),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("htmlTagOutline.enabled")) applyEnabled();
    }),
    vscode.window.onDidChangeActiveTextEditor(updateStatusBar),
    { dispose: () => registration?.dispose() },
  );

  applyEnabled();
}

export function deactivate(): void {}
