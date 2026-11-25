import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from "react"
import { FlatList, Keyboard, Pressable, useWindowDimensions, View } from "react-native"
import type { TextStyle, ViewStyle } from "react-native"
import type { ImageStyle } from "expo-image"
import { useFocusEffect } from "expo-router"
import { GestureDetector } from "react-native-gesture-handler"
import { useKeyboardState } from "react-native-keyboard-controller"
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { CardFocusDialog } from "@/components/CardFocusDialog"
import { CardImage } from "@/components/CardImage"
import { Header, HeaderBack } from "@/components/Header"
import { Icon } from "@/components/Icon"
import { RetryableError } from "@/components/RetryableError"
import { Screen } from "@/components/Screen"
import { SegmentedControl } from "@/components/SegmentedControl"
import { $sizeStyles, Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { useSheetPresence } from "@/components/useSheetPresence"
import type { BackAction } from "@/features/game/useBackToBoard"
import {
  adjacentSections,
  excerptSegments,
  findRules,
  ruleContext,
  rulePreviewText,
  ruleReferences,
  searchRules,
  type ComprehensiveRules,
  type GlossaryEntry,
  type Rule,
  type RuleChapter,
  type RuleSection,
} from "@/features/rules/comprehensiveRules"
import { RULES_TEXT_IN_APP, type TextRules } from "@/features/rules/gameRules"
import { useLocalCardSearch } from "@/features/rules/localCards"
import { recentRules, rememberRule } from "@/features/rules/recentRules"
import { useComprehensiveRules } from "@/features/rules/rulesSource"
import { useRulesSearchAnalytics } from "@/features/rules/useRulesSearchAnalytics"
import { joinParts } from "@/i18n/format"
import { translate } from "@/i18n/translate"
import type { SheetDragGesture } from "@/screens/RulesSheet"
import { useAppTheme } from "@/theme/context"
import { textEnd } from "@/theme/direction"
import type { ThemedStyle } from "@/theme/types"
import { openUrl } from "@/utils/openUrl"
import { useReducedMotion } from "@/utils/useReducedMotion"

import type { LocalCard } from "../../convex/lib/localCards"
import { textSearchKey } from "../../convex/lib/magicDataset"

const TABS_COLLAPSE_MS = 180
const TABS_FALLBACK_HEIGHT = 44
const TABS_EASE = Easing.bezier(0.32, 0.72, 0, 1)

const TABS = ["recent", "contents", "glossary"] as const
type Tab = (typeof TABS)[number]
type Peek = { rule: string; reference: string }

type Row =
  | { kind: "chapter"; key: string; chapter: RuleChapter; open: boolean }
  | { kind: "section"; key: string; section: RuleSection }
  | { kind: "recent"; key: string; id: string; title: string }
  | { kind: "term"; key: string; entry: GlossaryEntry }
  | { kind: "card"; key: string; card: LocalCard }
  | { kind: "result"; key: string; rule: Rule; matched?: ReadonlySet<string>; partial?: string }
  | { kind: "rule"; key: string; rule: Rule; target: boolean }
  | { kind: "all"; key: string; section: RuleSection }
  | { kind: "nav"; key: string; previous?: RuleSection; next?: RuleSection }

export interface RulesScreenProps {
  source: TextRules
  system: string
  ruleId?: string
  glossary?: boolean
  initialQuery?: string
  active?: boolean
  sheet?: boolean
  sheetOpened?: boolean
  back?: BackAction
  dragGesture?: SheetDragGesture
  onOverscrollDismiss?: () => void
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
    cards,
  }: {
    tab: Tab
    query: string
    open: ReadonlySet<string>
    recent: string[]
    cards: readonly LocalCard[]
  },
): Row[] {
  if (query.trim()) {
    const found = searchRules(rules, query).map((result): Row =>
      result.kind === "term"
        ? { kind: "term", key: `term-${result.entry.term}`, entry: result.entry }
        : { ...result, kind: "result", key: result.rule.id },
    )
    const first = found[0]
    // why: "mill" means the keyword action, not Millstone, so an exact glossary term stays above the cards.
    const after =
      first?.kind === "term" && first.entry.term.toLowerCase() === query.trim().toLowerCase()
        ? 1
        : 0
    const asked = textSearchKey(query).split(" ")
    const isNamed = (card: LocalCard) => {
      const words = new Set(textSearchKey(card.name).split(" "))
      return asked.every((word) => words.has(word))
    }
    const cardRows = (named: boolean) =>
      cards
        .filter((card) => named === isNamed(card))
        .map((card): Row => ({ kind: "card", key: `card-${card.cardId}`, card }))
    return [...found.slice(0, after), ...cardRows(true), ...found.slice(after), ...cardRows(false)]
  }
  if (tab === "glossary")
    return rules.glossary.map((entry) => ({ kind: "term", key: entry.term, entry }))
  if (tab === "recent")
    return recent.flatMap((id): Row[] => {
      const context = ruleContext(rules, id)
      return context
        ? [{ kind: "recent", key: id, id, title: context.topic ?? context.section.title }]
        : []
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
  initialQuery,
  active = true,
  sheet = false,
  sheetOpened = false,
  back,
  dragGesture,
  onOverscrollDismiss,
  onOpenRule,
  onCards,
}: RulesScreenProps) {
  const { theme, themed } = useAppTheme()
  const insets = useSafeAreaInsets()
  const reducedMotion = useReducedMotion()
  const keyboard = useKeyboardState((state) => (state.isVisible ? state.height : 0))
  const { rules, failed, retry } = useComprehensiveRules(source)
  const [query, setQuery] = useState(initialQuery ?? "")
  const [autoFocusSearch, setAutoFocusSearch] = useState(
    () => !ruleId && !glossary && !initialQuery,
  )
  const [recent, setRecent] = useState(() => recentRules(source.cacheKey))
  const [tab, setTab] = useState<Tab>(() =>
    glossary ? "glossary" : recent.length > 0 ? "recent" : "contents",
  )
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const [peek, setPeek] = useState<Peek>()
  const [card, setCard] = useState<LocalCard>()
  const cardSheet = useSheetPresence(card)
  const shownCard = cardSheet.shown
  const pendingRule = useRef<string | undefined>(undefined)
  const cards = useLocalCardSearch(system, ruleId ? "" : query)
  useFocusEffect(useCallback(() => setRecent(recentRules(source.cacheKey)), [source.cacheKey]))
  const rows = useMemo(
    () =>
      !rules
        ? []
        : ruleId
          ? readerRows(rules, ruleId)
          : homeRows(rules, { tab, query, open, recent, cards }),
    [rules, ruleId, tab, query, open, recent, cards],
  )
  const targetIndex = rows.findIndex((row) => row.kind === "rule" && row.target)
  const list = useRef<FlatList<Row>>(null)
  const searchField = useRef<ComponentRef<typeof TextField>>(null)
  const loaded = Boolean(rules)
  // why: iOS blocks the UI thread over 100 ms to bring up the keyboard, so a sheet focuses search once it stops moving instead of hitching its slide.
  useEffect(() => {
    if (!sheet || !autoFocusSearch || (active && !(sheetOpened && loaded))) return
    if (active) searchField.current?.focus()
    setAutoFocusSearch(false)
  }, [sheet, sheetOpened, loaded, autoFocusSearch, active])
  const scrolledForRule = useRef<string | undefined>(undefined)
  const section = rules && ruleId ? findRules(rules, ruleId)?.section : undefined
  useEffect(() => {
    if (active && !ruleId) setRecent(recentRules(source.cacheKey))
  }, [active, ruleId, source.cacheKey])
  useEffect(() => {
    setPeek(undefined)
    scrolledForRule.current = undefined
    if (ruleId) {
      setAutoFocusSearch(false)
    } else {
      setRecent(recentRules(source.cacheKey))
    }
  }, [ruleId, source.cacheKey])
  useEffect(() => {
    if (section && ruleId) rememberRule(source.cacheKey, ruleId)
  }, [section, ruleId, source.cacheKey])
  const title = section ? `${section.id}. ${section.title}` : translate("play:rules.title")
  const home = !ruleId
  const searching = home && Boolean(query.trim())
  const { fontScale } = useWindowDimensions()
  const resultText = Math.ceil(
    ($sizeStyles.sm.lineHeight + theme.spacing.xxxs + 2 * $sizeStyles.xs.lineHeight) * fontScale,
  )
  const resultRow: ViewStyle | undefined = searching
    ? { height: resultText + 2 * theme.spacing.sm + 1, overflow: "hidden" }
    : undefined
  const searchResults = rows.flatMap((row) =>
    row.kind === "result"
      ? [row.rule.id]
      : row.kind === "term"
        ? ["glossary"]
        : row.kind === "card"
          ? ["card"]
          : [],
  )
  const searchOpened = useRulesSearchAnalytics(
    system,
    searching && rules ? { query, results: searchResults } : undefined,
  )
  const openResult = (id: string, index: number) => {
    if (searching) searchOpened(index + 1, id)
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
            <Text size="sm" weight="medium" numberOfLines={1} text={item.entry.term} />
            <RuleText
              reference={source.references}
              text={item.entry.text}
              onPressReference={(id) => openResult(id, index)}
              lines={searching ? 2 : undefined}
              size={searching ? "xs" : "sm"}
              dim
            />
          </>
        )
        return firstCitedRule ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => openResult(firstCitedRule.id, index)}
            style={({ pressed }) => [themed($entry), resultRow, pressed && $pressed]}
            testID={`rules-term-${item.entry.term}`}
          >
            {body}
          </Pressable>
        ) : (
          <View style={[themed($entry), resultRow]}>{body}</View>
        )
      }
      case "card":
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={joinParts([item.card.name, item.card.typeLine])}
            onPress={() => {
              searchOpened(index + 1, "card")
              Keyboard.dismiss()
              setCard(item.card)
            }}
            style={({ pressed }) => [themed($cardRow), resultRow, pressed && $pressed]}
            testID={`rules-card-${item.card.cardId}`}
          >
            <CardImage
              game={system}
              cardId={item.card.cardId}
              source={item.card.smallImageUrl ?? item.card.imageUrl}
              compact
              style={[themed($thumbnail), { width: (resultText * 488) / 680 }]}
              accessibilityLabel={item.card.name}
            />
            <View style={$flex}>
              <Text size="sm" weight="medium" numberOfLines={1} text={item.card.name} />
              {item.card.typeLine ? (
                <Text size="xs" tone="dim" numberOfLines={1} text={item.card.typeLine} />
              ) : null}
              {item.card.oracleText ? (
                <Text size="xs" tone="dim" numberOfLines={1} text={item.card.oracleText} />
              ) : null}
            </View>
          </Pressable>
        )
      case "result": {
        // why: a search lists up to 50 results, so each excerpt is built only when its row renders.
        const context = rules && ruleContext(rules, item.rule.id)
        const title = context?.section.title
        const topic = context?.topic
        const showSection = title && title.toLowerCase() !== topic?.toLowerCase()
        const segments = excerptSegments(
          rulePreviewText(context?.group ?? [item.rule], item.rule),
          item.matched,
          item.partial,
        )
        return (
          <Pressable
            accessibilityRole="link"
            onPress={() => openResult(item.rule.id, index)}
            style={({ pressed }) => [themed($entry), resultRow, pressed && $pressed]}
            testID={`rule-${item.rule.id}`}
          >
            <View style={themed($resultHeader)}>
              <Text size="sm" style={themed($link)} text={item.rule.id} />
              {topic ? <Text size="xs" weight="medium" numberOfLines={1} text={topic} /> : null}
              {showSection ? (
                <Text size="xs" tone="dim" numberOfLines={1} style={$flex} text={title} />
              ) : null}
            </View>
            <Text size="xs" tone="dim" numberOfLines={2}>
              {segments.map((segment, segmentIndex) =>
                segment.matched ? (
                  <Text key={segmentIndex} size="xs" weight="medium" text={segment.text} />
                ) : (
                  segment.text
                ),
              )}
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

  const tabsOpen = useSharedValue(searching ? 0 : 1)
  const tabsHeight = useSharedValue(TABS_FALLBACK_HEIGHT)
  useEffect(() => {
    const target = searching ? 0 : 1
    if (reducedMotion) {
      tabsOpen.set(target)
      return
    }
    tabsOpen.set(withTiming(target, { duration: TABS_COLLAPSE_MS, easing: TABS_EASE }))
  }, [reducedMotion, searching, tabsOpen])
  const tabsGap = theme.spacing.sm
  const tabsAnimatedStyle = useAnimatedStyle(() => ({
    opacity: tabsOpen.value,
    maxHeight: interpolate(tabsOpen.value, [0, 1], [0, tabsHeight.value + tabsGap]),
    paddingTop: interpolate(tabsOpen.value, [0, 1], [0, tabsGap]),
  }))

  const topBar = home ? (
    <View style={themed($searchBar)}>
      <TextField
        ref={searchField}
        testID="rules-search"
        accessibilityLabel={translate("play:rules.search")}
        placeholderTx="play:rules.search"
        value={query}
        onChangeText={setQuery}
        autoFocus={autoFocusSearch && !sheet}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        clearable
      />
      <Animated.View
        pointerEvents={searching ? "none" : "auto"}
        style={[$tabsClip, tabsAnimatedStyle]}
      >
        <View
          onLayout={(event) => {
            const measured = event.nativeEvent.layout.height
            if (measured > 0) tabsHeight.set(measured)
          }}
        >
          <SegmentedControl
            testID="rules-tabs"
            segments={TABS.map((id) => ({ id, label: translate(`play:rules.${id}`) }))}
            selectedId={tab}
            onSelect={(id) => setTab(TABS.find((candidate) => candidate === id) ?? tab)}
          />
        </View>
      </Animated.View>
    </View>
  ) : (
    <Header
      title={title}
      safeAreaEdges={sheet ? [] : ["top"]}
      LeftActionComponent={back ? <HeaderBack testID="rules-back" {...back} /> : undefined}
      rightTx={onCards ? "play:rules.cards" : undefined}
      onRightPress={onCards}
    />
  )

  const topChrome = dragGesture ? (
    <GestureDetector gesture={dragGesture}>
      <View>{topBar}</View>
    </GestureDetector>
  ) : (
    topBar
  )

  const messageBody = !RULES_TEXT_IN_APP ? (
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
  ) : null

  const listNode = rules ? (
    <FlatList
      key={ruleId ?? "home"}
      ref={list}
      testID="rules-list"
      style={$flex}
      data={rows}
      extraData={peek}
      initialNumToRender={Math.max(10, targetIndex + 1)}
      // why: the default window spans all 50 results, so every keystroke re-rendered every one.
      windowSize={searching ? 3 : undefined}
      onContentSizeChange={() => {
        if (!ruleId || targetIndex <= 0 || scrolledForRule.current === ruleId) return
        scrolledForRule.current = ruleId
        list.current?.scrollToIndex({ index: targetIndex, animated: false })
      }}
      onScrollToIndexFailed={({ index }) =>
        setTimeout(() => list.current?.scrollToIndex({ index, animated: false }), 50)
      }
      onScrollEndDrag={(event) => {
        if (sheet && onOverscrollDismiss && event.nativeEvent.contentOffset.y < -65) {
          onOverscrollDismiss()
        }
      }}
      keyExtractor={(row) => row.key}
      renderItem={renderRow}
      automaticallyAdjustContentInsets={false}
      contentInsetAdjustmentBehavior="never"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={[
        themed($list),
        sheet && { paddingBottom: Math.max(insets.bottom, keyboard) + theme.spacing.xl },
      ]}
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
  ) : null

  const cardDialog = shownCard ? (
    <CardFocusDialog
      card={{
        game: system,
        cardId: shownCard.cardId,
        name: shownCard.name,
        imageUrl: shownCard.imageUrl,
        smallImageUrl: shownCard.smallImageUrl,
        quantity: 0,
        boardLabel: "",
      }}
      details={shownCard}
      showQuantity={false}
      visible={cardSheet.visible}
      onClose={() => setCard(undefined)}
      onDismissed={() => {
        cardSheet.onDismissed()
        const rule = pendingRule.current
        pendingRule.current = undefined
        if (rule) onOpenRule(rule)
      }}
      onOpenRule={(id) => {
        pendingRule.current = id
        setCard(undefined)
      }}
    />
  ) : null

  if (sheet) {
    return (
      <View style={$flex}>
        {messageBody ?? (
          <>
            {topChrome}
            {listNode}
          </>
        )}
        {cardDialog}
      </View>
    )
  }

  return (
    <Screen
      preset="fixed"
      safeAreaEdges={["bottom"]}
      backgroundColor={theme.colors.background}
      contentContainerStyle={$flex}
    >
      {home || messageBody ? (
        <Header
          title={title}
          safeAreaEdges={["top"]}
          LeftActionComponent={back ? <HeaderBack testID="rules-back" {...back} /> : undefined}
          rightTx={onCards ? "play:rules.cards" : undefined}
          onRightPress={onCards}
        />
      ) : null}
      {messageBody ?? (
        <>
          {topBar}
          {listNode}
        </>
      )}
      {cardDialog}
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
              // eslint-disable-next-line no-restricted-syntax -- why: the rules and their numbering are published in English only, so this line is quoted as written.
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
              // eslint-disable-next-line no-restricted-syntax -- why: the rules and their numbering are published in English only, so this line is quoted as written.
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
  lines,
  size = "sm",
}: {
  text: string
  reference: RegExp
  onPressReference: (id: string) => void
  active?: string
  dim?: boolean
  lines?: number
  size?: "sm" | "xs"
}) {
  const { themed } = useAppTheme()
  return (
    <Text size={size} tone={dim ? "dim" : undefined} numberOfLines={lines}>
      {ruleReferences(text, reference).map((part, index) =>
        typeof part === "string" ? (
          part
        ) : (
          <Text
            key={index}
            size={size}
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
const $textEnd: TextStyle = { textAlign: textEnd }
const $number: TextStyle = { width: 40, fontVariant: ["tabular-nums"] }
const $recentId: TextStyle = { width: 72, fontVariant: ["tabular-nums"] }
const $gutter: TextStyle = { width: 60, paddingTop: 2, fontVariant: ["tabular-nums"] }
const $caretOpen = { transform: [{ rotate: "90deg" }] }
const $active: TextStyle = { textDecorationLine: "underline" }
const $pressed: ViewStyle = { opacity: 0.7 }
const $tabsClip: ViewStyle = { overflow: "hidden" }
const $list: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.md,
  paddingBottom: spacing.xl,
})
const $searchBar: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.md,
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
const $thumbnail: ThemedStyle<ImageStyle> = ({ colors }) => ({
  width: 32,
  aspectRatio: 488 / 680,
  backgroundColor: colors.separator,
})
const $cardRow: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  paddingVertical: spacing.sm,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
const $entry: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  gap: spacing.xxxs,
  paddingVertical: spacing.sm,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
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
