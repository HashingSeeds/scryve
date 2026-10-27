import { translate } from "@/i18n/translate"

import { cardSection, printingKey, type DeckCard } from "./deckCards"

export type CommanderSelectionDetails = {
  commanderEligibility?: string
  commanderLegality?: string
  colorIdentity?: string
  typeLine?: string
  oracleText?: string
  keywords?: string
}

type CommanderCandidate = { name: string; details?: CommanderSelectionDetails }

function pairingAbilities(details?: CommanderSelectionDetails) {
  return new Set(
    (details?.oracleText ?? details?.keywords ?? "").split("\n").map((line) =>
      line
        .replace(/\s*\(.*$/, "")
        .replace(/\u2019/g, "'")
        .trim()
        .toLowerCase(),
    ),
  )
}

export function isBackground(details?: CommanderSelectionDetails) {
  return /\bBackground\b/.test(details?.typeLine ?? "")
}

export function formsCommanderPair(first: CommanderCandidate, second: CommanderCandidate) {
  if (first.name === second.name) return false
  const own = pairingAbilities(first.details)
  const other = pairingAbilities(second.details)
  const doctor = (card: CommanderCandidate) =>
    /\bTime Lord Doctor\b/.test(card.details?.typeLine ?? "")
  const both = (ability: string) => own.has(ability) && other.has(ability)
  return (
    both("partner") ||
    both("friends forever") ||
    (own.has(`partner with ${second.name.toLowerCase()}`) &&
      other.has(`partner with ${first.name.toLowerCase()}`)) ||
    (own.has("choose a background") && isBackground(second.details)) ||
    (other.has("choose a background") && isBackground(first.details)) ||
    (own.has("doctor's companion") && doctor(second)) ||
    (other.has("doctor's companion") && doctor(first))
  )
}

export function selectCommander<T extends DeckCard>(
  cards: readonly T[],
  selectedKey: string,
  detailsFor: (card: T) => CommanderSelectionDetails | undefined,
  commanderColor?: string,
): { cards: T[]; warnings: string[] } | { error: string } {
  const commanders = cards.filter((card) => cardSection(card) === "commander")
  const pairs = (first: T, second: T, secondDetails = detailsFor(second)) =>
    formsCommanderPair(
      { name: first.name, details: detailsFor(first) },
      { name: second.name, details: secondDetails },
    )
  const selected = cards.find((card) => printingKey(card) === selectedKey)
  const commanderCount = commanders.reduce((count, card) => count + card.quantity, 0)
  if (
    commanderCount > 2 ||
    (commanderCount === 2 &&
      (commanders.length !== 2 ||
        !pairs(commanders[0], commanders[1]) ||
        !selected ||
        !commanders.includes(selected)))
  ) {
    return { error: translate("decks:commander.multipleUnsupported") }
  }
  if (!selected || selected.quantity < 1)
    return { error: translate("decks:commander.chooseCardInDeck") }
  const details = detailsFor(selected)
  const partner = commanders.find((card) => card !== selected && pairs(card, selected, details))
  const joinsAsBackground = partner !== undefined && isBackground(details)
  if (details?.commanderEligibility === "ineligible" && !joinsAsBackground) {
    return { error: translate("decks:commander.ineligible") }
  }
  if (
    !details ||
    (!joinsAsBackground &&
      details.commanderEligibility !== "eligible" &&
      details.commanderEligibility !== "color-choice")
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
    } else if (cardSection(card) === "commander" && card !== partner) {
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
  const commanderKey = printingKey({ ...selected, section: "commander" })
  return {
    cards: nextCards,
    warnings: getCommanderWarnings(nextCards, (card) =>
      printingKey(card) === commanderKey ? details : detailsFor(card),
    ),
  }
}

export function getCommanderWarnings<T extends DeckCard>(
  cards: readonly T[],
  detailsFor: (card: T) => CommanderSelectionDetails | undefined,
): string[] {
  const commanders = cards.filter((card) => cardSection(card) === "commander")
  if (
    commanders.length === 0 ||
    commanders.length > 2 ||
    commanders.some((card) => card.quantity !== 1)
  )
    return []
  const commanderDetails = commanders.map(detailsFor)
  if (!commanderDetails.every((details) => details !== undefined))
    return [translate("decks:commander.detailsMissing")]
  const warnings: string[] = []
  const copies = (commander: T) =>
    cards
      .filter((card) =>
        commander.oracleId && card.oracleId
          ? card.oracleId === commander.oracleId
          : card.name === commander.name,
      )
      .reduce((count, card) => count + card.quantity, 0)
  if (commanders.some((commander) => copies(commander) > 1)) {
    warnings.push(translate("decks:commander.duplicateCommander"))
  }
  const identity = commanderDetails
    .map(
      (details, index) =>
        `${details.colorIdentity ?? ""}${details.commanderEligibility === "color-choice" ? (commanders[index].commanderColor ?? "") : ""}`,
    )
    .join("")
  const identityKnown = commanderDetails.every((details) => details.colorIdentity !== undefined)
  let incomplete = !identityKnown
  const conflicts: string[] = []
  for (const card of cards) {
    if (cardSection(card) !== "main") continue
    const colorIdentity = detailsFor(card)?.colorIdentity
    if (colorIdentity === undefined) incomplete = true
    else if (identityKnown && [...colorIdentity].some((color) => !identity.includes(color)))
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
