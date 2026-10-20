import { Fragment } from "react"
import { useWindowDimensions, View, type ViewStyle } from "react-native"
import Svg, { Circle, ClipPath, Defs, G, Path, Text as SvgText } from "react-native-svg"

import { $sizeStyles, Text, type TextProps } from "@/components/Text"
import type { TxKeyPath } from "@/i18n"
import { translate } from "@/i18n/translate"
import { typography } from "@/theme/typography"

import { LUCIDE, PHOSPHOR, type IconName } from "./cardSymbolIcons"
import { isSystemId, type SystemId } from "../../convex/lib/systems"

type LineArt = { kind: "line"; icon: IconName; color: string; letter?: string }
type CoinArt = {
  kind: "coin"
  fill: string
  icon?: IconName
  text?: string
  ink?: string
  outline?: string
}
type HybridArt = { kind: "hybrid"; halves: readonly [CoinArt, CoinArt] }
type SymbolArt = LineArt | CoinArt | HybridArt | { kind: "phyrexian"; base: CoinArt | HybridArt }
type CardSymbol = { art: SymbolArt; label: string }

const INK = "#140D10"
const GENERIC_FILL = "#CFC8C3"
const TAP_FILL = "#D7CEC9"

const FAB_SYMBOLS: Partial<Record<string, { art: LineArt; label: TxKeyPath }>> = {
  p: { art: { kind: "line", icon: "sword", color: "#E8743B" }, label: "decks:cardSymbols.power" },
  d: {
    art: { kind: "line", icon: "shield", color: "#7FA6C9" },
    label: "decks:cardSymbols.defense",
  },
  h: { art: { kind: "line", icon: "heart", color: "#E25563" }, label: "decks:cardSymbols.life" },
  r: {
    art: { kind: "line", icon: "hexagon", color: "#F2B544", letter: "R" },
    label: "decks:cardSymbols.resource",
  },
  c: { art: { kind: "line", icon: "wind", color: "#5CC3B0" }, label: "decks:cardSymbols.chi" },
  i: {
    art: { kind: "line", icon: "brain", color: "#A38BD6" },
    label: "decks:cardSymbols.intellect",
  },
  t: { art: { kind: "line", icon: "redo", color: TAP_FILL }, label: "decks:cardSymbols.tap" },
  u: { art: { kind: "line", icon: "undo", color: TAP_FILL }, label: "decks:cardSymbols.untap" },
  x: {
    art: { kind: "line", icon: "hexagon", color: "#F2B544", letter: "X" },
    label: "decks:cardSymbols.variableResource",
  },
}

const MAGIC_SYMBOLS: Partial<Record<string, { art: CoinArt; label: TxKeyPath }>> = {
  W: { art: { kind: "coin", fill: "#F2E6C9", icon: "sun" }, label: "decks:cardSymbols.white" },
  U: { art: { kind: "coin", fill: "#6FA8DC", icon: "waves" }, label: "decks:cardSymbols.blue" },
  B: { art: { kind: "coin", fill: "#9C948F", icon: "skull" }, label: "decks:cardSymbols.black" },
  R: { art: { kind: "coin", fill: "#E5604A", icon: "flame" }, label: "decks:cardSymbols.red" },
  G: { art: { kind: "coin", fill: "#5FB97A", icon: "leaf" }, label: "decks:cardSymbols.green" },
  C: {
    art: { kind: "coin", fill: GENERIC_FILL, icon: "diamond" },
    label: "decks:cardSymbols.colorless",
  },
  T: { art: { kind: "coin", fill: TAP_FILL, icon: "redo" }, label: "decks:cardSymbols.tap" },
  Q: {
    art: { kind: "coin", fill: INK, ink: TAP_FILL, outline: TAP_FILL, icon: "undo" },
    label: "decks:cardSymbols.untap",
  },
  E: { art: { kind: "coin", fill: "#F2C94C", icon: "zap" }, label: "decks:cardSymbols.energy" },
  S: { art: { kind: "coin", fill: "#BFE3F2", icon: "snowflake" }, label: "decks:cardSymbols.snow" },
}

function fabSymbol(token: string): CardSymbol | undefined {
  const symbol = FAB_SYMBOLS[token]
  return symbol && { art: symbol.art, label: translate(symbol.label) }
}

function magicMana(part: string): { art: CoinArt; label: string } | undefined {
  if (/^(\d+|X|Y|Z)$/.test(part)) {
    return {
      art: { kind: "coin", fill: GENERIC_FILL, text: part },
      label: translate("decks:cardSymbols.generic", { amount: part }),
    }
  }
  const symbol = MAGIC_SYMBOLS[part]
  return symbol && { art: symbol.art, label: translate(symbol.label) }
}

function magicSymbol(token: string): CardSymbol | undefined {
  const parts = token.split("/")
  const phyrexian = parts.length > 1 && parts.at(-1) === "P"
  const manaParts = phyrexian ? parts.slice(0, -1) : parts
  const mana = manaParts.map(magicMana)
  const [first, second] = mana
  if (!first || mana.length > 2 || mana.some((part) => !part)) return undefined

  const paid: { art: CoinArt | HybridArt; label: string } = second
    ? {
        art: { kind: "hybrid", halves: [first.art, second.art] },
        label: translate("decks:cardSymbols.either", { first: first.label, second: second.label }),
      }
    : first
  if (!phyrexian) return paid
  return {
    art: { kind: "phyrexian", base: paid.art },
    label: translate("decks:cardSymbols.orLife", { mana: paid.label }),
  }
}

const SYMBOL_READERS: Partial<Record<SystemId, (token: string) => CardSymbol | undefined>> = {
  fab: fabSymbol,
  mtg: magicSymbol,
}

const TOKEN = /(\{[^}]+\})/

function readToken(game: string | undefined, part: string): CardSymbol | undefined {
  if (!isSystemId(game) || !part.startsWith("{") || !part.endsWith("}")) return undefined
  return SYMBOL_READERS[game]?.(part.slice(1, -1))
}

export function spokenCardText(game: string | undefined, text: string) {
  return text.split(TOKEN).reduce((spoken, part) => {
    const label = readToken(game, part)?.label
    if (label === undefined) return spoken + part
    return spoken === "" || /\s$/.test(spoken) ? spoken + label : `${spoken} ${label}`
  }, "")
}

const isPhosphor = (icon: IconName): icon is keyof typeof PHOSPHOR => icon in PHOSPHOR

function Icon({ icon, color, width = 2 }: { icon: IconName; color: string; width?: number }) {
  if (isPhosphor(icon)) {
    return (
      <G transform="scale(0.09375)">
        <Path d={PHOSPHOR[icon]} fill={color} />
      </G>
    )
  }
  return (
    <G stroke={color} strokeWidth={width} fill="none" strokeLinecap="round" strokeLinejoin="round">
      {LUCIDE[icon].map((d) => (
        <Path key={d} d={d} />
      ))}
    </G>
  )
}

/** why: Rubik draws "1" with its flag on the left, so centering the advance width leaves the ink off-center. */
function opticalNudge(text: string) {
  if (text === "1") return 0.36
  return text.startsWith("1") ? 0.22 : 0
}

function CoinFace({ coin }: { coin: CoinArt }) {
  const ink = coin.ink ?? INK
  return (
    <>
      <Circle cx={12} cy={12} r={12} fill={coin.fill} />
      {coin.outline ? (
        <Circle cx={12} cy={12} r={11.25} fill="none" stroke={coin.outline} strokeWidth={1.5} />
      ) : null}
      {coin.icon ? (
        <G transform="translate(12 12) scale(0.62) translate(-12 -12)">
          <Icon icon={coin.icon} color={ink} width={2.6} />
        </G>
      ) : (
        <SvgText
          x={12 + opticalNudge(coin.text ?? "")}
          y={16.9}
          textAnchor="middle"
          fontSize={14}
          fontFamily={typography.primary.semiBold}
          fill={ink}
        >
          {coin.text}
        </SvgText>
      )}
    </>
  )
}

function HybridFace({ halves }: { halves: HybridArt["halves"] }) {
  return (
    <>
      <Defs>
        <ClipPath id="upper">
          <Path d="M0 0H24L0 24Z" />
        </ClipPath>
        <ClipPath id="lower">
          <Path d="M24 0V24H0Z" />
        </ClipPath>
      </Defs>
      <G clipPath="url(#upper)">
        <CoinFace coin={halves[0]} />
      </G>
      <G clipPath="url(#lower)">
        <CoinFace coin={halves[1]} />
      </G>
    </>
  )
}

function SymbolGlyph({ art }: { art: SymbolArt }) {
  switch (art.kind) {
    case "line":
      return (
        <>
          <Icon icon={art.icon} color={art.color} />
          {art.letter ? (
            <SvgText
              x={12}
              y={15.6}
              textAnchor="middle"
              fontSize={10}
              fontFamily={typography.primary.bold}
              fill={art.color}
            >
              {art.letter}
            </SvgText>
          ) : null}
        </>
      )
    case "coin":
      return <CoinFace coin={art} />
    case "hybrid":
      return <HybridFace halves={art.halves} />
    case "phyrexian":
      return (
        <>
          <SymbolGlyph art={art.base} />
          <Circle cx={19} cy={19} r={5} fill={INK} />
          <G transform="translate(19 19.3) scale(0.3) translate(-12 -12)">
            <Icon icon="heart" color="#E25563" width={4} />
          </G>
        </>
      )
  }
}

export interface CardSymbolTextProps extends Omit<TextProps, "children" | "tx"> {
  game: string | undefined
  text: string
}

/** why: Text grows with the system font size but inline Views do not, so glyphs must apply the same scale and cap. */
function textScale(fontScale: number, maxFontSizeMultiplier: number | null | undefined) {
  return maxFontSizeMultiplier && maxFontSizeMultiplier >= 1
    ? Math.min(fontScale, maxFontSizeMultiplier)
    : fontScale
}

export function CardSymbolText({ game, text, size, ...rest }: CardSymbolTextProps) {
  const { fontScale } = useWindowDimensions()
  const glyphSize = Math.round(
    $sizeStyles[size ?? "sm"].fontSize * 1.1 * textScale(fontScale, rest.maxFontSizeMultiplier),
  )
  const $glyph: ViewStyle = {
    width: glyphSize,
    height: glyphSize,
    marginHorizontal: 1,
    transform: [{ translateY: glyphSize * 0.18 }],
  }
  const parts = text.split(TOKEN)
  return (
    <Text size={size} accessibilityLabel={spokenCardText(game, text)} {...rest}>
      {parts.map((part, index) => {
        const symbol = readToken(game, part)
        if (!symbol) return <Fragment key={index}>{part}</Fragment>
        return (
          <View key={index} style={$glyph}>
            <Svg width={glyphSize} height={glyphSize} viewBox="0 0 24 24">
              <SymbolGlyph art={symbol.art} />
            </Svg>
          </View>
        )
      })}
    </Text>
  )
}
