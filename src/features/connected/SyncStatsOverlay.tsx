import { useEffect, useState } from "react"
import { View, type TextStyle, type ViewStyle } from "react-native"
import { useMMKVString } from "react-native-mmkv"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { Text } from "@/components/Text"
import { LOCAL_KEYS, syncStatsEnabled } from "@/features/game/localPersistence"
import { translate } from "@/i18n/translate"
import { storage } from "@/utils/storage"

import type { PeerLatency, SyncLatency } from "./syncLatency"

const COLUMNS = ["ping", "p50", "p90", "p99", "count"] as const

export function SyncStatsOverlay(props: { latency: SyncLatency; peers?: () => PeerLatency[] }) {
  const [settings] = useMMKVString(LOCAL_KEYS.settings, storage)
  return syncStatsEnabled(settings) ? <SyncStatsTable {...props} /> : null
}

function SyncStatsTable({ latency, peers }: { latency: SyncLatency; peers?: () => PeerLatency[] }) {
  const { top } = useSafeAreaInsets()
  const [rows, setRows] = useState<PeerLatency[]>([])
  useEffect(() => {
    const read = () =>
      setRows([
        { name: translate("connected:syncStats.you"), summary: latency.summary() },
        ...(peers?.() ?? []),
      ])
    read()
    const timer = setInterval(read, 1_000)
    return () => clearInterval(timer)
  }, [latency, peers])
  return (
    <View pointerEvents="none" testID="sync-stats" style={[$table, { top: top + 4 }]}>
      <View style={$row}>
        <Text size="xxs" text="" style={$name} />
        {COLUMNS.map((column) => (
          <Text
            key={column}
            size="xxs"
            tx={`connected:syncStats.${column}`}
            numberOfLines={1}
            adjustsFontSizeToFit
            style={$cell}
          />
        ))}
      </View>
      {rows.map(({ name, summary: { ping, delivery } }, index) => (
        <View key={`${index}:${name}`} style={$row}>
          <Text size="xxs" text={name} numberOfLines={1} style={$name} />
          {[ping, delivery?.p50, delivery?.p90, delivery?.p99, delivery?.count].map(
            (value, column) => (
              <Text
                key={COLUMNS[column]}
                size="xxs"
                text={value?.toString() ?? "–"}
                style={$cell}
              />
            ),
          )}
        </View>
      ))}
    </View>
  )
}

const $table: ViewStyle = {
  position: "absolute",
  left: 4,
  padding: 4,
  borderRadius: 4,
  backgroundColor: "rgba(0, 0, 0, 0.7)",
}

const $row: ViewStyle = { flexDirection: "row" }

const $name: TextStyle = { width: 72, color: "#FFFFFF" }

const $cell: TextStyle = {
  width: 40,
  textAlign: "right",
  color: "#FFFFFF",
  fontVariant: ["tabular-nums"],
}
