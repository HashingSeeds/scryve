import { Children, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native"
import type { TextStyle, ViewStyle } from "react-native"
import { LegendList } from "@legendapp/list/react-native"
import { useConvex, useConvexConnectionState } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"

import { Button } from "@/components/Button"
import type { FocusedCardDetails } from "@/components/CardFocusDialog"
import { CardFocusDialog, cardColorIdentityLabel, colorLabel } from "@/components/CardFocusDialog"
import { CardImage } from "@/components/CardImage"
import { DialogCard, $dialogActions, $dialogButton } from "@/components/DialogCard"
import { FilterPill, FilterGroup } from "@/components/FilterPill"
import { Header, HeaderIcon } from "@/components/Header"
import { SectionHeader } from "@/components/NumberLane"
import { RetryableError } from "@/components/RetryableError"
import { Screen } from "@/components/Screen"
import { SegmentedControl } from "@/components/SegmentedControl"
import { SelectField } from "@/components/SelectField"
import { $sheetScroll, $sheetScrollContent } from "@/components/sheetStyles"
import { Text } from "@/components/Text"
import { TextAction } from "@/components/TextAction"
import { TextField } from "@/components/TextField"
import { useSheetPresence } from "@/components/useSheetPresence"
import { LocalGameRepository } from "@/features/game/localPersistence"
import {
  cardFilterLabel,
  cardFilterOptionLabel,
  localizedDeckSections,
  playSystemShortLabel,
} from "@/features/game/playSystems"
import { VISIBLE_SYSTEM_IDS } from "@/features/game/systemVisibility"
import { prereleaseBuild } from "@/features/updates/appUpdate"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { convexErrorMessage, convexRetryAfterMs } from "@/utils/convexError"
import { useStableCallbacks } from "@/utils/useStableCallbacks"

import {
  completeCardDetails,
  loadCardDetails,
  partialMagicDetails,
  readCardDetail,
  saveCardDetails,
} from "./cardDetailsCache"
import { CardFilterGroup } from "./CardFilterGroup"
import {
  cardOptions,
  filterGroups,
  matchesCardFilters,
  filterTerms,
  pickedCount,
  type CardFilterState,
} from "./cardFilters"
import { searchCardNames } from "./cardNameMatch"
import {
  formatCardQuery,
  identityTerm,
  parseCardQuery,
  querySections,
  querySpans,
  querySuggestions,
  type CardQuery,
} from "./cardQuery"
import { CardScanner, type CardScan, type ScannedCardAdd } from "./CardScanner"
import { cardSource, SCRYFALL_SOURCE } from "./cardSources"
import {
  COLOR_MATCHES,
  COMMANDER_COLORS,
  matchesColors,
  SEARCH_COLORS,
  toggleColor,
  type ColorMatch,
} from "./colorMatch"
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
import {
  localMagicSearch,
  NAME_MATCHES,
  readsOnDevice,
  SCRYFALL_SYNTAX,
  type MagicCards,
} from "./localMagicSearch"
import { useCardDetails } from "./useCardDetails"
import { useCardNameIndex } from "./useCardNameIndex"
import { useCardSearchAnalytics } from "./useCardSearchAnalytics"
import { useMagicCards } from "./useMagicCards"
import { api } from "../../../convex/_generated/api"
import {
  isSystemId,
  MAGIC_CARD_FILTERS,
  picksCommander,
  systemDefinition,
  type CardFilterDefinition,
  type SystemId,
} from "../../../convex/lib/systems"
import { canReadCardText } from "../../../modules/card-text-reader"

type SearchCard = FunctionReturnType<typeof api.cards.search>[number]

const SCRYFALL = "Scryfall"
const CAN_READ_CARDS = Platform.OS !== "web" && canReadCardText
/** why: color identity sits beside the mana a card costs, so its section shows just above that group. */
const COLORS_BEFORE = "cost"
/** why: Text's 24pt line puts the extra room above typed text on iOS, so the bar's parts keep Rubik's own 16pt line, as its placeholder does. */
const QUERY_LINE_HEIGHT = 19
/** why: a result row's usual height, which the list uses to place rows before it measures them. */
const RESULT_HEIGHT = 77
/** why: a filter's search field has its row of matches under it, which the keyboard must leave in view. */
const SUGGESTIONS_BELOW_FIELD = 56
const NO_RESULTS = [] as const
const NO_OPTIONS: readonly string[] = []
// why: LegendList's web build copies unknown props onto its <div>, so native-only props would warn.
const NATIVE_RESULTS_PROPS = Platform.select({
  native: { keyboardShouldPersistTaps: "handled", keyboardDismissMode: "on-drag" } as const,
})
const NO_CARD_FILTERS: readonly CardFilterDefinition[] = []

/** why: a `cards` filter lists what the card file holds, and its fallback until the file loads. */
function filterOptions(
  magicCards: MagicCards | undefined,
  filters: readonly CardFilterDefinition[],
  id: string,
  formats: readonly string[] = [],
): readonly string[] {
  if (magicCards) return cardOptions(SCRYFALL_SOURCE, magicCards.cards, id, formats)
  const filter = filters.find((candidate) => candidate.id === id)
  return (filter && "fallback" in filter && filter.fallback) || NO_OPTIONS
}
const NO_PICKS: CardFilterState = {}
const NO_COLORS: readonly string[] = []

export function scryfallQuery({
  text,
  commander,
  colors,
  colorMatch,
  filters,
}: {
  text: string
  commander: boolean
  colors: readonly string[]
  colorMatch: ColorMatch
  filters: CardFilterState
}) {
  const identity = identityTerm(colors, colorMatch)
  const terms = [
    ...new Set([
      commander ? "is:commander" : "",
      commander ? "f:commander" : "",
      commander && identity && !colors.includes("C")
        ? `(${identity} or o:"choose a color")`
        : identity,
      ...filterTerms(SCRYFALL_SOURCE, MAGIC_CARD_FILTERS, filters),
    ]),
  ].filter(Boolean)
  if (!terms.length) return text
  const words = commander ? text.slice(0, 80).replace(/[()"]/g, " ").trim() : text
  return [words.length >= 2 ? `(${words})` : "", ...terms].filter(Boolean).join(" ")
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
  onGameChange?: (game: SystemId) => void
}

const GAME_OPTIONS = VISIBLE_SYSTEM_IDS.map((id) => ({ id, label: playSystemShortLabel(id) }))

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
  onGameChange,
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
  const source = cardSource(systemDefinition(game)?.integration.capabilities.cardCatalog.provider)
  const filtersCards = source !== undefined
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
  const [scanning, setScanning] = useState(false)
  const scannedEntries = useRef(new Map<string, GuestDeckPayload["cards"][number]>())
  const magicCards = useMagicCards(game)
  const [results, setResults] = useState<SearchCard[]>()
  const [nameResults, setNameResults] = useState<SearchCard[]>()
  const [textExcerpts, setTextExcerpts] = useState<ReadonlyMap<string, string>>()
  const [resultsQuery, setResultsQuery] = useState<string>()
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
  const cardFilters = (filtersCards && systemDefinition(game)?.cardFilters) || NO_CARD_FILTERS
  // why: a deck's search starts on cards its format allows; looking up rules searches every card.
  const [startingPicked] = useState<CardFilterState>(() => ({
    format:
      !lookup &&
      cardFilters.some(
        (filter) =>
          filter.id === "format" &&
          Array.isArray(filter.options) &&
          filter.options.includes(format),
      )
        ? [format]
        : [],
  }))
  const [colorMatchPick, setColorMatchPick] = useState(startingFilters.colorMatch)
  const [query, setQuery] = useState(() =>
    source
      ? formatCardQuery(
          source,
          { rest: "", filters: startingPicked, colors: startingFilters.colors },
          startingFilters.colorMatch,
          cardFilters,
        )
      : "",
  )
  const parsed = useMemo<CardQuery>(
    () =>
      source
        ? parseCardQuery(source, query, cardFilters, (id) =>
            filterOptions(magicCards, cardFilters, id),
          )
        : { rest: query, filters: NO_PICKS, colors: NO_COLORS },
    [query, source, cardFilters, magicCards],
  )
  const picked = parsed.filters
  const colorFilters = parsed.colors
  const colorMatch = parsed.colorMatch ?? colorMatchPick
  const text = parsed.rest.trim()
  // why: suggestions follow the bar's unfinished last word, not its focus, since clicking one on web blurs the bar first.
  const suggestions = source
    ? querySuggestions(source, query, cardFilters, (id) =>
        filterOptions(magicCards, cardFilters, id, picked.format),
      )
    : []
  const nameIndex = useCardNameIndex(game, deviceId, scanning || text.length > 0)
  /** why: the sheet edits the search bar's text, which holds every filter. */
  function changeQuery(change: Partial<CardQuery>, match = colorMatch) {
    if (!source) return
    setColorMatchPick(match)
    setQuery(formatCardQuery(source, { ...parsed, ...change }, match, cardFilters))
  }
  const pickedFilters = pickedCount(cardFilters, picked)
  const changedFilters = cardFilters.some(({ id }) => {
    const options = picked[id] ?? []
    const starting = startingPicked[id] ?? []
    return options.length !== starting.length || options.some((o) => !starting.includes(o))
  })
  const needsKeywords = (picked.keyword?.length ?? 0) > 0
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filterActionsHeight, setFilterActionsHeight] = useState(0)
  // why: the sheet's groups skip renders their picks didn't change, so their handlers keep one identity.
  const stable = useStableCallbacks()
  // why: iOS keeps a multiline field's height when its text changes from outside, so the bar is rebuilt after the sheet edits it or it is cleared.
  const [bar, setBar] = useState({ build: 0, focused: !choosingCommander })
  function closeFilters() {
    setFiltersOpen(false)
    setBar(({ build }) => ({ build: build + 1, focused: false }))
  }
  const pickedColors =
    colorFilters.length > 0 &&
    (colorFilters.length !== startingFilters.colors.length ||
      colorFilters.some((color) => !startingFilters.colors.includes(color)))
  // why: a word still being finished, such as `kw:fl`, isn't a search yet, and Scryfall rejects it.
  const finishing =
    suggestions.length > 0 &&
    !suggestions.some((suggestion) => query.toLowerCase().endsWith(suggestion.term))
  const filterSections = querySections(cardFilters)
  const spans = source
    ? querySpans(
        source,
        query,
        cardFilters,
        (id) => filterOptions(magicCards, cardFilters, id),
        finishing,
      )
    : [{ text: query }]
  /** why: `syntax` is a term the sheet has no section for, which still reads apart from the name. */
  function sectionColor(section: string | undefined) {
    if (section === "syntax") return theme.colors.brandText
    const index = section === undefined ? -1 : filterSections.indexOf(section)
    return index < 0
      ? undefined
      : theme.colors.searchSections[index % theme.colors.searchSections.length]
  }
  const colorSection = (
    <View key="colors" style={$filterSection}>
      <FilterGroup
        heading={translate("decks:cardSearch.colorIdentity")}
        headingColor={sectionColor("colors")}
      >
        {SEARCH_COLORS.map((color) => (
          <FilterPill
            key={color}
            testID={`card-color-${color}`}
            label={colorLabel(color)}
            selected={colorFilters.includes(color)}
            color={colorFilters.includes(color) ? sectionColor("colors") : undefined}
            onPress={() => changeQuery({ colors: toggleColor(colorFilters, color) })}
          />
        ))}
      </FilterGroup>
      <SegmentedControl
        testID="card-color-match"
        accessibilityLabel={translate("decks:cardSearch.colorMatch")}
        segments={COLOR_MATCHES.map(({ id, tx }) => ({ id, label: translate(tx) }))}
        selectedId={colorMatch}
        onSelect={(id) => {
          const match = COLOR_MATCHES.find((option) => option.id === id)
          if (match) changeQuery({}, match.id)
        }}
      />
    </View>
  )
  const filterSectionGroups = filterGroups(cardFilters)
  const searchRequested =
    !finishing &&
    (text.length >= 2 || (filtersCards && (pickedColors || (changedFilters && pickedFilters > 0))))
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

  /** why: cached and fetched details lack mana value, toughness and legality, so the card file answers for them when it has the card. */
  function matchesFilters(name: string, details?: FocusedCardDetails) {
    const known = magicCards?.byName.get(name)
    // why: a card whose legality the device doesn't know stays in; Scryfall checked it, or the card file predates legality.
    const checked = known?.legalFormats ? picked : { ...picked, format: [] }
    if (!matchesCardFilters(SCRYFALL_SOURCE, known ?? details ?? {}, cardFilters, checked))
      return false
    return matchesPickedColors(details)
  }

  function matchesPickedColors(details?: FocusedCardDetails) {
    const canChooseColor = choosingCommander && details?.commanderEligibility === "color-choice"
    return matchesColors(details?.colorIdentity, colorFilters, colorMatch, canChooseColor)
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
    // why: looking up rules never adds a card, so offline it can search the card file, which lacks the full details an add needs.
    const local =
      searchRequested && (!offline || lookup)
        ? localMagicSearch(magicCards, nameIndex, {
            text,
            commander: choosingCommander,
            colors: colorFilters,
            colorMatch,
            filters: picked,
          })
        : undefined
    const remoteQuery = scryfallQuery({
      text,
      commander: choosingCommander,
      colors: colorFilters,
      colorMatch,
      filters: picked,
    })
    const answered =
      local &&
      (offline ||
        local.named.length ||
        local.found.length ||
        local.text.length ||
        remoteQuery.length < 2)
        ? local
        : undefined
    if (searchError?.retryAfterMs && !offline && !answered) return
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
    if (offline && !answered) {
      const wanted = (
        choosingCommander ? text.slice(0, 80).replace(/[()"]/g, " ").trim() : text
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
    setTextExcerpts(
      answered && new Map(answered.text.map(({ card, excerpt }) => [card.name, excerpt])),
    )
    if (answered) {
      setNameResults(answered.named)
      setResultsQuery(text)
      setResults([...answered.found, ...answered.text.map(({ card }) => card)])
      setBusy(false)
      return
    }
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
            query: remoteQuery,
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
        setResultsQuery(text)
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
    text,
    offline,
    offlineCandidates,
    choosingCommander,
    colorFilters,
    colorMatch,
    picked,
    searchRequested,
    searchAttempt,
    searchError?.retryAfterMs,
    deviceId,
    nameIndex,
    magicCards,
    lookup,
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
    const cached = readCardDetail(card.scryfallId)
    const details =
      partialMagicDetails(card) && cached && !partialMagicDetails(cached) ? cached : card
    if (details === card) saveCardDetails({ [card.scryfallId]: card })
    setCachedRules((current) => ({ ...current, [card.scryfallId]: details }))
  }

  /** why: a card from the device's Magic file has no rules text, so the deck's analysis and card view need its full details. */
  function completeDetails(scryfallId: string) {
    if (!convex) return
    completeCardDetails(scryfallId, () =>
      convex.action(api.cards.byId, { scryfallId, deviceId }),
    ).then(
      (details) => setCachedRules((current) => ({ ...current, [scryfallId]: details })),
      () => {},
    )
  }

  function add(card: SearchCard, to = section) {
    remember(card)
    if (choosingCommander || !onAdd) {
      preview(searchEntry(card))
      return undefined
    }
    const error = onAdd(searchEntry(card, to))
    if (
      !error &&
      "scryfallId" in card &&
      partialMagicDetails(readCardDetail(card.scryfallId) ?? card)
    )
      completeDetails(card.scryfallId)
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

  // why: name matches skip the Scryfall query, so a card whose legality the device can't confirm stays out; Scryfall lists it if it is legal.
  const rankedResults = (nameResults ?? []).filter(
    (card) =>
      "scryfallId" in card &&
      (!picked.format?.length || magicCards?.byName.get(card.name)?.legalFormats !== undefined) &&
      matchesFilters(card.name, card),
  )
  const rankedNames = new Set(rankedResults.map((card) => card.name))
  const catalogResults = results
    ? [...rankedResults, ...results.filter((card) => !rankedNames.has(card.name))].filter(
        (card) =>
          !choosingCommander ||
          ("scryfallId" in card && eligible(card) && matchesPickedColors(card) && !inDeck(card)),
      )
    : undefined
  const searchPicked = useCardSearchAnalytics(
    game,
    resultsQuery !== undefined && !busy && catalogResults
      ? { query: resultsQuery, results: catalogResults.map((card) => card.name) }
      : undefined,
  )
  function pick(card: SearchCard, index: number, to = section) {
    searchPicked(index + 1, card.name)
    add(card, to)
  }
  const eligibleCommanders = choosingCommander
    ? commanderCards?.filter((card) => {
        const cached = cachedRules[cardDetailsKey(card, game)]
        return eligible(cached) && matchesFilters(card.name, cached)
      })
    : undefined
  const cachedCandidates = offlineResults?.filter(
    (entry) =>
      (!choosingCommander || !inDeck(entry.card)) &&
      (!filtersCards ||
        matchesFilters(entry.card.name, cachedRules[cardDetailsKey(entry.card, game)])),
  )

  const needle = text.toLocaleLowerCase()
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

  // why: a search the device can't answer, such as rules text or a format an older card file lacks, needs Scryfall.
  const offlineSyntax =
    offline &&
    filtersCards &&
    (SCRYFALL_SYNTAX.test(text) ||
      (lookup && magicCards !== undefined && !readsOnDevice(magicCards, { text, filters: picked })))
  const scans = CAN_READ_CARDS && prereleaseBuild() && filtersCards && !choosingCommander && !lookup

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
          titleAccessory={
            busy ? (
              <ActivityIndicator
                color={theme.colors.textDim}
                accessibilityLabel={translate("decks:cardSearch.searching")}
              />
            ) : undefined
          }
          LeftActionComponent={
            <HeaderIcon
              testID="card-search-close"
              icon="x"
              label={translate("common:close")}
              onPress={onClose}
            />
          }
          RightActionComponent={
            <View style={$headerActions}>
              {scans ? (
                <HeaderIcon
                  testID="card-scan-button"
                  icon="camera"
                  label={translate("decks:cardSearch.scanLabel")}
                  onPress={() => setScanning(true)}
                />
              ) : null}
              {filtersCards ? (
                <HeaderIcon
                  testID="card-filters-button"
                  icon="sliders"
                  label={translate("decks:filters.label")}
                  onPress={() => setFiltersOpen(true)}
                />
              ) : null}
            </View>
          }
          backgroundColor={theme.colors.surface}
        />
        <View style={[themed($search), choosingCommander ? $searchHeader : undefined]}>
          <TextField
            key={bar.build}
            testID="card-search-input"
            accessibilityLabel={translate("decks:cardSearch.searchLabel")}
            placeholderTx="decks:cardSearch.placeholder"
            // why: React Native styles the parts of a field's text only through children, which web ignores.
            value={Platform.OS === "web" ? query : undefined}
            maxLength={filtersCards ? 400 : 120}
            autoCorrect={false}
            autoFocus={bar.focused}
            returnKeyType="search"
            // why: a query with filter terms wraps onto more lines instead of scrolling out of sight.
            multiline
            submitBehavior="blurAndSubmit"
            onChangeText={(value) => setQuery(value.replace(/\n/g, " "))}
            clearable={() => setBar(({ build }) => ({ build: build + 1, focused: true }))}
            inputWrapperStyle={$queryWrapper}
            style={$queryInput}
            textAlignVertical="center"
          >
            {Platform.OS === "web"
              ? undefined
              : spans.map((span, index) => (
                  <Text
                    key={index}
                    style={{
                      lineHeight: QUERY_LINE_HEIGHT,
                      color:
                        sectionColor(span.section) ??
                        (span.joiner ? theme.colors.textDim : theme.colors.text),
                    }}
                    text={span.text}
                  />
                ))}
          </TextField>
          {suggestions.length ? (
            <ScrollView
              horizontal
              keyboardShouldPersistTaps="handled"
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={themed($suggestions)}
            >
              {suggestions.map((suggestion) => (
                <FilterPill
                  key={suggestion.term}
                  testID={`card-search-suggestion-${suggestion.term}`}
                  label={cardFilterOptionLabel(game, suggestion.filter.id, suggestion.option)}
                  color={sectionColor(suggestion.filter.group?.id ?? suggestion.filter.id)}
                  onPress={() => setQuery(suggestion.text)}
                />
              ))}
            </ScrollView>
          ) : null}
          {onGameChange ? (
            <SelectField
              testID="card-search-game"
              label={translate("decks:shelf.system")}
              field="system"
              options={GAME_OPTIONS}
              value={game}
              onSelect={(value) => {
                if (isSystemId(value)) onGameChange(value)
              }}
            />
          ) : null}
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
        <LegendList
          {...NATIVE_RESULTS_PROPS}
          style={$results}
          contentContainerStyle={[
            themed($search),
            $resultsContent,
            choosingCommander ? $searchResults : undefined,
          ]}
          columnWrapperStyle={themed($resultGap)}
          data={catalogResults ?? NO_RESULTS}
          keyExtractor={(card, index) => `${index}:${card.name}`}
          estimatedItemSize={RESULT_HEIGHT}
          ListHeaderComponent={
            <ResultSlot edge="above">
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
                      txOptions={{
                        count: card.quantity,
                        section: sectionLabel(cardSection(card)),
                      }}
                    />
                  </View>
                  {isCommanderPick({ game, format }, card) ? null : (
                    <TextAction
                      style={$add}
                      accessibilityLabel={translate("decks:cardSearch.addAnother", {
                        card: card.name,
                      })}
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
                      text={cardColorIdentityLabel(
                        cachedRules[cardDetailsKey(card, game)],
                        card.name,
                      )}
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
              {offline ? (
                <Text
                  size="xxs"
                  tx={
                    offlineSyntax
                      ? "decks:cardSearch.offlineSyntax"
                      : lookup && magicCards
                        ? "decks:cardSearch.offlineCardFile"
                        : "decks:cardSearch.offline"
                  }
                />
              ) : null}
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
              {offline && !offlineSyntax && cachedCandidates?.length === 0 ? (
                <Text tx="decks:cardSearch.noCached" />
              ) : null}
            </ResultSlot>
          }
          renderItem={({ item: card, index }) => (
            <ResultRow
              style={themed($result)}
              accessibilityRole={tapsRows ? "button" : undefined}
              accessibilityLabel={rowLabel(card)}
              onPress={tapsRows ? () => pick(card, index) : undefined}
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
                {textExcerpts?.has(card.name) ? (
                  <Text
                    size="meta"
                    tone="dim"
                    numberOfLines={2}
                    text={textExcerpts.get(card.name)}
                  />
                ) : null}
                {choosingCommander && "scryfallId" in card ? (
                  <Text size="meta" tone="dim" text={cardColorIdentityLabel(card, card.name)} />
                ) : null}
              </View>
              {!tapsRows ? (
                <TextAction
                  style={$add}
                  accessibilityLabel={translate("decks:cardSearch.addCard", { card: card.name })}
                  tx="decks:cardSearch.add"
                  onPress={() => pick(card, index)}
                />
              ) : null}
              {!tapsRows ? sideAction(card, (to) => pick(card, index, to)) : null}
            </ResultRow>
          )}
          ListFooterComponent={
            <ResultSlot edge="below">
              {!busy && catalogResults?.length === 0 ? (
                <Text tx="decks:cardSearch.noResults" />
              ) : null}
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
            </ResultSlot>
          }
        />
      </Screen>
      {filtersOpen ? (
        <DialogCard
          visible
          onClose={closeFilters}
          dialogTestID="card-filters-dialog"
          backdropAccessibilityLabel={translate(
            choosingCommander ? "decks:cardSearch.dismissFilters" : "decks:shelf.dismissFilters",
          )}
        >
          <Text preset="subheading" tx="decks:filters.label" />
          <KeyboardAwareScrollView
            style={themed($sheetScroll)}
            contentContainerStyle={themed([$sheetScrollContent, $filterBody])}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            // why: the dialog keeps its buttons above the keyboard, so a field scrolls clear of those and of the dialog's gap, padding and margin.
            bottomOffset={SUGGESTIONS_BELOW_FIELD + filterActionsHeight + 3 * theme.spacing.lg}
          >
            {filterSectionGroups.some(({ heading }) => heading.id === COLORS_BEFORE)
              ? null
              : colorSection}
            {filterSectionGroups.map(({ heading, filters }) => [
              heading.id === COLORS_BEFORE ? colorSection : null,
              <View key={heading.id} style={$filterSection}>
                {filters.map((filter, index) => (
                  <CardFilterGroup
                    key={filter.id}
                    game={game}
                    filter={filter}
                    heading={index === 0 ? cardFilterLabel(heading) : undefined}
                    color={sectionColor(heading.id)}
                    options={
                      filter.options === "cards"
                        ? filterOptions(magicCards, cardFilters, filter.id, picked.format)
                        : filter.options === "range"
                          ? NO_OPTIONS
                          : filter.options
                    }
                    optionLabel={stable(`label:${filter.id}`, (option: string) => {
                      const color =
                        filter.id === "manaCost"
                          ? SEARCH_COLORS.find((symbol) => symbol === option)
                          : undefined
                      return color
                        ? colorLabel(color)
                        : cardFilterOptionLabel(game, filter.id, option)
                    })}
                    picked={picked[filter.id] ?? NO_OPTIONS}
                    onChange={stable(`pick:${filter.id}`, (options: readonly string[]) =>
                      changeQuery({ filters: { ...picked, [filter.id]: options } }),
                    )}
                  />
                ))}
              </View>,
            ])}
          </KeyboardAwareScrollView>
          <View
            style={themed($dialogActions)}
            onLayout={(event) => setFilterActionsHeight(event.nativeEvent.layout.height)}
          >
            <Button
              style={themed($dialogButton)}
              tx="decks:cardSearch.clearAll"
              onPress={() => {
                changeQuery({ filters: startingPicked, colors: [] }, startingFilters.colorMatch)
              }}
            />
            <Button
              style={themed($dialogButton)}
              preset="primary"
              tx="common:done"
              onPress={closeFilters}
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
const $screen: ViewStyle = { flex: 1 }
const $results: ViewStyle = { flex: 1 }
// why: the list would also put the gap after its header slot when that slot is empty; rows take theirs from $resultGap.
const $resultsContent: ViewStyle = { gap: 0 }
const $resultGap: ThemedStyle<{ rowGap: number }> = ({ spacing }) => ({ rowGap: spacing.sm })
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

const $suggestions: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $headerActions: ViewStyle = { flexDirection: "row" }
const $queryWrapper: ViewStyle = { minHeight: 44, maxHeight: 112, alignItems: "center" }
/** why: iOS draws multiline text at the top of its box, so the field hugs its lines (no minimum height) and centers instead, scrolling past the bar's height. */
const $queryInput: TextStyle = { alignSelf: "center", minHeight: 0, maxHeight: 100 }
const $filterBody: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.md })
const $filterSection: ViewStyle = { gap: 8 }

const $searchHeader: ViewStyle = { paddingBottom: 4 }
const $searchResults: ViewStyle = { paddingTop: 8 }

/** why: the list spaces its rows but not its header or footer, so content beside the rows keeps that gap, and an empty slot adds none. */
function ResultSlot({ edge, children }: { edge: "above" | "below"; children: ReactNode }) {
  const { theme } = useAppTheme()
  if (!Children.toArray(children).length) return null
  const gap = theme.spacing.sm
  return (
    <View style={{ gap, [edge === "above" ? "paddingBottom" : "paddingTop"]: gap }}>
      {children}
    </View>
  )
}
