import { ReactElement, ReactNode, useState } from "react"
import {
  LayoutChangeEvent,
  StyleProp,
  TextStyle,
  TouchableOpacity,
  TouchableOpacityProps,
  useWindowDimensions,
  View,
  ViewStyle,
} from "react-native"

import { isRTL } from "@/i18n"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import { $styles } from "@/theme/styles"
import type { ThemedStyle } from "@/theme/types"
import { ExtendedEdge, useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"

import { IconTypes, PressableIcon } from "./Icon"
import { Text, TextProps } from "./Text"

export interface HeaderProps {
  /**
   * The layout of the title relative to the action components.
   * - `center` will force the title to always be centered relative to the header. If the title or the action buttons are too long, the title will be cut off.
   * - `flex` will attempt to center the title relative to the action buttons. If the action buttons are different widths, the title will be off-center relative to the header.
   */
  titleMode?: "center" | "flex"
  titleStyle?: StyleProp<TextStyle>
  titleContainerStyle?: StyleProp<ViewStyle>
  /**
   * Optional inner header wrapper style override.
   */
  style?: StyleProp<ViewStyle>
  containerStyle?: StyleProp<ViewStyle>
  backgroundColor?: string
  title?: TextProps["text"]
  titleTx?: TextProps["tx"]
  titleTxOptions?: TextProps["txOptions"]
  titleAccessory?: ReactNode
  leftIcon?: IconTypes
  leftIconColor?: string
  /**
   * Left action text to display if not using `leftTx`.
   * Can be used with `onLeftPress`. Overrides `leftIcon`.
   */
  leftText?: TextProps["text"]
  /**
   * Left action text text which is looked up via i18n.
   * Can be used with `onLeftPress`. Overrides `leftIcon`.
   */
  leftTx?: TextProps["tx"]
  /**
   * Left action custom ReactElement if the built in action props don't suffice.
   * Overrides `leftIcon`, `leftTx` and `leftText`.
   */
  LeftActionComponent?: ReactElement
  leftTxOptions?: TextProps["txOptions"]
  onLeftPress?: TouchableOpacityProps["onPress"]
  rightIcon?: IconTypes
  rightIconColor?: string
  /**
   * Right action text to display if not using `rightTx`.
   * Can be used with `onRightPress`. Overrides `rightIcon`.
   */
  rightText?: TextProps["text"]
  /**
   * Right action text text which is looked up via i18n.
   * Can be used with `onRightPress`. Overrides `rightIcon`.
   */
  rightTx?: TextProps["tx"]
  /**
   * Right action custom ReactElement if the built in action props don't suffice.
   * Overrides `rightIcon`, `rightTx` and `rightText`.
   */
  RightActionComponent?: ReactElement
  rightTxOptions?: TextProps["txOptions"]
  onRightPress?: TouchableOpacityProps["onPress"]
  safeAreaEdges?: ExtendedEdge[]
}

interface HeaderActionProps {
  onLayout: (event: LayoutChangeEvent) => void
  backgroundColor?: string
  icon?: IconTypes
  iconColor?: string
  text?: TextProps["text"]
  tx?: TextProps["tx"]
  txOptions?: TextProps["txOptions"]
  onPress?: TouchableOpacityProps["onPress"]
  ActionComponent?: ReactElement
}

export function Header(props: HeaderProps) {
  const {
    theme: { colors, spacing },
    themed,
  } = useAppTheme()
  const [actionWidths, setActionWidths] = useState({ left: 0, right: 0 })
  const {
    backgroundColor = colors.background,
    LeftActionComponent,
    leftIcon,
    leftIconColor,
    leftText,
    leftTx,
    leftTxOptions,
    onLeftPress,
    onRightPress,
    RightActionComponent,
    rightIcon,
    rightIconColor,
    rightText,
    rightTx,
    rightTxOptions,
    safeAreaEdges = ["top"],
    title,
    titleMode = "center",
    titleTx,
    titleTxOptions,
    titleAccessory,
    titleContainerStyle: $titleContainerStyleOverride,
    style: $styleOverride,
    titleStyle: $titleStyleOverride,
    containerStyle: $containerStyleOverride,
  } = props

  const $containerInsets = useSafeAreaInsetsStyle(safeAreaEdges)
  const { fontScale } = useWindowDimensions()
  const centered = titleMode === "center" && fontScale <= CENTERED_TITLE_MAX_FONT_SCALE

  const titleContent = titleTx ? translate(titleTx, titleTxOptions) : title
  const centeredInset = Math.max(spacing.xxl, actionWidths.left, actionWidths.right)
  const measureAction = (side: "left" | "right") => (event: LayoutChangeEvent) => {
    const width = Math.ceil(event.nativeEvent.layout.width)
    setActionWidths((widths) => (widths[side] === width ? widths : { ...widths, [side]: width }))
  }

  return (
    <View style={[$container, $containerInsets, { backgroundColor }, $containerStyleOverride]}>
      <View style={[$styles.row, $wrapper, $styleOverride]}>
        <HeaderAction
          onLayout={measureAction("left")}
          tx={leftTx}
          text={leftText}
          icon={leftIcon}
          iconColor={leftIconColor}
          onPress={onLeftPress}
          txOptions={leftTxOptions}
          backgroundColor={backgroundColor}
          ActionComponent={LeftActionComponent}
        />

        {!!titleContent && (
          <View
            style={[
              titleAccessory ? $titleWrapperAccessoryPointerEvents : $titleWrapperPointerEvents,
              !!titleAccessory && themed($titleWrapperRow),
              centered
                ? [$titleWrapperCenter, { paddingHorizontal: centeredInset }]
                : $titleWrapperFlex,
              $titleContainerStyleOverride,
            ]}
          >
            <Text
              weight="medium"
              size="md"
              text={titleContent}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={TITLE_MIN_FONT_SCALE}
              maxFontSizeMultiplier={HEADER_MAX_FONT_SCALE}
              style={[$title, $titleStyleOverride]}
            />
            {titleAccessory}
          </View>
        )}

        <HeaderAction
          onLayout={measureAction("right")}
          tx={rightTx}
          text={rightText}
          icon={rightIcon}
          iconColor={rightIconColor}
          onPress={onRightPress}
          txOptions={rightTxOptions}
          backgroundColor={backgroundColor}
          ActionComponent={RightActionComponent}
        />
      </View>
    </View>
  )
}

function HeaderAction({ onLayout, ...props }: HeaderActionProps) {
  return (
    <View onLayout={onLayout} style={$actionSlot}>
      <HeaderActionContent {...props} />
    </View>
  )
}

function HeaderActionContent(props: Omit<HeaderActionProps, "onLayout">) {
  const { backgroundColor, icon, text, tx, txOptions, onPress, ActionComponent, iconColor } = props
  const { themed } = useAppTheme()

  const content = tx ? translate(tx, txOptions) : text

  if (ActionComponent) return ActionComponent

  if (content) {
    return (
      <TouchableOpacity
        style={themed([$actionTextContainer, { backgroundColor }])}
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole="button"
        accessibilityLabel={content}
        accessibilityState={{ disabled: !onPress }}
        activeOpacity={0.8}
      >
        <Text
          weight="medium"
          size="md"
          text={content}
          numberOfLines={1}
          maxFontSizeMultiplier={HEADER_MAX_FONT_SCALE}
          style={themed($actionText)}
        />
      </TouchableOpacity>
    )
  }

  if (icon) {
    return (
      <PressableIcon
        size={24}
        icon={icon}
        color={iconColor}
        onPress={onPress}
        containerStyle={themed([$actionIconContainer, { backgroundColor }])}
        style={isRTL ? { transform: [{ rotate: "180deg" }] } : {}}
      />
    )
  }

  return <View style={[$actionFillerContainer, { backgroundColor }]} />
}

const HEADER_MAX_FONT_SCALE = 1.5
const CENTERED_TITLE_MAX_FONT_SCALE = 1.3
const TITLE_MIN_FONT_SCALE = 0.75

const $wrapper: ViewStyle = {
  height: 56,
  alignItems: "center",
  justifyContent: "space-between",
}

const $actionSlot: ViewStyle = {
  height: "100%",
  justifyContent: "center",
  zIndex: 2,
}

const $container: ViewStyle = {
  width: "100%",
}

const $title: TextStyle = {
  textAlign: "center",
}

const $actionTextContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexGrow: 0,
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  paddingHorizontal: spacing.md,
  zIndex: 2,
})

const $actionText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.tint,
})

const $actionIconContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexGrow: 0,
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  paddingHorizontal: spacing.md,
  zIndex: 2,
})

const $actionFillerContainer: ViewStyle = {
  width: 16,
}

const $titleWrapperPointerEvents: ViewStyle = {
  pointerEvents: "none",
}

const $titleWrapperAccessoryPointerEvents: ViewStyle = {
  pointerEvents: "box-none",
}

const $titleWrapperRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.xs,
})

const $titleWrapperCenter: ViewStyle = {
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  width: "100%",
  position: "absolute",
  zIndex: 1,
}

const $titleWrapperFlex: ViewStyle = {
  justifyContent: "center",
  flexGrow: 1,
  flexShrink: 1,
}
