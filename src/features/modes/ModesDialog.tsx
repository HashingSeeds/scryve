import { useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { ScrollView, View } from "react-native"
import { Image } from "expo-image"

import { Button } from "@/components/Button"
import { $dialogActions, $dialogButton, DialogCard } from "@/components/DialogCard"
import { PlanarDieButton } from "@/components/modes/ModeSeam"
import { Text } from "@/components/Text"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { modeCardImage } from "./modeCards"
import type { BoardModes, ModeLogRow } from "./useBoardModes"
import type { ModeCard } from "../../../convex/lib/modeDecks"

const CARD_RATIO = 680 / 488
const LOG_ROWS = 6

/** why: Scryfall stores planes upright with sideways text, so the image turns a quarter to read. */
function PlaneImage({ card }: { card: ModeCard }) {
  const [width, setWidth] = useState(0)
  const height = width / CARD_RATIO
  return (
    <View
      testID="plane-image"
      accessibilityLabel={card.name}
      onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}
      style={[$landscape, { height: height || undefined }]}
    >
      {width > 0 ? (
        <Image
          source={modeCardImage(card, "large")}
          contentFit="cover"
          style={[
            $quarterTurn,
            {
              width: height,
              height: width,
              left: (width - height) / 2,
              top: (height - width) / 2,
            },
          ]}
        />
      ) : null}
    </View>
  )
}

function SchemeImage({ card, small }: { card: ModeCard; small?: boolean }) {
  return (
    <Image
      accessibilityLabel={card.name}
      source={modeCardImage(card, "large")}
      contentFit="contain"
      style={small ? $schemeSmall : $scheme}
    />
  )
}

function ModeLog({ rows }: { rows: readonly ModeLogRow[] }) {
  const { themed } = useAppTheme()
  if (rows.length === 0) return null
  return (
    <View testID="mode-log" style={themed($log)}>
      {rows.slice(0, LOG_ROWS).map((row) => (
        <Text key={row.key} size="xs" text={row.text} style={themed($logRow)} />
      ))}
    </View>
  )
}

export function ModesDialog({ modes }: { modes: BoardModes }) {
  const { themed } = useAppTheme()
  const { dialog, planar, scheme, openDialog } = modes
  if (!dialog) return null
  const close = () => openDialog(undefined)
  const planarRows = modes.log.filter(({ entry }) =>
    ["rolled", "walked", "reset"].includes(entry.kind),
  )
  const schemeRows = modes.log.filter(({ entry }) => ["revealed", "abandoned"].includes(entry.kind))
  return (
    <DialogCard
      visible
      onClose={close}
      backdropTestID="modes-dialog-backdrop"
      backdropAccessibilityLabel={translate("common:close")}
      dialogTestID={`${dialog}-dialog`}
      accessibilityViewIsModal
      wide
    >
      <ScrollView style={$scroll} contentContainerStyle={themed($content)}>
        {dialog === "planar" && planar ? (
          <>
            <Text
              preset="subheading"
              text={planar.card ? planar.card.name : translate("board:planar.ownCards")}
            />
            {planar.card ? <PlaneImage card={planar.card} /> : null}
            <View style={themed($row)}>
              <PlanarDieButton planar={planar} testID="planar-dialog-die" />
              <View style={$grow}>
                <Text
                  size="sm"
                  weight="bold"
                  text={translate("board:planar.nextCost", {
                    cost: planar.cost || translate("board:planar.free"),
                  })}
                />
                {!planar.roller ? (
                  <Text size="xs" style={themed($muted)} tx="board:planar.activeOnly" />
                ) : null}
              </View>
              {planar.manualReset ? (
                <Button
                  testID="planar-reset"
                  tx="board:planar.reset"
                  style={themed($small)}
                  onPress={planar.reset}
                />
              ) : null}
            </View>
            <Button
              testID="planar-walk"
              tx={planar.phenomenon ? "board:planar.resolve" : "board:planar.planeswalk"}
              preset={planar.phenomenon ? "primary" : "secondary"}
              onPress={planar.walk}
            />
            <ModeLog rows={planarRows} />
          </>
        ) : null}
        {dialog === "scheme" && scheme ? (
          <>
            <Text preset="subheading" tx="board:scheme.title" />
            <Button
              testID="scheme-reveal"
              tx="board:scheme.setInMotion"
              preset={scheme.due ? "primary" : "secondary"}
              disabled={!scheme.mine}
              onPress={scheme.reveal}
            />
            {!scheme.mine ? (
              <Text size="xs" style={themed($muted)} tx="board:scheme.archenemyOnly" />
            ) : null}
            {scheme.shown ? (
              <View style={themed($section)}>
                <Text size="xs" weight="medium" tx="board:scheme.last" />
                <SchemeImage card={scheme.shown} />
              </View>
            ) : null}
            {scheme.ongoing.length > 0 ? (
              <View style={themed($section)}>
                <Text size="xs" weight="medium" tx="board:scheme.ongoing" />
                <View style={themed($ongoing)}>
                  {scheme.ongoing.map(({ index, card }) => (
                    <View key={index} style={themed($ongoingCard)}>
                      <SchemeImage card={card} small />
                      {scheme.mine ? (
                        <Button
                          testID={`scheme-abandon-${index}`}
                          tx="board:scheme.abandon"
                          style={themed($small)}
                          onPress={() => scheme.abandon(index)}
                        />
                      ) : null}
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
            <ModeLog rows={schemeRows} />
          </>
        ) : null}
      </ScrollView>
      <View style={themed($dialogActions)}>
        <Button tx="common:done" style={themed($dialogButton)} onPress={close} />
      </View>
    </DialogCard>
  )
}

const $scroll: ViewStyle = { flexGrow: 0, flexShrink: 1 }
const $content: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.md })
const $quarterTurn = {
  position: "absolute" as const,
  borderRadius: 12,
  transform: [{ rotate: "90deg" }],
}
const $landscape: ViewStyle = { width: "100%", overflow: "hidden", borderRadius: 12 }
const $row: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
})
const $grow: ViewStyle = { flex: 1 }
const $muted: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $small: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 36,
  paddingHorizontal: spacing.sm,
})
const $section: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $ongoing: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.sm,
})
const $ongoingCard: ThemedStyle<ViewStyle> = ({ spacing }) => ({ width: 120, gap: spacing.xs })
const $scheme = { width: "100%" as const, aspectRatio: 488 / 680, borderRadius: 12 }
const $schemeSmall = { width: 120, height: 120 / (488 / 680), borderRadius: 8 }
const $log: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xxs })
const $logRow: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
