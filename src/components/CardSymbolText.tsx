import { Fragment } from "react"
// why: glyph spans must inherit the paragraph's size and line height, and the Text wrapper resets both to its presets.
// eslint-disable-next-line no-restricted-imports
import { Text as RNText, type GestureResponderEvent, type TextStyle } from "react-native"

import { Text, type TextProps } from "@/components/Text"
import type { TxKeyPath } from "@/i18n"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import {
  CARD_SYMBOL_FONT,
  COIN_FACES,
  LINE_SYMBOLS,
  SYMBOL_ADVANCE,
  SYMBOL_LAYERS,
} from "./cardSymbolGlyphs"
import { isSystemId, type SystemId } from "../../convex/lib/systems"

type Layer = readonly [glyph: string, color?: string]
type CardSymbol = { layers: readonly Layer[]; label: string }
type CoinFace = keyof typeof COIN_FACES
type Coin = { fill: string; face: CoinFace; ink?: string; outline?: string }

const INK = "#140D10"
const GENERIC_FILL = "#CFC8C3"
const TAP_FILL = "#D7CEC9"

function coinLayers({ fill, face, ink = INK, outline }: Coin): Layer[] {
  const ring: Layer[] = outline ? [[SYMBOL_LAYERS.ring, outline]] : []
  return [[SYMBOL_LAYERS.disc, fill], ...ring, [COIN_FACES[face].whole, ink]]
}

function hybridLayers(upper: Coin, lower: Coin): Layer[] {
  return [
    [SYMBOL_LAYERS.discUpper, upper.fill],
    [COIN_FACES[upper.face].upper, upper.ink ?? INK],
    [SYMBOL_LAYERS.discLower, lower.fill],
    [COIN_FACES[lower.face].lower, lower.ink ?? INK],
  ]
}

const PHYREXIAN_LAYERS: Layer[] = [
  [SYMBOL_LAYERS.phyrexianDot, INK],
  [SYMBOL_LAYERS.phyrexianHeart, "#E25563"],
]

const line = (glyph: keyof typeof LINE_SYMBOLS, color?: string): Layer[] => [
  [LINE_SYMBOLS[glyph], color],
]

const isCoinText = (part: string): part is CoinFace =>
  /^(\d+|X|Y|Z)$/.test(part) && part in COIN_FACES

const FAB_SYMBOLS: Partial<Record<string, { layers: Layer[]; label: TxKeyPath }>> = {
  p: { layers: line("sword", "#E8743B"), label: "decks:cardSymbols.power" },
  d: { layers: line("shield", "#7FA6C9"), label: "decks:cardSymbols.defense" },
  h: { layers: line("heart", "#E25563"), label: "decks:cardSymbols.life" },
  r: { layers: line("hexagonR", "#F2B544"), label: "decks:cardSymbols.resource" },
  c: { layers: line("wind", "#5CC3B0"), label: "decks:cardSymbols.chi" },
  i: { layers: line("brain", "#A38BD6"), label: "decks:cardSymbols.intellect" },
  t: { layers: line("redo", TAP_FILL), label: "decks:cardSymbols.tap" },
  u: { layers: line("undo", TAP_FILL), label: "decks:cardSymbols.untap" },
  x: { layers: line("hexagonX", "#F2B544"), label: "decks:cardSymbols.variableResource" },
}

const MAGIC_SYMBOLS: Partial<Record<string, { coin: Coin; label: TxKeyPath }>> = {
  W: { coin: { fill: "#F2E6C9", face: "sun" }, label: "decks:cardSymbols.white" },
  U: { coin: { fill: "#6FA8DC", face: "waves" }, label: "decks:cardSymbols.blue" },
  B: { coin: { fill: "#9C948F", face: "skull" }, label: "decks:cardSymbols.black" },
  R: { coin: { fill: "#E5604A", face: "flame" }, label: "decks:cardSymbols.red" },
  G: { coin: { fill: "#5FB97A", face: "leaf" }, label: "decks:cardSymbols.green" },
  C: { coin: { fill: GENERIC_FILL, face: "diamond" }, label: "decks:cardSymbols.colorless" },
  T: { coin: { fill: TAP_FILL, face: "redo" }, label: "decks:cardSymbols.tap" },
  Q: {
    coin: { fill: INK, ink: TAP_FILL, outline: TAP_FILL, face: "undo" },
    label: "decks:cardSymbols.untap",
  },
  E: { coin: { fill: "#F2C94C", face: "zap" }, label: "decks:cardSymbols.energy" },
  S: { coin: { fill: "#BFE3F2", face: "snowflake" }, label: "decks:cardSymbols.snow" },
}

function fabSymbol(token: string): CardSymbol | undefined {
  const symbol = FAB_SYMBOLS[token]
  return symbol && { layers: symbol.layers, label: translate(symbol.label) }
}

const RIFTBOUND_DOMAINS: Partial<Record<string, Coin>> = {
  fury: { fill: "#E5604A", face: "flame" },
  calm: { fill: "#5FB97A", face: "leaf" },
  mind: { fill: "#6FA8DC", face: "brain" },
  body: { fill: "#E89A3C", face: "shield" },
  chaos: { fill: "#A07AD1", face: "zap" },
  order: { fill: "#F2C94C", face: "sun" },
}

function riftboundSymbol(token: string): CardSymbol | undefined {
  if (isCoinText(token))
    return {
      layers: coinLayers({ fill: GENERIC_FILL, face: token }),
      label: translate("decks:cardSymbols.energyAmount", { amount: token }),
    }
  if (token === "might")
    return { layers: line("sword", "#E8743B"), label: translate("decks:cardSymbols.might") }
  if (token === "exhaust")
    return {
      layers: coinLayers({ fill: TAP_FILL, face: "redo" }),
      label: translate("decks:cardSymbols.exhaust"),
    }
  if (token === "rainbow")
    return {
      layers: coinLayers({ fill: GENERIC_FILL, face: "diamond" }),
      label: translate("decks:cardSymbols.anyPower"),
    }
  const domain = RIFTBOUND_DOMAINS[token]
  return (
    domain && {
      layers: coinLayers(domain),
      label: translate("decks:cardSymbols.domainPower", {
        domain: token[0].toUpperCase() + token.slice(1),
      }),
    }
  )
}

function magicMana(part: string): { coin: Coin; label: string } | undefined {
  if (isCoinText(part)) {
    return {
      coin: { fill: GENERIC_FILL, face: part },
      label: translate("decks:cardSymbols.generic", { amount: part }),
    }
  }
  const symbol = MAGIC_SYMBOLS[part]
  return symbol && { coin: symbol.coin, label: translate(symbol.label) }
}

function magicSymbol(token: string): CardSymbol | undefined {
  const parts = token.split("/")
  const phyrexian = parts.length > 1 && parts.at(-1) === "P"
  const manaParts = phyrexian ? parts.slice(0, -1) : parts
  const mana = manaParts.map(magicMana)
  const [first, second] = mana
  if (!first || mana.length > 2 || mana.some((part) => !part)) return undefined

  const paid: CardSymbol = second
    ? {
        layers: hybridLayers(first.coin, second.coin),
        label: translate("decks:cardSymbols.either", { first: first.label, second: second.label }),
      }
    : { layers: coinLayers(first.coin), label: first.label }
  if (!phyrexian) return paid
  return {
    layers: [...paid.layers, ...PHYREXIAN_LAYERS],
    label: translate("decks:cardSymbols.orLife", { mana: paid.label }),
  }
}

/** why: printed Lorcana cards draw these in the text's own ink, so they take its color. */
const LORCANA_SYMBOLS: Partial<
  Record<string, { glyph: keyof typeof LINE_SYMBOLS; label: TxKeyPath }>
> = {
  "⬡": { glyph: "hexagon", label: "decks:cardSymbols.ink" },
  "◊": { glyph: "diamond", label: "decks:cardSymbols.lore" },
  "¤": { glyph: "sword", label: "decks:cardSymbols.strength" },
  "⛉": { glyph: "shield", label: "decks:cardSymbols.willpower" },
  "⟳": { glyph: "redo", label: "decks:cardSymbols.exert" },
  "◉": { glyph: "inkwell", label: "decks:cardSymbols.inkwell" },
}

function lorcanaSymbol(token: string): CardSymbol | undefined {
  const symbol = LORCANA_SYMBOLS[token]
  return symbol && { layers: line(symbol.glyph), label: translate(symbol.label) }
}

const SYMBOL_READERS: Partial<Record<SystemId, (token: string) => CardSymbol | undefined>> = {
  fab: fabSymbol,
  lorcana: lorcanaSymbol,
  mtg: magicSymbol,
  riftbound: riftboundSymbol,
}

/** why: LorcanaJSON writes its symbols as these characters, not braced codes. Splitting puts every token at an odd index. */
const TOKEN = /(\{[^}]+\}|[⬡◊¤⛉⟳◉])/

function readToken(game: string | undefined, part: string, index: number) {
  if (index % 2 === 0 || !isSystemId(game)) return undefined
  return SYMBOL_READERS[game]?.(part.startsWith("{") ? part.slice(1, -1) : part)
}

export function spokenCardText(game: string | undefined, text: string) {
  return text.split(TOKEN).reduce((spoken, part, index) => {
    const label = readToken(game, part, index)?.label
    if (label === undefined) return spoken + part
    return spoken === "" || /\s$/.test(spoken) ? spoken + label : `${spoken} ${label}`
  }, "")
}

export interface CardSymbolTextProps extends Omit<TextProps, "children" | "tx"> {
  game: string | undefined
  text: string
  keywords?: readonly string[]
  activeKeyword?: string
  onPressKeyword?: (keyword: string, event?: GestureResponderEvent) => void
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

function keywordPattern(keywords: readonly string[] | undefined) {
  if (!keywords?.length) return undefined
  const names = [...keywords].sort((a, b) => b.length - a.length).map(escapeRegExp)
  return new RegExp(`\\b(${names.join("|")})(?!\\w)`, "i")
}

/** why: symbols are font glyphs because inline views landed at different heights per platform and per line. */
export function CardSymbolText({
  game,
  text,
  size,
  keywords,
  activeKeyword,
  onPressKeyword,
  ...rest
}: CardSymbolTextProps) {
  const { themed } = useAppTheme()
  const pattern = onPressKeyword ? keywordPattern(keywords) : undefined
  const keywordOf = (match: string) =>
    keywords?.find((keyword) => keyword.toLowerCase() === match.toLowerCase()) ?? match
  return (
    <Text
      size={size}
      accessibilityLabel={spokenCardText(game, text)}
      accessibilityActions={
        pattern
          ? keywords?.map((keyword) => ({
              name: keyword,
              label: translate("decks:cardFocus.defineKeyword", { keyword }),
            }))
          : undefined
      }
      onAccessibilityAction={(event) => onPressKeyword?.(event.nativeEvent.actionName)}
      {...rest}
    >
      {text.split(TOKEN).map((part, index) => {
        const symbol = readToken(game, part, index)
        if (!symbol && pattern)
          return (
            <Fragment key={index}>
              {part.split(pattern).map((piece, pieceIndex) => {
                if (pieceIndex % 2 === 0) return piece
                const keyword = keywordOf(piece)
                return (
                  <Text
                    key={pieceIndex}
                    size={size}
                    style={[themed($keyword), keyword === activeKeyword && themed($activeKeyword)]}
                    onPress={(event) => onPressKeyword?.(keyword, event)}
                    text={piece}
                  />
                )
              })}
            </Fragment>
          )
        if (!symbol) return <Fragment key={index}>{part}</Fragment>
        return (
          <RNText key={index} style={$symbolFont}>
            {symbol.layers.map(([glyph, color], layer) => (
              <RNText key={layer} style={color && { color }}>
                {glyph}
              </RNText>
            ))}
            {SYMBOL_ADVANCE}
          </RNText>
        )
      })}
    </Text>
  )
}

const $symbolFont: TextStyle = { fontFamily: CARD_SYMBOL_FONT }
const $keyword: ThemedStyle<TextStyle> = ({ colors }) => ({
  textDecorationLine: "underline",
  textDecorationStyle: "dotted",
  textDecorationColor: colors.tint,
})
const $activeKeyword: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.tint })
