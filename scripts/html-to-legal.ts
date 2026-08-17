import { readFile, writeFile } from "node:fs/promises"
import { parse, type DefaultTreeAdapterTypes } from "parse5"
import { format, resolveConfig } from "prettier"

import type { LegalDocumentBlock, LegalDocumentContent } from "../src/content/legal"

type Element = DefaultTreeAdapterTypes.Element
type Node = DefaultTreeAdapterTypes.Node

export function convertHtmlToLegal(html: string): LegalDocumentContent {
  const document = parse(html)
  const root = findElement(document, ["article", "main", "body"]) ?? document
  const sections: LegalDocumentContent["sections"] = []
  let title = "Legal Document"
  let heading: string | undefined
  let blocks: LegalDocumentBlock[] = []
  let previousBlockWasInline = false

  walkBlocks(root)
  flushSection()
  if (title === "Legal Document" || sections.length === 0) {
    throw new Error("No legal document content found in the input HTML")
  }
  return { title, sections }

  function walkBlocks(node: Node) {
    if (!isElement(node)) {
      if ("childNodes" in node) node.childNodes.forEach(walkBlocks)
      return
    }
    if (["script", "style", "noscript"].includes(node.tagName)) return

    const text = textContent(node)
    if (node.tagName === "h1") {
      if (text) title = text
      return
    }
    if (node.tagName === "h2" || node.tagName === "h3") {
      flushSection()
      heading = text
      return
    }
    if (node.tagName === "table") {
      const rows = tableContent(node)
      if (rows.length > 0) addBlock({ type: "table", rows })
      return
    }
    if (node.tagName === "li") {
      if (text) addListItem(text)
      return
    }
    if (
      heading === "TABLE OF CONTENTS" &&
      node.tagName === "div" &&
      /^\d+\./.test(text) &&
      hasInternalLink(node)
    ) {
      addParagraph(text)
      return
    }
    if (isProseBlock(node)) {
      if (text) addParagraph(text, node.tagName === "span")
      return
    }
    node.childNodes.forEach(walkBlocks)
  }

  function flushSection() {
    if (heading || blocks.length > 0) {
      sections.push({ ...(heading ? { heading } : {}), blocks })
    }
    heading = undefined
    blocks = []
    previousBlockWasInline = false
  }

  function addParagraph(text: string, inline = false) {
    const previousBlock = blocks.at(-1)
    if (inline && previousBlockWasInline && previousBlock?.type === "paragraph") {
      previousBlock.text = cleanLegalText(`${previousBlock.text} ${text}`)
    } else {
      addBlock({ type: "paragraph", text })
    }
    previousBlockWasInline = inline
  }

  function addListItem(text: string) {
    const previousBlock = blocks.at(-1)
    if (previousBlock?.type === "list") previousBlock.items.push(text)
    else addBlock({ type: "list", items: [text] })
  }

  function addBlock(block: LegalDocumentBlock) {
    blocks.push(block)
    previousBlockWasInline = false
  }
}

export function cleanLegalText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ +([,.;:!?])/g, "$1")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\b(\d+)\s*\.\s+(\d+)\b/g, "$1.$2")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export async function renderLegalModule(content: LegalDocumentContent, exportName: string) {
  if (!/^[A-Za-z_$][\w$]*$/.test(exportName)) {
    throw new Error(`Invalid TypeScript export name: ${exportName}`)
  }
  const source = `import type { LegalDocumentContent } from "./legal"

export const ${exportName} = ${JSON.stringify(content, null, 2)} satisfies LegalDocumentContent
`
  return format(source, { ...(await resolveConfig("package.json")), parser: "typescript" })
}

async function main() {
  const [input, output, exportName] = process.argv.slice(2)
  if (!input || !output || !exportName) {
    throw new Error("Usage: pnpm legal:convert input.html src/content/output.ts exportName")
  }
  const content = convertHtmlToLegal(await readFile(input, "utf8"))
  await writeFile(output, await renderLegalModule(content, exportName), "utf8")
  process.stdout.write(`Generated ${output}\n`)
}

if (require.main === module) void main()

function isProseBlock(element: Element) {
  if (element.tagName === "p") return true
  if (element.tagName === "div") {
    return (
      (hasCustomClass(element, "body_text") || hasDescendantWithClass(element, "body_text")) &&
      !hasDescendantTag(element, ["h1", "h2", "h3", "table", "li"])
    )
  }
  return (
    hasCustomClass(element, "subtitle") ||
    (hasCustomClass(element, "body_text") && !hasDescendantTag(element, ["table"]))
  )
}

function tableContent(table: Element) {
  return findElements(table, "tr")
    .map((row) =>
      row.childNodes
        .filter(
          (child): child is Element => isElement(child) && ["th", "td"].includes(child.tagName),
        )
        .map(textContent)
        .filter(Boolean)
        .join(" "),
    )
    .filter(Boolean)
}

function hasCustomClass(element: Element, value: string) {
  return element.attrs.some(
    (attribute) => attribute.name === "data-custom-class" && attribute.value === value,
  )
}

function hasDescendantWithClass(element: Element, value: string): boolean {
  return element.childNodes.some(
    (child) =>
      isElement(child) && (hasCustomClass(child, value) || hasDescendantWithClass(child, value)),
  )
}

function hasDescendantTag(element: Element, tags: string[]): boolean {
  return element.childNodes.some(
    (child) => isElement(child) && (tags.includes(child.tagName) || hasDescendantTag(child, tags)),
  )
}

function hasInternalLink(element: Element): boolean {
  if (
    element.tagName === "a" &&
    element.attrs.some((attribute) => attribute.name === "href" && attribute.value.startsWith("#"))
  ) {
    return true
  }
  return element.childNodes.some((child) => isElement(child) && hasInternalLink(child))
}

function findElements(node: Node, tag: string): Element[] {
  const matches = isElement(node) && node.tagName === tag ? [node] : []
  if ("childNodes" in node) {
    for (const child of node.childNodes) matches.push(...findElements(child, tag))
  }
  return matches
}

function findElement(node: Node, tags: string[]): Element | undefined {
  if (isElement(node) && tags.includes(node.tagName)) return node
  if (!("childNodes" in node)) return undefined
  for (const child of node.childNodes) {
    const match = findElement(child, tags)
    if (match) return match
  }
  return undefined
}

function textContent(node: Node): string {
  return cleanLegalText(rawTextContent(node).replace(/\s+/g, " "))
}

function rawTextContent(node: Node): string {
  if ("value" in node) return node.value
  if (!("childNodes" in node)) return ""
  const text = node.childNodes.map(rawTextContent).join("")
  if (!isElement(node) || node.tagName !== "a") return text
  const href = node.attrs.find((attribute) => attribute.name === "href")?.value
  const label = cleanLegalText(text.replace(/\s+/g, " "))
  if (!href || href === label || href.startsWith("#") || href === `mailto:${label}`) return text
  return `${text} (${href})`
}

function isElement(node: Node): node is Element {
  return "tagName" in node
}
