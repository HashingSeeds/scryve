import type { TextStyle, ViewStyle } from "react-native"
import { Pressable, View } from "react-native"

import { Button } from "@/components/Button"
import { FilterChips } from "@/components/FilterChips"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { statusLabel, type FeedbackBoardItem } from "@/features/feedback/status"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

const FILTERS = ["all", "review", "planned", "building", "shipped"] as const
const VOTE_MARK = "▲"
export type FeedbackFilter = (typeof FILTERS)[number]

export interface FeedbackBoardScreenProps {
  items: readonly FeedbackBoardItem[] | undefined
  filter: FeedbackFilter
  unread: number
  onFilter: (filter: FeedbackFilter) => void
  onVote: (item: FeedbackBoardItem, voted: boolean) => void
  onOpen: (item: FeedbackBoardItem) => void
  onSuggest: () => void
  onMine: () => void
  onBack: () => void
}

export function FeedbackBoardScreen({
  items,
  filter,
  unread,
  onFilter,
  onVote,
  onOpen,
  onSuggest,
  onMine,
  onBack,
}: FeedbackBoardScreenProps) {
  const { themed } = useAppTheme()
  return (
    <Screen
      preset="scroll"
      safeAreaEdges={["bottom"]}
      header={{ titleTx: "feedback:board.title", leftTx: "common:back", onLeftPress: onBack }}
      contentContainerStyle={themed($content)}
    >
      <FilterChips
        chips={FILTERS.map((id) => ({
          id,
          label:
            id === "all" ? translate("feedback:board.all") : translate(`feedback:status.${id}`),
        }))}
        selectedId={filter}
        accessibilityLabel={translate("feedback:board.filters")}
        onSelect={(id) => {
          const next = FILTERS.find((candidate) => candidate === id)
          if (next) onFilter(next)
        }}
      />
      <View style={themed($actions)}>
        <Button tx="feedback:board.suggest" preset="reversed" style={$grow} onPress={onSuggest} />
        <Button
          text={
            unread
              ? translate("feedback:board.mineUnread", { count: unread })
              : translate("feedback:board.mine")
          }
          style={$grow}
          onPress={onMine}
        />
      </View>
      {items?.length === 0 ? (
        <Text tx="feedback:board.empty" style={themed($muted)} />
      ) : (
        items?.map((item) => (
          <FeedbackRow key={item._id} item={item} onVote={onVote} onOpen={onOpen} />
        ))
      )}
    </Screen>
  )
}

function FeedbackRow({
  item,
  onVote,
  onOpen,
}: {
  item: FeedbackBoardItem
  onVote: FeedbackBoardScreenProps["onVote"]
  onOpen: FeedbackBoardScreenProps["onOpen"]
}) {
  const { themed } = useAppTheme()
  const voteLabel = translate(item.voted ? "feedback:board.removeVote" : "feedback:board.vote", {
    title: item.title,
    count: item.votes,
  })
  return (
    <View style={themed($row)}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={voteLabel}
        accessibilityState={{ selected: item.voted }}
        hitSlop={8}
        onPress={() => onVote(item, !item.voted)}
        style={themed([$vote, item.voted && $voted])}
      >
        <Text text={VOTE_MARK} size="xxs" style={themed(item.voted ? $votedText : $muted)} />
        <Text text={String(item.votes)} size="xs" weight="bold" />
      </Pressable>
      <Pressable
        accessibilityRole={item.mine ? "button" : undefined}
        disabled={!item.mine}
        onPress={() => onOpen(item)}
        style={themed($rowText)}
      >
        <Text text={item.title} weight="bold" />
        <Text text={item.body} size="xs" numberOfLines={3} style={themed($muted)} />
        <Text
          text={statusLabel(item)}
          size="xxs"
          weight="bold"
          style={themed(item.status === "shipped" ? $shipped : $muted)}
        />
      </Pressable>
    </View>
  )
}

export function isFeedbackStatus(filter: FeedbackFilter): filter is Exclude<FeedbackFilter, "all"> {
  return filter !== "all"
}

const $content: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: "100%",
  maxWidth: 680,
  alignSelf: "center",
  paddingHorizontal: spacing.lg,
  paddingBottom: spacing.lg,
  gap: spacing.md,
})
const $actions: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.sm,
})
const $grow: ViewStyle = { flex: 1 }
const $row: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  gap: spacing.md,
  paddingTop: spacing.md,
  borderTopWidth: 1,
  borderColor: colors.separator,
})
const $vote: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  width: 44,
  minHeight: 48,
  alignItems: "center",
  justifyContent: "center",
  borderWidth: 1,
  borderRadius: spacing.xs,
  borderColor: colors.separator,
})
const $voted: ThemedStyle<ViewStyle> = ({ colors }) => ({ borderColor: colors.tint })
const $votedText: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.tint })
const $rowText: ThemedStyle<ViewStyle> = ({ spacing }) => ({ flex: 1, gap: spacing.xxs })
const $muted: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $shipped: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.success })
