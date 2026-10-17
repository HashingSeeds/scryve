import { useMemo, useRef, useState } from "react"
import { FlatList, Linking, Platform, Pressable, View } from "react-native"
import type { TextStyle, ViewStyle } from "react-native"

import { Header } from "@/components/Header"
import { RetryableError } from "@/components/RetryableError"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import {
  findRules,
  ruleReferences,
  searchRules,
  type ComprehensiveRules,
  type GlossaryEntry,
  type Rule,
} from "@/features/rules/comprehensiveRules"
import type { TextRules } from "@/features/rules/gameRules"
import { useComprehensiveRules } from "@/features/rules/rulesSource"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

type Row =
  | { kind: "chapter"; key: string; title: string }
  | { kind: "section"; key: string; id: string; title: string }
  | { kind: "glossary"; key: string }
  | { kind: "rule"; key: string; rule: Rule; target: boolean }
  | { kind: "term"; key: string; entry: GlossaryEntry }
  | { kind: "all"; key: string; id: string; title: string }

export interface RulesScreenProps {
  source: TextRules
  ruleId?: string
  glossary?: boolean
  onBack: () => void
  onOpenRule: (id: string) => void
  onOpenGlossary: () => void
}

function rowsFor(
  rules: ComprehensiveRules,
  { ruleId, glossary, query }: { ruleId?: string; glossary?: boolean; query: string },
): Row[] {
  if (glossary) return rules.glossary.map((entry) => ({ kind: "term", key: entry.term, entry }))
  if (ruleId) {
    const found = findRules(rules, ruleId)
    if (!found) return []
    const rows: Row[] = found.rules.map((rule) => ({
      kind: "rule",
      key: rule.id,
      rule,
      target: rule.id === ruleId,
    }))
    return found.rules.length < found.section.rules.length
      ? [...rows, { kind: "all", key: "all", id: found.section.id, title: found.section.title }]
      : rows
  }
  if (query.trim())
    return searchRules(rules, query).map((result) =>
      result.kind === "term"
        ? { kind: "term", key: `term-${result.entry.term}`, entry: result.entry }
        : { kind: "rule", key: result.rule.id, rule: result.rule, target: false },
    )
  return [
    { kind: "glossary", key: "glossary" },
    ...rules.chapters.flatMap((chapter): Row[] => [
      { kind: "chapter", key: `chapter-${chapter.id}`, title: `${chapter.id}. ${chapter.title}` },
      ...chapter.sections.map((section): Row => ({
        kind: "section",
        key: section.id,
        id: section.id,
        title: section.title,
      })),
    ]),
  ]
}

export function RulesScreen({
  source,
  ruleId,
  glossary,
  onBack,
  onOpenRule,
  onOpenGlossary,
}: RulesScreenProps) {
  const { theme, themed } = useAppTheme()
  const { rules, failed, retry } = useComprehensiveRules(source)
  const [query, setQuery] = useState("")
  const rows = useMemo(
    () => (rules ? rowsFor(rules, { ruleId, glossary, query }) : []),
    [rules, ruleId, glossary, query],
  )
  const targetIndex = rows.findIndex((row) => row.kind === "rule" && row.target)
  const list = useRef<FlatList<Row>>(null)
  const scrolledToTarget = useRef(false)
  const section = rules && ruleId ? findRules(rules, ruleId)?.section : undefined
  const title = glossary
    ? translate("play:rules.glossary")
    : section
      ? `${section.id}. ${section.title}`
      : translate("play:rules.title")
  const contents = !ruleId && !glossary

  function renderRow({ item }: { item: Row }) {
    switch (item.kind) {
      case "chapter":
        return <Text size="xs" weight="medium" style={themed($chapter)} text={item.title} />
      case "section":
      case "all":
        return (
          <Pressable
            accessibilityRole="link"
            onPress={() => onOpenRule(item.id)}
            style={themed($sectionRow)}
            testID={`rules-section-${item.id}`}
          >
            {item.kind === "section" ? (
              <>
                <Text size="sm" style={[themed($dim), $number]} text={item.id} />
                <Text size="sm" style={$flex} text={item.title} />
              </>
            ) : (
              <Text
                size="sm"
                style={themed($link)}
                tx="play:rules.allOf"
                txOptions={{ section: `${item.id}. ${item.title}` }}
              />
            )}
          </Pressable>
        )
      case "glossary":
        return (
          <Pressable
            accessibilityRole="link"
            onPress={onOpenGlossary}
            style={themed($sectionRow)}
            testID="rules-glossary"
          >
            <Text size="sm" weight="medium" tx="play:rules.glossary" />
          </Pressable>
        )
      case "term":
        return (
          <View style={themed($entry)}>
            <Text size="sm" weight="medium" text={item.entry.term} />
            <RuleText
              reference={source.references}
              text={item.entry.text}
              onOpenRule={onOpenRule}
            />
          </View>
        )
      case "rule":
        return (
          <Pressable
            disabled={!contents}
            onPress={() => onOpenRule(item.rule.id)}
            style={themed($entry)}
            testID={`rule-${item.rule.id}`}
          >
            <Text
              size="sm"
              weight="medium"
              style={item.target ? themed($link) : undefined}
              text={item.rule.id}
            />
            <RuleText reference={source.references} text={item.rule.text} onOpenRule={onOpenRule} />
            {item.rule.examples.map((example) => (
              <RuleText
                reference={source.references}
                key={example}
                text={example}
                onOpenRule={onOpenRule}
                dim
              />
            ))}
          </Pressable>
        )
    }
  }

  const officialLink = (
    <Pressable accessibilityRole="link" onPress={() => Linking.openURL(source.pageUrl)}>
      <Text size="sm" style={themed($link)} tx="play:rules.official" />
    </Pressable>
  )

  return (
    <Screen
      preset="fixed"
      safeAreaEdges={["bottom"]}
      backgroundColor={theme.colors.background}
      contentContainerStyle={$flex}
    >
      <Header title={title} leftTx="common:back" onLeftPress={onBack} />
      {Platform.OS === "web" ? (
        <View style={themed($message)}>
          <Text size="sm" tx="play:rules.webOnly" txOptions={{ publisher: source.publisher }} />
          {officialLink}
        </View>
      ) : !rules ? (
        <View style={themed($message)}>
          {failed ? (
            <RetryableError
              message={translate("play:rules.failed")}
              onRetry={retry}
              testID="rules-failed"
            />
          ) : (
            <Text
              size="sm"
              style={themed($dim)}
              tx="play:rules.downloading"
              txOptions={{ publisher: source.publisher }}
            />
          )}
        </View>
      ) : (
        <FlatList
          ref={list}
          testID="rules-list"
          data={rows}
          initialNumToRender={Math.max(10, targetIndex + 1)}
          onContentSizeChange={() => {
            if (targetIndex <= 0 || scrolledToTarget.current) return
            scrolledToTarget.current = true
            list.current?.scrollToIndex({ index: targetIndex, animated: false })
          }}
          onScrollToIndexFailed={({ index }) =>
            setTimeout(() => list.current?.scrollToIndex({ index, animated: false }), 50)
          }
          keyExtractor={(row) => row.key}
          renderItem={renderRow}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={themed($list)}
          ListHeaderComponent={
            contents ? (
              <TextField
                testID="rules-search"
                accessibilityLabel={translate("play:rules.search")}
                placeholderTx="play:rules.search"
                value={query}
                onChangeText={setQuery}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
              />
            ) : null
          }
          ListEmptyComponent={
            <Text
              size="sm"
              style={themed($dim)}
              tx={ruleId ? "play:rules.notFound" : "play:rules.noResults"}
            />
          }
          ListFooterComponent={
            contents && !query.trim() ? (
              <View style={themed($footer)}>
                {rules.effectiveDate ? (
                  <Text
                    size="xs"
                    style={themed($dim)}
                    tx="play:rules.effective"
                    txOptions={{ date: rules.effectiveDate }}
                  />
                ) : null}
                {officialLink}
                {rules.notice.map((line) => (
                  <Text key={line} size="xxs" style={themed($dim)} text={line} />
                ))}
              </View>
            ) : null
          }
        />
      )}
    </Screen>
  )
}

function RuleText({
  text,
  reference,
  onOpenRule,
  dim,
}: {
  text: string
  reference: RegExp
  onOpenRule: (id: string) => void
  dim?: boolean
}) {
  const { themed } = useAppTheme()
  return (
    <Text size="sm" style={dim ? themed($dim) : undefined}>
      {ruleReferences(text, reference).map((part, index) =>
        typeof part === "string" ? (
          part
        ) : (
          <Text
            key={index}
            size="sm"
            style={themed($link)}
            onPress={() => onOpenRule(part.id)}
            text={part.id}
          />
        ),
      )}
    </Text>
  )
}

const $flex: ViewStyle = { flex: 1 }
const $number: TextStyle = { width: 40, fontVariant: ["tabular-nums"] }
const $list: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.md,
  paddingBottom: spacing.xl,
  gap: spacing.xs,
})
const $message: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  padding: spacing.md,
  gap: spacing.sm,
})
const $chapter: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.textDim,
  marginTop: spacing.md,
})
const $sectionRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "baseline",
  minHeight: 36,
  paddingVertical: spacing.xxs,
})
const $entry: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xxxs,
  paddingVertical: spacing.xs,
})
const $footer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginTop: spacing.lg,
  gap: spacing.xs,
})
const $dim: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $link: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.tint })
