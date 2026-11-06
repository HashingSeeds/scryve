import { useEffect, useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"
import { Image } from "expo-image"
import Svg, { Circle, Path, Rect } from "react-native-svg"

import { faceLabel, modeCardImage } from "@/features/modes/modeCards"
import type { PlanarView, SchemeView } from "@/features/modes/useBoardModes"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"

import type { PlanarFace } from "../../../convex/lib/tableModes"
import { BoardPressable } from "../BoardPressable"
import { MENU_BUTTON_SIZE } from "../GameRadialMenu"
import { Text } from "../Text"

const PLATE_HEIGHT = 40
const DIE_SIZE = 44
const MENU_CLEARANCE = MENU_BUTTON_SIZE / 2 + 10
const EDGE = 8
/** why: clears the first-player and round clock tabs at the board's edges while they show. */
const EDGE_WITH_TABS = 40
/** why: a fresh roll shows its face long enough to read across the table, then the die goes back to showing its cost. */
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

/** why: the die shows the next roll's cost at rest, so the active player knows the mana before tapping. */
export function PlanarDieButton({
  planar,
  rotation = 0,
  testID = "planar-die",
}: {
  planar: PlanarView
  rotation?: number
  testID?: string
}) {
  const {
    theme: { colors },
  } = useAppTheme()
  const ink = colors.gameMenu.anchorGlyph
  const fresh = useFresh(planar.lastRoll?.at)
  const disabled = !planar.roller || planar.phenomenon
  const face = fresh ? planar.lastRoll?.face : undefined
  return (
    <BoardPressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={translate("board:planar.dieLabel", { cost: planar.cost })}
      accessibilityHint={disabled ? translate("board:planar.activeOnly") : undefined}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={planar.roll}
      style={({ pressed }) => [
        $die,
        { transform: [{ rotate: `${rotation}deg` }] },
        {
          backgroundColor: face === "chaos" ? colors.error : colors.gameMenu.anchor,
          borderColor: colors.gameMenu.anchorBorder,
        },
        disabled && $dimmed,
        pressed && $pressed,
      ]}
    >
      <PlanarGlyph face={face ?? "planeswalk"} size={face ? 22 : 18} color={ink} />
      <Text
        size="xxs"
        weight="bold"
        maxFontSizeMultiplier={1.1}
        style={[$dieText, { color: ink }]}
        text={
          face
            ? faceLabel(face)
            : planar.cost === 0
              ? translate("board:planar.free")
              : translate("board:planar.costBadge", { cost: planar.cost })
        }
      />
    </BoardPressable>
  )
}

function PlanePlate({
  planar,
  rotation,
  onPress,
}: {
  planar: PlanarView
  rotation: number
  onPress: () => void
}) {
  const {
    theme: { colors },
  } = useAppTheme()
  const ink = colors.gameMenu.anchorGlyph
  const chaos = useFresh(planar.lastRoll?.face === "chaos" ? planar.lastRoll.at : undefined)
  const name = planar.card?.name ?? translate("board:planar.ownCards")
  return (
    <BoardPressable
      testID="plane-plate"
      accessibilityRole="button"
      accessibilityLabel={`${translate(planar.phenomenon ? "board:planar.phenomenon" : "board:planar.plane")}: ${name}`}
      accessibilityHint={translate("board:planar.opensPlane")}
      onPress={onPress}
      style={({ pressed }) => [
        $plate,
        { transform: [{ rotate: `${rotation}deg` }] },
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
          style={$thumb}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <PlanarGlyph face="planeswalk" size={18} color={ink} />
      )}
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
    </BoardPressable>
  )
}

function SchemePlate({
  scheme,
  rotation,
  onPress,
}: {
  scheme: SchemeView
  rotation: number
  onPress: () => void
}) {
  const {
    theme: { colors },
  } = useAppTheme()
  const ink = colors.gameMenu.anchorGlyph
  const label = scheme.due
    ? translate("board:scheme.due")
    : scheme.ongoing.length === 1
      ? scheme.ongoing[0]!.card.name
      : scheme.ongoing.length > 1
        ? translate("board:scheme.ongoingCount", { count: scheme.ongoing.length })
        : (scheme.shown?.name ?? translate("board:scheme.schemes"))
  return (
    <BoardPressable
      testID="scheme-plate"
      accessibilityRole="button"
      accessibilityLabel={`${translate("board:scheme.archenemy")}: ${label}`}
      accessibilityHint={translate("board:scheme.opensSchemes")}
      onPress={onPress}
      style={({ pressed }) => [
        $plate,
        { transform: [{ rotate: `${rotation}deg` }] },
        {
          backgroundColor: scheme.due ? colors.error : colors.gameMenu.anchor,
          borderColor: colors.gameMenu.anchorBorder,
        },
        pressed && $pressed,
      ]}
    >
      {scheme.ongoing[0] ? (
        <Image
          source={modeCardImage(scheme.ongoing[0].card, "art_crop")}
          style={$thumb}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
      ) : null}
      <View style={$plateText}>
        <Text
          size="xs"
          weight="bold"
          numberOfLines={2}
          style={[$name, { color: ink }]}
          text={label}
        />
      </View>
    </BoardPressable>
  )
}

/**
 * why: the modes sit on the menu's seam, beside the pentagon, where no seat prints anything. Each
 * plate turns toward the seat it belongs to: the plane and die toward the active player, the
 * schemes toward the archenemy.
 */
export function ModeSeam({
  anchor,
  shift,
  edgeTabs,
  planar,
  scheme,
  dieOnSeam,
  planeRotation,
  schemeRotation,
  onOpen,
}: {
  anchor: { x: number; y: number }
  shift: number
  edgeTabs: boolean
  planar?: PlanarView
  scheme?: SchemeView
  dieOnSeam: boolean
  planeRotation: number
  schemeRotation: number
  onOpen: (dialog: "planar" | "scheme") => void
}) {
  const showDie = planar && dieOnSeam
  const edge = edgeTabs ? EDGE_WITH_TABS : EDGE
  return (
    <View
      testID="mode-seam"
      pointerEvents="box-none"
      style={[$seam, { top: `${anchor.y * 100}%`, marginTop: shift }]}
    >
      {planar ? (
        <View
          pointerEvents="box-none"
          style={[$side, $before, { right: `${(1 - anchor.x) * 100}%`, left: edge }]}
        >
          <PlanePlate planar={planar} rotation={planeRotation} onPress={() => onOpen("planar")} />
        </View>
      ) : null}
      {showDie || scheme ? (
        <View
          pointerEvents="box-none"
          style={[$side, $after, { left: `${anchor.x * 100}%`, right: edge }]}
        >
          {showDie ? <PlanarDieButton planar={planar} rotation={planeRotation} /> : null}
          {scheme ? (
            <SchemePlate
              scheme={scheme}
              rotation={schemeRotation}
              onPress={() => onOpen("scheme")}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

const $seam: ViewStyle = {
  position: "absolute",
  left: 0,
  right: 0,
  height: 0,
  zIndex: 60,
  elevation: 60,
}
const $side: ViewStyle = {
  position: "absolute",
  top: -PLATE_HEIGHT / 2 - 2,
  height: PLATE_HEIGHT + 4,
  flexDirection: "row",
  alignItems: "center",
  gap: 8,
}
const $before: ViewStyle = { justifyContent: "flex-end", marginRight: MENU_CLEARANCE }
const $after: ViewStyle = { justifyContent: "flex-start", marginLeft: MENU_CLEARANCE }
const $plate: ViewStyle = {
  flexShrink: 1,
  maxWidth: 168,
  height: PLATE_HEIGHT,
  flexDirection: "row",
  alignItems: "center",
  gap: 6,
  paddingLeft: 4,
  paddingRight: 10,
  borderRadius: 10,
  borderWidth: 2,
}
const $thumb = { width: 30, height: 30, borderRadius: 6 }
const $plateText: ViewStyle = { flexShrink: 1 }
const $kicker: TextStyle = { fontSize: 9, lineHeight: 11 }
const $name: TextStyle = { fontSize: 12, lineHeight: 14 }
const $die: ViewStyle = {
  minWidth: DIE_SIZE,
  paddingHorizontal: 4,
  height: DIE_SIZE,
  borderRadius: 10,
  borderWidth: 2,
  alignItems: "center",
  justifyContent: "center",
}
const $dieText: TextStyle = { fontSize: 9, lineHeight: 11, marginTop: 1 }
const $dimmed: ViewStyle = { opacity: 0.45 }
const $pressed: ViewStyle = { opacity: 0.7 }
