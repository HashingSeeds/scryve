import { useEffect, useState } from "react"
import { Modal, ScrollView, TouchableOpacity, View } from "react-native"
import type { ViewStyle } from "react-native"
import { useConvex, useConvexConnectionState } from "convex/react"
import type { FunctionReturnType } from "convex/server"

import { CardImage } from "@/components/CardImage"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { SelectField } from "@/components/SelectField"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { convexErrorMessage } from "@/utils/convexError"

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
}) {
  const convex = useConvex()
  const connection = useConvexConnectionState()
  const { themed, theme } = useAppTheme()
  const sections = deckSections(game, format)
  const [section, setSection] = useState(
    sections.find((item) => item.id === "main")?.id ?? sections[0]?.id ?? "main",
  )
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchCard[]>()
  const [offlineResults, setOfflineResults] = useState<KnownCardEntry[]>()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string>()

  const offline = offlineCandidates !== undefined && connection?.isWebSocketConnected === false

  useEffect(() => {
    let active = true
    setResults(undefined)
    setOfflineResults(undefined)
    setMessage(undefined)
    setBusy(query.trim().length >= 2)
    if (query.trim().length < 2) return
    if (offline) {
      setBusy(false)
      const wanted = query.trim().toLowerCase()
      setResults(undefined)
      setOfflineResults(
        offlineCandidates.filter((entry) => entry.card.name.toLowerCase().includes(wanted)),
      )
      return
    }
    setOfflineResults(undefined)
    const timer = setTimeout(async () => {
      try {
        if (!convex) throw new Error("Card search unavailable")
        const found = await convex.action(api.cards.search, { game, query: query.trim() })
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
  }, [convex, game, query, offline, offlineCandidates])

  function add(card: SearchCard) {
    const error = onAdd({
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
    })
    setMessage(error ?? `Added ${card.name}.`)
  }

  function addOffline(entry: KnownCardEntry) {
    const error = onAdd({ ...entry.card, quantity: 1, section })
    setMessage(error ?? `Added ${entry.card.name}.`)
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <Screen
        preset="fixed"
        safeAreaEdges={["bottom"]}
        backgroundColor={theme.colors.surface}
        contentContainerStyle={$screen}
      >
        <Header
          title="Add cards"
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
            maxLength={120}
            autoCorrect={false}
            autoFocus
            returnKeyType="search"
            onChangeText={setQuery}
          />
          <SelectField
            label="Add to"
            options={sections}
            value={section}
            onSelect={(value) => {
              if (value) setSection(value)
            }}
          />
        </View>
        <ScrollView
          style={$results}
          contentContainerStyle={themed($search)}
          keyboardShouldPersistTaps="handled"
        >
          {busy ? <Text size="sm" text="Searching…" /> : null}
          {offline ? (
            <Text size="xxs" text="You’re offline. Searching cards already in your decks." />
          ) : null}
          {offlineResults?.map((entry, index) => (
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
          {offline && offlineResults?.length === 0 ? (
            <Text text="No cached cards match. Cards appear here after you add them online." />
          ) : null}
          {results?.map((card, index) => (
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
          {results?.length === 0 ? <Text text="No cards found." /> : null}
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
