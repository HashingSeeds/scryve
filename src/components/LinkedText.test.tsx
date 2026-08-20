import { Linking } from "react-native"
import { fireEvent, render } from "@testing-library/react-native"

import { cookiePolicyContent } from "@/content/cookiePolicy"
import type { LegalDocumentContent } from "@/content/legal"
import { privacyContent } from "@/content/privacy"
import { termsContent } from "@/content/terms"
import { ThemeProvider } from "@/theme/context"

import { LinkedText, splitLinks } from "./LinkedText"

describe("splitLinks", () => {
  it("returns a single plain segment when there is no link", () => {
    expect(splitLinks("No links here.")).toEqual([{ content: "No links here." }])
  })

  it("leaves sentence punctuation outside the link", () => {
    expect(splitLinks("See https://scryve.sow.care/privacy.")).toEqual([
      { content: "See " },
      { content: "https://scryve.sow.care/privacy", href: "https://scryve.sow.care/privacy" },
      { content: "." },
    ])
  })

  it("keeps the closing parenthesis of a Label (url) pair outside the link", () => {
    expect(splitLinks("Chrome (https://support.google.com/chrome)")).toEqual([
      { content: "Chrome (" },
      { content: "https://support.google.com/chrome", href: "https://support.google.com/chrome" },
      { content: ")" },
    ])
  })

  it("keeps parentheses that are part of the URL", () => {
    const url = "https://example.test/a_(b)_c"
    expect(splitLinks(url)).toEqual([{ content: url, href: url }])
  })

  it("turns an email address into a mailto link", () => {
    expect(splitLinks("Email privacy@sowinghope.how today")).toEqual([
      { content: "Email " },
      { content: "privacy@sowinghope.how", href: "mailto:privacy@sowinghope.how" },
      { content: " today" },
    ])
  })

  it("handles several links in one paragraph", () => {
    const segments = splitLinks("Apple (https://a.test/p) and Google (https://b.test/p) differ.")
    expect(segments.filter((segment) => segment.href)).toEqual([
      { content: "https://a.test/p", href: "https://a.test/p" },
      { content: "https://b.test/p", href: "https://b.test/p" },
    ])
    expect(segments.map((segment) => segment.content).join("")).toBe(
      "Apple (https://a.test/p) and Google (https://b.test/p) differ.",
    )
  })

  it("preserves the original text exactly", () => {
    const source = "Write to a@b.test, or see https://c.test/d; both work."
    expect(
      splitLinks(source)
        .map((segment) => segment.content)
        .join(""),
    ).toBe(source)
  })
})

describe("LinkedText", () => {
  it("opens a tapped URL", () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true)
    const view = render(
      <ThemeProvider initialContext="light">
        <LinkedText text="Read https://scryve.sow.care/privacy for details." />
      </ThemeProvider>,
    )

    fireEvent.press(view.getByText("https://scryve.sow.care/privacy"))
    expect(openURL).toHaveBeenCalledWith("https://scryve.sow.care/privacy")
    openURL.mockRestore()
  })

  it("opens a tapped email address as a mailto link", () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true)
    const view = render(
      <ThemeProvider initialContext="light">
        <LinkedText text="Contact privacy@sowinghope.how anytime." />
      </ThemeProvider>,
    )

    fireEvent.press(view.getByText("privacy@sowinghope.how"))
    expect(openURL).toHaveBeenCalledWith("mailto:privacy@sowinghope.how")
    openURL.mockRestore()
  })
})

describe("the shipped legal documents", () => {
  const documents: Array<[string, LegalDocumentContent]> = [
    ["privacy", privacyContent],
    ["terms", termsContent],
    ["cookie policy", cookiePolicyContent],
  ]

  function stringsIn(document: LegalDocumentContent) {
    return document.sections.flatMap((section) =>
      section.blocks.flatMap((block) =>
        block.type === "paragraph"
          ? [block.text]
          : block.type === "list"
            ? block.items
            : block.rows,
      ),
    )
  }

  it.each(documents)("renders every %s link without altering the text", (_name, document) => {
    for (const value of stringsIn(document)) {
      const segments = splitLinks(value)
      expect(segments.map((segment) => segment.content).join("")).toBe(value)
      for (const { href } of segments) {
        if (!href) continue
        expect(href).not.toMatch(/[.,;:!?]$/)
        expect(href).not.toMatch(/\)$/)
        expect(href).toMatch(/^(https?:\/\/|mailto:)/)
      }
    }
  })

  it.each(documents)("finds at least one link in the %s", (_name, document) => {
    const hrefs = stringsIn(document).flatMap((value) =>
      splitLinks(value).flatMap((segment) => (segment.href ? [segment.href] : [])),
    )
    expect(hrefs.length).toBeGreaterThan(0)
  })
})
