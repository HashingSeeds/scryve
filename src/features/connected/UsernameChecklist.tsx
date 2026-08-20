import { View, type ViewStyle } from "react-native"

import { Icon } from "@/components/Icon"
import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { usernameRuleStatuses } from "./username"

const RULE_ICON_SIZE = 14

export function UsernameChecklist({ username }: { username: string }) {
  const { themed, theme } = useAppTheme()
  return (
    <View style={themed($checklist)}>
      {usernameRuleStatuses(username).map(({ rule, isMet }) => (
        <View
          key={rule.id}
          accessible
          accessibilityLabel={`${rule.label}: ${isMet ? "met" : "not met yet"}`}
          style={themed($rule)}
        >
          <Icon
            icon={isMet ? "check" : "x"}
            size={RULE_ICON_SIZE}
            color={isMet ? theme.colors.tint : theme.colors.textDim}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
          <Text
            preset="formHelper"
            text={rule.label}
            style={{ color: isMet ? theme.colors.text : theme.colors.textDim }}
          />
        </View>
      ))}
    </View>
  )
}

const $checklist: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xxs })

const $rule: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
})
