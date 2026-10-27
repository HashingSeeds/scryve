import { Dimensions } from "react-native"
import { render } from "@testing-library/react-native"
import Svg from "react-native-svg"

import { ThemeProvider } from "@/theme/context"

import { CardSymbolText, spokenCardText } from "./CardSymbolText"

describe("spokenCardText", () => {
  it("reads Flesh and Blood tokens as words", () => {
    expect(
      spokenCardText("fab", "Attack Reaction - {t}, remove a +1{p} counter: Gain {r}{r}"),
    ).toBe("Attack Reaction - tap, remove a +1 power counter: Gain resource resource")
  })

  it("reads Magic costs, hybrids, and Phyrexian mana", () => {
    expect(spokenCardText("mtg", "{1}{B}{B}, {T}: Draw a card.")).toBe(
      "1 generic mana black mana black mana, tap: Draw a card.",
    )
    expect(spokenCardText("mtg", "{W/U}{2/R}{G/P}{W/U/P}")).toBe(
      "white mana or blue mana 2 generic mana or red mana green mana or 2 life white mana or blue mana or 2 life",
    )
  })

  it("reads Riftbound energy, power, Might, and exhaust", () => {
    expect(spokenCardText("riftbound", "{exhaust}, {2}{fury}{rainbow}: +1 {might}")).toBe(
      "exhaust, 2 energy Fury power power of any domain: +1 Might",
    )
  })

  it("leaves unknown tokens and other systems' text as printed", () => {
    expect(spokenCardText("mtg", "{CHAOS}: Add {H}.")).toBe("{CHAOS}: Add {H}.")
    expect(spokenCardText("ygo", "{T}: Add {G}.")).toBe("{T}: Add {G}.")
    expect(spokenCardText(undefined, "{r}")).toBe("{r}")
  })
})

describe("CardSymbolText", () => {
  it("draws known tokens as glyphs and keeps the words readable", () => {
    const view = render(
      <ThemeProvider initialContext="dark">
        <CardSymbolText game="mtg" testID="rules" text="{T}: Add {G}." />
      </ThemeProvider>,
    )
    const rules = view.getByTestId("rules")
    expect(rules.props.accessibilityLabel).toBe("tap: Add green mana.")
    expect(view.queryByText(/\{T\}|\{G\}/)).toBeNull()
  })

  it("grows glyphs with the system font size up to the text's cap", () => {
    const window = Dimensions.get("window")
    Dimensions.set({ window: { ...window, fontScale: 2 } })
    const view = render(
      <ThemeProvider initialContext="dark">
        <CardSymbolText game="mtg" text="{T}" />
        <CardSymbolText game="mtg" text="{T}" maxFontSizeMultiplier={1.5} />
      </ThemeProvider>,
    )
    const widths = view.UNSAFE_getAllByType(Svg).map((svg) => svg.props.width)
    Dimensions.set({ window })
    expect(widths).toEqual([35, 26])
  })
})
