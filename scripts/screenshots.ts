// Generates README screenshots and the extension icon with headless Chrome.
// Usage: node scripts/screenshots.ts   (set CHROME=/path/to/chrome if needed)
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseTags, type TagNode } from "../src/parser.ts";

const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = resolve(import.meta.dirname, "../images");
const TMP = mkdtempSync(join(tmpdir(), "hto-shots-"));
mkdirSync(OUT, { recursive: true });

const SAMPLE = `<body class="bg-slate-50 text-slate-900 antialiased">
  <header id="top" class="sticky top-0 z-10 flex items-center justify-between border-b bg-white/80 px-6 py-4 backdrop-blur">
    <a href="/" class="text-lg font-semibold tracking-tight">Acme</a>
    <nav class="hidden gap-6 text-sm font-medium md:flex">
      <a href="#features" class="text-slate-600 hover:text-indigo-600">Features</a>
      <a href="#pricing" class="text-slate-600 hover:text-indigo-600">Pricing</a>
    </nav>
  </header>
  <main class="mx-auto max-w-5xl px-6">
    <section id="hero" class="grid gap-8 py-24 md:grid-cols-2 md:items-center">
      <div class="space-y-6">
        <h1 class="text-4xl font-bold tracking-tight sm:text-5xl">Ship faster</h1>
        <p class="text-lg leading-8 text-slate-600">Build modern sites without the clutter.</p>
        <button class="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white shadow-sm hover:bg-indigo-500">Get started</button>
      </div>
      <img src="hero.png" alt="" class="rounded-2xl shadow-xl ring-1 ring-slate-900/10">
    </section>
  </main>
</body>`;

const CURSOR_LINE = 14; // the <button> line (1-based)

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// --- symbol trees ---------------------------------------------------------

interface Row {
  label: string;
  depth: number;
  hasChildren: boolean;
  selected: boolean;
}

const lineOf = (offset: number) => SAMPLE.slice(0, offset).split("\n").length;

// Mirrors the built-in HTML language service naming: tag#id.class1.class2
function builtinName(n: TagNode): string {
  const startTag = SAMPLE.slice(n.start).match(/^<[^>]*>/)?.[0] ?? "";
  const tag = SAMPLE.slice(n.nameStart, n.nameStart + n.nameLength);
  const id = startTag.match(/\sid="([^"]*)"/)?.[1];
  const cls = startTag.match(/\sclass="([^"]*)"/)?.[1];
  return tag + (id ? "#" + id : "") + (cls ? "." + cls.trim().split(/\s+/).join(".") : "");
}

function rows(nodes: TagNode[], builtin: boolean, depth = 0, out: Row[] = []): Row[] {
  for (const n of nodes) {
    out.push({
      label: builtin ? builtinName(n) : n.name,
      depth,
      hasChildren: n.children.length > 0,
      selected: lineOf(n.start) === CURSOR_LINE,
    });
    rows(n.children, builtin, depth + 1, out);
  }
  return out;
}

function path(nodes: TagNode[], builtin: boolean): string[] {
  const cursor =
    SAMPLE.split("\n")
      .slice(0, CURSOR_LINE - 1)
      .join("\n").length + 9;
  const out: string[] = [];
  let level = nodes;
  for (;;) {
    const hit = level.find((n) => n.start <= cursor && cursor < n.end);
    if (!hit) return out;
    out.push(builtin ? builtinName(hit) : hit.name);
    level = hit.children;
  }
}

const tree = parseTags(SAMPLE, true);

// --- rendering ------------------------------------------------------------

function highlight(line: string): string {
  return line.replace(
    /(<\/?)([\w-]+)|([\w:-]+)(=)("[^"]*")|(\/?>)|([^<>"=\s][^<]*?(?=<|$))/g,
    (m, open, tag, attr, eq, str, close, text) => {
      if (tag) return `<i class=p>${esc(open)}</i><i class=t>${tag}</i>`;
      if (attr) return `<i class=a>${attr}</i><i class=p>${eq}</i><i class=s>${esc(str)}</i>`;
      if (close) return `<i class=p>${esc(close)}</i>`;
      if (text) return `<i class=x>${esc(text)}</i>`;
      return esc(m);
    },
  );
}

const ICON_FIELD = `<svg width="16" height="16" viewBox="0 0 16 16"><path fill="#75beff" d="M14.45 4.5l-5-2.5h-.9l-7 3.5-.55.89v4.5l.55.9 5 2.5h.9l7-3.5.55-.9v-4.5l-.55-.89zm-8 8.64l-4.5-2.25V7.17l4.5 2v3.97zm.5-4.8L2.29 6.23l6.66-3.34 4.67 2.34-6.67 3.11zm7 1.55l-6.5 3.25V9.21l6.5-3v3.68z"/></svg>`;
const CHEVRON = `<svg width="16" height="16" viewBox="0 0 16 16"><path fill="#c5c5c5" d="M7.976 10.072l4.357-4.357.62.618L8.284 11h-.618L3 6.333l.619-.618 4.357 4.357z"/></svg>`;
const TREE = `<svg width="14" height="14" viewBox="0 0 16 16"><path fill="currentColor" d="M14 6V3H9v1H5V2H2v3h3V5h2v6h2v1h5V9H9v1H8V6h1v1h5V6zM4 4H3V3h1v1zm9 9h-3v-2h3v2zm0-7h-3V4h3v2z"/></svg>`;

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#ccc;background:#1f1f1f;overflow:hidden}
.win{display:grid;grid-template-rows:34px 1fr 22px;height:100vh}
.title{background:#181818;border-bottom:1px solid #2b2b2b;display:flex;align-items:center;justify-content:center;position:relative;color:#9d9d9d;font-size:12.5px}
.lights{position:absolute;left:12px;display:flex;gap:8px}.lights i{width:12px;height:12px;border-radius:50%;display:block}
.badge{margin-left:10px;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600}
.badge.before{background:#5a1d1d;color:#f48771}.badge.after{background:#1d4a2b;color:#89d185}
.main{display:grid;grid-template-columns:48px 330px 1fr;min-height:0}
.act{background:#181818;border-right:1px solid #2b2b2b}
.side{background:#181818;border-right:1px solid #2b2b2b;min-width:0;overflow:hidden}
.side h2{font-size:11px;font-weight:400;padding:10px 20px;color:#ccc;letter-spacing:.3px}
.sec{font-size:11px;font-weight:700;padding:3px 4px;display:flex;align-items:center;border-top:1px solid #2b2b2b}
.row{height:22px;display:flex;align-items:center;white-space:nowrap;overflow:hidden;padding-right:8px}
.row.sel{background:#37373d;outline:1px solid #0078d4;outline-offset:-1px}
.row .tw{width:16px;flex:none;display:flex}.row .ic{width:20px;flex:none;display:flex}
.row span{overflow:hidden;text-overflow:ellipsis}
.ed{display:grid;grid-template-rows:35px 22px 1fr;min-width:0}
.tabs{background:#181818;border-bottom:1px solid #2b2b2b;display:flex}
.tab{background:#1f1f1f;border-top:1px solid #0078d4;border-right:1px solid #2b2b2b;padding:0 14px;display:flex;align-items:center;gap:6px;color:#fff}
.tab b{color:#e37933;font-size:11px}
.crumbs{display:flex;align-items:center;padding:0 12px;white-space:nowrap;overflow:hidden;color:#a9a9a9;gap:2px}
.crumbs .c{display:flex;align-items:center;gap:2px}.crumbs .c svg{flex:none}
.crumbs .sep{color:#8b8b8b;padding:0 3px}.crumbs .last{color:#fff}
.code{font:13px/19px Menlo,Monaco,monospace;padding-top:4px;overflow:hidden}
.ln{display:flex;white-space:pre}.ln.cur{background:#ffffff0a;outline:1px solid #282828}
.num{width:52px;text-align:right;padding-right:22px;color:#6e7681;flex:none}.ln.cur .num{color:#ccc}
i{font-style:normal}.p{color:#808080}.t{color:#569cd6}.a{color:#9cdcfe}.s{color:#ce9178}.x{color:#d4d4d4}
.status{background:#181818;border-top:1px solid #2b2b2b;display:flex;justify-content:flex-end;align-items:center;font-size:12px;color:#ccc;padding:0 6px}
.status span{padding:0 7px;display:flex;align-items:center;gap:4px;height:100%}
.status .hl{background:#ffffff1f;box-shadow:0 0 0 1px #0078d4 inset}
`;

function outlineHtml(builtin: boolean): string {
  return rows(tree, builtin)
    .map(
      (r) =>
        `<div class="row${r.selected ? " sel" : ""}" style="padding-left:${8 + r.depth * 8}px">` +
        `<i class=tw>${r.hasChildren ? CHEVRON : ""}</i><i class=ic>${ICON_FIELD}</i><span>${esc(r.label)}</span></div>`,
    )
    .join("");
}

function windowHtml(builtin: boolean): string {
  const crumbs = ["index.html", ...path(tree, builtin)];
  const crumbHtml = crumbs
    .map((c, i) => {
      const icon = i === 0 ? "" : ICON_FIELD;
      const cls = i === crumbs.length - 1 ? "c last" : "c";
      return `<span class="${cls}">${icon}${esc(c)}</span>`;
    })
    .join(`<span class=sep>›</span>`);
  const code = SAMPLE.split("\n")
    .map(
      (l, i) =>
        `<div class="ln${i + 1 === CURSOR_LINE ? " cur" : ""}"><span class=num>${i + 1}</span><span>${highlight(l)}</span></div>`,
    )
    .join("");
  const badge = builtin
    ? `<span class="badge before">Built-in HTML symbols</span>`
    : `<span class="badge after">HTML Tag Outline</span>`;
  return `<!doctype html><meta charset=utf-8><style>${CSS}</style>
<div class=win>
  <div class=title><div class=lights><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i></div>index.html — acme-site ${badge}</div>
  <div class=main>
    <div class=act></div>
    <div class=side><h2>EXPLORER</h2><div class=sec>${CHEVRON}OUTLINE</div>${outlineHtml(builtin)}</div>
    <div class=ed>
      <div class=tabs><div class=tab><b>&lt;/&gt;</b>index.html</div></div>
      <div class=crumbs>${crumbHtml}</div>
      <div class=code>${code}</div>
    </div>
  </div>
  <div class=status><span>Ln ${CURSOR_LINE}, Col 9</span><span>Spaces: 2</span><span>UTF-8</span><span>LF</span><span>HTML</span>
    <span class=hl>${TREE} Tag Outline: ${builtin ? "Off" : "On"}</span></div>
</div>`;
}

function comparisonHtml(): string {
  const pane = (builtin: boolean) =>
    `<div class=pane><div class=hd>${builtin ? `<span class="badge before">Before</span> Built-in HTML symbols` : `<span class="badge after">After</span> HTML Tag Outline`}</div>
     <div class=sec>${CHEVRON}OUTLINE</div>${outlineHtml(builtin)}</div>`;
  return `<!doctype html><meta charset=utf-8><style>${CSS}
body{background:#111;display:flex;gap:16px;padding:16px}
.pane{background:#181818;border:1px solid #2b2b2b;border-radius:8px;overflow:hidden;flex:1;min-width:0;padding-bottom:8px}
.hd{padding:12px;font-size:13px;display:flex;align-items:center;gap:6px;color:#ccc}.hd .badge{margin:0}
</style>${pane(true)}${pane(false)}`;
}

const ICON_HTML = `<!doctype html><style>*{margin:0}body{background:transparent}</style>
<svg width="512" height="512" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2b2f3a"/><stop offset="1" stop-color="#16181d"/></linearGradient></defs>
  <rect x="4" y="4" width="120" height="120" rx="26" fill="url(#g)"/>
  <g stroke="#4b5263" stroke-width="4" fill="none" stroke-linecap="round"><path d="M34 40v52M34 62h16M34 92h16M58 76v16h10"/></g>
  <g font-family="Menlo,monospace" font-weight="700" font-size="17">
    <rect x="20" y="22" width="56" height="22" rx="6" fill="#1f6feb"/><text x="48" y="38" fill="#fff" text-anchor="middle">&lt;/&gt;</text>
    <rect x="50" y="52" width="58" height="20" rx="6" fill="#75beff" opacity=".9"/><text x="79" y="67" fill="#0b1b2b" text-anchor="middle" font-size="14">main</text>
    <rect x="68" y="82" width="42" height="20" rx="6" fill="#38bdf8"/><text x="89" y="97" fill="#0b1b2b" text-anchor="middle" font-size="14">div</text>
  </g>
</svg>`;

function shoot(name: string, html: string, width: number, height: number, scale = 2) {
  const file = join(TMP, name + ".html");
  writeFileSync(file, html);
  execFileSync(CHROME, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--default-background-color=00000000",
    `--force-device-scale-factor=${scale}`,
    `--window-size=${width},${height}`,
    `--screenshot=${join(OUT, name + ".png")}`,
    "file://" + file,
  ]);
  console.log(`images/${name}.png`);
}

shoot("before", windowHtml(true), 1200, 488);
shoot("after", windowHtml(false), 1200, 488);
shoot("comparison", comparisonHtml(), 820, 392);
shoot("icon", ICON_HTML, 512, 512, 1);
execFileSync("sips", ["-Z", "128", join(OUT, "icon.png")], { stdio: "ignore" });
