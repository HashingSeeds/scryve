import { useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"
import { useConvexAuth, useMutation, useQuery } from "convex/react"

import { Button } from "@/components/Button"
import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { convexErrorMessage } from "@/utils/convexError"

import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"

export function BlockedPlayersSection() {
  const { themed } = useAppTheme()
  const { isAuthenticated } = useConvexAuth()
  const blocks = useQuery(api.moderation.myBlocks, isAuthenticated ? {} : "skip")
  const unblock = useMutation(api.moderation.unblockPlayer)
  const [error, setError] = useState<string>()
  const [busyId, setBusyId] = useState<string>()

  if (!isAuthenticated || !blocks || blocks.length === 0) return null

  return (
    <View style={themed($section)}>
      <Text text="Blocked players" preset="subheading" accessibilityRole="header" />
      <Text
        size="xs"
        style={themed($muted)}
        text="You will not be seated in a connected game with anyone on this list, and their names stay hidden from you."
      />
      {error ? (
        <Text testID="unblock-error" accessibilityRole="alert" size="xs" text={error} />
      ) : null}
      {blocks.map((block) => (
        <View key={block.blockedUserId} style={themed($row)}>
          <Text style={themed($name)} numberOfLines={1} text={block.username} />
          <Button
            testID={`unblock-${block.blockedUserId}`}
            text={busyId === block.blockedUserId ? "Unblocking…" : "Unblock"}
            disabled={busyId !== undefined}
            style={themed($action)}
            onPress={async () => {
              try {
                setBusyId(block.blockedUserId)
                setError(undefined)
                await unblock({ blockedUserId: block.blockedUserId as Id<"users"> })
              } catch (cause) {
                setError(convexErrorMessage(cause, "Could not unblock that player"))
              } finally {
                setBusyId(undefined)
              }
            }}
          />
        </View>
      ))}
    </View>
  )
}

const $section: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
  marginTop: spacing.lg,
})
const $row: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
})
const $name: ThemedStyle<TextStyle> = () => ({ flex: 1 })
const $action: ThemedStyle<ViewStyle> = () => ({ minHeight: 44, minWidth: 120 })
const $muted: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
