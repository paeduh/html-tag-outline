export interface TagNode {
  /** Display name: tag, optionally followed by #id. */
  name: string;
  /** Offset of the opening "<". */
  start: number;
  /** Offset of the tag name inside the start tag. */
  nameStart: number;
  /** Length of the tag name as written in the source. */
  nameLength: number;
  /** Offset just past the element's end (closing tag, or implied end). */
  end: number;
  children: TagNode[];
}

export interface ParseStats {
  elements: number;
}

const VOID = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);
const RAW_TEXT = new Set(["script", "style"]);
// Global, case-insensitive regexes used with lastIndex to find the end of raw-text elements.
// (Avoids text.toLowerCase(), which is O(n) per call and can shift indices on some Unicode.)
const RAW_CLOSE: Record<string, RegExp> = {
  script: /<\/script/gi,
  style: /<\/style/gi,
};

// Elements whose start tag implicitly closes an open <p>
const P_CLOSERS = [
  "address",
  "article",
  "aside",
  "blockquote",
  "details",
  "div",
  "dl",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hgroup",
  "hr",
  "main",
  "menu",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "ul",
];

interface ImpliedRule {
  closes: Set<string>;
  stop: Set<string>;
}

// Implied end tags: when <key> opens, it closes any open element listed in
// `closes`, searching down the stack until an element listed in `stop` is hit.
const IMPLIED: Record<string, ImpliedRule> = {};
for (const t of P_CLOSERS) {
  IMPLIED[t] = {
    closes: new Set(["p"]),
    stop: new Set(["table", "td", "th", "button", "caption"]),
  };
}
const rule = (tags: string[], closes: string[], stop: string[]) => {
  for (const t of tags) {
    IMPLIED[t] = { closes: new Set(closes), stop: new Set(stop) };
  }
};
rule(["li"], ["li"], ["ul", "ol", "menu"]);
rule(["dt", "dd"], ["dt", "dd"], ["dl"]);
rule(["tr"], ["tr", "td", "th"], ["table", "thead", "tbody", "tfoot"]);
rule(["td", "th"], ["td", "th"], ["tr", "table"]);
rule(["thead", "tbody", "tfoot"], ["thead", "tbody", "tfoot", "tr", "td", "th"], ["table"]);
rule(["option"], ["option"], ["select", "datalist", "optgroup"]);
rule(["optgroup"], ["option", "optgroup"], ["select"]);

// comments | CDATA | doctype/other declarations | open or close tags
// Quoted attribute values may contain "<" only when it does not start a tag, so an
// unterminated quote can't swallow the rest of the file.
const TOKEN =
  /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<(\/?)([a-zA-Z][\w:.-]*)((?:"(?:[^"<]|<(?![a-zA-Z/!]))*"|'(?:[^'<]|<(?![a-zA-Z/!]))*'|[^'">])*)>/g;

const ID_ATTR = /(?:^|\s)id\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;

export function parseTags(text: string, showId: boolean, stats?: ParseStats): TagNode[] {
  const roots: TagNode[] = [];
  const stack: { tag: string; node: TagNode }[] = [];

  const push = (node: TagNode) => {
    if (stats) stats.elements++;
    if (stack.length) stack[stack.length - 1].node.children.push(node);
    else roots.push(node);
  };

  // Close elements that the HTML spec ends implicitly when `tag` opens
  const closeImplied = (tag: string, start: number) => {
    const r = IMPLIED[tag];
    if (!r) return;
    let lowest = -1;
    for (let i = stack.length - 1; i >= 0; i--) {
      const t = stack[i].tag;
      if (r.closes.has(t)) lowest = i;
      else if (r.stop.has(t)) break;
    }
    if (lowest === -1) return;
    while (stack.length > lowest) stack.pop()!.node.end = start;
  };

  TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN.exec(text)) !== null) {
    if (m[2] === undefined) continue; // comment, CDATA or declaration

    const isClose = m[1] === "/";
    const rawTag = m[2];
    const tag = rawTag.toLowerCase();
    const attrs = m[3] || "";
    const start = m.index;
    const end = m.index + m[0].length;

    if (isClose) {
      // find the nearest matching open tag; anything above it was left unclosed
      let i = stack.length - 1;
      while (i >= 0 && stack[i].tag !== tag) i--;
      if (i < 0) continue; // stray closing tag
      while (stack.length - 1 > i) stack.pop()!.node.end = start;
      stack.pop()!.node.end = end;
      continue;
    }

    closeImplied(tag, start);

    let name = rawTag;
    if (showId) {
      const idm = ID_ATTR.exec(attrs);
      const id = idm && (idm[1] ?? idm[2] ?? idm[3]);
      if (id) name += "#" + id;
    }
    const node: TagNode = {
      name,
      start,
      nameStart: start + 1,
      nameLength: rawTag.length,
      end,
      children: [],
    };
    push(node);

    const selfClosing = /\/\s*$/.test(attrs);
    if (VOID.has(tag) || selfClosing) continue;

    stack.push({ tag, node });

    if (RAW_TEXT.has(tag)) {
      // skip content so "<" inside scripts/styles isn't parsed as tags
      const re = RAW_CLOSE[tag];
      re.lastIndex = end;
      const close = re.exec(text);
      TOKEN.lastIndex = close ? close.index : text.length;
    }
  }

  // unclosed elements run to end of document
  while (stack.length) stack.pop()!.node.end = text.length;

  return roots;
}
