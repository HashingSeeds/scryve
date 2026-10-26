import { useEffect, useState } from "react"
import { Keyboard, Modal, Platform, ScrollView, TouchableOpacity, View } from "react-native"
import type { ViewStyle } from "react-native"
import { isSupported as canReadText } from "expo-text-extractor"
import { useConvex, useConvexConnectionState } from "convex/react"
import type { FunctionReturnType } from "convex/server"

import { Button } from "@/components/Button"
import type { FocusedCardDetails } from "@/components/CardFocusDialog"
import {
  CardFocusDialog,
  COMMANDER_COLORS,
  cardColorIdentityLabel,
  colorLabel,
} from "@/components/CardFocusDialog"
import { CardImage } from "@/components/CardImage"
import { DialogCard, $dialogActions, $dialogButton } from "@/components/DialogCard"
import { FilterPill, FilterGroup, FilterButton } from "@/components/FilterPill"
import { Header } from "@/components/Header"
import { RetryableError } from "@/components/RetryableError"
import { Screen } from "@/components/Screen"
import { SelectField } from "@/components/SelectField"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { LocalGameRepository } from "@/features/game/localPersistence"
import { localizedDeckSections } from "@/features/game/playSystems"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { convexErrorMessage, convexRetryAfterMs } from "@/utils/convexError"
import { loadString, saveString } from "@/utils/storage"

import { loadCardDetails, saveCardDetails } from "./cardDetailsCache"
import { CardScanner } from "./CardScanner"
import { cardDetailsKey, printingKey, type CommanderColor, type DeckCard } from "./deckCards"
import type { KnownCardEntry } from "./deckVersionsCache"
import type { GuestDeckPayload } from "./guestDeck"
import { useCardDetails } from "./useCardDetails"
import { api } from "../../../convex/_generated/api"
import { picksCommander, systemDefinition } from "../../../convex/lib/systems"

type SearchCard = FunctionReturnType<typeof api.cards.search>[number]

const SCRYFALL = "Scryfall"
const SEARCH_COLORS = [...COMMANDER_COLORS, "C"] as const
const CAN_SCAN = Platform.OS !== "web" && canReadText

function scryfallQuery({
  text,
  commander,
  colors,
  exactColors,
  keywords,
}: {
  text: string
  commander: boolean
  colors: string[]
  exactColors: boolean
  keywords: string[]
}) {
  const identity = colors.includes("C")
    ? "id:c"
    : colors.length
      ? `id${exactColors ? "=" : ">="}${colors.join("").toLowerCase()}`
      : ""
  const filters = [
    commander ? "is:commander f:commander" : "",
    commander && identity && !colors.includes("C")
      ? `(${identity} or o:"choose a color")`
      : identity,
    ...keywords.map((keyword) => `kw:"${keyword.replace(/["\\]/g, "")}"`),
  ].filter(Boolean)
  if (!filters.length) return text
  const words = commander ? text.slice(0, 80).replace(/[()"]/g, " ").trim() : text
  return [words.length >= 2 ? `(${words})` : "", ...filters].filter(Boolean).join(" ")
}

export function CardSearchScreen({
  game,
  format,
  onAdd,
  onClose,
  offlineCandidates,
  initialSection,
  commanderCards,
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
}) {
  const convex = useConvex()
  const [deviceId] = useState(() => new LocalGameRepository().getDeviceId())
  const connection = useConvexConnectionState()
  const { themed, theme } = useAppTheme()
  const sections = localizedDeckSections(game, format)
  const [section, setSection] = useState(
    initialSection ?? sections.find((item) => item.id === "main")?.id ?? sections[0]?.id ?? "main",
  )
  const choosingCommander = section === "commander" && picksCommander(game, format)
  const filtersCards =
    systemDefinition(game)?.integration.capabilities.cardCatalog.provider === "scryfall"
  const imageCredit = systemDefinition(game)?.integration.rights.imageCredit
  const [candidate, setCandidate] = useState<DeckCard>()
  const [candidateError, setCandidateError] = useState<string>()
  const candidateDetails = useCardDetails(
    candidate ? { ...candidate, detailKey: cardDetailsKey(candidate, game), game } : undefined,
    true,
  )
  const [query, setQuery] = useState("")
  const [scanning, setScanning] = useState(false)
  const [scanLines, setScanLines] = useState<string[]>([])
  const [results, setResults] = useState<SearchCard[]>()
  const [offlineResults, setOfflineResults] = useState<KnownCardEntry[]>()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string>()
  const [searchError, setSearchError] = useState<{ message: string; retryAfterMs?: number }>()
  const [searchAttempt, setSearchAttempt] = useState(0)

  const offline = connection?.isWebSocketConnected === false
  const searchDelayMs = scanLines.includes(query) ? 0 : 350
  const [cachedRules, setCachedRules] = useState(() => loadCardDetails())
  const [colorFilters, setColorFilters] = useState<string[]>([])
  const [exactColors, setExactColors] = useState(true)
  const [keywords, setKeywords] = useState<string[]>([])
  const needsKeywords = keywords.length > 0
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [keywordQuery, setKeywordQuery] = useState("")
  const [keywordCatalog, setKeywordCatalog] = useState<string[]>(() => {
    try {
      const value: unknown = JSON.parse(loadString("scryve.cards.keyword-abilities.v1") ?? "null")
      return Array.isArray(value)
        ? value.filter((entry): entry is string => typeof entry === "string")
        : []
    } catch {
      return []
    }
  })
  const [keywordError, setKeywordError] = useState<string>()
  const searchRequested =
    query.trim().length >= 2 || (filtersCards && (colorFilters.length > 0 || keywords.length > 0))

  useEffect(() => {
    if (!filtersOpen || offline || !convex) return
    let active = true
    setKeywordError(undefined)
    void convex
      .action(api.cards.keywordAbilities, { deviceId })
      .then((catalog) => {
        if (!active) return
        setKeywordCatalog([...catalog].sort((a, b) => a.localeCompare(b)))
        saveString("scryve.cards.keyword-abilities.v1", JSON.stringify(catalog))
      })
      .catch(() => {
        if (active) setKeywordError(translate("decks:cardSearch.keywordsUnavailable"))
      })
    return () => {
      active = false
    }
  }, [filtersOpen, convex, offline, deviceId])
  const [checkingDeck, setCheckingDeck] = useState(false)
  const [rulesAttempt, setRulesAttempt] = useState(0)
  const [rulesError, setRulesError] = useState<string>()
  const [rulesRetryAfterMs, setRulesRetryAfterMs] = useState<number>()

  function eligible(details?: FocusedCardDetails) {
    return (
      (details?.commanderEligibility === "eligible" ||
        details?.commanderEligibility === "color-choice") &&
      details.commanderLegality === "legal"
    )
  }

  function matchesFilters(details?: FocusedCardDetails) {
    if (!keywords.every((keyword) => details?.keywords?.split("\n").includes(keyword))) return false
    if (!colorFilters.length) return true
    const canChooseColor = choosingCommander && details?.commanderEligibility === "color-choice"
    if (colorFilters.includes("C")) return details?.colorIdentity === "" && !canChooseColor
    const identity = details?.colorIdentity
    if (identity === undefined) return false
    const missing = colorFilters.filter((color) => !identity.includes(color))
    return (
      (missing.length === 0 || (canChooseColor && missing.length === 1)) &&
      (!exactColors || [...identity].every((color) => colorFilters.includes(color)))
    )
  }

  function toggleColor(color: string) {
    setColorFilters((current) =>
      color === "C"
        ? current.includes("C")
          ? []
          : ["C"]
        : current.includes(color)
          ? current.filter((value) => value !== color)
          : [...current.filter((value) => value !== "C"), color],
    )
  }

  function preview(card: DeckCard) {
    setCandidateError(undefined)
    setCandidate(card)
  }

  function inDeck(card: { name: string; oracleId?: string }) {
    return commanderCards?.some((entry) =>
      entry.oracleId && card.oracleId ? entry.oracleId === card.oracleId : entry.name === card.name,
    )
  }

  useEffect(() => {
    const cardsToCheck = commanderCards ?? []
    const client = convex
    if (!choosingCommander || !cardsToCheck?.length || offline || !client || rulesRetryAfterMs)
      return
    let active = true
    async function checkDeck() {
      setCheckingDeck(true)
      setRulesError(undefined)
      const cached = loadCardDetails()
      function hasCurrentRules(details?: FocusedCardDetails) {
        return Boolean(
          details?.commanderEligibility &&
          details.commanderLegality &&
          details.colorIdentity !== undefined &&
          Date.parse(details.commanderRulesUpdatedAt ?? "") >= Date.now() - 86_400_000 &&
          (!needsKeywords || details.keywords !== undefined),
        )
      }
      const missing = cardsToCheck.filter(
        (card) => !hasCurrentRules(cached[cardDetailsKey(card, game)]),
      )
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
          if (hasCurrentRules(cached[key])) continue
          const id =
            card.scryfallId ??
            [card.printingId, card.providerCardId].find(
              (value) => value && /^[0-9a-f-]{36}$/i.test(value),
            )
          if (!id) continue
          const details = await client.action(api.cards.byId, { scryfallId: id, deviceId })
          if (!active) return
          cached[key] = details
          saveCardDetails({ [key]: details })
          setCachedRules({ ...cached })
        }
      } catch (cause) {
        if (active) {
          setRulesError(convexErrorMessage(cause, translate("decks:cardSearch.checkFailed")))
          setRulesRetryAfterMs(convexRetryAfterMs(cause))
        }
      } finally {
        if (active) setCheckingDeck(false)
      }
    }
    void checkDeck()
    return () => {
      active = false
    }
  }, [
    convex,
    game,
    commanderCards,
    choosingCommander,
    offline,
    rulesAttempt,
    needsKeywords,
    rulesRetryAfterMs,
    deviceId,
  ])

  useEffect(() => {
    if (searchError?.retryAfterMs && !offline) return
    let active = true
    setSearchError(undefined)
    setResults(undefined)
    setOfflineResults(undefined)
    setMessage(undefined)
    setBusy(searchRequested)
    if (!searchRequested) return
    if (offline) {
      setBusy(false)
      const wanted = (
        choosingCommander ? query.slice(0, 80).replace(/[()"]/g, " ").trim() : query.trim()
      ).toLowerCase()
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
          deviceId,
          query: scryfallQuery({
            text: query.trim(),
            commander: choosingCommander,
            colors: colorFilters,
            exactColors,
            keywords,
          }),
        })
        if (active) setResults(found)
      } catch (cause) {
        if (active)
          setSearchError({
            message: convexErrorMessage(cause, translate("decks:cardSearch.searchFailed")),
            retryAfterMs: convexRetryAfterMs(cause),
          })
      } finally {
        if (active) setBusy(false)
      }
    }, searchDelayMs)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [
    convex,
    game,
    query,
    offline,
    offlineCandidates,
    choosingCommander,
    colorFilters,
    exactColors,
    keywords,
    searchRequested,
    searchAttempt,
    searchDelayMs,
    searchError?.retryAfterMs,
    deviceId,
  ])

  function searchEntry(card: SearchCard) {
    return {
      name: card.name,
      quantity: 1,
      section,
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
    }
  }

  function add(card: SearchCard) {
    if ("scryfallId" in card) {
      saveCardDetails({ [card.scryfallId]: card })
      setCachedRules((current) => ({ ...current, [card.scryfallId]: card }))
    }
    if (choosingCommander) {
      preview(searchEntry(card))
      return
    }
    const error = onAdd(searchEntry(card))
    setMessage(error ?? translate("decks:cardSearch.added", { card: card.name }))
  }

  function addOffline(entry: KnownCardEntry) {
    if (choosingCommander) {
      preview(entry.card)
      return
    }
    const error = onAdd({ ...entry.card, quantity: 1, section })
    setMessage(error ?? translate("decks:cardSearch.added", { card: entry.card.name }))
  }

  function setCommander(commanderColor?: CommanderColor) {
    if (!candidate) return
    const error = onAdd({
      ...candidate,
      quantity: 1,
      section: "commander",
      board: "commander",
      commanderColor,
    })
    if (error) {
      setCandidateError(error)
      return
    }
    setCandidate(undefined)
  }

  const catalogResults = results?.filter(
    (card) =>
      !choosingCommander ||
      ("scryfallId" in card && eligible(card) && matchesFilters(card) && !inDeck(card)),
  )
  const cachedCandidates = offlineResults?.filter(
    (entry) =>
      (!choosingCommander || !inDeck(entry.card)) &&
      (!filtersCards || matchesFilters(cachedRules[cardDetailsKey(entry.card, game)])),
  )

  const ResultRow = choosingCommander ? TouchableOpacity : View

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <Screen
        preset="fixed"
        safeAreaEdges={["bottom"]}
        backgroundColor={theme.colors.surface}
        contentContainerStyle={$screen}
      >
        <Header
          title={translate(
            choosingCommander ? "systems:section.commander" : "decks:cardSearch.title",
          )}
          leftTx="common:back"
          onLeftPress={onClose}
          rightTx="common:done"
          onRightPress={onClose}
          backgroundColor={theme.colors.surface}
        />
        <View style={[themed($search), choosingCommander ? $searchHeader : undefined]}>
          <View style={$queryRow}>
            <TextField
              testID="card-search-input"
              accessibilityLabel={translate("decks:cardSearch.searchLabel")}
              placeholderTx="decks:cardSearch.placeholder"
              value={query}
              maxLength={choosingCommander ? 80 : 120}
              autoCorrect={false}
              autoFocus={!choosingCommander}
              returnKeyType="search"
              onChangeText={setQuery}
              containerStyle={$queryField}
            />
            {CAN_SCAN ? (
              <Button
                testID="card-scan-button"
                tx="decks:cardSearch.scan"
                accessibilityLabel={translate("decks:cardSearch.scanLabel")}
                onPress={() => setScanning(true)}
              />
            ) : null}
          </View>
          {scanLines.length > 1 && catalogResults?.length === 0 ? (
            <View style={$pills}>
              {scanLines.map((line) => (
                <FilterPill
                  key={line}
                  label={line}
                  selected={query === line}
                  onPress={() => setQuery(line)}
                />
              ))}
            </View>
          ) : null}
          {initialSection !== "commander" ? (
            <SelectField
              label={translate("decks:cardSearch.addTo")}
              field="addTo"
              options={sections}
              value={section}
              onSelect={(value) => {
                if (value) setSection(value)
              }}
            />
          ) : null}
          {filtersCards ? (
            <View style={$filterRow}>
              <ScrollView
                horizontal
                style={$filterScroll}
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={[$pills, themed($colorScroll)]}
              >
                {SEARCH_COLORS.map((color) => (
                  <FilterPill
                    key={color}
                    testID={`card-color-${color}`}
                    label={colorLabel(color)}
                    selected={colorFilters.includes(color)}
                    onPress={() => toggleColor(color)}
                  />
                ))}
              </ScrollView>
              <FilterButton
                testID="card-filters-button"
                count={keywords.length + (!exactColors ? 1 : 0)}
                onPress={() => setFiltersOpen(true)}
              />
            </View>
          ) : null}
          {filtersCards && keywords.length ? (
            <View style={$pills}>
              {keywords.map((keyword) => (
                <FilterPill
                  key={keyword}
                  label={keyword}
                  selected
                  removable
                  onPress={() =>
                    setKeywords((current) => current.filter((value) => value !== keyword))
                  }
                />
              ))}
            </View>
          ) : null}
        </View>
        <ScrollView
          style={$results}
          contentContainerStyle={[themed($search), choosingCommander ? $searchResults : undefined]}
          keyboardShouldPersistTaps="handled"
        >
          {choosingCommander ? <Text weight="medium" tx="decks:cardSearch.inDeck" /> : null}
          {checkingDeck ? <Text size="sm" tx="decks:cardSearch.checking" /> : null}
          {rulesError ? (
            <RetryableError
              message={rulesError}
              retryAfterMs={rulesRetryAfterMs}
              testID="retry-commander-eligibility"
              onRetry={() => {
                setRulesRetryAfterMs(undefined)
                setRulesAttempt((current) => current + 1)
              }}
            />
          ) : null}
          {choosingCommander
            ? commanderCards
                ?.filter((card) => {
                  const cached = cachedRules[cardDetailsKey(card, game)]
                  return eligible(cached) && matchesFilters(cached)
                })
                .map((card) => (
                  <TouchableOpacity
                    key={printingKey(card)}
                    accessibilityRole="button"
                    accessibilityLabel={translate("decks:cardSearch.preview", { card: card.name })}
                    style={themed($result)}
                    onPress={() => preview(card)}
                  >
                    <CardImage
                      game={game}
                      source={card.smallImageUrl ?? card.imageUrl}
                      compact
                      style={$image}
                      accessibilityLabel={card.name}
                    />
                    <View style={$name}>
                      <Text size="sm" text={card.name} />
                      <Text
                        size="xxs"
                        text={cardColorIdentityLabel(
                          cachedRules[cardDetailsKey(card, game)],
                          card.name,
                        )}
                      />
                    </View>
                  </TouchableOpacity>
                ))
            : null}
          {choosingCommander &&
          !checkingDeck &&
          !commanderCards?.some(
            (card) =>
              eligible(cachedRules[cardDetailsKey(card, game)]) &&
              matchesFilters(cachedRules[cardDetailsKey(card, game)]),
          ) ? (
            <Text size="sm" tx="decks:cardSearch.noEligible" />
          ) : null}
          {choosingCommander ? (
            <Text
              weight="medium"
              text={offline ? translate("decks:cardSearch.cachedCards") : SCRYFALL}
            />
          ) : null}
          {choosingCommander && !searchRequested ? (
            <Text
              size="sm"
              tx={offline ? "decks:cardSearch.searchCached" : "decks:cardSearch.searchScryfall"}
            />
          ) : null}
          {busy ? <Text size="sm" tx="decks:cardSearch.searching" /> : null}
          {offline ? <Text size="xxs" tx="decks:cardSearch.offline" /> : null}
          {cachedCandidates?.map((entry, index) => (
            <ResultRow
              key={index}
              style={themed($result)}
              accessibilityRole={choosingCommander ? "button" : undefined}
              accessibilityLabel={
                choosingCommander
                  ? translate("decks:cardSearch.preview", { card: entry.card.name })
                  : undefined
              }
              onPress={choosingCommander ? () => addOffline(entry) : undefined}
            >
              <View style={$name}>
                <Text size="sm" weight="medium" text={entry.card.name} />
                <Text
                  size="xxs"
                  tx="decks:cardSearch.fromCache"
                  txOptions={{ game: entry.game ?? game }}
                />
                {choosingCommander ? (
                  <Text
                    size="xxs"
                    text={cardColorIdentityLabel(
                      cachedRules[cardDetailsKey(entry.card, game)],
                      entry.card.name,
                    )}
                  />
                ) : null}
              </View>
              {!choosingCommander ? (
                <TouchableOpacity
                  style={$add}
                  accessibilityRole="button"
                  accessibilityLabel={translate("decks:cardSearch.addCard", {
                    card: entry.card.name,
                  })}
                  onPress={() => addOffline(entry)}
                >
                  <Text
                    size="sm"
                    style={{ color: theme.colors.brandText }}
                    tx="decks:cardSearch.add"
                  />
                </TouchableOpacity>
              ) : null}
            </ResultRow>
          ))}
          {offline && cachedCandidates?.length === 0 ? (
            <Text tx="decks:cardSearch.noCached" />
          ) : null}
          {catalogResults?.map((card, index) => (
            <ResultRow
              key={index}
              style={themed($result)}
              accessibilityRole={choosingCommander ? "button" : undefined}
              accessibilityLabel={
                choosingCommander
                  ? translate("decks:cardSearch.preview", { card: card.name })
                  : undefined
              }
              onPress={choosingCommander ? () => add(card) : undefined}
            >
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
                {choosingCommander && "scryfallId" in card ? (
                  <Text size="xxs" text={cardColorIdentityLabel(card, card.name)} />
                ) : null}
              </View>
              {!choosingCommander ? (
                <TouchableOpacity
                  style={$add}
                  accessibilityRole="button"
                  accessibilityLabel={translate("decks:cardSearch.addCard", { card: card.name })}
                  onPress={() => add(card)}
                >
                  <Text
                    size="sm"
                    style={{ color: theme.colors.brandText }}
                    tx="decks:cardSearch.add"
                  />
                </TouchableOpacity>
              ) : null}
            </ResultRow>
          ))}
          {catalogResults?.length === 0 ? <Text tx="decks:cardSearch.noResults" /> : null}
          {catalogResults?.length && imageCredit ? (
            <Text size="xxs" style={{ color: theme.colors.textDim }} text={imageCredit} />
          ) : null}
          {searchError ? (
            <RetryableError
              message={searchError.message}
              retryAfterMs={searchError.retryAfterMs}
              testID="retry-card-search"
              onRetry={() => {
                setSearchError(undefined)
                setSearchAttempt((current) => current + 1)
              }}
            />
          ) : null}
          {message ? <Text accessibilityLiveRegion="polite" text={message} /> : null}
        </ScrollView>
      </Screen>
      {filtersOpen ? (
        <DialogCard
          visible
          onClose={() => setFiltersOpen(false)}
          dialogTestID="card-filters-dialog"
          backdropAccessibilityLabel={translate(
            choosingCommander ? "decks:cardSearch.dismissFilters" : "decks:shelf.dismissFilters",
          )}
        >
          <Text preset="subheading" tx="decks:filters.label" />
          <ScrollView contentContainerStyle={$filterBody} keyboardShouldPersistTaps="handled">
            <FilterGroup heading={translate("decks:cardSearch.colorMatch")}>
              <FilterPill
                label={translate("decks:cardSearch.allowAdditional")}
                selected={!exactColors}
                onPress={() => setExactColors(false)}
              />
              <FilterPill
                label={translate("decks:cardSearch.exactColors")}
                selected={exactColors}
                onPress={() => setExactColors(true)}
              />
            </FilterGroup>
            <TextField
              accessibilityLabel={translate("decks:cardSearch.searchKeywords")}
              placeholderTx="decks:cardSearch.searchKeywords"
              value={keywordQuery}
              onChangeText={setKeywordQuery}
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
              autoCorrect={false}
            />
            <FilterGroup heading={translate("decks:cardSearch.keywords")}>
              {keywordCatalog
                .filter((keyword) => keyword.toLowerCase().includes(keywordQuery.toLowerCase()))
                .slice(0, 40)
                .map((keyword) => (
                  <FilterPill
                    key={keyword}
                    label={keyword}
                    selected={keywords.includes(keyword)}
                    onPress={() =>
                      setKeywords((current) =>
                        current.includes(keyword)
                          ? current.filter((value) => value !== keyword)
                          : [...current, keyword],
                      )
                    }
                  />
                ))}
            </FilterGroup>
            {keywordError ? <Text text={keywordError} /> : null}
            {offline && !keywordCatalog.length ? (
              <Text tx="decks:cardSearch.keywordsOffline" />
            ) : null}
          </ScrollView>
          <View style={themed($dialogActions)}>
            <Button
              style={themed($dialogButton)}
              tx="decks:cardSearch.clearAll"
              onPress={() => {
                setColorFilters([])
                setKeywords([])
                setExactColors(true)
              }}
            />
            <Button
              style={themed($dialogButton)}
              tx="common:done"
              onPress={() => setFiltersOpen(false)}
            />
          </View>
        </DialogCard>
      ) : null}
      {scanning ? (
        <CardScanner
          onClose={() => setScanning(false)}
          onScan={(lines) => {
            setScanning(false)
            setScanLines(lines)
            setQuery(lines[0])
          }}
        />
      ) : null}
      {candidate ? (
        <CardFocusDialog
          key={printingKey(candidate)}
          card={{
            game,
            cardId:
              candidate.scryfallId ??
              candidate.cardId ??
              candidate.printingId ??
              candidate.providerCardId,
            name: candidate.name,
            imageUrl: candidate.imageUrl,
            smallImageUrl: candidate.smallImageUrl,
            quantity: candidate.quantity,
            boardLabel: inDeck(candidate) ? translate("decks:cardSearch.inDeck") : SCRYFALL,
            commanderColor: candidate.commanderColor,
          }}
          details={candidateDetails.details}
          detailsError={candidateError ?? candidateDetails.detailsError}
          detailsRetryAfterMs={candidateDetails.detailsRetryAfterMs}
          onRetryDetails={candidateDetails.retryDetails}
          onClose={() => setCandidate(undefined)}
          showQuantity={false}
          onSetCommander={setCommander}
        />
      ) : null}
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

const $queryRow: ViewStyle = { flexDirection: "row", alignItems: "center", gap: 8 }
const $queryField: ViewStyle = { flex: 1 }
const $filterRow: ViewStyle = { flexDirection: "row", alignItems: "center", minHeight: 44 }
const $pills: ViewStyle = { flexDirection: "row", flexWrap: "wrap", gap: 8 }
const $filterBody: ViewStyle = { gap: 16 }

const $searchHeader: ViewStyle = { paddingBottom: 4 }
const $searchResults: ViewStyle = { paddingTop: 8 }

const $filterScroll: ViewStyle = { flex: 1 }
const $colorScroll: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexWrap: "nowrap",
  paddingRight: spacing.md,
})
