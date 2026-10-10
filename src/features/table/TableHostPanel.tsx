import { useState } from "react"
import type { ViewStyle } from "react-native"
import { Pressable, View } from "react-native"
import * as Linking from "expo-linking"
import QRCode from "react-native-qrcode-svg"

import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import type { TableLinkStatus } from "./useTableLink"

export const tableJoinUrl = (sessionId: string) => Linking.createURL(`dev/table/${sessionId}`)

/** why: tapping folds the QR away once guests are in, so it stops covering seats. */
export function TableHostPanel({
  sessionId,
  status,
}: {
  sessionId: string
  status: TableLinkStatus
}) {
  const { themed } = useAppTheme()
  const [open, setOpen] = useState(true)
  const label = `Table ${status.state}${status.detail ? `: ${status.detail}` : ""} · ${status.peers} guest${status.peers === 1 ? "" : "s"}`
  return (
    <Pressable
      testID="table-host-panel"
      onPress={() => setOpen((value) => !value)}
      style={themed($panel)}
    >
      {open ? (
        <View style={themed($qrTile)}>
          <QRCode value={tableJoinUrl(sessionId)} size={180} />
        </View>
      ) : null}
      <Text size="xs" text={label} />
    </Pressable>
  )
}

const $panel: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  position: "absolute",
  top: spacing.xxl,
  alignSelf: "center",
  alignItems: "center",
  gap: spacing.xs,
  padding: spacing.sm,
  borderRadius: spacing.sm,
  backgroundColor: colors.background,
})
const $qrTile: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  padding: spacing.xs,
  backgroundColor: "#FFFFFF",
})
