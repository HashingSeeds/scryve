import type { ImageStyle, TextStyle, ViewStyle } from "react-native"
import { FlatList, Image, TouchableOpacity, View } from "react-native"
import { useQuery } from "convex/react"

import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { api } from "../../convex/_generated/api"

type ShelfDeck = {
  _id: string
  name: string
  coverImageUrl?: string
  versionNumber?: number
}

function coverInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?"
}

function versionLabel(versionNumber?: number) {
  return versionNumber ? `v${versionNumber}` : "no list"
}

function filledFraction(used: number, limit: number): `${number}%` {
  if (limit <= 0) return "0%"
  return `${Math.min(100, Math.round((used / limit) * 100))}%`
}

function DeckTile({ deck, onPress }: { deck: ShelfDeck; onPress: () => void }) {
  const { themed } = useAppTheme()
  return (
    <TouchableOpacity
      style={themed($tileColumn)}
      accessibilityRole="button"
      accessibilityLabel={deck.name}
      activeOpacity={0.8}
      onPress={onPress}
    >
      {deck.coverImageUrl ? (
        <Image source={{ uri: deck.coverImageUrl }} style={themed($cover)} />
      ) : (
        <View style={themed($coverPlaceholder)}>
          <Text
            weight="bold"
            size="lg"
            text={coverInitial(deck.name)}
            style={themed($dimmedText)}
          />
        </View>
      )}
      <Text size="xs" numberOfLines={1} text={deck.name} />
      <Text size="xxs" style={themed($dimmedText)} text={versionLabel(deck.versionNumber)} />
    </TouchableOpacity>
  )
}

function AddDeckTile({ onPress }: { onPress: () => void }) {
  const { themed } = useAppTheme()
  return (
    <TouchableOpacity
      testID="add-deck-tile"
      style={themed($tileColumn)}
      accessibilityRole="button"
      accessibilityLabel="Add deck"
      activeOpacity={0.8}
      onPress={onPress}
    >
      <View style={themed($addTile)}>
        <Text size="xl" text="+" style={themed($dimmedText)} />
      </View>
      <Text size="xs" numberOfLines={1} text="Add deck" />
    </TouchableOpacity>
  )
}

export function DecksScreen({
  onBack,
  onSelect,
  onAddDeck,
}: {
  onBack: () => void
  onSelect: (deckId: string) => void
  onAddDeck: () => void
}) {
  const { themed } = useAppTheme()
  const mine = useQuery(api.decks.listMine)
  const capacity = mine?.capacity
  const atCapacity = capacity !== undefined && !capacity.canCreate
  const decks = mine?.decks ?? []

  return (
    <Screen preset="fixed" safeAreaEdges={["bottom"]} contentContainerStyle={themed($screen)}>
      <Header title="Decks" leftTx="common:back" onLeftPress={onBack} />
      <View style={themed($content)}>
        <Text preset="heading" text="Your decks" />
        <FlatList
          testID="decks-list"
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={themed($shelfContent)}
          data={decks}
          keyExtractor={(deck) => deck._id}
          renderItem={({ item: deck }) => (
            <DeckTile deck={deck} onPress={() => onSelect(deck._id)} />
          )}
          ListFooterComponent={<AddDeckTile onPress={onAddDeck} />}
        />
        {mine && decks.length === 0 ? (
          <Text size="xs" style={themed($dimmedText)} text="No decks yet — add your first deck." />
        ) : null}
        {capacity ? (
          <View style={themed($capacity)}>
            <Text
              size="xs"
              style={themed($dimmedText)}
              text={`${capacity.used} of ${capacity.limit} deck${capacity.limit === 1 ? "" : "s"} used`}
            />
            <View style={themed($meterTrack)}>
              <View
                style={[
                  themed($meterFill),
                  { width: filledFraction(capacity.used, capacity.limit) },
                ]}
              />
            </View>
            {atCapacity && !capacity.premium ? (
              <Text
                size="xs"
                text="Free accounts include one deck. Premium unlocks unlimited decks."
              />
            ) : null}
          </View>
        ) : null}
      </View>
    </Screen>
  )
}

const TILE_SIZE = 96

const $cover: ThemedStyle<ImageStyle> = ({ spacing }) => ({
  width: TILE_SIZE,
  height: TILE_SIZE,
  borderRadius: spacing.xs,
})
const $coverPlaceholder: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  width: TILE_SIZE,
  height: TILE_SIZE,
  borderRadius: spacing.xs,
  alignItems: "center",
  justifyContent: "center",
  borderWidth: 1,
  borderColor: colors.separator,
  backgroundColor: colors.palette.neutral200,
})
const $addTile: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  width: TILE_SIZE,
  height: TILE_SIZE,
  borderRadius: spacing.xs,
  alignItems: "center",
  justifyContent: "center",
  borderWidth: 1,
  borderStyle: "dashed",
  borderColor: colors.separator,
})
const $tileColumn: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: TILE_SIZE,
  gap: spacing.xxs,
})
const $dimmedText: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $capacity: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xxs,
  marginTop: spacing.sm,
})
const $meterTrack: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  width: "100%",
  height: spacing.xxs,
  borderRadius: spacing.xxs,
  overflow: "hidden",
  backgroundColor: colors.separator,
})
const $meterFill: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  height: "100%",
  borderRadius: spacing.xxs,
  backgroundColor: colors.tint,
})
const $screen: ThemedStyle<ViewStyle> = () => ({ flex: 1, width: "100%" })
const $content: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  width: "100%",
  maxWidth: 720,
  alignSelf: "center",
  gap: spacing.sm,
  paddingHorizontal: spacing.lg,
  paddingBottom: spacing.xl,
})
const $shelfContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
  paddingVertical: spacing.xxs,
})
