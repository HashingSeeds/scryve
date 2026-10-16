import { useCallback, useEffect, useSyncExternalStore } from "react"
import type { StyleProp, TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"
import { Image, type ImageStyle } from "expo-image"
import { useConvex } from "convex/react"

import { Text } from "@/components/Text"
import { LocalGameRepository } from "@/features/game/localPersistence"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import { convexErrorCode, convexErrorRetryAfterMs } from "@/utils/convexError"

import { api } from "../../convex/_generated/api"

type Fallback = {
  urls: string[]
  failed: Set<string>
  loading: boolean
  expiresAt: number
}
const fallbacks = new Map<string, Fallback>()
type Lookup = { key: string; run: () => Promise<void> }
const scheduledLookups = new Set<string>()
const pendingLookups: Lookup[] = []
const mountedCards = new Map<string, number>()
let runningLookups = 0
let scryfallPausedUntil = 0
let lookupSpacingMs = 0
let nextLookupAt = 0
let drainTimer: ReturnType<typeof setTimeout> | undefined

function drainLookups() {
  if (drainTimer) return
  while (runningLookups < 2 && pendingLookups.length) {
    if (!mountedCards.get(pendingLookups[0].key)) {
      const { key } = pendingLookups.shift()!
      scheduledLookups.delete(key)
      fallbacks.delete(key)
      continue
    }
    const wait = nextLookupAt - Date.now()
    if (wait > 0) {
      drainTimer = setTimeout(() => {
        drainTimer = undefined
        drainLookups()
      }, wait)
      return
    }
    nextLookupAt = Date.now() + lookupSpacingMs
    const lookup = pendingLookups.shift()!
    runningLookups += 1
    void lookup.run().finally(() => {
      runningLookups -= 1
      drainLookups()
    })
  }
  if (!runningLookups && !pendingLookups.length) lookupSpacingMs = nextLookupAt = 0
}

/** why: image lookups share the per-caller budget with card search, so a big deck paces at half the server's refill rate and leaves the rest for search. */
function deferLookup(lookup: Lookup, retryAfterMs: number) {
  lookupSpacingMs = Math.max(lookupSpacingMs, 2 * retryAfterMs)
  nextLookupAt = Math.max(nextLookupAt, Date.now() + retryAfterMs)
  pendingLookups.unshift(lookup)
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
  // why: a mounted card recreates an evicted live entry, which would evict another card's, looping forever.
  if (fallbacks.size > 200) {
    const now = Date.now()
    fallbacks.forEach((entry, cached) => {
      if (entry.expiresAt <= now) fallbacks.delete(cached)
    })
  }
  listeners.forEach((listener) => listener())
}

function publishPaused(key: string, failed: Set<string>) {
  publish(key, { urls: [], failed, loading: false, expiresAt: scryfallPausedUntil })
  const delay = scryfallPausedUntil - Date.now()
  if (delay > 0)
    setTimeout(() => {
      const current = fallbacks.get(key)
      if (current && current.expiresAt <= Date.now())
        publish(key, { urls: [], failed, loading: false, expiresAt: Date.now() })
    }, delay)
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
      if (Date.now() < scryfallPausedUntil) {
        publishPaused(key, failed)
        return
      }
      publish(key, {
        urls: [],
        failed,
        loading: Boolean(game && cardId && client),
        expiresAt: Date.now() + 5 * 60_000,
      })
      if (!game || !cardId || !client) return
      scheduledLookups.add(key)
      const lookup: Lookup = {
        key,
        run: async () => {
          let deferred = false
          const timeout = setTimeout(() => {
            publish(key, { urls: [], failed, loading: false, expiresAt: Date.now() + 30_000 })
          }, 15_000)
          try {
            if (Date.now() < scryfallPausedUntil) {
              publishPaused(key, failed)
              return
            }
            const urls = await client.action(api.cards.imageFallbacks, {
              game,
              cardId,
              deviceId: new LocalGameRepository().getDeviceId(),
            })
            publish(key, {
              urls: urls.filter((url) => !failed.has(url)),
              failed,
              loading: false,
              expiresAt: Date.now() + 5 * 60_000,
            })
          } catch (cause) {
            const code = convexErrorCode(cause)
            if (code === "rate_limited") {
              deferred = true
              deferLookup(lookup, convexErrorRetryAfterMs(cause, 1_000))
            } else if (code === "scryfall_rate_limited") {
              scryfallPausedUntil = Date.now() + convexErrorRetryAfterMs(cause, 30_000)
              publishPaused(key, failed)
            } else {
              publish(key, { urls: [], failed, loading: false, expiresAt: Date.now() + 30_000 })
            }
          } finally {
            clearTimeout(timeout)
            if (!deferred) scheduledLookups.delete(key)
          }
        },
      }
      pendingLookups.push(lookup)
      drainLookups()
    },
    [key, game, cardId, client],
  )
  useEffect(() => {
    mountedCards.set(key, (mountedCards.get(key) ?? 0) + 1)
    return () => {
      const remaining = (mountedCards.get(key) ?? 1) - 1
      if (remaining) mountedCards.set(key, remaining)
      else mountedCards.delete(key)
    }
  }, [key])
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
      accessible
      accessibilityRole="image"
      testID={testID ? `${testID}-placeholder` : undefined}
      accessibilityLabel={
        active?.loading
          ? translate("decks:image.loadingLabel", { card: accessibilityLabel })
          : translate("decks:image.missingLabel", { card: accessibilityLabel })
      }
      style={[style as StyleProp<ViewStyle>, $placeholder]}
    >
      <Text
        tx={active?.loading ? "decks:image.loading" : "decks:image.missing"}
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
