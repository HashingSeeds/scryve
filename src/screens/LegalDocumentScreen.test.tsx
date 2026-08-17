import { render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { LegalDocumentScreen } from "./LegalDocumentScreen"

describe("LegalDocumentScreen", () => {
  it("renders placeholder copy for the requested document", () => {
    const view = render(
      <ThemeProvider initialContext="dark">
        <LegalDocumentScreen
          document={{
            title: "Privacy Policy",
            sections: [
              {
                blocks: [
                  { type: "paragraph", text: "Last updated August 14, 2026" },
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
          }}
          onBack={jest.fn()}
        />
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
})
