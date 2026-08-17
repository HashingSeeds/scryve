import { readFileSync } from "node:fs"

import { cleanLegalText, convertHtmlToLegal, renderLegalModule } from "./html-to-legal"

function sectionNumber(value: string) {
  return value.match(/^\d+/)?.[0]
}

describe("convertHtmlToLegal", () => {
  it("cleans typography without rewriting legal copy", () => {
    expect(cleanLegalText('Hashing Seeds LLC , ( "Licensor" ) and clause 2 . 1 .')).toBe(
      'Hashing Seeds LLC, ("Licensor") and clause 2.1.',
    )
  })

  it("emits structured paragraphs, lists, and tables", () => {
    const result = convertHtmlToLegal(`
      <html><body><h1>Terms</h1><h2>Section</h2>
      <p>First paragraph.</p><p>Second paragraph.</p>
      <ul><li>One</li><li>Two</li></ul>
      <table><tr><td>Name</td><td>Value</td></tr></table>
      </body></html>
    `)

    expect(result.sections[0]).toEqual({
      heading: "Section",
      blocks: [
        { type: "paragraph", text: "First paragraph." },
        { type: "paragraph", text: "Second paragraph." },
        { type: "list", items: ["One", "Two"] },
        { type: "table", rows: ["Name Value"] },
      ],
    })
  })

  it("removes internal and redundant email targets while retaining named external URLs", () => {
    const result = convertHtmlToLegal(`
      <html><body><h1>Terms</h1><p>
      <a href="#details">Details</a>
      <a href="mailto:legal@example.com">legal@example.com</a>
      <a href="https://example.com/terms">External terms</a>
      </p></body></html>
    `)

    expect(result.sections[0].blocks).toEqual([
      {
        type: "paragraph",
        text: "Details legal@example.com External terms (https://example.com/terms)",
      },
    ])
  })

  it("converts the restored legal documents", () => {
    const terms = convertHtmlToLegal(readFileSync("legal/terms.html", "utf8"))
    const eula = convertHtmlToLegal(readFileSync("legal/eula.html", "utf8"))

    expect(terms.sections.find((section) => section.heading === "1. OUR SERVICES")?.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "paragraph",
          text: expect.stringContaining("jurisdiction"),
        }),
      ]),
    )
    expect(eula.sections.find((section) => section.heading === "5. USE OF DATA")?.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "paragraph",
          text: expect.stringContaining("https://count.sow.care/privacy"),
        }),
      ]),
    )
  })

  it("keeps every numbered privacy section in the table of contents", () => {
    const privacy = convertHtmlToLegal(readFileSync("legal/privacy.html", "utf8"))
    const tableOfContents = privacy.sections
      .find((section) => section.heading === "TABLE OF CONTENTS")
      ?.blocks.flatMap((block) => (block.type === "paragraph" ? [block.text] : []))
    const numberedHeadings = privacy.sections
      .map((section) => section.heading)
      .filter((heading): heading is string => /^\d+\./.test(heading ?? ""))

    expect(tableOfContents?.map(sectionNumber)).toEqual(numberedHeadings.map(sectionNumber))
  })

  it("renders a typed TypeScript content module", async () => {
    const source = await renderLegalModule(
      { title: "Terms", sections: [{ blocks: [{ type: "paragraph", text: "Legal text" }] }] },
      "termsContent",
    )

    expect(source).toContain("export const termsContent")
    expect(source).toContain("satisfies LegalDocumentContent")
  })

  it("rejects empty or unrecognized HTML", () => {
    expect(() => convertHtmlToLegal("")).toThrow("No legal document content found")
  })
})
