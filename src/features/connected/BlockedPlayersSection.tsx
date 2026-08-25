import { useState, type ReactNode } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { ActivityIndicator, View } from "react-native"
import { useConvexAuth, useMutation, useQuery } from "convex/react"

import { Button } from "@/components/Button"
import { Text } from "@/components/Text"
import { ConvexQueryBoundary } from "@/features/async/ConvexQueryBoundary"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { convexErrorMessage } from "@/utils/convexError"

import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"

export function BlockedPlayersSection() {
  const { isAuthenticated, isLoading } = useConvexAuth()

  return (
    <ConvexQueryBoundary
      resetKey={isAuthenticated ? "authenticated" : "signed-out"}
      fallback={({ retry }) => <BlockedPlayersFailure onRetry={retry} />}
    >
      <BlockedPlayersContent isAuthenticated={isAuthenticated} isAuthLoading={isLoading} />
    </ConvexQueryBoundary>
  )
}

function BlockedPlayersContent({
  isAuthenticated,
  isAuthLoading,
}: {
  isAuthenticated: boolean
  isAuthLoading: boolean
}) {
  const { themed } = useAppTheme()
  const blocks = useQuery(api.moderation.myBlocks, isAuthenticated ? {} : "skip")
  const unblock = useMutation(api.moderation.unblockPlayer)
  const [error, setError] = useState<string>()
  const [busyId, setBusyId] = useState<string>()
  const isLoading = isAuthLoading || (isAuthenticated && blocks === undefined)

  return (
    <BlockedPlayersFrame>
      {isLoading ? (
        <View testID="blocked-players-loading" style={themed($stateRow)}>
          <ActivityIndicator accessibilityLabel="Loading blocked players" />
          <Text
            text="Loading blocked players…"
            size="xs"
            style={themed($muted)}
            accessibilityLiveRegion="polite"
          />
        </View>
      ) : !isAuthenticated ? (
        <View testID="blocked-players-signed-out" style={themed($stateRow)}>
          <Text text="Sign in to manage blocked players." size="xs" style={themed($muted)} />
        </View>
      ) : blocks?.length === 0 ? (
        <View testID="blocked-players-empty" style={themed($stateRow)}>
          <Text text="No blocked players." size="xs" style={themed($muted)} />
        </View>
      ) : (
        <View testID="blocked-players-list" style={themed($list)}>
          <View style={themed($mutationStatus)}>
            {error ? (
              <Text testID="unblock-error" accessibilityRole="alert" size="xs" text={error} />
            ) : null}
          </View>
          {blocks?.map((block) => (
            <View key={block.blockedUserId} style={themed($row)}>
              <Text style={themed($name)} numberOfLines={1} text={block.username} />
              <Button
                testID={`unblock-${block.blockedUserId}`}
                text={busyId === block.blockedUserId ? "Unblocking…" : "Unblock"}
                accessibilityLabel={`Unblock ${block.username}`}
                accessibilityState={{
                  busy: busyId === block.blockedUserId,
                  disabled: busyId !== undefined,
                }}
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
      )}
    </BlockedPlayersFrame>
  )
}

function BlockedPlayersFailure({ onRetry }: { onRetry: () => void }) {
  const { themed } = useAppTheme()
  return (
    <BlockedPlayersFrame>
      <View testID="blocked-players-error" style={themed($stateRow)}>
        <Text
          accessibilityRole="alert"
          text="Couldn't load blocked players."
          size="xs"
          style={themed([$name, $error])}
        />
        <Button
          text="Retry"
          accessibilityHint="Loads blocked players again"
          style={themed($retry)}
          onPress={onRetry}
        />
      </View>
    </BlockedPlayersFrame>
  )
}

function BlockedPlayersFrame({ children }: { children: ReactNode }) {
  const { themed } = useAppTheme()
  return (
    <View style={themed($section)}>
      <Text text="Blocked players" preset="subheading" accessibilityRole="header" />
      <Text
        size="xs"
        style={themed($muted)}
        text="Blocked players cannot join the same connected game as you."
      />
      <View testID="blocked-players-state" style={themed($state)}>
        {children}
      </View>
    </View>
  )
}

const $section: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
  marginTop: spacing.lg,
})
const $state: ThemedStyle<ViewStyle> = () => ({ minHeight: 68, justifyContent: "center" })
const $stateRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 44,
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
})
const $list: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $mutationStatus: ThemedStyle<ViewStyle> = () => ({ minHeight: 20, justifyContent: "center" })
const $row: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
})
const $name: ThemedStyle<TextStyle> = () => ({ flex: 1 })
const $action: ThemedStyle<ViewStyle> = () => ({ minHeight: 44, minWidth: 120 })
const $retry: ThemedStyle<ViewStyle> = () => ({ minHeight: 40, minWidth: 88 })
const $muted: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $error: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.error })
