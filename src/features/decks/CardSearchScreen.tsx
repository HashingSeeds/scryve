import { useEffect, useState } from "react"
import { Modal, ScrollView, TouchableOpacity, View } from "react-native"
import type { ViewStyle } from "react-native"
import { useConvex, useConvexConnectionState } from "convex/react"
import type { FunctionReturnType } from "convex/server"

import type { FocusedCardDetails } from "@/components/CardFocusDialog"
import { COMMANDER_COLORS } from "@/components/CardFocusDialog"
import { CardImage } from "@/components/CardImage"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { SelectField } from "@/components/SelectField"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { convexErrorMessage } from "@/utils/convexError"

import { loadCardDetails, saveCardDetails } from "./cardDetailsCache"
import { cardDetailsKey, printingKey, type CommanderColor, type DeckCard } from "./deckCards"
import type { KnownCardEntry } from "./deckVersionsCache"
import type { GuestDeckPayload } from "./guestDeck"
import { api } from "../../../convex/_generated/api"
import { deckSections } from "../../../convex/lib/deckGames"

type SearchCard = FunctionReturnType<typeof api.cards.search>[number]

export function CardSearchScreen({
  game,
  format,
  onAdd,
  onClose,
  offlineCandidates,
  initialSection,
  commanderCards,
  onChooseCommander,
}: {
  game: string
  format: string
  onAdd: (card: GuestDeckPayload["cards"][number]) => string | undefined
  onClose: () => void
  /**
   * The account's fully-cached cards to search while offline. Offline adds draw from
   * this index only — never the catalog and never a name-only candidate.
   */
  offlineCandidates?: KnownCardEntry[]
  initialSection?: string
  commanderCards?: DeckCard[]
  onChooseCommander?: (card: DeckCard) => void
}) {
  const convex = useConvex()
  const connection = useConvexConnectionState()
  const { themed, theme } = useAppTheme()
  const sections = deckSections(game, format)
  const [section, setSection] = useState(
    initialSection ?? sections.find((item) => item.id === "main")?.id ?? sections[0]?.id ?? "main",
  )
  const choosingCommander = game === "mtg" && format === "commander" && section === "commander"
  const [commanderColor, setCommanderColor] = useState<CommanderColor>()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchCard[]>()
  const [offlineResults, setOfflineResults] = useState<KnownCardEntry[]>()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string>()

  const offline = connection?.isWebSocketConnected === false
  const [cachedRules, setCachedRules] = useState(() => loadCardDetails())
  const [colorFilter, setColorFilter] = useState<string>()
  const [checkingDeck, setCheckingDeck] = useState(false)
  const [rulesAttempt, setRulesAttempt] = useState(0)
  const [rulesError, setRulesError] = useState<string>()

  function eligible(details?: FocusedCardDetails) {
    return (
      (details?.commanderEligibility === "eligible" ||
        details?.commanderEligibility === "color-choice") &&
      details.commanderLegality === "legal"
    )
  }

  function matchesColor(details?: FocusedCardDetails) {
    if (!colorFilter) return true
    if (colorFilter === "C")
      return details?.colorIdentity === "" && details.commanderEligibility !== "color-choice"
    return (
      details?.colorIdentity?.includes(colorFilter) ||
      details?.commanderEligibility === "color-choice"
    )
  }

  function inDeck(card: { name: string; oracleId?: string }) {
    return commanderCards?.some((entry) =>
      entry.oracleId && card.oracleId ? entry.oracleId === card.oracleId : entry.name === card.name,
    )
  }

  useEffect(() => {
    const cardsToCheck = commanderCards ?? []
    const client = convex
    if (!choosingCommander || !cardsToCheck?.length || offline || !client) return
    let active = true
    async function checkDeck() {
      setCheckingDeck(true)
      setRulesError(undefined)
      const cached = loadCardDetails()
      const missing = cardsToCheck.filter((card) => {
        const details = cached[cardDetailsKey(card, game)]
        return (
          !details?.commanderEligibility ||
          !details.commanderLegality ||
          details.colorIdentity === undefined
        )
      })
      try {
        const items = missing.flatMap((card) =>
          card.scryfallId ? [{ key: cardDetailsKey(card, game), scryfallId: card.scryfallId }] : [],
        )
        if (items.length) {
          const found = await client.query(api.cards.detailsBatch, { game, items })
          if (!active) return
          for (const entry of found) cached[entry.key] = entry.details
          saveCardDetails(cached)
          setCachedRules({ ...cached })
        }
        for (const card of missing) {
          const key = cardDetailsKey(card, game)
          if (
            cached[key]?.commanderEligibility &&
            cached[key]?.commanderLegality &&
            cached[key]?.colorIdentity !== undefined
          )
            continue
          const id =
            card.scryfallId ??
            [card.printingId, card.providerCardId].find(
              (value) => value && /^[0-9a-f-]{36}$/i.test(value),
            )
          if (!id) continue
          const details = await client.action(api.cards.byId, { scryfallId: id })
          if (!active) return
          cached[key] = details
          saveCardDetails({ [key]: details })
          setCachedRules({ ...cached })
        }
      } catch (cause) {
        if (active)
          setRulesError(convexErrorMessage(cause, "Could not check all cards in this deck."))
      } finally {
        if (active) setCheckingDeck(false)
      }
    }
    void checkDeck()
    return () => {
      active = false
    }
  }, [convex, game, commanderCards, choosingCommander, offline, rulesAttempt])

  useEffect(() => {
    let active = true
    setResults(undefined)
    setOfflineResults(undefined)
    setMessage(undefined)
    const searchQuery = choosingCommander
      ? query.slice(0, 80).replace(/[()"]/g, " ").trim()
      : query.trim()
    setBusy(searchQuery.length >= 2)
    if (searchQuery.length < 2) return
    if (offline) {
      setBusy(false)
      const wanted = searchQuery.toLowerCase()
      const cached = loadCardDetails()
      setCachedRules(cached)
      setResults(undefined)
      setOfflineResults(
        (offlineCandidates ?? []).filter((entry) => {
          const rules = cached[cardDetailsKey(entry.card, game)]
          return (
            entry.card.name.toLowerCase().includes(wanted) &&
            (!choosingCommander ||
              ((rules?.commanderEligibility === "eligible" ||
                rules?.commanderEligibility === "color-choice") &&
                rules.commanderLegality === "legal"))
          )
        }),
      )
      return
    }
    setOfflineResults(undefined)
    const timer = setTimeout(async () => {
      try {
        if (!convex) throw new Error("Card search unavailable")
        const found = await convex.action(api.cards.search, {
          game,
          query: choosingCommander
            ? `(${searchQuery}) is:commander f:commander${colorFilter ? (colorFilter === "C" ? " id:c" : ` (id>=${colorFilter.toLowerCase()} or o:"choose a color")`) : ""}`
            : searchQuery,
        })
        if (active) setResults(found)
      } catch (cause) {
        if (active)
          setMessage(
            convexErrorMessage(
              cause,
              "Could not search cards. Check your connection and try again.",
            ),
          )
      } finally {
        if (active) setBusy(false)
      }
    }, 350)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [convex, game, query, offline, offlineCandidates, choosingCommander, colorFilter])

  function add(card: SearchCard) {
    if ("scryfallId" in card) {
      saveCardDetails({ [card.scryfallId]: card })
      setCachedRules((current) => ({ ...current, [card.scryfallId]: card }))
    }
    const error = onAdd({
      name: card.name,
      quantity: 1,
      section,
      ...(choosingCommander && commanderColor ? { commanderColor } : {}),
      imageUrl: card.imageUrl,
      smallImageUrl: card.smallImageUrl,
      ...("scryfallId" in card
        ? { scryfallId: card.scryfallId, oracleId: card.oracleId }
        : {
            game: card.game,
            cardId: card.cardId,
            printingId: card.printingId,
            providerCardId: card.providerCardId,
            identityNamespace: card.identityNamespace,
            category: card.category,
          }),
    })
    setMessage(error ?? `Added ${card.name}.`)
    if (!error) setCommanderColor(undefined)
  }

  function addOffline(entry: KnownCardEntry) {
    const error = onAdd({
      ...entry.card,
      quantity: 1,
      section,
      ...(choosingCommander ? { commanderColor } : {}),
    })
    setMessage(error ?? `Added ${entry.card.name}.`)
    if (!error) setCommanderColor(undefined)
  }

  const catalogResults = results?.filter(
    (card) =>
      !choosingCommander ||
      ("scryfallId" in card && eligible(card) && matchesColor(card) && !inDeck(card)),
  )
  const cachedCandidates = offlineResults?.filter(
    (entry) =>
      !choosingCommander ||
      (!inDeck(entry.card) && matchesColor(cachedRules[cardDetailsKey(entry.card, game)])),
  )

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <Screen
        preset="fixed"
        safeAreaEdges={["bottom"]}
        backgroundColor={theme.colors.surface}
        contentContainerStyle={$screen}
      >
        <Header
          title={initialSection === "commander" ? "Choose commander" : "Add cards"}
          leftIcon="back"
          onLeftPress={onClose}
          rightText="Done"
          onRightPress={onClose}
          backgroundColor={theme.colors.surface}
        />
        <View style={themed($search)}>
          <TextField
            testID="card-search-input"
            accessibilityLabel="Search cards"
            placeholder="Search by card name"
            value={query}
            maxLength={choosingCommander ? 80 : 120}
            autoCorrect={false}
            autoFocus={!choosingCommander}
            returnKeyType="search"
            onChangeText={setQuery}
          />
          {initialSection !== "commander" ? (
            <SelectField
              label="Add to"
              options={sections}
              value={section}
              onSelect={(value) => {
                if (value) setSection(value)
              }}
            />
          ) : null}
          {choosingCommander ? (
            <SelectField
              testID="commander-color-filter"
              label="Color identity"
              options={[...COMMANDER_COLORS, { id: "C", label: "Colorless" }]}
              value={colorFilter}
              placeholder="All colors"
              clearLabel="All colors"
              onSelect={setColorFilter}
            />
          ) : null}
          {choosingCommander &&
          (catalogResults?.some(
            (card) =>
              "commanderEligibility" in card && card.commanderEligibility === "color-choice",
          ) ||
            cachedCandidates?.some(
              (entry) =>
                cachedRules[cardDetailsKey(entry.card, game)]?.commanderEligibility ===
                "color-choice",
            )) ? (
            <SelectField
              testID="search-commander-color"
              label="Commander color"
              options={COMMANDER_COLORS}
              value={commanderColor}
              onSelect={(color) =>
                setCommanderColor(COMMANDER_COLORS.find((option) => option.id === color)?.id)
              }
            />
          ) : null}
        </View>
        <ScrollView
          style={$results}
          contentContainerStyle={themed($search)}
          keyboardShouldPersistTaps="handled"
        >
          {choosingCommander ? <Text weight="medium" text="In this deck" /> : null}
          {checkingDeck ? <Text size="sm" text="Checking commander eligibility…" /> : null}
          {rulesError ? (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Retry commander eligibility"
              onPress={() => setRulesAttempt((current) => current + 1)}
            >
              <Text text={`${rulesError} Tap to retry.`} />
            </TouchableOpacity>
          ) : null}
          {choosingCommander && onChooseCommander
            ? commanderCards
                ?.filter((card) => {
                  const cached = cachedRules[cardDetailsKey(card, game)]
                  return eligible(cached) && matchesColor(cached)
                })
                .map((card) => (
                  <TouchableOpacity
                    key={printingKey(card)}
                    accessibilityRole="button"
                    accessibilityLabel={`Choose ${card.name} as commander`}
                    style={themed($result)}
                    onPress={() => onChooseCommander(card)}
                  >
                    <CardImage
                      game={game}
                      source={card.smallImageUrl ?? card.imageUrl}
                      compact
                      style={$image}
                      accessibilityLabel={card.name}
                    />
                    <Text size="sm" text={card.name} style={$name} />
                  </TouchableOpacity>
                ))
            : null}
          {choosingCommander &&
          !checkingDeck &&
          !commanderCards?.some(
            (card) =>
              eligible(cachedRules[cardDetailsKey(card, game)]) &&
              matchesColor(cachedRules[cardDetailsKey(card, game)]),
          ) ? (
            <Text size="sm" text="No eligible commanders in this deck." />
          ) : null}
          {choosingCommander ? (
            <Text weight="medium" text={offline ? "Cached cards" : "Scryfall"} />
          ) : null}
          {choosingCommander && query.trim().length < 2 ? (
            <Text
              size="sm"
              text={
                offline ? "Search cached commanders by name." : "Search Scryfall for a commander."
              }
            />
          ) : null}
          {busy ? <Text size="sm" text="Searching…" /> : null}
          {offline ? (
            <Text size="xxs" text="You’re offline. Searching cards already in your decks." />
          ) : null}
          {cachedCandidates?.map((entry, index) => (
            <View key={index} style={themed($result)}>
              <View style={$name}>
                <Text size="sm" weight="medium" text={entry.card.name} />
                <Text size="xxs" text={`From your cached decks · ${entry.game ?? game}`} />
              </View>
              <TouchableOpacity
                style={$add}
                accessibilityRole="button"
                accessibilityLabel={`Add ${entry.card.name} to deck`}
                onPress={() => addOffline(entry)}
              >
                <Text size="sm" style={{ color: theme.colors.brandText }} text="+ Add" />
              </TouchableOpacity>
            </View>
          ))}
          {offline && cachedCandidates?.length === 0 ? (
            <Text text="No cached cards match. Cards appear here after you add them online." />
          ) : null}
          {catalogResults?.map((card, index) => (
            <View key={index} style={themed($result)}>
              <CardImage
                game={game}
                source={card.smallImageUrl ?? card.imageUrl}
                accessibilityLabel={card.name}
                compact
                style={$image}
              />
              <View style={$name}>
                <Text size="sm" weight="medium" text={card.name} />
                <Text size="xxs" text={"scryfallId" in card ? card.typeLine : card.typeLabel} />
              </View>
              <TouchableOpacity
                style={$add}
                accessibilityRole="button"
                accessibilityLabel={`Add ${card.name} to deck`}
                onPress={() => add(card)}
              >
                <Text size="sm" style={{ color: theme.colors.brandText }} text="+ Add" />
              </TouchableOpacity>
            </View>
          ))}
          {catalogResults?.length === 0 ? <Text text="No cards found." /> : null}
          {message ? <Text accessibilityLiveRegion="polite" text={message} /> : null}
        </ScrollView>
      </Screen>
    </Modal>
  )
}
const $screen: ViewStyle = { flex: 1 }
const $results: ViewStyle = { flex: 1 }
const $name: ViewStyle = { flex: 1 }
const $image = { width: 38, height: 53 } as const
const $add: ViewStyle = {
  minHeight: 44,
  minWidth: 60,
  justifyContent: "center",
  alignItems: "flex-end",
}
const $search: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  padding: spacing.md,
  gap: spacing.sm,
  width: "100%",
  maxWidth: 720,
  alignSelf: "center",
})
const $result: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  minHeight: 76,
  paddingVertical: spacing.xs,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
