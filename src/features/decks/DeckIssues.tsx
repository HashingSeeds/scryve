import { useMemo } from "react"
import { View } from "react-native"
import type { ViewStyle } from "react-native"

import type { FocusedCardDetails } from "@/components/CardFocusDialog"
import { Text } from "@/components/Text"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import type { DeckCard } from "./deckCards"
import { useDeckCardDetails } from "./useDeckCardDetails"
import { deckFormatLabel } from "../../../convex/lib/deckGames"
import {
  deckIssues,
  readsCardDetails,
  type CardFacets,
  type DeckIssue,
} from "../../../convex/lib/deckRules"

function isFacet(value: unknown): value is CardFacets[number] {
  return (
    typeof value === "object" &&
    value !== null &&
    "key" in value &&
    typeof value.key === "string" &&
    "value" in value &&
    typeof value.value === "string"
  )
}

function parseFacets(serialized: string | undefined): CardFacets {
  if (serialized === undefined) return []
  try {
    const facets: unknown = JSON.parse(serialized)
    return Array.isArray(facets) ? facets.filter(isFacet) : []
  } catch {
    return []
  }
}

/** why: catalog cards send facets, while Magic's Scryfall details carry the same facts as named fields. */
function readFacets(details: FocusedCardDetails | undefined): CardFacets | undefined {
  if (!details) return undefined
  const named = {
    "typeLine": details.typeLine,
    "oracleText": details.oracleText,
    "colorIdentity": details.colorIdentity,
    "legality:commander": details.commanderLegality,
  }
  return [
    ...parseFacets(details.facets),
    ...Object.entries(named).flatMap(([key, value]) =>
      value === undefined ? [] : [{ key, value }],
    ),
  ]
}

export function useDeckIssues(game: string, format: string, cards: readonly DeckCard[]) {
  const { detailsFor } = useDeckCardDetails(game, cards, readsCardDetails(game, format))
  return useMemo(
    () => deckIssues(game, format, cards, (card) => readFacets(detailsFor(card))),
    [game, format, cards, detailsFor],
  )
}

type IssueLabels = { section: (id: string) => string; format: (id: string) => string }

export function deckIssueText(issue: DeckIssue, labels: IssueLabels) {
  const sectionLabel = labels.section
  switch (issue.code) {
    case "size": {
      const { count: have, target, exact } = issue
      const values = {
        sections: issue.sections.map(sectionLabel).join(" + "),
        have,
        target,
        diff: Math.abs(have - target),
      }
      if (have < target)
        return translate(exact ? "decks:issues.sizeUnder" : "decks:issues.sizeAtLeast", values)
      return translate(exact ? "decks:issues.sizeOver" : "decks:issues.sizeAtMost", values)
    }
    case "copies":
      return translate("decks:issues.copies", {
        card: issue.name,
        have: issue.count,
        max: issue.max,
        diff: issue.count - issue.max,
      })
    case "unique":
      return translate("decks:issues.unique", {
        section: sectionLabel(issue.section),
        card: issue.name,
        have: issue.count,
        diff: issue.count - 1,
      })
    case "domain":
      return translate("decks:issues.domain", {
        card: issue.name,
        domains: issue.domains.join(", "),
        identity: issue.identity.join(", "),
      })
    case "champion":
      return issue.champion.length > 0
        ? translate("decks:issues.champion", {
            card: issue.name,
            champion: issue.champion.join(", "),
          })
        : translate("decks:issues.championUnit", { card: issue.name })
    case "signatureCount":
      return translate("decks:issues.signatureCount", {
        have: issue.count,
        max: issue.max,
        diff: issue.count - issue.max,
      })
    case "signatureChampion":
      return translate("decks:issues.signatureChampion", { card: issue.name })
    case "legality":
      return translate(
        issue.status === "banned" ? "decks:issues.banned" : "decks:issues.notLegal",
        { card: issue.name, format: labels.format(issue.format) },
      )
    case "colorIdentity":
      return translate("decks:issues.colorIdentity", {
        card: issue.name,
        colors: issue.colors,
        identity: issue.identity || translate("decks:issues.colorless"),
      })
  }
}

export function DeckIssues({
  game,
  issues,
  sectionLabel,
}: {
  game: string
  issues: readonly DeckIssue[]
  sectionLabel: (id: string) => string
}) {
  const { themed } = useAppTheme()
  if (issues.length === 0) return null
  const labels: IssueLabels = {
    section: sectionLabel,
    format: (format) => deckFormatLabel(game, format),
  }
  return (
    <View style={themed($issues)} testID="deck-issues">
      {issues.map((issue, index) => (
        <Text key={index} size="xs" text={deckIssueText(issue, labels)} />
      ))}
    </View>
  )
}

const $issues: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xxs,
  paddingTop: spacing.md,
})
