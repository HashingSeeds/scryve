import { useState } from "react"
import { Keyboard, ScrollView, View } from "react-native"
import type { ViewStyle } from "react-native"
import { useConvex } from "convex/react"
import type { FunctionReturnType } from "convex/server"

import { Button } from "@/components/Button"
import { DialogCard } from "@/components/DialogCard"
import { SelectField } from "@/components/SelectField"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { convexErrorMessage } from "@/utils/convexError"

import type { GuestDeckPayload } from "./guestDeck"
import { api } from "../../../convex/_generated/api"
import { deckSections } from "../../../convex/lib/deckGames"

type SearchCard = FunctionReturnType<typeof api.cards.search>[number]

export function GuestCardSearchDialog({
  game,
  format,
  onAdd,
  onClose,
}: {
  game: string
  format: string
  onAdd: (card: GuestDeckPayload["cards"][number]) => string | undefined
  onClose: () => void
}) {
  const convex = useConvex()
  const { themed } = useAppTheme()
  const sections = deckSections(game, format)
  const [section, setSection] = useState(sections[0]?.id ?? "main")
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchCard[]>()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string>()

  async function search() {
    if (busy || query.trim().length < 2) return
    Keyboard.dismiss()
    setBusy(true)
    setMessage(undefined)
    setResults(undefined)
    try {
      if (!convex) throw new Error("Card search unavailable")
      setResults(await convex.action(api.cards.search, { game, query: query.trim() }))
    } catch (cause) {
      setMessage(
        convexErrorMessage(cause, "Could not search cards. Check your connection and try again."),
      )
    } finally {
      setBusy(false)
    }
  }

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

  return (
    <DialogCard
      visible
      onClose={onClose}
      wide
      accessibilityViewIsModal
      backdropAccessibilityLabel="Close card search"
      dialogTestID="guest-card-search-dialog"
    >
      <Text preset="subheading" text="Add cards" />
      <TextField
        testID="guest-card-search-input"
        label="Card name"
        value={query}
        maxLength={120}
        autoCorrect={false}
        onChangeText={setQuery}
        onSubmitEditing={search}
      />
      <Button
        testID="guest-card-search"
        text={busy ? "Searching…" : "Search"}
        disabled={busy || query.trim().length < 2}
        onPress={search}
      />
      <SelectField
        label="Add to"
        options={sections}
        value={section}
        onSelect={(value) => setSection(value ?? sections[0]?.id ?? "main")}
      />
      <ScrollView style={$results} keyboardShouldPersistTaps="handled">
        {results?.map((card, index) => (
          <View key={index} style={themed($result)}>
            <Text style={$name} text={card.name} />
            <Button
              text="Add"
              accessibilityLabel={`Add ${card.name} to deck`}
              onPress={() => add(card)}
            />
          </View>
        ))}
        {results?.length === 0 ? <Text text="No cards found." /> : null}
      </ScrollView>
      {message ? <Text accessibilityLiveRegion="polite" text={message} /> : null}
      <Button text="Done" onPress={onClose} />
    </DialogCard>
  )
}

const $results: ViewStyle = { maxHeight: 280, flexShrink: 1 }
const $name: ViewStyle = { flex: 1 }
const $result: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  paddingVertical: spacing.xs,
  borderBottomWidth: 1,
  borderBottomColor: colors.border,
})
