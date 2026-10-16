import { View, type ViewStyle } from "react-native"

import { Icon } from "@/components/Icon"
import { Text } from "@/components/Text"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { usernameRuleStatuses } from "./username"

const RULE_ICON_SIZE = 14

export function UsernameChecklist({ username }: { username: string }) {
  const { themed, theme } = useAppTheme()
  return (
    <View style={themed($checklist)}>
      {usernameRuleStatuses(username).map(({ rule, isMet }) => {
        const label = rule.label()
        return (
          <View
            key={rule.id}
            accessible
            accessibilityLabel={translate(
              isMet ? "connected:username.ruleMet" : "connected:username.ruleNotMet",
              { rule: label },
            )}
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
              text={label}
              style={{ color: isMet ? theme.colors.text : theme.colors.textDim }}
            />
          </View>
        )
      })}
    </View>
  )
}

const $checklist: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xxs })

const $rule: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
})
