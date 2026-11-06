import {
  ComponentType,
  forwardRef,
  Ref,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
} from "react"
import {
  ImageStyle,
  StyleProp,
  // eslint-disable-next-line no-restricted-imports
  TextInput,
  TextInputProps,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native"

import { isRTL } from "@/i18n"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import { $styles } from "@/theme/styles"
import type { ThemedStyle, ThemedStyleArray } from "@/theme/types"

import { PressableIcon } from "./Icon"
import { KeyboardDismiss } from "./KeyboardDismiss"
import { needsKeyboardDismiss } from "./needsKeyboardDismiss"
import { Text, TextProps } from "./Text"

export interface TextFieldAccessoryProps {
  style: StyleProp<ViewStyle | TextStyle | ImageStyle>
  status: TextFieldProps["status"]
  multiline: boolean
  editable: boolean
}

export interface TextFieldProps extends Omit<TextInputProps, "ref"> {
  status?: "error" | "disabled"
  label?: TextProps["text"]
  labelTx?: TextProps["tx"]
  labelTxOptions?: TextProps["txOptions"]
  LabelTextProps?: TextProps
  optional?: boolean
  helper?: TextProps["text"]
  helperTx?: TextProps["tx"]
  helperTxOptions?: TextProps["txOptions"]
  HelperTextProps?: TextProps
  placeholder?: TextProps["text"]
  placeholderTx?: TextProps["tx"]
  placeholderTxOptions?: TextProps["txOptions"]
  style?: StyleProp<TextStyle>
  containerStyle?: StyleProp<ViewStyle>
  inputWrapperStyle?: StyleProp<ViewStyle>
  /**
   * An optional component to render on the right side of the input.
   * Example: `RightAccessory={(props) => <Icon icon="ladybug" containerStyle={props.style} color={props.editable ? colors.textDim : colors.text} />}`
   * Note: It is a good idea to memoize this.
   */
  RightAccessory?: ComponentType<TextFieldAccessoryProps>
  /**
   * An optional component to render on the left side of the input.
   * Example: `LeftAccessory={(props) => <Icon icon="ladybug" containerStyle={props.style} color={props.editable ? colors.textDim : colors.text} />}`
   * Note: It is a good idea to memoize this.
   */
  LeftAccessory?: ComponentType<TextFieldAccessoryProps>
  clearable?: boolean
}

export const TextField = forwardRef(function TextField(props: TextFieldProps, ref: Ref<TextInput>) {
  const {
    labelTx,
    label,
    labelTxOptions,
    placeholderTx,
    placeholder,
    placeholderTxOptions,
    helper,
    helperTx,
    helperTxOptions,
    status,
    RightAccessory,
    LeftAccessory,
    clearable,
    optional,
    HelperTextProps,
    LabelTextProps,
    style: $inputStyleOverride,
    containerStyle: $containerStyleOverride,
    inputWrapperStyle: $inputWrapperStyleOverride,
    ...TextInputProps
  } = props
  const input = useRef<TextInput>(null)
  const multiline = TextInputProps.multiline ?? false
  const accessoryID = useId()
  const dismissible = needsKeyboardDismiss(TextInputProps)
  // why: Fabric attaches an InputAccessoryView after native autoFocus, and iOS ignores an accessory set on an already focused field.
  const deferredFocus = dismissible && TextInputProps.autoFocus
  useEffect(() => {
    if (deferredFocus) input.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const {
    themed,
    theme: { colors, isDark },
  } = useAppTheme()

  const disabled = TextInputProps.editable === false || status === "disabled"

  const labelContent = labelTx ? translate(labelTx, labelTxOptions) : label
  const placeholderContent = placeholderTx
    ? translate(placeholderTx, placeholderTxOptions)
    : placeholder

  const $containerStyles = [$containerStyleOverride]

  const $labelStyles = [$labelStyle, LabelTextProps?.style]

  const $inputWrapperStyles = [
    $styles.row,
    $inputWrapperStyle,
    status === "error" && { borderColor: colors.error },
    multiline ? { minHeight: 112 } : $singleLineWrapper,
    LeftAccessory && { paddingStart: 0 },
    RightAccessory && { paddingEnd: 0 },
    $inputWrapperStyleOverride,
  ]

  const $inputStyles: ThemedStyleArray<TextStyle> = [
    $inputStyle,
    multiline && $multilineInputStyle,
    disabled && { color: colors.textDim },
    isRTL && { textAlign: "right" as TextStyle["textAlign"] },
    $inputStyleOverride,
  ]

  const $helperStyles = [
    $helperStyle,
    status === "error" && { color: colors.error },
    HelperTextProps?.style,
  ]

  function focusInput() {
    if (disabled) return

    input.current?.focus()
  }

  function clearInput() {
    TextInputProps.onChangeText?.("")
    input.current?.focus()
  }

  useImperativeHandle(ref, () => input.current as TextInput)

  return (
    <TouchableOpacity
      activeOpacity={1}
      accessible={!clearable}
      style={$containerStyles}
      onPress={focusInput}
      accessibilityState={{ disabled }}
    >
      {!!labelContent && (
        <Text preset="formLabel" size="xs" {...LabelTextProps} style={themed($labelStyles)}>
          {labelContent}
          {optional ? (
            <Text size="xs" tone="dim" text={` ${translate("common:optional")}`} />
          ) : null}
        </Text>
      )}

      <View style={themed($inputWrapperStyles)}>
        {!!LeftAccessory && (
          <LeftAccessory
            style={themed($leftAccessoryStyle)}
            status={status}
            editable={!disabled}
            multiline={multiline}
          />
        )}

        <TextInput
          ref={input}
          underlineColorAndroid={colors.transparent}
          textAlignVertical={multiline ? "top" : "center"}
          placeholder={placeholderContent}
          placeholderTextColor={colors.textDim}
          keyboardAppearance={isDark ? "dark" : "light"}
          inputAccessoryViewID={dismissible ? accessoryID : undefined}
          {...TextInputProps}
          editable={!disabled}
          autoFocus={deferredFocus ? false : TextInputProps.autoFocus}
          style={themed($inputStyles)}
        />
        {dismissible && <KeyboardDismiss nativeID={accessoryID} />}

        {clearable && !disabled && !!TextInputProps.value && (
          <PressableIcon
            testID={TextInputProps.testID && `${TextInputProps.testID}-clear`}
            icon="x"
            size={16}
            color={colors.textDim}
            accessibilityRole="button"
            accessibilityLabel={translate("common:clear")}
            hitSlop={8}
            containerStyle={themed($rightAccessoryStyle)}
            onPress={clearInput}
          />
        )}

        {!!RightAccessory && (
          <RightAccessory
            style={themed($rightAccessoryStyle)}
            status={status}
            editable={!disabled}
            multiline={multiline}
          />
        )}
      </View>

      {!!(helper || helperTx) && (
        <Text
          preset="formHelper"
          text={helper}
          tx={helperTx}
          txOptions={helperTxOptions}
          {...HelperTextProps}
          style={themed($helperStyles)}
        />
      )}
    </TouchableOpacity>
  )
})

const $labelStyle: ThemedStyle<TextStyle> = ({ spacing }) => ({
  marginBottom: spacing.xs,
})

const $inputWrapperStyle: ThemedStyle<ViewStyle> = ({ colors, radius }) => ({
  alignItems: "flex-start",
  borderWidth: 1,
  borderRadius: radius.lg,
  backgroundColor: colors.field,
  borderColor: colors.border,
  overflow: "hidden",
})

const $singleLineWrapper: ViewStyle = { minHeight: 44, alignItems: "center" }

/** why: a fixed height left text high on Android; filling the wrapper lets each OS center it at any font scale. */
const $inputStyle: ThemedStyle<TextStyle> = ({ colors, typography, spacing }) => ({
  flex: 1,
  alignSelf: "stretch",
  fontFamily: typography.primary.normal,
  color: colors.text,
  fontSize: 16,
  // https://github.com/facebook/react-native/issues/21720#issuecomment-532642093
  paddingVertical: 0,
  paddingHorizontal: 0,
  marginVertical: spacing.xs,
  marginHorizontal: spacing.sm,
})

const $multilineInputStyle: TextStyle = { minHeight: 24 }

const $helperStyle: ThemedStyle<TextStyle> = ({ spacing }) => ({
  marginTop: spacing.xs,
})

const $rightAccessoryStyle: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginEnd: spacing.xs,
  height: 40,
  justifyContent: "center",
  alignItems: "center",
})

const $leftAccessoryStyle: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginStart: spacing.xs,
  height: 40,
  justifyContent: "center",
  alignItems: "center",
})
