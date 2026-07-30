import { readFile, writeFile } from "node:fs/promises"
import { basename, resolve } from "node:path"

const inputPath = resolve(process.argv[2] ?? "docs/IMPLEMENTATION_PLAN.md")
const outputPath = resolve(
  process.argv[3] ?? inputPath.replace(/\.md$/i, ".html"),
)

const markdown = await readFile(inputPath, "utf8")

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function renderInline(value) {
  const tokens = []
  const token = (html) => {
    const index = tokens.push(html) - 1
    return `\u0000${index}\u0000`
  }

  let rendered = value
    .replace(/`([^`]+)`/g, (_, code) => token(`<code>${escapeHtml(code)}</code>`))
    .replace(/\[([^\]]+)]\((https?:\/\/[^\s)]+)\)/g, (_, label, href) =>
      token(
        `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`,
      ),
    )

  rendered = escapeHtml(rendered)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\u0000(\d+)\u0000/g, (_, index) => tokens[Number(index)])

  return rendered
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

function tableCells(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim())
}

function isTableSeparator(line) {
  const cells = tableCells(line)
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

const lines = markdown.replaceAll("\r\n", "\n").split("\n")
const body = []
const headings = []
const usedIds = new Map()
let paragraph = []
let list = null

function uniqueId(label) {
  const base = slugify(label) || "section"
  const count = usedIds.get(base) ?? 0
  usedIds.set(base, count + 1)
  return count === 0 ? base : `${base}-${count + 1}`
}

function flushParagraph() {
  if (paragraph.length === 0) return
  const rendered = paragraph
    .map((line, index) => {
      const hardBreak = /\s{2}$/.test(line)
      const content = renderInline(line.trimEnd())
      if (index === paragraph.length - 1) return content
      return `${content}${hardBreak ? "<br>" : " "}`
    })
    .join("")
  body.push(`<p>${rendered}</p>`)
  paragraph = []
}

function flushList() {
  if (!list) return
  const tag = list.ordered ? "ol" : "ul"
  body.push(`<${tag}>${list.items.map((item) => `<li>${renderInline(item)}</li>`).join("")}</${tag}>`)
  list = null
}

function flushBlocks() {
  flushParagraph()
  flushList()
}

for (let index = 0; index < lines.length; index += 1) {
  const line = lines[index]

  const fence = line.match(/^```([^\s]*)\s*$/)
  if (fence) {
    flushBlocks()
    const language = fence[1].toLowerCase()
    const code = []
    index += 1
    while (index < lines.length && !/^```\s*$/.test(lines[index])) {
      code.push(lines[index])
      index += 1
    }
    if (language === "mermaid") {
      body.push(`<div class="diagram"><pre class="mermaid">${escapeHtml(code.join("\n"))}</pre></div>`)
    } else {
      const className = language ? ` class="language-${escapeHtml(language)}"` : ""
      body.push(`<pre><code${className}>${escapeHtml(code.join("\n"))}</code></pre>`)
    }
    continue
  }

  const heading = line.match(/^(#{1,3})\s+(.+)$/)
  if (heading) {
    flushBlocks()
    const level = heading[1].length
    const label = heading[2].trim()
    const id = uniqueId(label)
    headings.push({ level, label, id })
    body.push(`<h${level} id="${id}">${renderInline(label)}</h${level}>`)
    continue
  }

  if (
    line.includes("|") &&
    index + 1 < lines.length &&
    isTableSeparator(lines[index + 1])
  ) {
    flushBlocks()
    const headers = tableCells(line)
    index += 2
    const rows = []
    while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
      rows.push(tableCells(lines[index]))
      index += 1
    }
    index -= 1
    body.push(
      `<div class="table-wrap"><table><thead><tr>${headers
        .map((cell) => `<th>${renderInline(cell)}</th>`)
        .join("")}</tr></thead><tbody>${rows
        .map(
          (row) =>
            `<tr>${headers
              .map((_, cellIndex) => `<td>${renderInline(row[cellIndex] ?? "")}</td>`)
              .join("")}</tr>`,
        )
        .join("")}</tbody></table></div>`,
    )
    continue
  }

  const unordered = line.match(/^\s*-\s+(.+)$/)
  const ordered = line.match(/^\s*\d+\.\s+(.+)$/)
  if (unordered || ordered) {
    flushParagraph()
    const isOrdered = Boolean(ordered)
    if (list && list.ordered !== isOrdered) flushList()
    list ??= { ordered: isOrdered, items: [] }
    list.items.push((ordered ?? unordered)[1])
    continue
  }

  if (line.trim() === "") {
    flushBlocks()
    continue
  }

  flushList()
  paragraph.push(line)
}

flushBlocks()

const titleHeading = headings.find((heading) => heading.level === 1)
const title = titleHeading?.label ?? basename(inputPath, ".md")
const toc = headings
  .filter((heading) => heading.level > 1)
  .map(
    (heading) =>
      `<a class="toc-link depth-${heading.level}" href="#${heading.id}">${renderInline(heading.label)}</a>`,
  )
  .join("\n")

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      --bg: #f4f1eb;
      --surface: #fffdf9;
      --surface-2: #f1ece3;
      --ink: #211f1b;
      --muted: #686157;
      --line: #d9d1c5;
      --brand: #76513a;
      --brand-strong: #4f3223;
      --accent: #d9854a;
      --code-bg: #211f1b;
      --code-ink: #f8f3eb;
      --shadow: 0 18px 50px rgb(54 39 25 / 10%);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--ink);
      background: var(--bg);
    }

    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body { margin: 0; line-height: 1.65; }
    a { color: var(--brand); text-underline-offset: 0.18em; }
    a:hover { color: var(--accent); }

    .shell {
      display: grid;
      grid-template-columns: minmax(220px, 280px) minmax(0, 900px);
      gap: 42px;
      width: min(1240px, calc(100% - 40px));
      margin: 0 auto;
      padding: 40px 0 80px;
      align-items: start;
    }

    .sidebar {
      position: sticky;
      top: 24px;
      max-height: calc(100vh - 48px);
      overflow: auto;
      padding: 22px;
      border: 1px solid var(--line);
      border-radius: 18px;
      background: color-mix(in srgb, var(--surface) 92%, transparent);
      box-shadow: var(--shadow);
    }

    .eyebrow {
      margin: 0 0 14px;
      color: var(--accent);
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }

    .sidebar-title { margin: 0 0 18px; font-size: 1.1rem; }
    .toc-link {
      display: block;
      padding: 6px 8px;
      border-radius: 7px;
      color: var(--muted);
      font-size: 0.86rem;
      line-height: 1.3;
      text-decoration: none;
    }
    .toc-link:hover { color: var(--brand-strong); background: var(--surface-2); }
    .toc-link.depth-3 { padding-left: 22px; font-size: 0.8rem; }

    main {
      min-width: 0;
      padding: clamp(28px, 5vw, 64px);
      border: 1px solid var(--line);
      border-radius: 24px;
      background: var(--surface);
      box-shadow: var(--shadow);
    }

    h1, h2, h3 { line-height: 1.18; letter-spacing: -0.025em; scroll-margin-top: 24px; }
    h1 {
      margin: 0 0 26px;
      padding-bottom: 24px;
      border-bottom: 3px solid var(--accent);
      color: var(--brand-strong);
      font-size: clamp(2.25rem, 6vw, 4.3rem);
    }
    h2 { margin: 3.3rem 0 1rem; color: var(--brand-strong); font-size: clamp(1.55rem, 3vw, 2.15rem); }
    h3 { margin: 2.2rem 0 0.8rem; color: var(--brand); font-size: 1.25rem; }
    p { margin: 0.85rem 0; }
    ul, ol { padding-left: 1.35rem; }
    li { margin: 0.4rem 0; padding-left: 0.2rem; }
    strong { color: var(--brand-strong); }

    code {
      padding: 0.14em 0.36em;
      border: 1px solid var(--line);
      border-radius: 5px;
      background: var(--surface-2);
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
      font-size: 0.88em;
    }
    pre {
      overflow: auto;
      padding: 20px;
      border-radius: 14px;
      background: var(--code-bg);
      color: var(--code-ink);
      line-height: 1.5;
      box-shadow: inset 0 0 0 1px rgb(255 255 255 / 8%);
    }
    pre code { padding: 0; border: 0; background: transparent; color: inherit; }
    .diagram { overflow: auto; padding: 18px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface-2); }
    .diagram pre { min-width: 650px; margin: 0; background: transparent; color: var(--ink); box-shadow: none; text-align: center; }

    .table-wrap { overflow-x: auto; margin: 1.2rem 0 1.6rem; border: 1px solid var(--line); border-radius: 14px; }
    table { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
    th, td { padding: 12px 14px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
    th { color: var(--brand-strong); background: var(--surface-2); font-size: 0.8rem; letter-spacing: 0.04em; text-transform: uppercase; }
    tr:last-child td { border-bottom: 0; }
    tbody tr:nth-child(even) { background: color-mix(in srgb, var(--surface-2) 45%, transparent); }

    .source-note { margin-top: 56px; padding-top: 18px; border-top: 1px solid var(--line); color: var(--muted); font-size: 0.8rem; }

    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #171512;
        --surface: #211e1a;
        --surface-2: #2e2923;
        --ink: #eee8df;
        --muted: #b9afa3;
        --line: #4b433a;
        --brand: #e1a77b;
        --brand-strong: #f2c7a8;
        --accent: #e68e51;
        --code-bg: #0f0e0c;
        --code-ink: #f6eee4;
        --shadow: 0 18px 50px rgb(0 0 0 / 30%);
      }
    }

    @media (max-width: 860px) {
      .shell { display: block; width: min(100% - 24px, 900px); padding-top: 12px; }
      .sidebar { position: static; max-height: none; margin-bottom: 12px; }
      .sidebar nav { display: none; }
      main { padding: clamp(22px, 6vw, 42px); border-radius: 18px; }
    }

    @media print {
      :root { --bg: white; --surface: white; --ink: black; --muted: #444; --line: #bbb; --brand: #4f3223; --brand-strong: #271810; }
      .shell { display: block; width: 100%; padding: 0; }
      .sidebar { display: none; }
      main { padding: 0; border: 0; box-shadow: none; }
      h2, h3 { break-after: avoid; }
      pre, table, .diagram { break-inside: avoid; }
      a { color: inherit; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <aside class="sidebar">
      <p class="eyebrow">Count product plan</p>
      <p class="sidebar-title"><strong>${escapeHtml(title)}</strong></p>
      <nav aria-label="Document sections">${toc}</nav>
    </aside>
    <main>
      ${body.join("\n")}
      <p class="source-note">Generated from ${escapeHtml(basename(inputPath))}. The HTML is standalone except for optional online Mermaid enhancement; the diagram source remains readable offline.</p>
    </main>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
  <script>
    if (window.mermaid) {
      window.mermaid.initialize({ startOnLoad: true, securityLevel: "strict", theme: "neutral" });
    }
  </script>
</body>
</html>
`

await writeFile(outputPath, html, "utf8")
console.log(`Rendered ${inputPath} -> ${outputPath}`)
