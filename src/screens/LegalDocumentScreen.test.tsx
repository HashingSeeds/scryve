import { fireEvent, render } from "@testing-library/react-native"

import type { LegalDocumentContent } from "@/content/legal"
import { ThemeProvider } from "@/theme/context"

import { LegalDocumentScreen } from "./LegalDocumentScreen"

const document = {
  id: "privacy",
  title: "Privacy Policy",
  version: "2026-08-14",
  effectiveDate: "August 14, 2026",
  sections: [
    {
      blocks: [
        { type: "paragraph", text: "Read more." },
        { type: "list", items: ["First item", "Second item"] },
      ],
    },
    {
      heading: "Information",
      blocks: [
        { type: "paragraph", text: "THIS IS LEGAL TEXT" },
        { type: "table", rows: ["Name Value"] },
      ],
    },
  ],
} satisfies LegalDocumentContent

function scrollTo(view: ReturnType<typeof render>, y: number) {
  fireEvent.scroll(view.getByTestId("legal-document-scroll"), {
    nativeEvent: { contentOffset: { y }, contentSize: { height: 2000 }, layoutMeasurement: {} },
  })
}

describe("LegalDocumentScreen", () => {
  it("renders placeholder copy for the requested document", () => {
    const view = render(
      <ThemeProvider initialContext="dark">
        <LegalDocumentScreen document={document} onBack={jest.fn()} />
      </ThemeProvider>,
    )

    expect(view.getByText("Privacy Policy")).toBeTruthy()
    expect(view.getByText("Last updated August 14, 2026")).toBeTruthy()
    expect(view.getByText("Read more.")).toBeTruthy()
    expect(view.getByText("First item")).toBeTruthy()
    expect(view.getByText("Name Value")).toBeTruthy()
    expect(view.getByText("Information")).toBeTruthy()
    expect(view.getByText("THIS IS LEGAL TEXT")).toBeTruthy()
  })

  it("keeps the back button reachable and reveals the title once scrolled past the heading", () => {
    const onBack = jest.fn()
    const view = render(
      <ThemeProvider initialContext="dark">
        <LegalDocumentScreen document={document} onBack={onBack} />
      </ThemeProvider>,
    )

    expect(view.getAllByText("Privacy Policy")).toHaveLength(1)

    scrollTo(view, 400)
    expect(view.getAllByText("Privacy Policy")).toHaveLength(2)

    scrollTo(view, 0)
    expect(view.getAllByText("Privacy Policy")).toHaveLength(1)

    fireEvent.press(view.getByText(/^(Back|common:back)$/))
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
