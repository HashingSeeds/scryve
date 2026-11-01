import { useEffect, useRef, useState } from "react"
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Platform,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native"
import type { ViewStyle } from "react-native"
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
import { PressableIcon } from "@/components/Icon"
import { SectionHeader } from "@/components/NumberLane"
import { RetryableError } from "@/components/RetryableError"
import { Screen } from "@/components/Screen"
import { SegmentedControl } from "@/components/SegmentedControl"
import { SelectField } from "@/components/SelectField"
import { Text } from "@/components/Text"
import { TextAction } from "@/components/TextAction"
import { TextField, type TextFieldAccessoryProps } from "@/components/TextField"
import { useSheetPresence } from "@/components/useSheetPresence"
import { LocalGameRepository } from "@/features/game/localPersistence"
import { localizedDeckSections } from "@/features/game/playSystems"
import { prereleaseBuild } from "@/features/updates/appUpdate"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { convexErrorMessage, convexRetryAfterMs } from "@/utils/convexError"
import { loadString, saveString } from "@/utils/storage"

import { loadCardDetails, saveCardDetails } from "./cardDetailsCache"
import { searchCardNames } from "./cardNameMatch"
import { CardScanner, type CardScan, type ScannedCardAdd } from "./CardScanner"
import {
  cardDetailsKey,
  cardSection,
  printingKey,
  type CommanderColor,
  type DeckCard,
} from "./deckCards"
import { isCommanderPick, sideboardSection } from "./deckDraft"
import type { KnownCardEntry } from "./deckVersionsCache"
import type { GuestDeckPayload } from "./guestDeck"
import { useCardDetails } from "./useCardDetails"
import { useCardNameIndex } from "./useCardNameIndex"
import { api } from "../../../convex/_generated/api"
import { picksCommander, systemDefinition } from "../../../convex/lib/systems"
import { canReadCardText } from "../../../modules/card-text-reader"

type SearchCard = FunctionReturnType<typeof api.cards.search>[number]

const SCRYFALL = "Scryfall"
const SEARCH_COLORS = [...COMMANDER_COLORS, "C"] as const
const CAN_READ_CARDS = Platform.OS !== "web" && canReadCardText
const COLOR_MATCH_OPERATOR = { exact: "=", additional: ">=", within: "<=" } as const
const COLOR_MATCHES = [
  { id: "within", tx: "decks:cardSearch.withinColors" },
  { id: "additional", tx: "decks:cardSearch.allowAdditional" },
  { id: "exact", tx: "decks:cardSearch.exactColors" },
] as const
const NAME_MATCHES = 20
const SCRYFALL_SYNTAX = /[:=<>!"()]|(^|\s)-|(^|\s)(and|or)(\s|$)/i
type ColorMatch = keyof typeof COLOR_MATCH_OPERATOR

export function scryfallQuery({
  text,
  commander,
  colors,
  colorMatch,
  keywords,
}: {
  text: string
  commander: boolean
  colors: string[]
  colorMatch: ColorMatch
  keywords: string[]
}) {
  const identity = colors.includes("C")
    ? "id:c"
    : colors.length
      ? `id${COLOR_MATCH_OPERATOR[colorMatch]}${colors.join("").toLowerCase()}`
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

type AddCard = (card: GuestDeckPayload["cards"][number]) => string | undefined

type CardSearchProps = {
  game: string
  format: string
  onAdd?: AddCard
  onRemove?: (card: GuestDeckPayload["cards"][number]) => void
  onClose: () => void
  /**
   * The account's fully-cached cards to search while offline. Offline adds draw from
   * this index only — never the catalog and never a name-only candidate.
   */
  offlineCandidates?: KnownCardEntry[]
  initialSection?: string
  commanderCards?: DeckCard[]
  deckCards?: DeckCard[]
  presentation?: "modal" | "screen"
}

// why: DeckView and ImportBuild type their search props from this component and always add cards.
export function CardSearchScreen(props: CardSearchProps & { onAdd: AddCard }) {
  return <CardSearch {...props} />
}

export function CardSearch({
  game,
  format,
  onAdd,
  onRemove,
  onClose,
  offlineCandidates,
  initialSection,
  commanderCards,
  deckCards,
  presentation = "modal",
}: CardSearchProps) {
  const convex = useConvex()
  const [deviceId] = useState(() => new LocalGameRepository().getDeviceId())
  const connection = useConvexConnectionState()
  const { themed, theme } = useAppTheme()
  const sections = localizedDeckSections(game, format)
  const [section, setSection] = useState(
    initialSection ?? sections.find((item) => item.id === "main")?.id ?? sections[0]?.id ?? "main",
  )
  const choosingCommander = section === "commander" && picksCommander(game, format)
  const lookup = !onAdd
  const side = deckCards ? sideboardSection({ game, format }) : undefined
  const picksSection =
    !deckCards ||
    sections.some(
      (item) =>
        item.id !== "main" &&
        item.id !== side?.id &&
        !(item.id === "commander" && picksCommander(game, format)),
    )
  const filtersCards =
    systemDefinition(game)?.integration.capabilities.cardCatalog.provider === "scryfall"
  const imageCredit = systemDefinition(game)?.integration.rights.imageCredit
  const [candidate, setCandidate] = useState<DeckCard>()
  const candidateSheet = useSheetPresence(candidate)
  const shownCandidate = candidateSheet.shown
  const [candidateError, setCandidateError] = useState<string>()
  const candidateDetails = useCardDetails(
    shownCandidate
      ? {
          ...shownCandidate,
          detailKey: cardDetailsKey(shownCandidate, game),
          game,
          catalogCardId:
            shownCandidate.cardId ?? shownCandidate.printingId ?? shownCandidate.providerCardId,
        }
      : undefined,
    choosingCommander,
  )
  const [query, setQuery] = useState("")
  const [scanning, setScanning] = useState(false)
  const scannedEntries = useRef(new Map<string, GuestDeckPayload["cards"][number]>())
  const nameIndex = useCardNameIndex(game, deviceId, scanning || query.trim().length > 0)
  const [results, setResults] = useState<SearchCard[]>()
  const [nameResults, setNameResults] = useState<SearchCard[]>()
  const [offlineResults, setOfflineResults] = useState<KnownCardEntry[]>()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string>()
  const [searchError, setSearchError] = useState<{ message: string; retryAfterMs?: number }>()
  const [searchAttempt, setSearchAttempt] = useState(0)

  const offline = connection?.isWebSocketConnected === false
  const [cachedRules, setCachedRules] = useState(() => loadCardDetails())
  const [startingFilters] = useState<{ colors: string[]; colorMatch: ColorMatch }>(() => {
    const identities = (commanderCards ?? [])
      .filter((card) => cardSection(card) === "commander")
      .map((card) => {
        const details = cachedRules[cardDetailsKey(card, game)]
        return details?.colorIdentity !== undefined &&
          details.commanderEligibility === "color-choice"
          ? details.colorIdentity + (card.commanderColor ?? "")
          : details?.colorIdentity
      })
    if (
      !filtersCards ||
      choosingCommander ||
      !identities.length ||
      identities.some((identity) => identity === undefined)
    )
      return { colors: [], colorMatch: "exact" }
    const colors = COMMANDER_COLORS.filter((color) => identities.join("").includes(color))
    return { colors: colors.length ? colors : ["C"], colorMatch: "within" }
  })
  const [colorFilters, setColorFilters] = useState<string[]>(startingFilters.colors)
  const [colorMatch, setColorMatch] = useState(startingFilters.colorMatch)
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
  const pickedColors = colorFilters.length > 0 && colorFilters !== startingFilters.colors
  const searchRequested =
    query.trim().length >= 2 || (filtersCards && (pickedColors || keywords.length > 0))

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
    const within = [...identity].every((color) => colorFilters.includes(color))
    if (colorMatch === "within") return within
    const missing = colorFilters.filter((color) => !identity.includes(color))
    return (
      (missing.length === 0 || (canChooseColor && missing.length === 1)) &&
      (colorMatch === "additional" || within)
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
      function mayLead(details?: FocusedCardDetails) {
        return details?.typeLine === undefined || details.typeLine.includes("Legendary")
      }
      const missing = cardsToCheck.filter((card) => {
        const details = cached[cardDetailsKey(card, game)]
        return !hasCurrentRules(details) && mayLead(details)
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
          if (hasCurrentRules(cached[key]) || !mayLead(cached[key])) continue
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
    setMessage(undefined)
    setBusy(searchRequested && !offline)
    if (!searchRequested || offline) {
      setResults(undefined)
      setNameResults(undefined)
      setOfflineResults(undefined)
    }
    if (!searchRequested) return
    if (offline) {
      const wanted = (
        choosingCommander ? query.slice(0, 80).replace(/[()"]/g, " ").trim() : query.trim()
      ).toLowerCase()
      const cached = loadCardDetails()
      setCachedRules(cached)
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
    const text = query.trim()
    const timer = setTimeout(async () => {
      try {
        if (!convex) throw new Error("Card search unavailable")
        const names =
          nameIndex && !SCRYFALL_SYNTAX.test(text)
            ? searchCardNames(
                nameIndex,
                choosingCommander ? text.slice(0, 80).replace(/[()"]/g, " ") : text,
                NAME_MATCHES,
              )
            : []
        const [found, named] = await Promise.all([
          convex.action(api.cards.search, {
            game,
            deviceId,
            query: scryfallQuery({
              text,
              commander: choosingCommander,
              colors: colorFilters,
              colorMatch,
              keywords,
            }),
          }),
          names.length
            ? convex.action(api.cards.byNames, { names, deviceId }).then(
                ({ cards }) => cards,
                () => [],
              )
            : [],
        ])
        if (!active) return
        const byName = new Map(named.map((card) => [card.name, card]))
        setNameResults(names.flatMap((name) => byName.get(name) ?? []))
        setResults(found)
      } catch (cause) {
        if (!active) return
        setResults(undefined)
        setNameResults(undefined)
        setSearchError({
          message: convexErrorMessage(cause, translate("decks:cardSearch.searchFailed")),
          retryAfterMs: convexRetryAfterMs(cause),
        })
      } finally {
        if (active) setBusy(false)
      }
    }, 350)
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
    colorMatch,
    keywords,
    searchRequested,
    searchAttempt,
    searchError?.retryAfterMs,
    deviceId,
    nameIndex,
  ])

  function searchEntry(card: SearchCard, to = section) {
    return {
      name: card.name,
      quantity: 1,
      section: to,
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

  function remember(card: SearchCard) {
    if (!("scryfallId" in card)) return
    saveCardDetails({ [card.scryfallId]: card })
    setCachedRules((current) => ({ ...current, [card.scryfallId]: card }))
  }

  function add(card: SearchCard, to = section) {
    remember(card)
    if (choosingCommander || !onAdd) {
      preview(searchEntry(card))
      return undefined
    }
    const error = onAdd(searchEntry(card, to))
    setMessage(error ?? translate("decks:cardSearch.added", { card: card.name }))
    return error
  }

  async function addScannedCards(names: string[]): Promise<ScannedCardAdd[]> {
    try {
      if (!convex) throw new Error("Card search unavailable")
      const { cards, lookupFailed } = await convex.action(api.cards.byNames, { names, deviceId })
      const byName = new Map(cards.map((card) => [card.name, card]))
      return names.map((name) => {
        const card = byName.get(name)
        if (!card)
          return lookupFailed
            ? { error: translate("decks:cardScan.addFailed"), retryable: true }
            : { error: translate("decks:cardScan.notFound", { card: name }) }
        const error = add(card)
        // why: a deck refuses uncached cards while offline; a retry adds them once it reconnects.
        if (error) return { error, retryable: offline }
        scannedEntries.current.set(name, searchEntry(card))
        if (__DEV__) console.log(`SCANADD ${JSON.stringify({ added: card.name })}`)
        return { imageUrl: card.smallImageUrl ?? card.imageUrl }
      })
    } catch (cause) {
      const error = convexErrorMessage(cause, translate("decks:cardScan.addFailed"))
      const retryAfterMs = convexRetryAfterMs(cause)
      return names.map(() => ({ error, retryable: true, retryAfterMs }))
    }
  }

  function removeScannedCard(name: string) {
    const entry = scannedEntries.current.get(name)
    if (!entry || !onRemove) return
    onRemove(entry)
    if (__DEV__) console.log(`SCANREMOVE ${JSON.stringify({ removed: name })}`)
  }

  function recordScanRead(scan: CardScan, match: string | undefined) {
    console.log(`SCANREAD ${JSON.stringify({ photo: scan.photo, framing: scan.framing, match })}`)
  }

  function addOffline(entry: KnownCardEntry, to = section) {
    if (choosingCommander || !onAdd) {
      preview(entry.card)
      return
    }
    const error = onAdd({ ...entry.card, quantity: 1, section: to })
    setMessage(error ?? translate("decks:cardSearch.added", { card: entry.card.name }))
  }

  function addCopy(card: DeckCard) {
    const error = onAdd?.({ ...card, quantity: 1 })
    setMessage(error ?? translate("decks:cardSearch.added", { card: card.name }))
  }

  function setCommander(commanderColor?: CommanderColor) {
    if (!candidate || !onAdd) return
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

  const rankedResults = (nameResults ?? []).filter(
    (card) => "scryfallId" in card && matchesFilters(card),
  )
  const rankedNames = new Set(rankedResults.map((card) => card.name))
  const catalogResults = results
    ? [...rankedResults, ...results.filter((card) => !rankedNames.has(card.name))].filter(
        (card) =>
          !choosingCommander ||
          ("scryfallId" in card && eligible(card) && matchesFilters(card) && !inDeck(card)),
      )
    : undefined
  const eligibleCommanders = choosingCommander
    ? commanderCards?.filter((card) => {
        const cached = cachedRules[cardDetailsKey(card, game)]
        return eligible(cached) && matchesFilters(cached)
      })
    : undefined
  const cachedCandidates = offlineResults?.filter(
    (entry) =>
      (!choosingCommander || !inDeck(entry.card)) &&
      (!filtersCards || matchesFilters(cachedRules[cardDetailsKey(entry.card, game)])),
  )

  const needle = query.trim().toLocaleLowerCase()
  const inDeckMatches = needle
    ? deckCards?.filter((card) => card.name.toLocaleLowerCase().includes(needle))
    : undefined
  const sectionLabel = (id: string) => sections.find((item) => item.id === id)?.label ?? id
  const sideAction = (card: { name: string }, addTo: (section: string) => void) =>
    side ? (
      <TextAction
        style={$add}
        accessibilityLabel={translate("decks:cardSearch.addToSection", {
          card: card.name,
          section: sectionLabel(side.id),
        })}
        tx="decks:cardSearch.side"
        onPress={() => addTo(side.id)}
      />
    ) : null

  const tapsRows = choosingCommander || lookup
  const ResultRow = tapsRows ? TouchableOpacity : View
  const rowLabel = (card: { name: string }) =>
    choosingCommander
      ? translate("decks:cardSearch.preview", { card: card.name })
      : lookup
        ? translate("decks:cardSearch.showCard", { card: card.name })
        : undefined

  const content = (
    <>
      <Screen
        preset="fixed"
        safeAreaEdges={["bottom"]}
        backgroundColor={theme.colors.surface}
        contentContainerStyle={$screen}
      >
        <Header
          title={translate(
            choosingCommander
              ? "systems:section.commander"
              : lookup
                ? "decks:cardSearch.lookupTitle"
                : "decks:cardSearch.title",
          )}
          // why: Header's own icon actions take no accessibilityLabel, so the close icon brings one.
          LeftActionComponent={
            <PressableIcon
              testID="card-search-close"
              icon="x"
              size={24}
              accessibilityRole="button"
              accessibilityLabel={translate("common:close")}
              onPress={onClose}
              containerStyle={themed($close)}
            />
          }
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
              RightAccessory={busy ? SearchBusy : undefined}
            />
            {CAN_READ_CARDS &&
            prereleaseBuild() &&
            filtersCards &&
            !choosingCommander &&
            !lookup ? (
              <Button
                testID="card-scan-button"
                tx="decks:cardSearch.scan"
                accessibilityLabel={translate("decks:cardSearch.scanLabel")}
                onPress={() => setScanning(true)}
              />
            ) : null}
            {filtersCards ? (
              <View style={themed($filterSlot)}>
                <FilterButton
                  testID="card-filters-button"
                  count={
                    colorFilters.length +
                    keywords.length +
                    (colorMatch !== startingFilters.colorMatch ? 1 : 0)
                  }
                  onPress={() => setFiltersOpen(true)}
                />
              </View>
            ) : null}
          </View>
          {initialSection !== "commander" && !lookup && picksSection ? (
            <SelectField
              testID="card-search-section"
              label={translate("decks:cardSearch.addTo")}
              field="addTo"
              options={sections}
              value={section}
              onSelect={(value) => {
                if (value) setSection(value)
              }}
            />
          ) : null}
        </View>
        <ScrollView
          style={$results}
          contentContainerStyle={[themed($search), choosingCommander ? $searchResults : undefined]}
          keyboardShouldPersistTaps="handled"
        >
          {inDeckMatches?.length ? (
            <SectionHeader
              label={translate("decks:cardSearch.inDeck")}
              count={inDeckMatches.length}
            />
          ) : null}
          {inDeckMatches?.map((card) => (
            <View key={printingKey(card)} style={themed($result)}>
              <CardImage
                game={game}
                source={card.smallImageUrl ?? card.imageUrl}
                compact
                style={$image}
                accessibilityLabel={card.name}
              />
              <View style={$name}>
                <Text weight="medium" text={card.name} />
                <Text
                  size="meta"
                  tone="dim"
                  tx="decks:cardSearch.inSection"
                  txOptions={{ count: card.quantity, section: sectionLabel(cardSection(card)) }}
                />
              </View>
              {isCommanderPick({ game, format }, card) ? null : (
                <TextAction
                  style={$add}
                  accessibilityLabel={translate("decks:cardSearch.addAnother", { card: card.name })}
                  tx="decks:cardSearch.add"
                  onPress={() => addCopy(card)}
                />
              )}
            </View>
          ))}
          {choosingCommander ? (
            <SectionHeader
              label={translate("decks:cardSearch.inDeck")}
              count={checkingDeck ? undefined : eligibleCommanders?.length}
            />
          ) : null}
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
          {eligibleCommanders?.map((card) => (
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
                <Text weight="medium" text={card.name} />
                <Text
                  size="meta"
                  tone="dim"
                  text={cardColorIdentityLabel(cachedRules[cardDetailsKey(card, game)], card.name)}
                />
              </View>
            </TouchableOpacity>
          ))}
          {choosingCommander && !checkingDeck && !eligibleCommanders?.length ? (
            <Text size="sm" tx="decks:cardSearch.noEligible" />
          ) : null}
          {choosingCommander ? (
            <SectionHeader
              label={offline ? translate("decks:cardSearch.cachedCards") : SCRYFALL}
              count={offline ? cachedCandidates?.length : catalogResults?.length}
            />
          ) : null}
          {choosingCommander && !searchRequested ? (
            <Text
              size="sm"
              tx={offline ? "decks:cardSearch.searchCached" : "decks:cardSearch.searchScryfall"}
            />
          ) : null}
          {offline ? <Text size="xxs" tx="decks:cardSearch.offline" /> : null}
          {cachedCandidates?.map((entry, index) => (
            <ResultRow
              key={index}
              style={themed($result)}
              accessibilityRole={tapsRows ? "button" : undefined}
              accessibilityLabel={rowLabel(entry.card)}
              onPress={tapsRows ? () => addOffline(entry) : undefined}
            >
              <View style={$name}>
                <Text weight="medium" text={entry.card.name} />
                <Text
                  size="meta"
                  tone="dim"
                  tx="decks:cardSearch.fromCache"
                  txOptions={{ game: entry.game ?? game }}
                />
                {choosingCommander ? (
                  <Text
                    size="meta"
                    tone="dim"
                    text={cardColorIdentityLabel(
                      cachedRules[cardDetailsKey(entry.card, game)],
                      entry.card.name,
                    )}
                  />
                ) : null}
              </View>
              {!tapsRows ? (
                <TextAction
                  style={$add}
                  accessibilityLabel={translate("decks:cardSearch.addCard", {
                    card: entry.card.name,
                  })}
                  tx="decks:cardSearch.add"
                  onPress={() => addOffline(entry)}
                />
              ) : null}
              {!tapsRows ? sideAction(entry.card, (to) => addOffline(entry, to)) : null}
            </ResultRow>
          ))}
          {offline && cachedCandidates?.length === 0 ? (
            <Text tx="decks:cardSearch.noCached" />
          ) : null}
          {catalogResults?.map((card, index) => (
            <ResultRow
              key={index}
              style={themed($result)}
              accessibilityRole={tapsRows ? "button" : undefined}
              accessibilityLabel={rowLabel(card)}
              onPress={tapsRows ? () => add(card) : undefined}
            >
              <CardImage
                game={game}
                source={card.smallImageUrl ?? card.imageUrl}
                accessibilityLabel={card.name}
                compact
                style={$image}
              />
              <View style={$name}>
                <Text weight="medium" text={card.name} />
                <Text
                  size="meta"
                  tone="dim"
                  text={"scryfallId" in card ? card.typeLine : card.typeLabel}
                />
                {choosingCommander && "scryfallId" in card ? (
                  <Text size="meta" tone="dim" text={cardColorIdentityLabel(card, card.name)} />
                ) : null}
              </View>
              {!tapsRows ? (
                <TextAction
                  style={$add}
                  accessibilityLabel={translate("decks:cardSearch.addCard", { card: card.name })}
                  tx="decks:cardSearch.add"
                  onPress={() => add(card)}
                />
              ) : null}
              {!tapsRows ? sideAction(card, (to) => add(card, to)) : null}
            </ResultRow>
          ))}
          {!busy && catalogResults?.length === 0 ? <Text tx="decks:cardSearch.noResults" /> : null}
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
            <FilterGroup heading={translate("decks:cardSearch.colors")}>
              {SEARCH_COLORS.map((color) => (
                <FilterPill
                  key={color}
                  testID={`card-color-${color}`}
                  label={colorLabel(color)}
                  selected={colorFilters.includes(color)}
                  onPress={() => toggleColor(color)}
                />
              ))}
            </FilterGroup>
            <View style={$filterSection}>
              <Text preset="sectionLabel" tx="decks:cardSearch.colorMatch" />
              <SegmentedControl
                testID="card-color-match"
                accessibilityLabel={translate("decks:cardSearch.colorMatch")}
                segments={COLOR_MATCHES.map(({ id, tx }) => ({ id, label: translate(tx) }))}
                selectedId={colorMatch}
                onSelect={(id) => {
                  const match = COLOR_MATCHES.find((option) => option.id === id)
                  if (match) setColorMatch(match.id)
                }}
              />
            </View>
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
                setColorMatch(startingFilters.colorMatch)
              }}
            />
            <Button
              style={themed($dialogButton)}
              preset="primary"
              tx="common:done"
              onPress={() => setFiltersOpen(false)}
            />
          </View>
        </DialogCard>
      ) : null}
      {scanning ? (
        <CardScanner
          game={game}
          nameIndex={nameIndex}
          singleton={picksCommander(game, format)}
          copiesInDeck={(name) =>
            (commanderCards ?? []).reduce(
              (total, card) => total + (card.name === name ? card.quantity : 0),
              0,
            )
          }
          addCards={addScannedCards}
          removeCard={onRemove ? removeScannedCard : undefined}
          onRead={__DEV__ ? recordScanRead : undefined}
          onClose={() => setScanning(false)}
        />
      ) : null}
      {shownCandidate ? (
        <CardFocusDialog
          key={printingKey(shownCandidate)}
          card={{
            game,
            cardId:
              shownCandidate.scryfallId ??
              shownCandidate.cardId ??
              shownCandidate.printingId ??
              shownCandidate.providerCardId,
            name: shownCandidate.name,
            imageUrl: shownCandidate.imageUrl,
            smallImageUrl: shownCandidate.smallImageUrl,
            quantity: shownCandidate.quantity,
            boardLabel: inDeck(shownCandidate) ? translate("decks:cardSearch.inDeck") : SCRYFALL,
            commanderColor: shownCandidate.commanderColor,
          }}
          details={candidateDetails.details}
          detailsError={candidateError ?? candidateDetails.detailsError}
          detailsRetryAfterMs={candidateDetails.detailsRetryAfterMs}
          onRetryDetails={candidateDetails.retryDetails}
          visible={candidateSheet.visible}
          onClose={() => setCandidate(undefined)}
          onDismissed={candidateSheet.onDismissed}
          showQuantity={false}
          onSetCommander={choosingCommander ? setCommander : undefined}
        />
      ) : null}
    </>
  )
  return presentation === "screen" ? (
    content
  ) : (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      {content}
    </Modal>
  )
}
function SearchBusy({ style }: TextFieldAccessoryProps) {
  const { theme } = useAppTheme()
  return (
    <ActivityIndicator
      style={style}
      color={theme.colors.textDim}
      accessibilityLabel={translate("decks:cardSearch.searching")}
    />
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
const $filterBody: ViewStyle = { gap: 16 }
const $filterSection: ViewStyle = { gap: 8 }
const $close: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  height: "100%",
  justifyContent: "center",
  paddingHorizontal: spacing.md,
})

const $searchHeader: ViewStyle = { paddingBottom: 4 }
const $searchResults: ViewStyle = { paddingTop: 8 }

// why: FilterButton overlaps its left neighbor by spacing.md; the padding keeps that off the search field.
const $filterSlot: ThemedStyle<ViewStyle> = ({ spacing }) => ({ paddingLeft: spacing.md })
