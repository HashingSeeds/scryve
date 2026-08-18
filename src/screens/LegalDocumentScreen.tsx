import type { TextStyle, ViewStyle } from "react-native"
import { ScrollView, View } from "react-native"

import { useCollapsingTitle } from "@/components/CollapsingTitle"
import { Header } from "@/components/Header"
import { LinkedText } from "@/components/LinkedText"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import type { LegalDocumentBlock, LegalDocumentContent } from "@/content/legal"
import { useAppTheme } from "@/theme/context"
import { $styles } from "@/theme/styles"
import type { ThemedStyle } from "@/theme/types"

export interface LegalDocumentScreenProps {
  document: LegalDocumentContent
  onBack: () => void
}

export function LegalDocumentScreen({ document, onBack }: LegalDocumentScreenProps) {
  const { theme, themed } = useAppTheme()
  const backgroundColor = theme.isDark ? theme.colors.palette.neutral100 : theme.colors.background
  const { titleVisible, onScroll } = useCollapsingTitle()

  return (
    <Screen
      preset="fixed"
      safeAreaEdges={["bottom"]}
      backgroundColor={backgroundColor}
      systemBarStyle={theme.isDark ? "light" : "dark"}
      contentContainerStyle={themed($screen)}
    >
      <Header
        title={titleVisible ? document.title : ""}
        backgroundColor={backgroundColor}
        leftTx="common:back"
        onLeftPress={onBack}
      />
      <ScrollView
        testID="legal-document-scroll"
        style={$styles.flex1}
        contentContainerStyle={themed($scrollContent)}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        <View style={themed($content)}>
          <View style={themed($documentHeader)}>
            <Text text={document.title} preset="heading" accessibilityRole="header" />
            <Text
              text={`Last updated ${document.effectiveDate}`}
              size="xs"
              style={themed($metadata)}
            />
          </View>
          {document.sections.map((section, index) => (
            <View key={`${section.heading ?? "section"}-${index}`} style={themed($section)}>
              {section.heading ? (
                <Text
                  text={section.heading}
                  weight="bold"
                  size="md"
                  accessibilityRole="header"
                  style={themed($sectionHeading)}
                />
              ) : null}
              {section.blocks.map((block, blockIndex) => (
                <LegalBlockView key={`${block.type}-${blockIndex}`} block={block} />
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </Screen>
  )
}

function LegalBlockView({ block }: { block: LegalDocumentBlock }) {
  const { themed } = useAppTheme()
  if (block.type === "paragraph") {
    return <LinkedText text={block.text} weight="light" style={themed($body)} />
  }
  if (block.type === "list") {
    return (
      <View style={themed($list)}>
        {block.items.map((item, index) => (
          <View key={`${item}-${index}`} style={themed($listItem)}>
            <Text text="•" weight="light" style={themed($bullet)} />
            <LinkedText text={item} weight="light" style={themed($listText)} />
          </View>
        ))}
      </View>
    )
  }
  return (
    <View style={themed($table)}>
      {block.rows.map((row, index) => (
        <LinkedText key={`${row}-${index}`} text={row} weight="light" style={themed($tableRow)} />
      ))}
    </View>
  )
}

const $screen: ThemedStyle<ViewStyle> = () => ({ flex: 1, width: "100%" })

const $scrollContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: "100%",
  paddingHorizontal: spacing.lg,
  paddingBottom: spacing.xxxl,
})

const $content: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: "100%",
  maxWidth: 680,
  alignSelf: "center",
  gap: spacing.xl,
})
const $documentHeader: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  gap: spacing.md,
  paddingBottom: spacing.xxl,
  borderBottomWidth: 1,
  borderColor: colors.separator,
})
const $metadata: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $section: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.md })
const $sectionHeading: ThemedStyle<TextStyle> = () => ({ letterSpacing: -0.2 })
const $body: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
  fontSize: 16,
  lineHeight: 28,
})
const $list: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.sm })
const $listItem: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "flex-start",
  gap: spacing.sm,
})
const $bullet: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  fontSize: 16,
  lineHeight: 28,
})
const $listText: ThemedStyle<TextStyle> = ({ colors }) => ({
  flex: 1,
  color: colors.text,
  fontSize: 16,
  lineHeight: 28,
})
const $table: ThemedStyle<ViewStyle> = ({ colors }) => ({
  borderTopWidth: 1,
  borderBottomWidth: 1,
  borderColor: colors.separator,
})
const $tableRow: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.text,
  fontSize: 15,
  lineHeight: 24,
  paddingVertical: spacing.sm,
})
