/* eslint-disable i18next/no-literal-string -- why: dev-only spike screen, never shipped to players. */
import { useState } from "react"
import { Modal, ScrollView, View, type TextStyle, type ViewStyle } from "react-native"
import { Image } from "expo-image"
import * as ImagePicker from "expo-image-picker"

import { Button } from "@/components/Button"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"

import type { CardNameIndex } from "./cardNameMatch"
import { namesInSpread } from "./cardSpread"
import { readPhoto, type CardPhotoText } from "../../../modules/card-text-reader"

// why: Vision skips text shorter than this share of the photo, and names in a spread are small.
const MIN_TEXT_HEIGHTS = [undefined, 1 / 64, 1 / 128, 0] as const

type Read = { uri: string; photo: CardPhotoText; ms: number }

export function CardSpreadDebug({
  nameIndex,
  onClose,
}: {
  nameIndex: CardNameIndex | undefined
  onClose: () => void
}) {
  const { theme } = useAppTheme()
  const [read, setRead] = useState<Read>()
  const [status, setStatus] = useState("Take or choose a photo of a spread.")
  const [heightChoice, setHeightChoice] = useState(0)
  const [width, setWidth] = useState(0)

  async function readUri(uri: string, choice: number) {
    if (!readPhoto) return setStatus("This build can't read photos.")
    setStatus("Reading…")
    const startedAt = Date.now()
    try {
      const photo = await readPhoto(uri, MIN_TEXT_HEIGHTS[choice])
      setRead({ uri, photo, ms: Date.now() - startedAt })
      setStatus("")
    } catch (cause) {
      setStatus(String(cause))
    }
  }

  async function pick(source: "camera" | "library") {
    if (source === "camera" && !(await ImagePicker.requestCameraPermissionsAsync()).granted)
      return setStatus("Camera access denied.")
    const options = { mediaTypes: ["images"], quality: 1 } satisfies ImagePicker.ImagePickerOptions
    const picked =
      source === "camera"
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options)
    const asset = picked.assets?.[0]
    if (!picked.canceled && asset) await readUri(asset.uri, heightChoice)
  }

  function nextHeight() {
    const choice = (heightChoice + 1) % MIN_TEXT_HEIGHTS.length
    setHeightChoice(choice)
    if (read) void readUri(read.uri, choice)
  }

  const lines = read && nameIndex ? namesInSpread(nameIndex, read.photo) : []
  const counts = new Map<string, number>()
  for (const { match } of lines)
    if (match) counts.set(match.name, (counts.get(match.name) ?? 0) + 1)
  const matched = [...counts.values()].reduce((total, count) => total + count, 0)
  const scale = read ? width / read.photo.width : 0
  const minHeight = MIN_TEXT_HEIGHTS[heightChoice]

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <Screen
        preset="fixed"
        safeAreaEdges={["bottom"]}
        backgroundColor={theme.colors.background}
        contentContainerStyle={$fill}
      >
        <Header
          title="Spread scan (dev)"
          leftText="Close"
          onLeftPress={onClose}
          backgroundColor={theme.colors.background}
        />
        <View style={$row}>
          <Button text="Camera" onPress={() => void pick("camera")} />
          <Button text="Library" onPress={() => void pick("library")} />
          <Button
            text={`Min text ${minHeight === undefined ? "default" : minHeight ? `1/${1 / minHeight}` : "0"}`}
            onPress={nextHeight}
          />
        </View>
        <Text
          size="xs"
          style={$summary}
          text={
            status ||
            `${matched} cards from ${lines.length} lines in ${read?.ms} ms (${read?.photo.width}x${read?.photo.height})\n` +
              [...counts].map(([name, count]) => `${count} ${name}`).join(", ")
          }
        />
        <ScrollView
          style={$fill}
          maximumZoomScale={6}
          minimumZoomScale={1}
          onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        >
          {read && width ? (
            <View style={{ width, height: read.photo.height * scale }}>
              <Image source={read.uri} style={{ width, height: read.photo.height * scale }} />
              {lines.map(({ line, match }, key) => (
                <View
                  key={key}
                  pointerEvents="none"
                  style={[
                    $box,
                    {
                      left: line.x * scale,
                      top: line.y * scale,
                      width: line.width * scale,
                      height: line.height * scale,
                      borderColor: match ? theme.colors.success : theme.colors.error,
                    },
                  ]}
                >
                  {match ? (
                    <Text
                      size="xxs"
                      numberOfLines={1}
                      style={[$label, { backgroundColor: theme.colors.success }]}
                      text={match.name}
                    />
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>
      </Screen>
    </Modal>
  )
}

const $fill: ViewStyle = { flex: 1 }
const $row: ViewStyle = { flexDirection: "row", gap: 8, paddingHorizontal: 16 }
const $summary: TextStyle = { paddingHorizontal: 16, paddingVertical: 8 }
const $box: ViewStyle = { position: "absolute", borderWidth: 1 }
const $label: TextStyle = {
  position: "absolute",
  bottom: "100%",
  left: 0,
  color: "#000",
  fontSize: 8,
  lineHeight: 10,
  paddingHorizontal: 2,
}
