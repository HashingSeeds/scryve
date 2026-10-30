import { useEffect, useMemo, useRef, useState } from "react"
import { View } from "react-native"
import type { TextStyle, ViewStyle } from "react-native"
import { useConvex } from "convex/react"

import { Text } from "@/components/Text"
import { TextAction } from "@/components/TextAction"
import { useConvexOnline } from "@/features/connected/useConvexOnline"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import { radius } from "@/theme/radius"
import type { ThemedStyle } from "@/theme/types"

import { fetchCardDetails, loadCardDetails } from "./cardDetailsCache"
import { analyzeDeck, CURVE_BUCKETS, type DeckAnalysis, type ManaColor } from "./deckAnalysis"
import { cardDetailsKey, type DeckCard } from "./deckCards"
import { systemDefinition } from "../../../convex/lib/systems"

const MANA_DOT: Record<ManaColor, string> = {
  W: "#D9C98C",
  U: "#5AA7E0",
  B: "#9C8C99",
  R: "#E2624B",
  G: "#4FB477",
}

const CURVE_HEIGHT = 72

export function useDeckAnalysis(game: string, format: string, cards: DeckCard[]) {
  const enabled = systemDefinition(game)?.deckAnalysis === true
  const client = useConvex()
  const online = useConvexOnline()
  const [details, setDetails] = useState(loadCardDetails)
  const requested = useRef(new Set<string>())
  useEffect(() => {
    if (!enabled || !online) return
    const pending = cards.filter((card) => {
      const key = cardDetailsKey(card, game)
      if (requested.current.has(key)) return false
      requested.current.add(key)
      return true
    })
    if (pending.length === 0) return
    fetchCardDetails(client, game, pending)
      .then(() => setDetails(loadCardDetails()))
      .catch(() => {
        for (const card of pending) requested.current.delete(cardDetailsKey(card, game))
      })
  }, [client, enabled, game, cards, online])
  return useMemo(() => {
    if (!enabled) return undefined
    const detailsFor = (card: DeckCard) => details[cardDetailsKey(card, game)]
    return { detailsFor, analysis: analyzeDeck({ cards, format, details: detailsFor }) }
  }, [enabled, cards, format, details, game])
}

export function DeckAnalysisPanel({
  analysis,
  onChooseCommander,
}: {
  analysis: DeckAnalysis
  onChooseCommander?: () => void
}) {
  const { themed } = useAppTheme()
  const tallest = Math.max(1, ...analysis.curve)

  return (
    <View testID="deck-analysis" style={themed($panel)}>
      {analysis.incomplete || analysis.needsCommander ? (
        <View style={themed($group)}>
          {analysis.incomplete ? (
            <Text
              size="xs"
              tone="dim"
              tx="decks:analysis.incomplete"
              txOptions={analysis.incomplete}
              testID="deck-analysis-incomplete"
            />
          ) : null}
          {analysis.needsCommander ? (
            <View style={$row}>
              <Text
                size="xs"
                tone="dim"
                tx="decks:analysis.noCommander"
                testID="deck-analysis-no-commander"
              />
              {onChooseCommander ? (
                <TextAction
                  testID="deck-analysis-choose-commander"
                  accessibilityLabel={translate("decks:cardRow.chooseCommander")}
                  tx="decks:cardRow.choose"
                  size="xs"
                  style={$choose}
                  onPress={onChooseCommander}
                />
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={themed($group)}>
        <View style={$between}>
          <Text size="sm" weight="medium" tx="decks:analysis.curve" />
          <Text
            size="xs"
            tone="dim"
            style={$tabular}
            tx="decks:analysis.average"
            txOptions={{ value: analysis.averageManaValue.toFixed(2) }}
          />
        </View>
        <View style={themed($curve)} testID="deck-analysis-curve">
          {analysis.curve.map((count, value) => (
            <View key={value} style={themed($column)}>
              <Text size="xxs" tone="dim" style={$tabular} text={count > 0 ? String(count) : ""} />
              <View
                style={[
                  themed($bar),
                  { height: Math.max(count > 0 ? 2 : 0, (count / tallest) * CURVE_HEIGHT) },
                ]}
              />
              <Text
                size="xxs"
                tone="dim"
                style={$tabular}
                text={value === CURVE_BUCKETS - 1 ? `${value}+` : String(value)}
              />
            </View>
          ))}
        </View>
      </View>

      <View style={themed($group)}>
        <Line
          label={translate("decks:analysis.lands")}
          value={
            analysis.modalLands > 0
              ? translate("decks:analysis.landsWithModal", {
                  lands: analysis.lands,
                  modal: analysis.modalLands,
                })
              : String(analysis.lands)
          }
          testID="deck-analysis-lands"
        />
        {analysis.suggestedLands ? (
          <Line
            label={translate("decks:analysis.suggested")}
            value={translate("decks:analysis.range", analysis.suggestedLands)}
            testID="deck-analysis-suggested"
          />
        ) : null}
        <Line
          label={translate("decks:analysis.ramp")}
          value={String(analysis.ramp)}
          testID="deck-analysis-ramp"
        />
        <Line
          label={translate("decks:analysis.cheapDraw")}
          value={String(analysis.cheapDraw)}
          testID="deck-analysis-cheap-draw"
        />
      </View>

      {analysis.colors.length > 0 ? (
        <View style={themed($group)} testID="deck-analysis-colors">
          <View style={$colorRow}>
            <Text size="sm" weight="medium" tx="decks:analysis.colors" style={$flex} />
            <Text size="xs" tone="dim" style={$cell} tx="decks:analysis.pips" />
            <Text size="xs" tone="dim" style={$cell} tx="decks:analysis.sources" />
          </View>
          {analysis.colors.map(({ color, pips, sources }) => (
            <View key={color} style={$colorRow} testID={`deck-analysis-color-${color}`}>
              <View style={[$flex, $row]}>
                <View style={[$dot, { backgroundColor: MANA_DOT[color] }]} />
                <Text size="sm" tx={`decks:analysis.color.${color}`} />
              </View>
              <Text size="sm" style={[$cell, $tabular]} text={String(pips)} />
              <Text size="sm" style={[$cell, $tabular]} text={String(sources)} />
            </View>
          ))}
        </View>
      ) : null}

      {analysis.landDrops.length > 0 ? (
        <View style={themed($group)} testID="deck-analysis-land-drops">
          <Text
            size="sm"
            weight="medium"
            tx={analysis.onThePlay ? "decks:analysis.landDropsOnPlay" : "decks:analysis.landDrops"}
          />
          <Odds
            cells={analysis.landDrops.map(({ turn, chance }) => ({
              label: translate("decks:analysis.turn", { turn }),
              chance,
            }))}
          />
        </View>
      ) : null}

      {analysis.mulligans ? (
        <View style={themed($group)} testID="deck-analysis-mulligans">
          <Text size="sm" weight="medium" tx="decks:analysis.openingHand" />
          <Odds
            cells={[
              { label: translate("decks:analysis.keepSeven"), chance: analysis.mulligans.keep },
              { label: translate("decks:analysis.mulligan"), chance: analysis.mulligans.once },
              {
                label: translate("decks:analysis.mulliganTwice"),
                chance: analysis.mulligans.twice,
              },
            ]}
          />
          {analysis.freeMulligan ? (
            <Text size="xs" tone="dim" tx="decks:analysis.freeMulligan" />
          ) : null}
        </View>
      ) : null}

      {analysis.missing > 0 ? (
        <Text
          size="xs"
          tone="dim"
          tx="decks:analysis.missing"
          txOptions={{ count: analysis.missing }}
          testID="deck-analysis-missing"
        />
      ) : null}
      {analysis.suggestedLands ? <Text size="xxs" tone="dim" tx="decks:analysis.credit" /> : null}
    </View>
  )
}

function Odds({ cells }: { cells: { label: string; chance: number }[] }) {
  return (
    <View style={$row}>
      {cells.map(({ label, chance }) => (
        <View key={label} style={$flex}>
          <Text size="xxs" tone="dim" text={label} />
          <Text size="sm" weight="medium" style={$tabular} text={`${Math.round(chance * 100)}%`} />
        </View>
      ))}
    </View>
  )
}

function Line({ label, value, testID }: { label: string; value: string; testID: string }) {
  return (
    <View style={$between} testID={testID}>
      <Text size="sm" tone="dim" text={label} />
      <Text size="sm" weight="medium" style={$tabular} text={value} />
    </View>
  )
}

const $flex: ViewStyle = { flex: 1 }
const $row: ViewStyle = { flexDirection: "row", alignItems: "center", gap: 6 }
const $between: ViewStyle = {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "baseline",
}
const $tabular: TextStyle = { fontVariant: ["tabular-nums"] }
const $dot: ViewStyle = { width: 10, height: 10, borderRadius: radius.full }
const $panel: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingVertical: spacing.md,
  gap: spacing.lg,
})
const $group: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $choose: ViewStyle = {
  minWidth: 44,
  minHeight: 44,
  alignItems: "center",
  justifyContent: "center",
}
const $curve: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "flex-end",
  gap: spacing.xs,
})
const $column: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  alignItems: "center",
  justifyContent: "flex-end",
  gap: spacing.xxxs,
  minHeight: CURVE_HEIGHT + 32,
})
const $bar: ThemedStyle<ViewStyle> = ({ colors, radius }) => ({
  alignSelf: "stretch",
  backgroundColor: colors.tint,
  borderRadius: radius.xxs,
})
const $colorRow: ViewStyle = { flexDirection: "row", alignItems: "center" }
const $cell: TextStyle = { width: 64, textAlign: "right" }
