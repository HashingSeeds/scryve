import { useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"

import { Button } from "@/components/Button"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { Text } from "@/components/Text"
import { FeedbackLayout } from "@/features/feedback/FeedbackLayout"
import { RequestMeta, VoteButton } from "@/features/feedback/RequestParts"
import type { FeedbackBoardItem } from "@/features/feedback/status"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

export interface FeedbackRequestScreenProps {
  item: FeedbackBoardItem | null | undefined
  offline: boolean
  voteFailed: boolean
  reportFailed: boolean
  onVote: (voted: boolean) => void
  onReport: () => void
  onBack: () => void
}

export function FeedbackRequestScreen({
  item,
  offline,
  voteFailed,
  reportFailed,
  onVote,
  onReport,
  onBack,
}: FeedbackRequestScreenProps) {
  const { themed } = useAppTheme()
  const [confirming, setConfirming] = useState(false)
  return (
    <FeedbackLayout
      title={item?.title ?? translate("feedback:board.title")}
      offline={offline}
      onBack={onBack}
    >
      {item === null ? <Text tx="feedback:request.missing" style={themed($muted)} /> : null}
      {item ? (
        <>
          <RequestMeta item={item} yours={item.mine} />
          <Text text={item.body} />
          <View style={themed($votes)}>
            <VoteButton item={item} onVote={onVote} />
            <Text
              text={translate("feedback:request.want", { count: item.votes })}
              size="xs"
              style={[themed($muted), $grow]}
            />
          </View>
          {offline ? (
            <Text tx="feedback:board.offlineVotes" size="xxs" style={themed($muted)} />
          ) : null}
          {voteFailed ? (
            <Text tx="feedback:board.voteFailed" size="xs" accessibilityRole="alert" />
          ) : null}
          {item.mine ? null : (
            <View style={themed($report)}>
              {item.reported ? (
                <Text tx="feedback:request.reported" size="xs" style={themed($muted)} />
              ) : (
                <Button tx="feedback:request.report" onPress={() => setConfirming(true)} />
              )}
              {reportFailed ? (
                <Text tx="feedback:request.reportFailed" size="xs" accessibilityRole="alert" />
              ) : null}
            </View>
          )}
          <ConfirmDialog
            visible={confirming}
            title={translate("feedback:report.title")}
            message={translate("feedback:report.body")}
            confirmText={translate("feedback:report.confirm")}
            cancelText={translate("common:cancel")}
            destructive
            backdropAccessibilityLabel={translate("common:cancel")}
            onConfirm={() => {
              setConfirming(false)
              onReport()
            }}
            onClose={() => setConfirming(false)}
          />
        </>
      ) : null}
    </FeedbackLayout>
  )
}

const $votes: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
})
const $grow: TextStyle = { flex: 1 }
const $report: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  gap: spacing.xs,
  marginTop: spacing.lg,
  paddingTop: spacing.md,
  borderTopWidth: 1,
  borderColor: colors.separator,
})
const $muted: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
