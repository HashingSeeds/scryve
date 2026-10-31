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
import Svg, { Circle, Path } from "react-native-svg"

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
    const Glyph = glyphRegistry[icon as keyof typeof glyphRegistry]
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
        <Glyph />
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

/** why: header and row actions need these, and stroked SVG stays crisp at any size without @2x/@3x assets. */
const glyphRegistry = {
  back: () => <Path d="m15 18-6-6 6-6" />,
  more: () => (
    <>
      <Circle cx={5} cy={12} r={1} />
      <Circle cx={12} cy={12} r={1} />
      <Circle cx={19} cy={12} r={1} />
    </>
  ),
  plus: () => <Path d="M12 5v14M5 12h14" />,
}

const $imageStyleBase: ImageStyle = {
  resizeMode: "contain",
}
