import type { TextStyle, ViewStyle } from "react-native"
import { Pressable, View } from "react-native"

import { Text } from "@/components/Text"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { statusLabel, type FeedbackBoardItem } from "./status"

const VOTE_MARK = "▲"

export function VoteButton({
  item,
  onVote,
}: {
  item: Pick<FeedbackBoardItem, "title" | "votes" | "voted">
  onVote: (voted: boolean) => void
}) {
  const { themed } = useAppTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={translate(
        item.voted ? "feedback:board.removeVote" : "feedback:board.vote",
        {
          title: item.title,
          count: item.votes,
        },
      )}
      accessibilityState={{ selected: item.voted }}
      hitSlop={8}
      onPress={() => onVote(!item.voted)}
      style={({ pressed }) => [themed([$vote, item.voted && $voted]), pressed && $pressed]}
    >
      <Text text={VOTE_MARK} size="xxs" style={themed(item.voted ? $tint : $muted)} />
      <Text text={String(item.votes)} size="xs" weight="bold" />
    </Pressable>
  )
}

export function RequestMeta({
  item,
  yours,
  visibility,
}: {
  item: Pick<FeedbackBoardItem, "status" | "shippedIn" | "kind">
  yours?: boolean
  visibility?: "public" | "private"
}) {
  const { themed } = useAppTheme()
  return (
    <View style={themed($meta)}>
      <Text
        text={statusLabel(item)}
        size="xxs"
        weight="bold"
        style={themed(item.status === "shipped" ? $shipped : $muted)}
      />
      {item.kind === "bug" ? (
        <Text tx="feedback:board.bug" size="xxs" style={themed($muted)} />
      ) : null}
      {yours ? <Text tx="feedback:board.yours" size="xxs" style={themed($tint)} /> : null}
      {visibility ? (
        <Text tx={`feedback:mine.${visibility}`} size="xxs" style={themed($muted)} />
      ) : null}
    </View>
  )
}

const $vote: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  width: 48,
  minHeight: 48,
  alignItems: "center",
  justifyContent: "center",
  borderWidth: 1,
  borderRadius: spacing.xs,
  borderColor: colors.separator,
})
const $voted: ThemedStyle<ViewStyle> = ({ colors }) => ({ borderColor: colors.tint })
const $pressed: ViewStyle = { opacity: 0.6 }
const $meta: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  columnGap: spacing.sm,
  rowGap: spacing.xxs,
})
const $tint: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.tint })
const $muted: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $shipped: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.success })
