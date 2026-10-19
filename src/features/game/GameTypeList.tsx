import { Fragment, useState } from "react"
import type { ImageStyle, TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"

import { Button } from "@/components/Button"
import { ChoiceButton } from "@/components/ChoiceButton"
import { Icon } from "@/components/Icon"
import { Text } from "@/components/Text"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { gameTypeLabel, type GameType, type gameTypesBySystem } from "./gameTypes"
import { playSystemShortLabel, type PlaySystemId } from "./playSystems"

export interface GameTypeListProps {
  types: { suggested: readonly GameType[]; more: ReturnType<typeof gameTypesBySystem> }
  selectedId?: string
  detail: (type: GameType) => string
  onChoose: (type: GameType) => void
}

export function GameTypeList({ types, selectedId, detail, onChoose }: GameTypeListProps) {
  const { themed } = useAppTheme()
  const [toggledSystems, setToggledSystems] = useState<Partial<Record<PlaySystemId, boolean>>>({})
  const choice = (type: GameType) => (
    <ChoiceButton
      key={type.id}
      testID={`game-type-${type.id}`}
      text={gameTypeLabel(type)}
      detail={detail(type)}
      detailShrinks
      selected={type.id === selectedId}
      onPress={() => onChoose(type)}
    />
  )
  return (
    <View style={themed($list)}>
      {types.suggested.map(choice)}
      {types.more.map((group) => {
        const open =
          toggledSystems[group.system] ?? group.types.some((type) => type.id === selectedId)
        return (
          <Fragment key={group.system}>
            <FormatsDisclosure
              system={group.system}
              count={group.types.length}
              expanded={open}
              onPress={() =>
                setToggledSystems((toggled) => ({ ...toggled, [group.system]: !open }))
              }
            />
            {open ? group.types.map(choice) : null}
          </Fragment>
        )
      })}
    </View>
  )
}

// why: tint text and a caret, not a choice row, so opening a game's formats never reads as picking one.
function FormatsDisclosure({
  system,
  count,
  expanded,
  onPress,
}: {
  system: PlaySystemId
  count: number
  expanded: boolean
  onPress: () => void
}) {
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  const label = playSystemShortLabel(system)
  const more = translate("play:newGame.moreFormats", { count })
  return (
    <Button
      testID={`game-type-more-${system}`}
      text={label}
      accessibilityLabel={`${label}, ${more}`}
      accessibilityState={{ expanded }}
      style={themed($disclosure)}
      textStyle={themed($disclosureText)}
      RightAccessory={({ style }) => (
        <View style={[style, themed($disclosureDetail)]}>
          <Text size="xs" text={more} style={themed($disclosureText)} />
          <Icon
            icon="caretRight"
            size={14}
            color={colors.tint}
            style={expanded ? $caretUp : $caretDown}
          />
        </View>
      )}
      onPress={onPress}
    />
  )
}

const $list: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $disclosure: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 44,
  justifyContent: "flex-start",
  paddingHorizontal: spacing.sm,
  borderWidth: 0,
  backgroundColor: "transparent",
})
const $disclosureText: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.tint })
const $disclosureDetail: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
})
const $caretDown: ImageStyle = { transform: [{ rotate: "90deg" }] }
const $caretUp: ImageStyle = { transform: [{ rotate: "-90deg" }] }
