import { useState } from "react"
import { Pressable, View } from "react-native"
import type { TextStyle, ViewStyle } from "react-native"
import { useConvex } from "convex/react"

import { Icon } from "@/components/Icon"
import { RetryableError } from "@/components/RetryableError"
import { Text } from "@/components/Text"
import { localGameRepository } from "@/features/game/localPersistence"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { convexErrorMessage, convexRetryAfterMs } from "@/utils/convexError"
import { load, save } from "@/utils/storage"

import { api } from "../../convex/_generated/api"

type Ruling = { publishedAt: string; comment: string }
type Rulings =
  | { kind: "closed" }
  | { kind: "loading" }
  | { kind: "loaded"; rulings: Ruling[] }
  | { kind: "failed"; message: string; retryAfterMs?: number }

const CACHE_MS = 7 * 24 * 60 * 60 * 1000
const cacheKey = (scryfallId: string) => `scryve.rulings.${scryfallId}.v1`

function cachedRulings(scryfallId: string): Ruling[] | undefined {
  const stored = load(cacheKey(scryfallId))
  if (typeof stored !== "object" || stored === null || !("fetchedAt" in stored)) return undefined
  const { fetchedAt, rulings } = stored as { fetchedAt: unknown; rulings: unknown }
  return typeof fetchedAt === "number" &&
    fetchedAt > Date.now() - CACHE_MS &&
    Array.isArray(rulings)
    ? (rulings as Ruling[])
    : undefined
}

const formatDate = (isoDate: string) =>
  new Date(`${isoDate}T00:00:00Z`).toLocaleDateString(undefined, {
    dateStyle: "medium",
    timeZone: "UTC",
  })

export function CardRulings({ scryfallId }: { scryfallId: string }) {
  const { theme, themed } = useAppTheme()
  const client = useConvex()
  const [state, setState] = useState<Rulings>({ kind: "closed" })
  const open = state.kind !== "closed"

  const settle = (next: Rulings) =>
    setState((current) => (current.kind === "closed" ? current : next))

  function fetchRulings() {
    const cached = cachedRulings(scryfallId)
    if (cached) return setState({ kind: "loaded", rulings: cached })
    setState({ kind: "loading" })
    client
      .action(api.cards.rulings, { scryfallId, deviceId: localGameRepository.getDeviceId() })
      .then((rulings) => {
        save(cacheKey(scryfallId), { fetchedAt: Date.now(), rulings })
        settle({ kind: "loaded", rulings })
      })
      .catch((error: unknown) =>
        settle({
          kind: "failed",
          message: convexErrorMessage(error, translate("decks:cardFocus.rulingsFailed")),
          retryAfterMs: convexRetryAfterMs(error),
        }),
      )
  }

  return (
    <View style={themed($rulings)}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => (open ? setState({ kind: "closed" }) : fetchRulings())}
        style={$header}
        testID="card-rulings"
      >
        <Text size="sm" weight="medium" style={$flex} tx="decks:cardFocus.rulings" />
        <Icon
          icon="caretRight"
          size={16}
          color={theme.colors.textDim}
          style={open ? $caretOpen : undefined}
        />
      </Pressable>
      {state.kind === "loading" ? (
        <Text size="xs" tone="dim" tx="decks:cardFocus.loadingRulings" />
      ) : state.kind === "failed" ? (
        <RetryableError
          message={state.message}
          retryAfterMs={state.retryAfterMs}
          onRetry={fetchRulings}
          testID="retry-card-rulings"
        />
      ) : state.kind === "loaded" ? (
        state.rulings.length === 0 ? (
          <Text size="xs" tone="dim" tx="decks:cardFocus.noRulings" />
        ) : (
          state.rulings.map((ruling) => (
            <View key={`${ruling.publishedAt}:${ruling.comment}`} style={themed($ruling)}>
              <Text size="xxs" tone="dim" text={formatDate(ruling.publishedAt)} />
              <Text size="xs" text={ruling.comment} />
            </View>
          ))
        )
      ) : null}
    </View>
  )
}

const $flex: TextStyle = { flex: 1 }
const $caretOpen = { transform: [{ rotate: "90deg" }] }
const $header: ViewStyle = { flexDirection: "row", alignItems: "center", minHeight: 44 }
const $rulings: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  gap: spacing.xs,
  borderTopWidth: 1,
  borderTopColor: colors.separator,
})
const $ruling: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xxxs })
