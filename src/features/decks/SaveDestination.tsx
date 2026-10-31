import { useCallback, useMemo, useState, type ReactNode } from "react"
import type { ViewStyle } from "react-native"
import { Pressable, View } from "react-native"
import { useQueries, type RequestForQueries } from "convex/react"
import type { FunctionReturnType } from "convex/server"

import { Text } from "@/components/Text"
import { TextAction } from "@/components/TextAction"
import type { CloudAccess } from "@/features/auth/CloudScreen"
import { useConvexOnline } from "@/features/connected/useConvexOnline"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { loadString, saveString } from "@/utils/storage"

import { DeckLimitDialog } from "./DeckLimit"
import type { DeckHome } from "./localDeckSync"
import { api } from "../../../convex/_generated/api"

const PREFERENCE_KEY = "decks.saveDestination"

function storedPick(): DeckHome {
  return loadString(PREFERENCE_KEY) === "device" ? "device" : "account"
}

export type SaveDestinationState = ReturnType<typeof useSaveDestination>

export function useSaveDestination(access?: CloudAccess) {
  const signedIn = Boolean(access?.ready && access.ownerId)
  const online = useConvexOnline()
  const [pick, setPick] = useState(storedPick)
  // why: useQueries hands back an Error instead of throwing, so a lost session can't take down the screen saving a deck.
  const queries = useMemo(
    (): RequestForQueries =>
      signedIn ? { capacity: { query: api.decks.capacity, args: {} } } : {},
    [signedIn],
  )
  const capacity: FunctionReturnType<typeof api.decks.capacity> | Error | undefined =
    useQueries(queries).capacity
  const room =
    signedIn && capacity && !(capacity instanceof Error)
      ? {
          used: capacity.used,
          limit: capacity.limit,
          left: Math.max(0, capacity.limit - capacity.used),
        }
      : undefined
  const accountOpen = Boolean(online && room && room.left > 0)
  const choose = useCallback((next: DeckHome) => {
    setPick(next)
    saveString(PREFERENCE_KEY, next)
  }, [])
  return {
    access: signedIn ? access : undefined,
    value: pick === "account" && accountOpen ? ("account" as const) : ("device" as const),
    accountOpen,
    online,
    room,
    choose,
  }
}

export function SaveDestination({ destination }: { destination: SaveDestinationState }) {
  const { themed } = useAppTheme()
  const [freeing, setFreeing] = useState(false)
  const { access, value, accountOpen, online, room, choose } = destination
  if (!access) return null
  const full = room !== undefined && room.left === 0
  const accountDetail = !online
    ? translate("decks:saveTo.offline")
    : !room
      ? translate("decks:saveTo.checking")
      : full
        ? translate("decks:saveTo.full", { used: room.used, limit: room.limit })
        : translate("decks:saveTo.left", { left: room.left, limit: room.limit })
  return (
    <View testID="save-destination">
      <Text size="xs" weight="medium" tx="decks:saveTo.label" style={themed($label)} />
      <View accessibilityRole="radiogroup" accessibilityLabel={translate("decks:saveTo.label")}>
        <Option
          testID="save-destination-account"
          title={translate("decks:saveTo.account")}
          detail={accountDetail}
          selected={value === "account"}
          disabled={!accountOpen}
          onPress={() => choose("account")}
          action={
            full && online ? (
              <TextAction
                testID="save-destination-free-slot"
                tx="decks:saveTo.freeSlot"
                onPress={() => setFreeing(true)}
              />
            ) : null
          }
        />
        <Option
          testID="save-destination-device"
          title={translate("decks:saveTo.device")}
          detail={translate("decks:saveTo.deviceDetail")}
          selected={value === "device"}
          onPress={() => choose("device")}
        />
      </View>
      {freeing ? (
        <DeckLimitDialog
          access={access}
          onClose={() => setFreeing(false)}
          onRoomMade={() => {
            setFreeing(false)
            choose("account")
          }}
        />
      ) : null}
    </View>
  )
}

function Option({
  testID,
  title,
  detail,
  selected,
  disabled,
  action,
  onPress,
}: {
  testID: string
  title: string
  detail: string
  selected: boolean
  disabled?: boolean
  action?: ReactNode
  onPress: () => void
}) {
  const { themed } = useAppTheme()
  return (
    <View style={themed($option)}>
      <Pressable
        testID={testID}
        accessibilityRole="radio"
        accessibilityLabel={`${title}, ${detail}`}
        accessibilityState={{ checked: selected, disabled: Boolean(disabled) }}
        aria-checked={selected}
        disabled={disabled}
        style={themed($choice)}
        onPress={onPress}
      >
        <View style={[themed($radio), selected && themed($radioOn)]}>
          {selected ? <View style={themed($radioDot)} /> : null}
        </View>
        <View style={[$copy, disabled && $disabled]}>
          <Text size="sm" weight="medium" text={title} />
          <Text size="xs" tone="dim" numberOfLines={1} text={detail} />
        </View>
      </Pressable>
      {action}
    </View>
  )
}

const $label: ThemedStyle<ViewStyle> = ({ spacing }) => ({ paddingBottom: spacing.xxs })
const $option: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  borderTopWidth: 1,
  borderTopColor: colors.separator,
})
const $choice: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  minHeight: 52,
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
})
const $radio: ThemedStyle<ViewStyle> = ({ colors, radius }) => ({
  width: 20,
  height: 20,
  borderRadius: radius.full,
  borderWidth: 1.6,
  borderColor: colors.border,
  alignItems: "center",
  justifyContent: "center",
})
const $radioOn: ThemedStyle<ViewStyle> = ({ colors }) => ({ borderColor: colors.tint })
const $radioDot: ThemedStyle<ViewStyle> = ({ colors, radius }) => ({
  width: 10,
  height: 10,
  borderRadius: radius.full,
  backgroundColor: colors.tint,
})
const $copy: ViewStyle = { flex: 1 }
const $disabled: ViewStyle = { opacity: 0.5 }
