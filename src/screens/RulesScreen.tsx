import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { FlatList, Pressable, View } from "react-native"
import type { TextStyle, ViewStyle } from "react-native"
import { useFocusEffect } from "expo-router"

import { Header, HeaderBack } from "@/components/Header"
import { Icon } from "@/components/Icon"
import { RetryableError } from "@/components/RetryableError"
import { Screen } from "@/components/Screen"
import { SegmentedControl } from "@/components/SegmentedControl"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import type { BackAction } from "@/features/game/useBackToBoard"
import {
  adjacentSections,
  findRules,
  matchExcerpt,
  ruleReferences,
  searchRules,
  type ComprehensiveRules,
  type GlossaryEntry,
  type Rule,
  type RuleChapter,
  type RuleSection,
} from "@/features/rules/comprehensiveRules"
import { RULES_TEXT_IN_APP, type TextRules } from "@/features/rules/gameRules"
import { recentRules, rememberRule } from "@/features/rules/recentRules"
import { useComprehensiveRules } from "@/features/rules/rulesSource"
import { useRulesSearchAnalytics } from "@/features/rules/useRulesSearchAnalytics"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { openUrl } from "@/utils/openUrl"

const TABS = ["recent", "contents", "glossary"] as const
type Tab = (typeof TABS)[number]
type Peek = { rule: string; reference: string }

type Row =
  | { kind: "chapter"; key: string; chapter: RuleChapter; open: boolean }
  | { kind: "section"; key: string; section: RuleSection }
  | { kind: "recent"; key: string; id: string; title: string }
  | { kind: "term"; key: string; entry: GlossaryEntry }
  | { kind: "result"; key: string; rule: Rule; title: string }
  | { kind: "rule"; key: string; rule: Rule; target: boolean }
  | { kind: "all"; key: string; section: RuleSection }
  | { kind: "nav"; key: string; previous?: RuleSection; next?: RuleSection }

export interface RulesScreenProps {
  source: TextRules
  system: string
  ruleId?: string
  glossary?: boolean
  back: BackAction
  onOpenRule: (id: string) => void
  onCards?: () => void
}

function readerRows(rules: ComprehensiveRules, ruleId: string): Row[] {
  const found = findRules(rules, ruleId)
  if (!found) return []
  const { previous, next } = adjacentSections(rules, found.section.id)
  return [
    ...found.rules.map((rule): Row => ({
      kind: "rule",
      key: rule.id,
      rule,
      target: rule.id === ruleId,
    })),
    ...(found.rules.length < found.section.rules.length
      ? [{ kind: "all", key: "all", section: found.section } as const]
      : []),
    { kind: "nav", key: "nav", previous, next },
  ]
}

function homeRows(
  rules: ComprehensiveRules,
  {
    tab,
    query,
    open,
    recent,
  }: { tab: Tab; query: string; open: ReadonlySet<string>; recent: string[] },
): Row[] {
  if (query.trim())
    return searchRules(rules, query).map((result) =>
      result.kind === "term"
        ? { kind: "term", key: `term-${result.entry.term}`, entry: result.entry }
        : {
            kind: "result",
            key: result.rule.id,
            rule: result.rule,
            title: findRules(rules, result.rule.id)?.section.title ?? "",
          },
    )
  if (tab === "glossary")
    return rules.glossary.map((entry) => ({ kind: "term", key: entry.term, entry }))
  if (tab === "recent")
    return recent.flatMap((id): Row[] => {
      const section = findRules(rules, id)?.section
      return section ? [{ kind: "recent", key: id, id, title: section.title }] : []
    })
  return rules.chapters.flatMap((chapter): Row[] => [
    { kind: "chapter", key: `chapter-${chapter.id}`, chapter, open: open.has(chapter.id) },
    ...(open.has(chapter.id)
      ? chapter.sections.map((section): Row => ({ kind: "section", key: section.id, section }))
      : []),
  ])
}

export function RulesScreen({
  source,
  system,
  ruleId,
  glossary,
  back,
  onOpenRule,
  onCards,
}: RulesScreenProps) {
  const { theme, themed } = useAppTheme()
  const { rules, failed, retry } = useComprehensiveRules(source)
  const [query, setQuery] = useState("")
  const [recent, setRecent] = useState(() => recentRules(source.cacheKey))
  const [tab, setTab] = useState<Tab>(() =>
    glossary ? "glossary" : recent.length > 0 ? "recent" : "contents",
  )
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const [peek, setPeek] = useState<Peek>()
  useFocusEffect(useCallback(() => setRecent(recentRules(source.cacheKey)), [source.cacheKey]))
  const rows = useMemo(
    () =>
      !rules
        ? []
        : ruleId
          ? readerRows(rules, ruleId)
          : homeRows(rules, { tab, query, open, recent }),
    [rules, ruleId, tab, query, open, recent],
  )
  const targetIndex = rows.findIndex((row) => row.kind === "rule" && row.target)
  const list = useRef<FlatList<Row>>(null)
  const scrolledToTarget = useRef(false)
  const section = rules && ruleId ? findRules(rules, ruleId)?.section : undefined
  useEffect(() => {
    if (section && ruleId) rememberRule(source.cacheKey, ruleId)
  }, [section, ruleId, source.cacheKey])
  const title = section ? `${section.id}. ${section.title}` : translate("play:rules.title")
  const home = !ruleId
  const searching = home && Boolean(query.trim())
  const searchResults = rows.flatMap((row) =>
    row.kind === "result" ? [row.rule.id] : row.kind === "term" ? ["glossary"] : [],
  )
  const searchOpened = useRulesSearchAnalytics(
    system,
    searching && rules ? { query, results: searchResults } : undefined,
  )
  const openResult = (id: string, index: number) => {
    if (searching) searchOpened(index + 1)
    onOpenRule(id)
  }

  const toggleChapter = (id: string) =>
    setOpen((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })
  const togglePeek = (rule: string, reference: string) =>
    setPeek((current) =>
      current?.rule === rule && current.reference === reference ? undefined : { rule, reference },
    )

  function renderRow({ item, index }: { item: Row; index: number }) {
    switch (item.kind) {
      case "chapter":
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: item.open }}
            onPress={() => toggleChapter(item.chapter.id)}
            style={themed($chapterRow)}
            testID={`rules-chapter-${item.chapter.id}`}
          >
            <Text size="sm" weight="medium" style={$number} text={item.chapter.id} />
            <Text size="sm" weight="medium" style={$flex} text={item.chapter.title} />
            <Icon
              icon="caretRight"
              size={16}
              color={theme.colors.textDim}
              style={item.open ? $caretOpen : undefined}
            />
          </Pressable>
        )
      case "section":
        return (
          <Pressable
            accessibilityRole="link"
            onPress={() => onOpenRule(item.section.id)}
            style={themed($sectionRow)}
            testID={`rules-section-${item.section.id}`}
          >
            <Text size="sm" tone="dim" style={$number} text={item.section.id} />
            <Text size="sm" style={$flex} text={item.section.title} />
          </Pressable>
        )
      case "recent":
        return (
          <Pressable
            accessibilityRole="link"
            onPress={() => onOpenRule(item.id)}
            style={themed($recentRow)}
            testID={`rules-recent-${item.id}`}
          >
            <Text size="sm" style={[$recentId, themed($link)]} text={item.id} />
            <Text size="sm" numberOfLines={1} style={$flex} text={item.title} />
          </Pressable>
        )
      case "all":
        return (
          <Pressable
            accessibilityRole="link"
            onPress={() => onOpenRule(item.section.id)}
            style={themed($sectionRow)}
            testID={`rules-section-${item.section.id}`}
          >
            <Text
              size="sm"
              style={themed($link)}
              tx="play:rules.allOf"
              txOptions={{ section: `${item.section.id}. ${item.section.title}` }}
            />
          </Pressable>
        )
      case "term": {
        const firstCitedRule = ruleReferences(item.entry.text, source.references).find(
          (part) => typeof part !== "string",
        )
        const body = (
          <>
            <Text size="sm" weight="medium" text={item.entry.term} />
            <RuleText
              reference={source.references}
              text={item.entry.text}
              onPressReference={(id) => openResult(id, index)}
              dim
            />
          </>
        )
        return firstCitedRule ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => openResult(firstCitedRule.id, index)}
            style={({ pressed }) => [themed($entry), pressed && $pressed]}
            testID={`rules-term-${item.entry.term}`}
          >
            {body}
          </Pressable>
        ) : (
          <View style={themed($entry)}>{body}</View>
        )
      }
      case "result": {
        const { before, match, after } = matchExcerpt(item.rule.text, query)
        return (
          <Pressable
            accessibilityRole="link"
            onPress={() => openResult(item.rule.id, index)}
            style={({ pressed }) => [themed($entry), pressed && $pressed]}
            testID={`rule-${item.rule.id}`}
          >
            <View style={themed($resultHeader)}>
              <Text size="sm" style={themed($link)} text={item.rule.id} />
              <Text size="xs" tone="dim" numberOfLines={1} style={$flex} text={item.title} />
            </View>
            <Text size="xs" tone="dim" numberOfLines={3}>
              {before}
              {match ? <Text size="xs" weight="medium" text={match} /> : null}
              {after}
            </Text>
          </Pressable>
        )
      }
      case "rule": {
        const peeking = peek?.rule === item.rule.id ? peek.reference : undefined
        return (
          <View style={themed($rule)} testID={`rule-${item.rule.id}`}>
            <Text
              size="xs"
              weight={/\d$/.test(item.rule.id) ? "medium" : undefined}
              tone={item.target ? undefined : "dim"}
              style={[$gutter, item.target && themed($link)]}
              text={item.rule.id}
            />
            <View style={themed($ruleBody)}>
              <RuleText
                reference={source.references}
                text={item.rule.text}
                active={peeking}
                onPressReference={(reference) => togglePeek(item.rule.id, reference)}
              />
              {item.rule.examples.map((example) => (
                <View key={example} style={themed($example)}>
                  <RuleText
                    reference={source.references}
                    text={example}
                    active={peeking}
                    onPressReference={(reference) => togglePeek(item.rule.id, reference)}
                    dim
                  />
                </View>
              ))}
              {rules && peeking ? (
                <RulePeek rules={rules} id={peeking} onOpen={onOpenRule} />
              ) : null}
            </View>
          </View>
        )
      }
      case "nav":
        return (
          <View style={themed($nav)}>
            {item.previous ? (
              <SectionLink section={item.previous} onOpen={onOpenRule} direction="previous" />
            ) : (
              <View style={$flex} />
            )}
            {item.next ? (
              <SectionLink section={item.next} onOpen={onOpenRule} direction="next" />
            ) : null}
          </View>
        )
    }
  }

  const officialLink = (
    <Pressable accessibilityRole="link" onPress={() => void openUrl(source.pageUrl)}>
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
      <Header
        title={title}
        LeftActionComponent={<HeaderBack testID="rules-back" {...back} />}
        rightTx={onCards ? "play:rules.cards" : undefined}
        onRightPress={onCards}
      />
      {!RULES_TEXT_IN_APP ? (
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
              tone="dim"
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
          extraData={peek}
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
            home ? (
              <View style={themed($listHeader)}>
                <TextField
                  testID="rules-search"
                  accessibilityLabel={translate("play:rules.search")}
                  placeholderTx="play:rules.search"
                  value={query}
                  onChangeText={setQuery}
                  autoCorrect={false}
                  autoCapitalize="none"
                  returnKeyType="search"
                  clearable
                />
                {searching ? null : (
                  <SegmentedControl
                    testID="rules-tabs"
                    segments={TABS.map((id) => ({ id, label: translate(`play:rules.${id}`) }))}
                    selectedId={tab}
                    onSelect={(id) => setTab(TABS.find((candidate) => candidate === id) ?? tab)}
                  />
                )}
              </View>
            ) : null
          }
          ListEmptyComponent={
            <Text
              size="sm"
              tone="dim"
              tx={
                ruleId
                  ? "play:rules.notFound"
                  : searching
                    ? "play:rules.noResults"
                    : "play:rules.noRecent"
              }
            />
          }
          ListFooterComponent={
            home && !searching && tab === "contents" ? (
              <View style={themed($footer)}>
                {rules.effectiveDate ? (
                  <Text
                    size="xs"
                    tone="dim"
                    tx="play:rules.effective"
                    txOptions={{ date: rules.effectiveDate }}
                  />
                ) : null}
                {officialLink}
                {rules.notice.map((line) => (
                  <Text key={line} size="xxs" tone="dim" text={line} />
                ))}
              </View>
            ) : null
          }
        />
      )}
    </Screen>
  )
}

function SectionLink({
  section,
  onOpen,
  direction,
}: {
  section: RuleSection
  onOpen: (id: string) => void
  direction: "previous" | "next"
}) {
  const { themed } = useAppTheme()
  const label = `${section.id}. ${section.title}`
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => onOpen(section.id)}
      style={[$flex, direction === "next" && $alignEnd]}
      testID={`rules-${direction}`}
    >
      <Text
        size="xs"
        style={[themed($link), direction === "next" && $textEnd]}
        text={direction === "previous" ? `‹ ${label}` : `${label} ›`}
      />
    </Pressable>
  )
}

function RulePeek({
  rules,
  id,
  onOpen,
}: {
  rules: ComprehensiveRules
  id: string
  onOpen: (id: string) => void
}) {
  const { themed } = useAppTheme()
  const found = findRules(rules, id)
  const start = Math.max(0, found?.rules.findIndex((rule) => rule.id === id) ?? 0)
  return (
    <View style={themed($peek)} testID={`rule-peek-${id}`}>
      {found ? (
        <>
          <View style={themed($peekHeader)}>
            <Text
              size="xs"
              weight="medium"
              style={$flex}
              text={`${found.section.id}. ${found.section.title}`}
            />
            <Pressable accessibilityRole="link" hitSlop={8} onPress={() => onOpen(id)}>
              <Text size="xs" style={themed($link)} tx="play:rules.open" />
            </Pressable>
          </View>
          {found.rules.slice(start, start + 3).map((rule) => (
            <Text
              key={rule.id}
              size="xs"
              tone="dim"
              numberOfLines={4}
              text={`${rule.id} ${rule.text}`}
            />
          ))}
        </>
      ) : (
        <Text size="xs" tone="dim" tx="play:rules.notFound" />
      )}
    </View>
  )
}

function RuleText({
  text,
  reference,
  onPressReference,
  active,
  dim,
}: {
  text: string
  reference: RegExp
  onPressReference: (id: string) => void
  active?: string
  dim?: boolean
}) {
  const { themed } = useAppTheme()
  return (
    <Text size="sm" tone={dim ? "dim" : undefined}>
      {ruleReferences(text, reference).map((part, index) =>
        typeof part === "string" ? (
          part
        ) : (
          <Text
            key={index}
            size="sm"
            accessibilityRole="link"
            style={[themed($link), part.id === active && $active]}
            onPress={() => onPressReference(part.id)}
            text={part.id}
          />
        ),
      )}
    </Text>
  )
}

const $flex: ViewStyle = { flex: 1 }
const $alignEnd: ViewStyle = { alignItems: "flex-end" }
const $textEnd: TextStyle = { textAlign: "right" }
const $number: TextStyle = { width: 40, fontVariant: ["tabular-nums"] }
const $recentId: TextStyle = { width: 72, fontVariant: ["tabular-nums"] }
const $gutter: TextStyle = { width: 60, paddingTop: 2, fontVariant: ["tabular-nums"] }
const $caretOpen = { transform: [{ rotate: "90deg" }] }
const $active: TextStyle = { textDecorationLine: "underline" }
const $pressed: ViewStyle = { opacity: 0.7 }
const $list: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.md,
  paddingBottom: spacing.xl,
})
const $listHeader: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
  paddingBottom: spacing.xs,
})
const $message: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  padding: spacing.md,
  gap: spacing.sm,
})
const $chapterRow: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  minHeight: 44,
  paddingVertical: spacing.xs,
  borderTopWidth: 1,
  borderTopColor: colors.separator,
})
const $sectionRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "baseline",
  minHeight: 36,
  paddingVertical: spacing.xxs,
  paddingStart: 40,
})
const $recentRow: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "baseline",
  minHeight: 44,
  paddingVertical: spacing.xs,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
const $entry: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xxxs,
  paddingVertical: spacing.xs,
})
const $resultHeader: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "baseline",
  gap: spacing.xs,
})
const $rule: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  paddingVertical: spacing.xs,
})
const $ruleBody: ThemedStyle<ViewStyle> = ({ spacing }) => ({ flex: 1, gap: spacing.xxs })
const $example: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  paddingStart: spacing.sm,
  borderStartWidth: 2,
  borderStartColor: colors.separator,
})
const $peek: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  gap: spacing.xxs,
  marginTop: spacing.xxs,
  paddingVertical: spacing.xs,
  paddingStart: spacing.sm,
  borderStartWidth: 2,
  borderStartColor: colors.tint,
})
const $peekHeader: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "baseline",
  gap: spacing.sm,
})
const $nav: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  gap: spacing.md,
  marginTop: spacing.lg,
  paddingTop: spacing.sm,
  borderTopWidth: 1,
  borderTopColor: colors.separator,
})
const $footer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginTop: spacing.lg,
  gap: spacing.xs,
})
const $link: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.tint })
