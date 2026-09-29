import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseTags, type TagNode } from "../src/parser.ts";

const names = (nodes: TagNode[]): unknown[] =>
  nodes.map((n) => (n.children.length ? [n.name, names(n.children)] : n.name));

describe("parseTags", () => {
  it("shows tag names without classes", () => {
    const html = `<div class="flex items-center gap-4"><span class="text-sm">x</span></div>`;
    assert.deepEqual(names(parseTags(html, true)), [["div", ["span"]]]);
  });

  it("appends #id when enabled", () => {
    const html = `<section id="hero" class="py-24"><h1 id='title'>x</h1><p id=lead>y</p></section>`;
    assert.deepEqual(names(parseTags(html, true)), [["section#hero", ["h1#title", "p#lead"]]]);
    assert.deepEqual(names(parseTags(html, false)), [["section", ["h1", "p"]]]);
  });

  it("handles void and self-closing elements", () => {
    const html = `<div><img src="a.png"><br><input /><x-icon /></div>`;
    assert.deepEqual(names(parseTags(html, true)), [["div", ["img", "br", "input", "x-icon"]]]);
  });

  it("closes implied end tags", () => {
    const html = `<ul><li>a<li>b</ul><p>one<p>two<div></div>`;
    assert.deepEqual(names(parseTags(html, true)), [["ul", ["li", "li"]], "p", "p", "div"]);
  });

  it("does not parse tags inside script and style", () => {
    const html = `<script>if (a < b) { x = "<div>"; }</script><style>a>b{}</style><main></main>`;
    assert.deepEqual(names(parseTags(html, true)), ["script", "style", "main"]);
  });

  it("ignores comments, doctype and stray closing tags", () => {
    const html = `<!doctype html><!-- <div> --></span><body></body>`;
    assert.deepEqual(names(parseTags(html, true)), ["body"]);
  });

  it("computes ranges and counts elements", () => {
    const html = `<div>\n  <p>x</p>\n</div>`;
    const stats = { elements: 0 };
    const [div] = parseTags(html, true, stats);
    assert.equal(stats.elements, 2);
    assert.equal(div.start, 0);
    assert.equal(div.end, html.length);
    assert.equal(html.slice(div.nameStart, div.nameStart + div.nameLength), "div");
    const [p] = div.children;
    assert.equal(html.slice(p.start, p.end), "<p>x</p>");
  });

  it("runs unclosed elements to end of document", () => {
    const html = `<main><div>`;
    const [main] = parseTags(html, true);
    assert.equal(main.end, html.length);
    assert.equal(main.children[0].end, html.length);
  });
});
