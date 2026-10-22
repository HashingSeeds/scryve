import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"

import { Button } from "@/components/Button"
import { FilterChips } from "@/components/FilterChips"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { FeedbackLayout } from "@/features/feedback/FeedbackLayout"
import { RequestRow } from "@/features/feedback/RequestParts"
import type { FeedbackBoardItem } from "@/features/feedback/status"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

export const FEEDBACK_TABS = ["all", "features", "bugs", "shipped"] as const
export type FeedbackTab = (typeof FEEDBACK_TABS)[number]

export interface FeedbackBoardScreenProps {
  items: readonly FeedbackBoardItem[] | undefined
  search: string
  searched: string
  tab: FeedbackTab
  unread: number
  offline: boolean
  voteFailed: boolean
  onSearch: (search: string) => void
  onTab: (tab: FeedbackTab) => void
  onVote: (item: FeedbackBoardItem, voted: boolean) => void
  onOpen: (item: FeedbackBoardItem) => void
  onSuggest: (title?: string) => void
  onMine: () => void
  onBack: () => void
}

export function FeedbackBoardScreen({
  items,
  search,
  searched,
  tab,
  unread,
  offline,
  voteFailed,
  onSearch,
  onTab,
  onVote,
  onOpen,
  onSuggest,
  onMine,
  onBack,
}: FeedbackBoardScreenProps) {
  const { themed } = useAppTheme()
  const query = searched.trim()
  return (
    <FeedbackLayout
      title={translate("feedback:board.title")}
      offline={offline}
      onBack={onBack}
      footer={
        <>
          <Button tx="feedback:board.suggest" preset="reversed" onPress={() => onSuggest()} />
          <Button
            text={
              unread
                ? translate("feedback:board.mineUnread", { count: unread })
                : translate("feedback:board.mine")
            }
            onPress={onMine}
          />
        </>
      }
    >
      <TextField
        placeholderTx="feedback:board.search"
        accessibilityLabel={translate("feedback:board.search")}
        value={search}
        onChangeText={onSearch}
        autoCorrect={false}
        returnKeyType="search"
        clearable
      />
      <FilterChips
        chips={FEEDBACK_TABS.map((id) => ({ id, label: translate(`feedback:board.tabs.${id}`) }))}
        selectedId={tab}
        accessibilityLabel={translate("feedback:board.tabs.label")}
        onSelect={(id) => {
          const next = FEEDBACK_TABS.find((candidate) => candidate === id)
          if (next) onTab(next)
        }}
      />
      {items?.length === 0 ? (
        query ? (
          <View style={themed($empty)}>
            <Text
              text={translate("feedback:board.noMatch", { query })}
              size="xs"
              style={themed($muted)}
            />
            <Button
              text={translate("feedback:board.suggestQuery", { query })}
              preset="reversed"
              onPress={() => onSuggest(query)}
            />
          </View>
        ) : (
          <Text tx="feedback:board.empty" style={themed($muted)} />
        )
      ) : (
        items?.map((item) => (
          <RequestRow
            key={item._id}
            item={item}
            onVote={(voted) => onVote(item, voted)}
            onOpen={() => onOpen(item)}
          />
        ))
      )}
      {offline ? <Text tx="feedback:board.offlineVotes" size="xxs" style={themed($muted)} /> : null}
      {voteFailed ? (
        <Text tx="feedback:board.voteFailed" size="xs" accessibilityRole="alert" />
      ) : null}
    </FeedbackLayout>
  )
}

const $empty: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.sm })
const $muted: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
