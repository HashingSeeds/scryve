import { useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { Pressable, ScrollView, View } from "react-native"

import { FilterChips } from "@/components/FilterChips"
import { Text } from "@/components/Text"
import { useRevealSelected } from "@/components/useRevealSelected"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { gameTypeLabel, type GameTab, type GameType } from "./gameTypes"
import { playSystemShortLabel } from "./playSystems"

export interface GameTabsProps {
  tabs: readonly GameTab[]
  selectedId: string
  detail: (type: GameType) => string
  onChoose: (type: GameType) => void
}

const tabKey = (tab: Pick<GameTab, "system">) => tab.system ?? "none"

// why: a game row and a format row each scroll sideways, so adding games or formats never adds height.
export function GameTabs({ tabs, selectedId, detail, onChoose }: GameTabsProps) {
  const {
    themed,
    theme: { spacing },
  } = useAppTheme()
  const selectedTab = tabs.find((tab) => tab.types.some((type) => type.id === selectedId))
  // why: returning to a game picks the format last played in it on this screen, so most switches are one tap.
  const [lastFormat, setLastFormat] = useState<Partial<Record<string, string>>>(() =>
    selectedTab ? { [tabKey(selectedTab)]: selectedId } : {},
  )
  const { scrollProps, itemLayout } = useRevealSelected(selectedTab && tabKey(selectedTab))

  function choose(type: GameType) {
    setLastFormat((last) => ({ ...last, [tabKey(type)]: type.id }))
    onChoose(type)
  }

  function openTab(tab: GameTab) {
    if (tab === selectedTab) return
    const type = tab.types.find(({ id }) => id === lastFormat[tabKey(tab)]) ?? tab.types[0]
    if (type) choose(type)
  }

  return (
    <View style={themed($edgeToEdge)}>
      <ScrollView
        {...scrollProps}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        accessibilityRole="tablist"
        accessibilityLabel={translate("play:newGame.gameLabel")}
        style={themed($tabsTrack)}
        contentContainerStyle={themed($tabs)}
      >
        {tabs.map((tab) => {
          const selected = tab === selectedTab
          return (
            <Pressable
              key={tabKey(tab)}
              testID={`game-tab-${tabKey(tab)}`}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              aria-selected={selected}
              style={[themed($tab), selected && themed($selectedTab)]}
              onLayout={itemLayout(tabKey(tab))}
              onPress={() => openTab(tab)}
            >
              <Text
                text={playSystemShortLabel(tab.system)}
                weight="medium"
                numberOfLines={1}
                style={themed(selected ? $selectedTabText : $tabText)}
              />
            </Pressable>
          )
        })}
      </ScrollView>
      {selectedTab ? (
        <FilterChips
          // why: each game's formats start scrolled to the front, not where the last game's row was left.
          key={tabKey(selectedTab)}
          testID="game-type"
          edgeInset={spacing.lg}
          accessibilityLabel={translate("play:newGame.formatLabel")}
          chips={selectedTab.types.map((type) => ({
            id: type.id,
            label: gameTypeLabel(type),
            accessibilityLabel: `${gameTypeLabel(type)}, ${detail(type)}`,
          }))}
          selectedId={selectedId}
          onSelect={(id) => {
            const type = selectedTab.types.find((candidate) => candidate.id === id)
            if (type) choose(type)
          }}
        />
      ) : null}
    </View>
  )
}

const $tabsTrack: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
  marginBottom: spacing.sm,
})
// why: rows clipped at the content padding cut a label mid-word; running to the screen edge reads as scrollable instead.
const $edgeToEdge: ThemedStyle<ViewStyle> = ({ spacing }) => ({ marginHorizontal: -spacing.lg })
const $tabs: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.md,
  paddingHorizontal: spacing.lg,
})
const $tab: ThemedStyle<ViewStyle> = () => ({
  minHeight: 44,
  justifyContent: "center",
  borderBottomWidth: 2,
  borderBottomColor: "transparent",
  marginBottom: -1,
})
const $selectedTab: ThemedStyle<ViewStyle> = ({ colors }) => ({ borderBottomColor: colors.tint })
const $tabText: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $selectedTabText: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.tint })
