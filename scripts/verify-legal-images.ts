import { spawnSync } from "node:child_process"
import { readFile } from "node:fs/promises"

import { convertHtmlToLegal } from "./html-to-legal"
import { eulaContent } from "../src/content/eula"
import type { LegalDocumentContent } from "../src/content/legal"
import { termsContent } from "../src/content/terms"

const phraseLength = 5
const maximumUnmatchedRun = 12

const documents = [
  {
    content: termsContent,
    contentPath: "src/content/terms.ts",
    htmlPath: "legal/terms.html",
    images: ["legal/terms1.png", "legal/terms2.png"],
    screenshotFooter: /This Terms and Conditions was created using/i,
  },
  {
    content: eulaContent,
    contentPath: "src/content/eula.ts",
    htmlPath: "legal/eula.html",
    images: ["legal/eula.png"],
    screenshotFooter: /This EULA was created using/i,
  },
] satisfies Array<{
  content: LegalDocumentContent
  contentPath: string
  htmlPath: string
  images: string[]
  screenshotFooter: RegExp
}>

async function main() {
  for (const document of documents) await verifyDocument(document)
}

async function verifyDocument({
  content,
  contentPath,
  htmlPath,
  images,
  screenshotFooter,
}: (typeof documents)[number]) {
  const htmlContent = convertHtmlToLegal(await readFile(htmlPath, "utf8"))
  if (JSON.stringify(htmlContent) !== JSON.stringify(content)) {
    throw new Error(`${contentPath} is stale. Run \`pnpm legal:generate\` first.`)
  }

  const expectedPhrases = phrases(wordsFromContent(content), phraseLength)
  for (const image of images) {
    const result = spawnSync("tesseract", [image, "stdout", "--psm", "6"], {
      encoding: "utf8",
    })
    if (result.error?.message.includes("ENOENT")) {
      throw new Error("Tesseract is required. Install it with `brew install tesseract`.")
    }
    if (result.status !== 0) {
      throw new Error(`Could not OCR ${image}:\n${result.stderr.trim()}`)
    }

    verifyImageText(
      image,
      normalizeWords(result.stdout.split(screenshotFooter, 1)[0]),
      expectedPhrases,
      contentPath,
    )
  }

  process.stdout.write(`Verified ${images.join(" and ")} against ${contentPath}\n`)
}

function wordsFromContent(content: LegalDocumentContent) {
  return normalizeWords(
    [
      content.title,
      ...content.sections.flatMap((section) => [
        section.heading ?? "",
        ...section.blocks.flatMap((block) =>
          block.type === "paragraph"
            ? [block.text]
            : block.type === "list"
              ? block.items
              : block.rows,
        ),
      ]),
    ].join(" "),
  )
}

function normalizeWords(value: string) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

function phrases(words: string[], length: number) {
  return new Set(
    Array.from({ length: Math.max(0, words.length - length + 1) }, (_, index) =>
      words.slice(index, index + length).join(" "),
    ),
  )
}

function verifyImageText(
  image: string,
  imageWords: string[],
  expectedPhrases: Set<string>,
  contentPath: string,
) {
  const matches = Array.from(
    { length: Math.max(0, imageWords.length - phraseLength + 1) },
    (_, index) => expectedPhrases.has(imageWords.slice(index, index + phraseLength).join(" ")),
  )

  let runStart = 0
  for (let index = 0; index <= matches.length; index += 1) {
    if (matches[index]) {
      runStart = index + 1
      continue
    }
    if (index - runStart < maximumUnmatchedRun) continue

    const contextStart = Math.max(0, runStart - phraseLength)
    const contextEnd = Math.min(imageWords.length, index + phraseLength * 2)
    const context = imageWords.slice(contextStart, contextEnd).join(" ")
    throw new Error(`${image} contains text not found in ${contentPath} near:\n\n  ${context}\n`)
  }
}

void main()
