import { View, type TextStyle, type ViewStyle } from "react-native"

import { Text } from "@/components/Text"
import { translate } from "@/i18n/translate"

import type { CardPhotoText } from "../../../modules/card-text-reader"

export function CardScanStats({ photo }: { photo: CardPhotoText }) {
  const outline = photo.cardCorners ? "found" : "none"
  const rectangles = photo.detection?.rectangles ?? []
  const thermal = photo.detection?.thermal
  return (
    <View pointerEvents="none" testID="card-scan-stats" style={$stats}>
      <Text
        size="xxs"
        style={$line}
        text={translate("decks:cardScan.stats.outline", {
          state: translate(`decks:cardScan.stats.${outline}`),
        })}
      />
      {thermal ? (
        <Text
          size="xxs"
          style={$line}
          text={translate("decks:cardScan.stats.heat", {
            state: translate(`decks:cardScan.stats.${thermal}`),
          })}
        />
      ) : null}
      {rectangles.length ? (
        rectangles.map((rectangle, index) => (
          <Text
            key={index}
            size="xxs"
            style={$line}
            text={translate("decks:cardScan.stats.rectangle", {
              aspect: rectangle.aspect.toFixed(2),
              share: Math.round(rectangle.share * 100),
              verdict: translate(`decks:cardScan.stats.${rectangle.rejected ?? "accepted"}`),
            })}
          />
        ))
      ) : (
        <Text size="xxs" style={$line} tx="decks:cardScan.stats.noRectangles" />
      )}
    </View>
  )
}

const $stats: ViewStyle = {
  position: "absolute",
  top: 4,
  left: 4,
  padding: 4,
  borderRadius: 4,
  backgroundColor: "rgba(0, 0, 0, 0.7)",
}

const $line: TextStyle = { color: "#FFFFFF", fontVariant: ["tabular-nums"] }
