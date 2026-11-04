import { Children, type ReactElement } from "react"
import { StyleSheet } from "react-native"
import { fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { CARD_SYMBOL_FONT, COIN_FACES, SYMBOL_ADVANCE, SYMBOL_LAYERS } from "./cardSymbolGlyphs"
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

  it("draws each symbol as stacked glyphs in the symbol font, then one advance", () => {
    const view = render(
      <ThemeProvider initialContext="dark">
        <CardSymbolText game="mtg" text="Pay {G/W/P}." />
      </ThemeProvider>,
    )
    const [symbol] = view.UNSAFE_root.findAll(
      (node) => StyleSheet.flatten(node.props.style)?.fontFamily === CARD_SYMBOL_FONT,
    )
    const layers = Children.toArray(symbol.props.children)
    expect(layers.at(-1)).toBe(SYMBOL_ADVANCE)
    expect(
      layers.slice(0, -1).map((layer) => {
        const { props } = layer as ReactElement<{ children: string; style: { color: string } }>
        return [props.children, props.style.color]
      }),
    ).toEqual([
      [SYMBOL_LAYERS.discUpper, "#5FB97A"],
      [COIN_FACES.leaf.upper, "#140D10"],
      [SYMBOL_LAYERS.discLower, "#F2E6C9"],
      [COIN_FACES.sun.lower, "#140D10"],
      [SYMBOL_LAYERS.phyrexianDot, "#140D10"],
      [SYMBOL_LAYERS.phyrexianHeart, "#E25563"],
    ])
  })
})

describe("CardSymbolText keywords", () => {
  it("links keywords that end in punctuation", () => {
    const onPressKeyword = jest.fn()
    const view = render(
      <ThemeProvider initialContext="dark">
        <CardSymbolText
          game="mtg"
          text="For Mirrodin! (When this Equipment enters, create a 2/2 red Rebel.)"
          keywords={["For Mirrodin!"]}
          onPressKeyword={onPressKeyword}
        />
      </ThemeProvider>,
    )
    fireEvent.press(view.getByText("For Mirrodin!"))
    expect(onPressKeyword.mock.calls[0]?.[0]).toBe("For Mirrodin!")
  })
})
