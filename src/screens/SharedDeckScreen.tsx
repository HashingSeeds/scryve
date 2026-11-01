import { useState, type ReactNode } from "react"
import { SectionList, View } from "react-native"
import type { ViewStyle } from "react-native"
import { useQuery } from "convex/react"

import { AlertNote } from "@/components/AlertNote"
import { BottomActionBar } from "@/components/BottomActionBar"
import { Button } from "@/components/Button"
import { CardFocusDialog } from "@/components/CardFocusDialog"
import { Header, HeaderIcon } from "@/components/Header"
import { LoadingProgress } from "@/components/LoadingProgress"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { useSheetPresence } from "@/components/useSheetPresence"
import { ConvexQueryBoundary } from "@/features/async/ConvexQueryBoundary"
import type { CloudAccess } from "@/features/auth/CloudScreen"
import { loadCardDetails } from "@/features/decks/cardDetailsCache"
import { buildSections } from "@/features/decks/deckBuild"
import { DeckCardRow, DeckCardSectionHeader } from "@/features/decks/DeckCardRow"
import {
  cardDetailsKey,
  printingKey,
  totalQuantity,
  type DeckCard,
} from "@/features/decks/deckCards"
import { cardCountLabel } from "@/features/decks/deckCopy"
import { useSaveNewDeck } from "@/features/decks/localDeckSync"
import { SaveDestination, useSaveDestination } from "@/features/decks/SaveDestination"
import {
  keepSharedDeck,
  sharedDeckPayload,
  type SharedDeckView,
} from "@/features/decks/sharedDecks"
import { localizedDeckSections } from "@/features/game/playSystems"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { convexErrorMessage } from "@/utils/convexError"

import { api } from "../../convex/_generated/api"
import { deckFormatLabel, deckGame } from "../../convex/lib/deckGames"

type SharedDeckScreenProps = {
  token: string
  access?: CloudAccess
  onBack: () => void
  onPlay: (deckKey: string) => void
  onSaved: (deckId: string) => void
}

export function SharedDeckScreen(props: SharedDeckScreenProps) {
  return (
    <ConvexQueryBoundary
      resetKey={props.token}
      fallback={({ retry }) => (
        <SharedDeckFrame onBack={props.onBack} status="unavailable">
          <Text tone="dim" tx="decks:detail.loadFailed" />
          <Button tx="common:retry" onPress={retry} />
        </SharedDeckFrame>
      )}
    >
      <SharedDeckQuery {...props} />
    </ConvexQueryBoundary>
  )
}

function SharedDeckQuery(props: SharedDeckScreenProps) {
  const shared = useQuery(api.decks.shared, { token: props.token })
  if (shared === undefined) return <SharedDeckFrame onBack={props.onBack} status="loading" />
  if (shared === null)
    return (
      <SharedDeckFrame onBack={props.onBack} status="unavailable">
        <Text testID="shared-deck-unavailable" tone="dim" tx="decks:shared.unavailable" />
      </SharedDeckFrame>
    )
  return <SharedDeckList shared={shared} {...props} />
}

function SharedDeckFrame({
  onBack,
  status,
  children,
}: {
  onBack: () => void
  status: "loading" | "unavailable"
  children?: ReactNode
}) {
  const { themed, theme } = useAppTheme()
  return (
    <Screen
      preset="fixed"
      safeAreaEdges={["bottom"]}
      backgroundColor={theme.colors.surface}
      contentContainerStyle={$screen}
    >
      <SharedDeckHeader onBack={onBack} />
      <LoadingProgress
        state={status}
        edge="bottom"
        accessibilityText={translate(
          status === "loading" ? "decks:detail.loading" : "decks:detail.unavailable",
        )}
      />
      <View style={themed($message)}>{children}</View>
    </Screen>
  )
}

function SharedDeckHeader({ onBack }: { onBack: () => void }) {
  const { theme } = useAppTheme()
  return (
    <Header
      titleTx="decks:shared.title"
      backgroundColor={theme.colors.surface}
      LeftActionComponent={
        <HeaderIcon icon="back" label={translate("common:back")} onPress={onBack} />
      }
    />
  )
}

function SharedDeckList({
  shared,
  token,
  access,
  onBack,
  onPlay,
  onSaved,
}: SharedDeckScreenProps & { shared: SharedDeckView }) {
  const { themed, theme } = useAppTheme()
  const destination = useSaveDestination(access)
  const saveNewDeck = useSaveNewDeck(destination.access?.ownerId)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const [focused, setFocused] = useState<DeckCard & { boardLabel: string }>()
  const focus = useSheetPresence(focused)
  const { name, game, format, cards } = shared
  const sections = buildSections(cards, localizedDeckSections(game, format))
  const signIn = access && !access.ready && !access.loading ? access : undefined
  const busy = saving || Boolean(access?.loading)

  function play() {
    if (!keepSharedDeck(shared, token)) return setError(translate("decks:guestStorage.saveFailed"))
    onPlay(shared.deckKey)
  }

  async function save() {
    setSaving(true)
    setError(undefined)
    try {
      onSaved(await saveNewDeck(sharedDeckPayload(shared), destination.value))
    } catch (cause) {
      setError(convexErrorMessage(cause, translate("decks:detail.saveFailed")))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Screen
      preset="fixed"
      safeAreaEdges={["bottom"]}
      backgroundColor={theme.colors.surface}
      contentContainerStyle={$screen}
    >
      <SharedDeckHeader onBack={onBack} />
      <SectionList
        testID="shared-deck"
        style={$flex}
        contentContainerStyle={themed($content)}
        sections={sections}
        keyExtractor={(card, index) => `${printingKey(card)}:${index}`}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <View style={themed($title)}>
            <Text testID="shared-deck-name" preset="heading" size="xl" text={name} />
            <Text
              size="xs"
              tone="dim"
              text={[
                deckGame(game)?.shortLabel ?? game,
                deckFormatLabel(game, format),
                cardCountLabel(totalQuantity(cards)),
              ].join(" · ")}
            />
          </View>
        }
        renderSectionHeader={({ section }) => (
          <DeckCardSectionHeader label={section.label} quantity={section.quantity} />
        )}
        renderItem={({ item, section }) => (
          <DeckCardRow
            card={item}
            game={game}
            format={format}
            editing={false}
            onFocus={(card) => setFocused({ ...card, boardLabel: section.label })}
            onIncrement={() => {}}
            onDecrement={() => {}}
          />
        )}
      />
      <BottomActionBar style={themed($bar)}>
        {error ? <AlertNote text={error} /> : null}
        {signIn ? (
          <Button
            testID="shared-deck-sign-in"
            preset="primary"
            text={signIn.actionLabel ?? signIn.message}
            onPress={signIn.request}
          />
        ) : (
          <>
            <Button
              testID="shared-deck-play"
              preset="primary"
              tx="decks:shared.play"
              disabled={busy}
              onPress={play}
            />
            <SaveDestination destination={destination} />
            <Button
              testID="shared-deck-save"
              tx={saving ? "decks:saving" : "decks:shared.addToMine"}
              disabled={busy}
              onPress={() => void save()}
            />
          </>
        )}
      </BottomActionBar>
      {focus.shown ? (
        <CardFocusDialog
          visible={focus.visible}
          onDismissed={focus.onDismissed}
          onClose={() => setFocused(undefined)}
          card={{
            ...focus.shown,
            game,
            cardId:
              focus.shown.scryfallId ??
              focus.shown.cardId ??
              focus.shown.printingId ??
              focus.shown.providerCardId,
          }}
          details={loadCardDetails()[cardDetailsKey(focus.shown, game)]}
        />
      ) : null}
    </Screen>
  )
}

const $flex: ViewStyle = { flex: 1 }
const $screen: ViewStyle = { flex: 1, width: "100%" }
const $content: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.md,
  paddingBottom: spacing.lg,
  width: "100%",
  maxWidth: 720,
  alignSelf: "center",
})
const $title: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
  paddingTop: spacing.sm,
})
const $message: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
  padding: spacing.md,
  width: "100%",
  maxWidth: 720,
  alignSelf: "center",
})
const $bar: ThemedStyle<ViewStyle> = ({ colors }) => ({ backgroundColor: colors.surface })
