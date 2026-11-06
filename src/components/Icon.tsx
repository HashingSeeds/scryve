import type { ReactNode } from "react"
import {
  Image,
  ImageStyle,
  StyleProp,
  TouchableOpacity,
  TouchableOpacityProps,
  View,
  ViewProps,
  ViewStyle,
} from "react-native"
import Svg, { Circle, Path, Rect } from "react-native-svg"

import { useAppTheme } from "@/theme/context"
import { decorativeSvgProps } from "@/utils/decorativeSvgProps"

export type IconTypes = keyof typeof iconRegistry | keyof typeof glyphRegistry

type BaseIconProps = {
  icon: IconTypes

  color?: string

  /**
   * An optional size for the icon. If not provided, the icon will be sized to the icon's resolution.
   */
  size?: number

  style?: StyleProp<ImageStyle>

  containerStyle?: StyleProp<ViewStyle>
}

type PressableIconProps = Omit<TouchableOpacityProps, "style"> & BaseIconProps
type IconProps = Omit<ViewProps, "style"> & BaseIconProps

export function PressableIcon(props: PressableIconProps) {
  const {
    icon,
    color,
    size,
    style: $imageStyleOverride,
    containerStyle: $containerStyleOverride,
    ...pressableProps
  } = props

  const { theme } = useAppTheme()

  return (
    <TouchableOpacity {...pressableProps} style={$containerStyleOverride}>
      <IconImage
        icon={icon}
        color={color ?? theme.colors.text}
        size={size}
        style={$imageStyleOverride}
      />
    </TouchableOpacity>
  )
}

export function Icon(props: IconProps) {
  const {
    icon,
    color,
    size,
    style: $imageStyleOverride,
    containerStyle: $containerStyleOverride,
    ...viewProps
  } = props

  const { theme } = useAppTheme()

  return (
    <View {...viewProps} style={$containerStyleOverride}>
      <IconImage
        icon={icon}
        color={color ?? theme.colors.text}
        size={size}
        style={$imageStyleOverride}
      />
    </View>
  )
}

function IconImage({
  icon,
  color,
  size,
  style,
}: {
  icon: IconTypes
  color: string
  size?: number
  style?: StyleProp<ImageStyle>
}) {
  if (icon in glyphRegistry) {
    const glyph = glyphRegistry[icon as keyof typeof glyphRegistry]
    const side = size ?? GLYPH_SIZE
    return (
      <Svg
        width={side}
        height={side}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        // why: callers rotate icons (RTL back, open carets) through this style; only its transform applies to SVG.
        style={style as StyleProp<ViewStyle>}
        {...decorativeSvgProps({ accessible: false })}
      >
        {glyph(color)}
      </Svg>
    )
  }
  return (
    <Image
      style={[
        $imageStyleBase,
        { tintColor: color },
        size !== undefined && { width: size, height: size },
        style,
      ]}
      source={iconRegistry[icon as keyof typeof iconRegistry]}
    />
  )
}

export const iconRegistry = {
  caretRight: require("@assets/icons/caretRight.png"),
  check: require("@assets/icons/check.png"),
  hidden: require("@assets/icons/hidden.png"),
  ladybug: require("@assets/icons/ladybug.png"),
  view: require("@assets/icons/view.png"),
  x: require("@assets/icons/x.png"),
}

const GLYPH_SIZE = 24

/** why: stroked SVG stays crisp at any size without @2x/@3x assets. Every glyph shares the Svg's one stroke weight. */
const glyphRegistry = {
  back: () => <Path d="m15 18-6-6 6-6" />,
  arrowBack: () => <Path d="M19 12H5m7 7-7-7 7-7" />,
  more: () => (
    <>
      <Circle cx={5} cy={12} r={1} />
      <Circle cx={12} cy={12} r={1} />
      <Circle cx={19} cy={12} r={1} />
    </>
  ),
  plus: () => <Path d="M12 5v14M5 12h14" />,
  pencil: () => (
    <>
      <Path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
      <Path d="m15 5 4 4" />
    </>
  ),
  info: () => (
    <>
      <Circle cx={12} cy={12} r={10} />
      <Path d="M12 16v-4M12 8h.01" />
    </>
  ),
  decks: () => (
    <>
      <Rect x={7} y={3.5} width={12} height={15.5} rx={2} />
      <Path d="M5 6.5v12a2 2 0 0 0 2 2h9" />
    </>
  ),
  history: () => <Path d="M3.5 12a8.5 8.5 0 1 0 2.5-6M3.5 4v4h4M12 7.5V12l3 2" />,
  events: () => (
    <>
      <Rect x={3.5} y={5} width={17} height={15.5} rx={2} />
      <Path d="M3.5 10h17M8 3v4m8-4v4" />
    </>
  ),
  nearby: (color) => (
    <>
      <Circle cx={12} cy={12} r={2} fill={color} />
      <Path d="M7.8 7.8a6 6 0 0 0 0 8.4m8.4-8.4a6 6 0 0 1 0 8.4M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14" />
    </>
  ),
  account: () => (
    <>
      <Circle cx={12} cy={8} r={4} />
      <Path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  support: () => (
    <>
      <Path d="M14.5 10a2 2 0 0 1-2 2H7l-3.5 3.5V5.5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2z" />
      <Path d="M16.5 9h2a2 2 0 0 1 2 2v9.5L17 17h-5.5a2 2 0 0 1-2-2v-1" />
    </>
  ),
  settings: () => (
    <>
      <Circle cx={12} cy={12} r={2.5} />
      <Circle cx={12} cy={12} r={6.5} />
      <Path d="M12 2.8v2.7m0 13v2.7M2.8 12h2.7m13 0h2.7M5.5 5.5l1.9 1.9m9.2 9.2 1.9 1.9m-13 0 1.9-1.9m9.2-9.2 1.9-1.9" />
    </>
  ),
  update: () => <Path d="M12 4v11m-5-5 5 5 5-5M5 20h14" />,
  sliders: (color) => (
    <>
      <Path d="M4 5h16M4 12h16M4 19h16" />
      <Circle cx={9} cy={5} r={2} fill={color} />
      <Circle cx={15} cy={12} r={2} fill={color} />
      <Circle cx={8} cy={19} r={2} fill={color} />
    </>
  ),
  panes: () => (
    <>
      <Rect x={3.5} y={3.5} width={7} height={17} rx={2} />
      <Rect x={13.5} y={3.5} width={7} height={7.5} rx={2} />
      <Rect x={13.5} y={13} width={7} height={7.5} rx={2} />
    </>
  ),
  book: () => <Path d="M5 4.5h9.5a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3ZM5 17a3 3 0 0 1 3-3h9.5" />,
  flag: () => <Path d="M6 21V4M6 5h11l-2.5 4L17 13H6" />,
  list: (color) => (
    <>
      <Path d="M9 6h11M9 12h11M9 18h11" />
      <Circle cx={4.5} cy={6} r={1.3} fill={color} />
      <Circle cx={4.5} cy={12} r={1.3} fill={color} />
      <Circle cx={4.5} cy={18} r={1.3} fill={color} />
    </>
  ),
} satisfies Record<string, (color: string) => ReactNode>

const $imageStyleBase: ImageStyle = {
  resizeMode: "contain",
}
