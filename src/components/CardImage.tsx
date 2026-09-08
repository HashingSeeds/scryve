import { useCallback, useEffect, useSyncExternalStore } from "react"
import type { StyleProp, TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"
import { Image, type ImageStyle } from "expo-image"
import { useConvex } from "convex/react"

import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"

import { api } from "../../convex/_generated/api"

type Fallback = {
  urls: string[]
  failed: Set<string>
  loading: boolean
  expiresAt: number
}
const fallbacks = new Map<string, Fallback>()
const scheduledLookups = new Set<string>()
const pendingLookups: Array<() => Promise<void>> = []
let runningLookups = 0

function drainLookups() {
  while (runningLookups < 2 && pendingLookups.length) {
    const lookup = pendingLookups.shift()!
    runningLookups += 1
    void lookup().finally(() => {
      runningLookups -= 1
      drainLookups()
    })
  }
}

const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
function publish(key: string, value: Fallback) {
  fallbacks.set(key, value)
  if (fallbacks.size > 200) fallbacks.delete(fallbacks.keys().next().value!)
  listeners.forEach((listener) => listener())
}

export type CardImageIdentity = { game?: string; cardId?: string }
type Props = CardImageIdentity & {
  source?: string
  placeholder?: string
  style: StyleProp<ImageStyle>
  accessibilityLabel: string
  testID?: string
  compact?: boolean
}

export function CardImage({
  game,
  cardId,
  source,
  placeholder,
  style,
  accessibilityLabel,
  testID,
  compact,
}: Props) {
  const { theme } = useAppTheme()
  const client = useConvex()
  const key = game && cardId ? `${game}:${cardId}` : `image:${source ?? accessibilityLabel}`
  const snapshot = useCallback(() => fallbacks.get(key), [key])
  const fallback = useSyncExternalStore(subscribe, snapshot, snapshot)
  const active = fallback && fallback.expiresAt > Date.now() ? fallback : undefined
  const imageUrl = active ? active.urls[0] : source
  const recover = useCallback(
    (failedUrl?: string) => {
      const current = fallbacks.get(key)
      const valid = current && current.expiresAt > Date.now() ? current : undefined
      if (valid) {
        if (valid.loading || (failedUrl && valid.urls[0] !== failedUrl)) return
        const failed = new Set(valid.failed)
        if (failedUrl) failed.add(failedUrl)
        publish(key, { ...valid, failed, urls: valid.urls.filter((url) => !failed.has(url)) })
        return
      }
      if (scheduledLookups.has(key)) return
      const failed = new Set(failedUrl ? [failedUrl] : [])
      publish(key, {
        urls: [],
        failed,
        loading: Boolean(game && cardId && client),
        expiresAt: Date.now() + 5 * 60_000,
      })
      if (!game || !cardId || !client) return
      scheduledLookups.add(key)
      const timeout = setTimeout(() => {
        publish(key, { urls: [], failed, loading: false, expiresAt: Date.now() + 30_000 })
      }, 15_000)
      pendingLookups.push(async () => {
        try {
          const urls = await client.action(api.cards.imageFallbacks, { game, cardId })
          publish(key, {
            urls: urls.filter((url) => !failed.has(url)),
            failed,
            loading: false,
            expiresAt: Date.now() + 5 * 60_000,
          })
        } catch {
          publish(key, { urls: [], failed, loading: false, expiresAt: Date.now() + 30_000 })
        } finally {
          clearTimeout(timeout)
          scheduledLookups.delete(key)
        }
      })
      drainLookups()
    },
    [key, game, cardId, client],
  )
  useEffect(() => {
    if (!source && !active) recover()
  }, [source, active, recover])

  if (imageUrl)
    return (
      <Image
        key={imageUrl}
        testID={testID}
        accessibilityLabel={accessibilityLabel}
        source={imageUrl}
        placeholder={active ? undefined : placeholder}
        style={style}
        contentFit="contain"
        transition={150}
        cachePolicy="memory-disk"
        onError={() => recover(imageUrl)}
      />
    )
  return (
    <View
      testID={testID ? `${testID}-placeholder` : undefined}
      accessibilityLabel={`${accessibilityLabel}: ${active?.loading ? "Loading image" : "No image found"}`}
      style={[style as StyleProp<ViewStyle>, $placeholder]}
    >
      <Text
        text={active?.loading ? "Loading…" : "No image found"}
        style={[{ color: theme.colors.textDim }, compact ? $compactLabel : $label]}
      />
    </View>
  )
}

const $placeholder: ViewStyle = {
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
}

const $label: TextStyle = { textAlign: "center", fontSize: 14, lineHeight: 20 }
const $compactLabel: TextStyle = { textAlign: "center", fontSize: 9, lineHeight: 11 }
