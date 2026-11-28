import { useMemo, useRef, useState } from "react"
import { Linking, ScrollView, TouchableOpacity, View } from "react-native"
import type { TextStyle, ViewStyle } from "react-native"

import { Button } from "@/components/Button"
import { ChoiceButton } from "@/components/ChoiceButton"
import { Sheet } from "@/components/Sheet"
import { $sheetScroll, $sheetScrollContent } from "@/components/sheetStyles"
import { Text } from "@/components/Text"
import type { DeckCard } from "@/features/decks/deckCards"
import { formatCurrency, formatDate, joinParts } from "@/i18n/format"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { captureAnalytics } from "@/utils/analytics"

import { catalogPricesAsOf } from "./catalogSync"
import type { DeckOwnershipItem } from "./deckOwnership"
import { planStoreCheckout, STORES, type Store, type StoreCheckout } from "./storeCheckout"

const STORE_IDS = Object.keys(STORES) as Store[]

function totalText(plan: StoreCheckout) {
  const total = formatCurrency(plan.totalCents, "USD")
  return plan.unpricedCount > 0
    ? translate("decks:checkout.totalUnpriced", { total, count: plan.unpricedCount })
    : total
}

export function StoreCheckoutSheet({
  visible,
  game,
  items,
  onOpenCard,
  onClose,
}: {
  visible: boolean
  game: string
  items: readonly DeckOwnershipItem[]
  onOpenCard: (card: DeckCard) => void
  onClose: () => void
}) {
  const { themed } = useAppTheme()
  const [store, setStore] = useState<Store>("tcgplayer")
  // why: iOS can't present the card's sheet while this one is still dismissing, so the card opens once this one is gone.
  const cardToOpen = useRef<DeckCard>(undefined)
  const plans = useMemo(
    () => (visible ? STORE_IDS.map((id) => planStoreCheckout(game, items, id)) : []),
    [visible, game, items],
  )
  const plan = plans.find((candidate) => candidate.store === store)
  const asOf = visible ? catalogPricesAsOf(game) : undefined
  const problems = plan?.lines.filter((line) => line.problem) ?? []

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      onDismissed={() => {
        const card = cardToOpen.current
        cardToOpen.current = undefined
        if (card) onOpenCard(card)
      }}
      testID="store-checkout-sheet"
    >
      <View style={themed($container)}>
        <Text preset="subheading" tx="decks:collection.buyMissing" />
        <View style={themed($stores)}>
          {plans.map((candidate) => (
            <ChoiceButton
              key={candidate.store}
              testID={`store-checkout-${candidate.store}`}
              text={STORES[candidate.store]}
              detail={totalText(candidate)}
              selected={candidate.store === store}
              onPress={() => setStore(candidate.store)}
            />
          ))}
        </View>
        <Text
          size="xs"
          tone="dim"
          text={joinParts([
            translate("decks:checkout.beforeShipping"),
            asOf !== undefined &&
              translate("decks:checkout.pricesFrom", {
                date: formatDate(asOf, { month: "short", day: "numeric" }),
              }),
            store === "tcgplayer" &&
              translate("decks:checkout.optimize", { store: STORES.tcgplayer }),
          ])}
        />
        {problems.length > 0 ? (
          <ScrollView
            style={themed($sheetScroll)}
            contentContainerStyle={themed($sheetScrollContent)}
          >
            {problems.map(({ item, problem }) => (
              <TouchableOpacity
                key={item.cardId}
                testID={`store-checkout-problem-${item.cardId}`}
                accessibilityRole="button"
                accessibilityHint={translate("decks:checkout.openCard")}
                style={themed($problem)}
                onPress={() => {
                  cardToOpen.current = item.card
                  onClose()
                }}
              >
                <Text weight="medium" numberOfLines={1} style={$name} text={item.name} />
                <Text
                  size="xs"
                  tone="dim"
                  text={
                    problem === "unknown_card"
                      ? translate("decks:checkout.unknownCard")
                      : translate("decks:checkout.notSold", { store: STORES[store] })
                  }
                />
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : null}
        {plan ? (
          <Button
            testID="store-checkout-open"
            preset="primary"
            disabled={!plan.url}
            text={translate("decks:checkout.open", { store: STORES[store], count: plan.cardCount })}
            onPress={() => {
              if (!plan.url) return
              captureAnalytics("store_checkout_opened", {
                store,
                card_count: plan.cardCount,
                problem_count: problems.length,
                estimate_cents: plan.totalCents,
              })
              void Linking.openURL(plan.url)
              onClose()
            }}
          />
        ) : null}
      </View>
    </Sheet>
  )
}

const $container: ThemedStyle<ViewStyle> = ({ spacing }) => ({ flexShrink: 1, gap: spacing.sm })
const $stores: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $problem: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  minHeight: 44,
  paddingVertical: spacing.xs,
})
const $name: TextStyle = { flexShrink: 1, flexGrow: 1 }
