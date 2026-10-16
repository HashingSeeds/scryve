import { translate } from "@/i18n/translate"

import { cardSection, printingKey, type DeckCard } from "./deckCards"

export type CommanderSelectionDetails = {
  commanderEligibility?: string
  commanderLegality?: string
  colorIdentity?: string
}

export function selectCommander<T extends DeckCard>(
  cards: readonly T[],
  selectedKey: string,
  detailsFor: (card: T) => CommanderSelectionDetails | undefined,
  commanderColor?: string,
): { cards: T[]; warnings: string[] } | { error: string } {
  if (
    cards.reduce(
      (count, card) => count + (cardSection(card) === "commander" ? card.quantity : 0),
      0,
    ) > 1
  ) {
    return { error: translate("decks:commander.multipleUnsupported") }
  }
  const selected = cards.find((card) => printingKey(card) === selectedKey)
  if (!selected || selected.quantity < 1)
    return { error: translate("decks:commander.chooseCardInDeck") }
  const details = detailsFor(selected)
  if (details?.commanderEligibility === "ineligible") {
    return { error: translate("decks:commander.ineligible") }
  }
  if (
    details?.commanderEligibility !== "eligible" &&
    details?.commanderEligibility !== "color-choice"
  ) {
    return { error: translate("decks:commander.eligibilityUnchecked") }
  }
  if (details.commanderLegality !== "legal") {
    return {
      error:
        details.commanderLegality === "banned"
          ? translate("decks:commander.banned")
          : translate("decks:commander.legalityUnconfirmed"),
    }
  }
  if (details.commanderEligibility === "color-choice" && !/^[WUBRG]$/.test(commanderColor ?? "")) {
    return { error: translate("decks:commander.chooseColor") }
  }

  const result: T[] = []
  for (const card of cards) {
    if (card === selected) {
      if (card.quantity > 1) {
        const section = cardSection(card)
        const remaining = {
          ...card,
          quantity: card.quantity - 1,
          section,
          board:
            section === "main" || section === "sideboard" || section === "commander"
              ? section
              : undefined,
        }
        delete remaining.commanderColor
        result.push(remaining)
      }
      result.push({
        ...card,
        quantity: 1,
        section: "commander",
        board: "commander",
        commanderColor:
          details.commanderEligibility === "color-choice" ? commanderColor : undefined,
      })
    } else if (cardSection(card) === "commander") {
      const demoted = { ...card, section: "main", board: "main" as const }
      delete demoted.commanderColor
      result.push(demoted)
    } else {
      result.push({ ...card })
    }
  }
  const merged = new Map<string, T>()
  for (const card of result) {
    const key = printingKey(card)
    const existing = merged.get(key)
    merged.set(key, existing ? { ...existing, quantity: existing.quantity + card.quantity } : card)
  }
  const nextCards = [...merged.values()]
  if (nextCards.some((card) => card.quantity > 999)) {
    return { error: translate("decks:commander.copyLimit") }
  }
  return {
    cards: nextCards,
    warnings: getCommanderWarnings(nextCards, (card) =>
      cardSection(card) === "commander" ? details : detailsFor(card),
    ),
  }
}

export function getCommanderWarnings<T extends DeckCard>(
  cards: readonly T[],
  detailsFor: (card: T) => CommanderSelectionDetails | undefined,
): string[] {
  const commanders = cards.filter((card) => cardSection(card) === "commander")
  if (commanders.length !== 1 || commanders[0].quantity !== 1) return []
  const commander = commanders[0]
  const details = detailsFor(commander)
  if (!details) return [translate("decks:commander.detailsMissing")]
  const warnings: string[] = []
  const sameCard = cards.filter((card) =>
    commander.oracleId && card.oracleId
      ? card.oracleId === commander.oracleId
      : card.name === commander.name,
  )
  if (sameCard.reduce((count, card) => count + card.quantity, 0) > 1) {
    warnings.push(translate("decks:commander.duplicateCommander"))
  }
  const identity = `${details.colorIdentity ?? ""}${details.commanderEligibility === "color-choice" ? (commander.commanderColor ?? "") : ""}`
  let incomplete = details.colorIdentity === undefined
  const conflicts: string[] = []
  for (const card of cards) {
    if (cardSection(card) !== "main") continue
    const colorIdentity = detailsFor(card)?.colorIdentity
    if (colorIdentity === undefined) incomplete = true
    else if (
      details.colorIdentity !== undefined &&
      [...colorIdentity].some((color) => !identity.includes(color))
    )
      conflicts.push(card.name)
  }
  if (conflicts.length > 0) {
    const names = [...new Set(conflicts)]
    const shown = names.slice(0, 3).join(", ")
    warnings.push(
      names.length > 3
        ? translate("decks:commander.colorIdentityConflictMore", {
            names: shown,
            count: names.length - 3,
          })
        : translate("decks:commander.colorIdentityConflict", { names: shown }),
    )
  }
  if (incomplete) warnings.push(translate("decks:commander.detailsMissing"))
  return warnings
}

export function addCommander<T extends DeckCard>(
  cards: readonly T[],
  card: T,
  detailsFor: (card: T) => CommanderSelectionDetails | undefined,
  commanderColor?: string,
) {
  const printing = printingKey({ ...card, section: "main", board: "main" })
  const existing =
    cards.find((entry) => printingKey({ ...entry, section: "main", board: "main" }) === printing) ??
    cards.find((entry) =>
      card.oracleId && entry.oracleId ? card.oracleId === entry.oracleId : card.name === entry.name,
    )
  if (existing)
    return selectCommander(
      cards,
      printingKey(existing),
      (entry) => (entry === existing ? (detailsFor(card) ?? detailsFor(entry)) : detailsFor(entry)),
      commanderColor,
    )
  const added = { ...card, quantity: 1, section: "main", board: "main" as const }
  return selectCommander([...cards, added], printingKey(added), detailsFor, commanderColor)
}
