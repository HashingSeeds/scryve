import { render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { Text, type TextProps } from "./Text"

jest.mock("@/i18n", () => ({ ...jest.requireActual("@/i18n"), isRTL: true }))

function contentOf(props: TextProps) {
  const view = render(
    <ThemeProvider initialContext="dark">
      <Text testID="text" {...props} />
    </ThemeProvider>,
  )
  return view.getByTestId("text").props.children
}

describe("Text in a right-to-left language", () => {
  it("isolates an all-Latin label so its punctuation stays in order", () => {
    expect(contentOf({ text: "Yu-Gi-Oh!" })).toBe("⁦Yu-Gi-Oh!⁩")
  })

  it("leaves Arabic text and copyable codes as they are", () => {
    expect(contentOf({ text: "اللعب" })).toBe("اللعب")
    expect(contentOf({ text: "ABC123", selectable: true })).toBe("ABC123")
  })
})
