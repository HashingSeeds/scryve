import { useEffect, useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"
import { Image } from "expo-image"
import Svg, { Circle, Path, Rect } from "react-native-svg"

import { faceLabel, modeCardImage } from "@/features/modes/modeCards"
import {
  FULL_PLATE_WIDTH,
  ICON_WIDTH,
  PLATE_HEIGHT,
  type SeamItem,
  type SeamSlot,
} from "@/features/modes/seamPlan"
import type { PlanarView, SchemeView } from "@/features/modes/useBoardModes"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"

import type { PlanarFace } from "../../../convex/lib/tableModes"
import { BoardPressable } from "../BoardPressable"
import { Text } from "../Text"

const GAP = 4
const RESULT_MS = 4_000

export function PlanarGlyph({
  face,
  size,
  color,
}: {
  face: PlanarFace
  size: number
  color: string
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {face === "planeswalk" ? (
        <>
          <Path d="M12 1.5 14.6 13 12 22.5 9.4 13Z" fill={color} />
          <Path
            d="M5 6c1.8 3 3 5.6 4.4 7M19 6c-1.8 3-3 5.6-4.4 7"
            stroke={color}
            strokeWidth={2.4}
            strokeLinecap="round"
            fill="none"
          />
        </>
      ) : face === "chaos" ? (
        <>
          <Circle cx={12} cy={12} r={3.2} fill={color} />
          <Path
            d="M12 2.5v4.2M12 17.3v4.2M2.5 12h4.2M17.3 12h4.2M5.3 5.3l3 3M15.7 15.7l3 3M18.7 5.3l-3 3M8.3 15.7l-3 3"
            stroke={color}
            strokeWidth={2.4}
            strokeLinecap="round"
          />
        </>
      ) : (
        <Rect
          x={4}
          y={4}
          width={16}
          height={16}
          rx={3}
          stroke={color}
          strokeWidth={2}
          fill="none"
        />
      )}
    </Svg>
  )
}

function SchemeGlyph({ size, color }: { size: number; color: string }) {
  return (
    <Svg testID="scheme-glyph" width={size} height={size} viewBox="0 0 24 24">
      <Rect x={7} y={2} width={13} height={17} rx={2} fill={color} opacity={0.5} />
      <Rect x={4} y={5} width={13} height={17} rx={2} fill={color} />
    </Svg>
  )
}

function useFresh(at: number | undefined) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (at === undefined) return
    const left = at + RESULT_MS - Date.now()
    if (left <= 0) return
    const timer = setTimeout(() => setNow(Date.now()), left)
    return () => clearTimeout(timer)
  }, [at])
  return at !== undefined && Math.max(now, Date.now()) - at < RESULT_MS
}

export function PlanarDieButton({
  planar,
  seat,
  size = PLATE_HEIGHT,
  width = size + 10,
  testID = "planar-die",
}: {
  planar: PlanarView
  seat?: string
  size?: number
  width?: number
  testID?: string
}) {
  const {
    theme: { colors },
  } = useAppTheme()
  const ink = colors.gameMenu.anchorGlyph
  const fresh = useFresh(planar.lastRoll?.at)
  const die = seat === undefined ? planar : planar.dieFor(seat)
  const disabled = !die.canRoll
  const face = fresh ? planar.lastRoll?.face : undefined
  return (
    <BoardPressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={translate("board:planar.dieLabel", { cost: die.cost })}
      accessibilityHint={disabled ? translate("board:planar.activeOnly") : undefined}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={die.roll}
      style={({ pressed }) => [
        $die,
        { height: size, minWidth: width },
        {
          backgroundColor: face === "chaos" ? colors.error : colors.gameMenu.anchor,
          borderColor: colors.gameMenu.anchorBorder,
        },
        disabled && $dimmed,
        pressed && $pressed,
      ]}
    >
      <PlanarGlyph face={face ?? "planeswalk"} size={face ? 16 : 14} color={ink} />
      <Text
        size="xxs"
        weight="bold"
        maxFontSizeMultiplier={1.1}
        style={[$dieText, { color: ink }]}
        text={
          face && width >= size + 10
            ? faceLabel(face)
            : face
              ? ""
              : die.cost === 0
                ? translate("board:planar.free")
                : translate("board:planar.costBadge", { cost: die.cost })
        }
      />
    </BoardPressable>
  )
}

function PlanePlate({
  planar,
  width,
  onPress,
}: {
  planar: PlanarView
  width: number
  onPress: () => void
}) {
  const {
    theme: { colors },
  } = useAppTheme()
  const ink = colors.gameMenu.anchorGlyph
  const chaos = useFresh(planar.lastRoll?.face === "chaos" ? planar.lastRoll.at : undefined)
  const name = planar.card?.name ?? translate("board:planar.ownCards")
  const full = width >= FULL_PLATE_WIDTH
  return (
    <BoardPressable
      testID="plane-plate"
      accessibilityRole="button"
      accessibilityLabel={`${translate(planar.phenomenon ? "board:planar.phenomenon" : "board:planar.plane")}: ${name}`}
      accessibilityHint={translate("board:planar.opensPlane")}
      onPress={onPress}
      style={({ pressed }) => [
        full ? $plate : $icon,
        full && { maxWidth: width },
        {
          backgroundColor: colors.gameMenu.anchor,
          borderColor: chaos || planar.phenomenon ? colors.error : colors.gameMenu.anchorBorder,
        },
        pressed && $pressed,
      ]}
    >
      {planar.card ? (
        <Image
          source={modeCardImage(planar.card, "art_crop")}
          style={full ? $thumb : $iconThumb}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <PlanarGlyph face="planeswalk" size={16} color={ink} />
      )}
      {full ? (
        <View style={$plateText}>
          {chaos || planar.phenomenon ? (
            <Text
              size="xxs"
              weight="bold"
              numberOfLines={1}
              style={[$kicker, { color: ink }]}
              text={translate(chaos ? "board:planar.faces.chaos" : "board:planar.phenomenon")}
            />
          ) : null}
          <Text
            size="xs"
            weight="bold"
            numberOfLines={chaos || planar.phenomenon ? 1 : 2}
            style={[$name, { color: ink }]}
            text={name}
          />
        </View>
      ) : null}
    </BoardPressable>
  )
}

function SchemePlate({
  scheme,
  width,
  due,
  onPress,
}: {
  scheme: SchemeView
  width: number
  due?: boolean
  onPress: () => void
}) {
  const {
    theme: { colors },
  } = useAppTheme()
  const ink = colors.gameMenu.anchorGlyph
  const ongoing = scheme.ongoing.length
  const art = scheme.ongoing[0]?.card ?? scheme.shown
  const label = due
    ? translate("board:scheme.due")
    : ongoing === 1
      ? scheme.ongoing[0]!.card.name
      : ongoing > 1
        ? translate("board:scheme.ongoingCount", { count: ongoing })
        : (scheme.shown?.name ?? translate("board:scheme.schemes"))
  const full = due || width >= FULL_PLATE_WIDTH
  return (
    <BoardPressable
      testID={due ? "scheme-due-plate" : "scheme-plate"}
      accessibilityRole="button"
      accessibilityLabel={`${translate("board:scheme.archenemy")}: ${label}`}
      accessibilityHint={translate("board:scheme.opensSchemes")}
      onPress={onPress}
      style={({ pressed }) => [
        full ? $plate : $icon,
        full && { maxWidth: Math.max(width, FULL_PLATE_WIDTH) },
        {
          backgroundColor: due ? colors.error : colors.gameMenu.anchor,
          borderColor: colors.gameMenu.anchorBorder,
        },
        pressed && $pressed,
      ]}
    >
      {due ? null : art ? (
        <Image
          source={modeCardImage(art, "art_crop")}
          style={full ? $thumb : $iconThumb}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <SchemeGlyph size={16} color={ink} />
      )}
      {full ? (
        <View style={$plateText}>
          <Text
            size="xs"
            weight="bold"
            numberOfLines={2}
            style={[$name, { color: ink }]}
            text={label}
          />
        </View>
      ) : ongoing > 1 ? (
        <View style={[$badge, { backgroundColor: colors.gameMenu.anchor }]}>
          <Text
            size="xxs"
            weight="bold"
            style={[$badgeText, { color: ink }]}
            text={String(ongoing)}
          />
        </View>
      ) : null}
    </BoardPressable>
  )
}

export function SchemeDueButton({ onPress }: { onPress: () => void }) {
  const {
    theme: { colors },
  } = useAppTheme()
  return (
    <BoardPressable
      testID="scheme-due-chip"
      accessibilityRole="button"
      accessibilityHint={translate("board:scheme.opensSchemes")}
      onPress={onPress}
      style={({ pressed }) => [
        $dueChip,
        { backgroundColor: colors.error, borderColor: colors.gameMenu.anchorBorder },
        pressed && $pressed,
      ]}
    >
      <Text
        size="xs"
        weight="bold"
        style={[$name, { color: colors.gameMenu.anchorGlyph }]}
        tx="board:scheme.due"
      />
    </BoardPressable>
  )
}

export function ModeSeam({
  anchorY,
  plan,
  planar,
  scheme,
  onOpen,
}: {
  anchorY: number
  plan: { left?: SeamSlot; right?: SeamSlot }
  planar?: PlanarView
  scheme?: SchemeView
  onOpen: (dialog: "planar" | "scheme") => void
}) {
  const share = (slot: SeamSlot) => {
    const dice = slot.items.filter((item) => item === "die").length
    const due = slot.items.filter((item) => item === "schemeDue").length
    const plates = Math.max(slot.items.length - dice - due, 1)
    const fixed = dice * (dieWidth(slot) + GAP) + due * (FULL_PLATE_WIDTH + GAP)
    return (slot.room.width - fixed - (plates - 1) * GAP) / plates
  }
  const render = (slot: SeamSlot, item: SeamItem) => {
    if (item === "plane" && planar)
      return (
        <PlanePlate
          key={item}
          planar={planar}
          width={share(slot)}
          onPress={() => onOpen("planar")}
        />
      )
    if ((item === "scheme" || item === "schemeDue") && scheme)
      return (
        <SchemePlate
          key={item}
          scheme={scheme}
          width={share(slot)}
          due={item === "schemeDue"}
          onPress={() => onOpen("scheme")}
        />
      )
    if (item === "die" && planar)
      return <PlanarDieButton key={item} planar={planar} width={dieWidth(slot)} />
    return null
  }
  return (
    <View testID="mode-seam" pointerEvents="box-none" style={[$seam, { top: `${anchorY * 100}%` }]}>
      {[plan.left, plan.right].map((slot, index) =>
        slot ? (
          <View key={index} pointerEvents="box-none" style={[$side, slotPlacement(slot.room)]}>
            {slot.items.map((item) => render(slot, item))}
          </View>
        ) : null,
      )}
    </View>
  )
}

function dieWidth(slot: SeamSlot) {
  const plates = slot.items.filter((item) => item !== "die").length
  const spare = slot.room.width - plates * (FULL_PLATE_WIDTH + GAP)
  return Math.max(ICON_WIDTH, Math.min(PLATE_HEIGHT + 10, spare))
}

function slotPlacement(room: SeamSlot["room"]): ViewStyle {
  return {
    top: SEAM_BAND / 2 + room.shift - PLATE_HEIGHT / 2,
    width: room.width,
    left: room.direction === 1 ? room.start : room.start - room.width,
    justifyContent: (room.direction === 1) === (room.rotation === 0) ? "flex-start" : "flex-end",
    transform: [{ rotate: `${room.rotation}deg` }],
  }
}

/** why: iOS leaves a plate drawn outside its parent's frame out of the accessibility tree, so the seam is a band tall enough to hold every plate, not a line. */
const SEAM_BAND = 4 * PLATE_HEIGHT

const $seam: ViewStyle = {
  position: "absolute",
  left: 0,
  right: 0,
  height: SEAM_BAND,
  marginTop: -SEAM_BAND / 2,
  zIndex: 60,
  elevation: 60,
}
const $side: ViewStyle = {
  position: "absolute",
  height: PLATE_HEIGHT,
  flexDirection: "row",
  alignItems: "center",
  gap: GAP,
}
const $plate: ViewStyle = {
  flexShrink: 1,
  height: PLATE_HEIGHT,
  flexDirection: "row",
  alignItems: "center",
  gap: 6,
  paddingLeft: 3,
  paddingRight: 8,
  borderRadius: 9,
  borderWidth: 2,
}
const $icon: ViewStyle = {
  width: ICON_WIDTH,
  height: PLATE_HEIGHT,
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 9,
  borderWidth: 2,
  overflow: "hidden",
}
const $thumb = { width: 26, height: 26, borderRadius: 5 }
const $iconThumb = { width: ICON_WIDTH - 4, height: PLATE_HEIGHT - 4, borderRadius: 7 }
const $plateText: ViewStyle = { flexShrink: 1 }
const $badge: ViewStyle = {
  position: "absolute",
  right: 1,
  bottom: 1,
  minWidth: 14,
  paddingHorizontal: 2,
  borderRadius: 7,
  alignItems: "center",
}
const $badgeText: TextStyle = { fontSize: 10, lineHeight: 13 }
const $dueChip: ViewStyle = {
  height: 36,
  paddingHorizontal: 8,
  borderRadius: 9,
  borderWidth: 1.5,
  alignItems: "center",
  justifyContent: "center",
}
const $kicker: TextStyle = { fontSize: 9, lineHeight: 11 }
const $name: TextStyle = { fontSize: 12, lineHeight: 14 }
const $die: ViewStyle = {
  paddingHorizontal: 4,
  borderRadius: 9,
  borderWidth: 2,
  alignItems: "center",
  justifyContent: "center",
}
const $dieText: TextStyle = { fontSize: 9, lineHeight: 11 }
const $dimmed: ViewStyle = { opacity: 0.45 }
const $pressed: ViewStyle = { opacity: 0.7 }
