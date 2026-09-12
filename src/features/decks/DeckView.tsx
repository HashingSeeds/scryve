import { type ReactNode } from "react"
import { SectionList, TouchableOpacity, View } from "react-native"
import type { ImageStyle, TextStyle, ViewStyle } from "react-native"
import Svg, { Path } from "react-native-svg"

import { BottomActionBar } from "@/components/BottomActionBar"
import { Button } from "@/components/Button"
import { CardImage } from "@/components/CardImage"
import { Header } from "@/components/Header"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { accessibleForeground } from "@/utils/colorContrast"

import { groupedCards, printingKey, totalQuantity, type DeckCard } from "./deckCards"
import { deckFormatLabel, deckGame, deckSections } from "../../../convex/lib/deckGames"

export function DeckView({
  tab,
  onTabChange: setTab,
  name,
  game,
  format,
  cards,
  note,
  editing,
  dirty,
  busy,
  guest,
  cardsUnavailable,
  editingDisabled,
  saveStatus,
  error,
  onBack,
  onEdit,
  onSave,
  onCancel,
  onDetails,
  onAdd,
  onNoteChange,
  onFocus,
  onIncrement,
  onDecrement,
  undo,
}: {
  tab: "cards" | "notes"
  onTabChange: (tab: "cards" | "notes") => void
  name: string
  game: string
  format: string
  cards: DeckCard[]
  note: string
  editing: boolean
  dirty: boolean
  busy?: boolean
  guest?: boolean
  cardsUnavailable?: boolean
  editingDisabled?: boolean
  saveStatus?: string
  error?: ReactNode
  onBack: () => void
  onEdit: () => void
  onSave: () => void
  onCancel: () => void
  onDetails: () => void
  onAdd: () => void
  onNoteChange: (note: string) => void
  onFocus: (card: DeckCard) => void
  onIncrement: (card: DeckCard) => void
  onDecrement: (card: DeckCard) => void
  undo?: { name: string; restore: () => void }
}) {
  const { themed, theme } = useAppTheme()
  const sections = groupedCards(cards, deckSections(game, format))
  return (
    <>
      <Header
        title={editing ? "Edit deck" : guest ? "Guest deck" : "Deck"}
        backgroundColor={theme.colors.surface}
        leftIcon={editing ? undefined : "back"}
        leftText={editing ? "Cancel" : undefined}
        onLeftPress={editing ? onCancel : onBack}
        RightActionComponent={
          <View style={$row}>
            <TouchableOpacity
              accessibilityRole="button"
              testID={editing ? "save-version-button" : "edit-deck-button"}
              disabled={busy || editingDisabled || (editing && !dirty)}
              style={$touch}
              onPress={editing ? onSave : onEdit}
            >
              <Text
                text={editing ? (busy ? "Saving…" : "Save") : "Edit"}
                style={[
                  themed($action),
                  (busy || editingDisabled || (editing && !dirty)) && $disabled,
                ]}
              />
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Deck details"
              testID="deck-settings-button"
              style={$touch}
              disabled={busy || editing || editingDisabled}
              onPress={onDetails}
            >
              <Text text="•••" style={busy || editing || editingDisabled ? $disabled : undefined} />
            </TouchableOpacity>
          </View>
        }
      />
      <SectionList
        testID="deck-cards-list"
        style={$flex}
        contentContainerStyle={themed($content)}
        sections={tab === "cards" ? sections : []}
        keyExtractor={(card, index) => `${printingKey(card)}:${index}`}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <>
            <View style={themed($title)}>
              <Text text={name} style={$heading} weight="semiBold" />
              <Text
                size="xs"
                style={themed($dim)}
                text={[
                  deckGame(game)?.shortLabel ?? game,
                  deckFormatLabel(game, format),
                  cardsUnavailable
                    ? undefined
                    : `${totalQuantity(cards)} ${totalQuantity(cards) === 1 ? "card" : "cards"}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              />
            </View>
            <View style={themed($tabs)} accessibilityRole="tablist">
              {(["cards", "notes"] as const).map((value) => (
                <TouchableOpacity
                  key={value}
                  accessibilityRole="tab"
                  testID={`deck-tab-${value}`}
                  accessibilityState={{ selected: tab === value }}
                  style={[themed($tab), tab === value && themed($selectedTab)]}
                  onPress={() => setTab(value)}
                >
                  <Text
                    size="sm"
                    text={value === "cards" ? "Cards" : "Notes"}
                    style={tab === value ? undefined : themed($dim)}
                  />
                </TouchableOpacity>
              ))}
            </View>
            {tab === "notes" ? (
              <View style={themed($notes)}>
                {editing ? (
                  <TextField
                    testID="deck-note-input"
                    accessibilityLabel="Deck notes"
                    value={note}
                    onChangeText={onNoteChange}
                    placeholder="Add a note"
                    multiline
                    maxLength={1000}
                    style={$noteInput}
                  />
                ) : (
                  <>
                    <Text text={note || "No notes yet."} size="sm" />
                    <TouchableOpacity
                      testID="edit-deck-notes"
                      style={$noteAction}
                      accessibilityRole="button"
                      disabled={editingDisabled}
                      onPress={onEdit}
                    >
                      <Text
                        text="Edit notes"
                        style={[themed($action), editingDisabled && $disabled]}
                      />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            ) : cardsUnavailable ? (
              <Text style={themed($notes)} text="Card list unavailable offline." />
            ) : cards.length === 0 ? (
              <Text style={themed($notes)} text="No cards yet. Add your first card below." />
            ) : null}
          </>
        }
        renderSectionHeader={({ section }) => (
          <View style={themed($section)}>
            <Text size="sm" weight="semiBold" text={section.label} />
            <Text size="sm" style={themed($dim)} text={String(section.quantity)} />
          </View>
        )}
        renderItem={({ item }) => (
          <View style={themed($card)}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={`${item.quantity}× ${item.name}`}
              testID={`deck-card-row-${printingKey(item)}`}
              style={themed($cardLink)}
              onPress={() => onFocus(item)}
            >
              <CardImage
                game={game}
                cardId={item.scryfallId ?? item.cardId ?? item.printingId ?? item.providerCardId}
                source={item.smallImageUrl ?? item.imageUrl}
                accessibilityLabel={item.name}
                compact
                style={$image}
              />
              <Text size="sm" weight="medium" text={item.name} style={$flex} numberOfLines={2} />
            </TouchableOpacity>
            {editing ? (
              <View style={$row}>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`${item.quantity === 1 ? "Remove" : "Decrease"} ${item.name}`}
                  disabled={busy || cardsUnavailable || editingDisabled}
                  style={$touch}
                  onPress={() => onDecrement(item)}
                >
                  {item.quantity === 1 ? (
                    <Svg
                      width={18}
                      height={18}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={theme.colors.brandText}
                      strokeWidth={1.6}
                    >
                      <Path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7" />
                    </Svg>
                  ) : (
                    <Text text="−" style={themed($action)} />
                  )}
                </TouchableOpacity>
                <Text size="sm" text={String(item.quantity)} style={$quantity} />
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Increase ${item.name}`}
                  disabled={busy || cardsUnavailable || editingDisabled || item.quantity >= 999}
                  style={$touch}
                  onPress={() => onIncrement(item)}
                >
                  <Text text="+" style={themed($action)} />
                </TouchableOpacity>
              </View>
            ) : (
              <Text size="sm" text={`${item.quantity}×`} style={themed($dim)} />
            )}
          </View>
        )}
      />
      <BottomActionBar style={themed($bar)}>
        {error}
        {undo ? (
          <View style={$row}>
            <Text size="xs" style={$flex} text={`Removed ${undo.name}`} />
            <TouchableOpacity style={$touch} accessibilityRole="button" onPress={undo.restore}>
              <Text text="Undo" style={themed($action)} />
            </TouchableOpacity>
          </View>
        ) : null}
        <View style={themed($footer)}>
          <Text
            size="xxs"
            style={[themed($dim), $flex]}
            text={dirty ? "Unsaved changes" : (saveStatus ?? (guest ? "Saved on device" : "Saved"))}
          />
          <Button
            testID="deck-add-cards"
            text="+ Add cards"
            onPress={onAdd}
            disabled={busy || cardsUnavailable || editingDisabled}
            style={themed($primary)}
            textStyle={{ color: accessibleForeground(theme.colors.tint) }}
          />
        </View>
      </BottomActionBar>
    </>
  )
}
const $flex: ViewStyle = { flex: 1 }
const $row: ViewStyle = { flexDirection: "row", alignItems: "center" }
const $touch: ViewStyle = {
  minWidth: 44,
  minHeight: 44,
  alignItems: "center",
  justifyContent: "center",
}
const $disabled: TextStyle = { opacity: 0.4 }
const $heading: TextStyle = { fontSize: 28, lineHeight: 34 }
const $quantity: TextStyle = { minWidth: 18, textAlign: "center", fontVariant: ["tabular-nums"] }
const $image: ImageStyle = { width: 32, height: 45 }
const $noteInput: TextStyle = { minHeight: 160, textAlignVertical: "top" }
const $noteAction: ViewStyle = { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" }
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
  paddingBottom: spacing.lg,
})
const $dim: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $action: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.brandText })
const $tabs: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  gap: spacing.lg,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
const $tab: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 44,
  justifyContent: "center",
  paddingHorizontal: spacing.xxs,
  borderBottomWidth: 2,
  borderBottomColor: "transparent",
})
const $selectedTab: ThemedStyle<ViewStyle> = ({ colors }) => ({ borderBottomColor: colors.tint })
const $notes: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingVertical: spacing.lg,
  gap: spacing.sm,
})
const $section: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  justifyContent: "space-between",
  paddingTop: spacing.lg,
  paddingBottom: spacing.xs,
})
const $card: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  minHeight: 66,
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
const $cardLink: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  paddingVertical: spacing.xs,
})
const $bar: ThemedStyle<ViewStyle> = ({ colors }) => ({ backgroundColor: colors.surface })
const $footer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.sm,
  alignItems: "center",
  width: "100%",
  maxWidth: 720,
  alignSelf: "center",
})
const $primary: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flex: 2,
  minHeight: 44,
  borderRadius: 6,
  backgroundColor: colors.tint,
  borderColor: colors.tint,
})
