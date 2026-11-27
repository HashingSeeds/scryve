import { useEffect, useEffectEvent, useRef } from "react"
import type { ViewStyle } from "react-native"
import { PixelRatio, Platform, View } from "react-native"
import Svg, { ClipPath, Defs, G, Line, Rect, Text as SvgText } from "react-native-svg"

import { LifeStrip, lifeScale } from "@/components/LifeStrip"
import { MARK_VIEW_BOX, MarkShape } from "@/components/PlayerMark"
import { playSystemShortLabel } from "@/features/game/playSystems"
import { formatNumber, joinParts } from "@/i18n/format"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import { typography } from "@/theme/typography"
import { shareImage } from "@/utils/shareImage"

import type { GameSummaryModel, SummaryPlayer } from "./gameSummary"
import {
  finishedOnLabel,
  playedFor,
  recapDetail,
  recapHeadline,
  recapOut,
  standings,
} from "./gameSummary"
import { shapeForSeat } from "../../convex/lib/appearance"

const STRIP_WIDTH = 88
const STRIP_HEIGHT = 32

export function RecapStrip({ model, player }: { model: GameSummaryModel; player: SummaryPlayer }) {
  const { theme } = useAppTheme()
  const lives = model.recap?.lives
  if (!lives) return null
  return (
    <Svg width={STRIP_WIDTH} height={STRIP_HEIGHT}>
      <LifeStrip
        lives={lives}
        column={model.players.indexOf(player)}
        scale={lifeScale(lives)}
        width={STRIP_WIDTH}
        height={STRIP_HEIGHT}
        color={player.color}
        baseline={theme.colors.separator}
        out={recapOut(model, player) !== undefined}
      />
    </Svg>
  )
}

const BRAND = "Scryve"
const IMAGE_WIDTH = 360
const IMAGE_HEIGHT = 450
const PAD = 24
const ROWS_TOP = PAD + 74
const ROWS_BOTTOM = IMAGE_HEIGHT - PAD - 22
const ROW_MAX = 73
const STRIP_LEFT = 212
const LIFE_COLUMN = 80
const EXPORT_PIXELS = { width: 1080, height: 1350 }

export function recapExportSize(os: typeof Platform.OS, pixelRatio: number) {
  const scale = os === "web" ? 1 : pixelRatio
  const layout = { width: EXPORT_PIXELS.width / scale, height: EXPORT_PIXELS.height / scale }
  return { layout, request: os === "ios" ? layout : EXPORT_PIXELS }
}

const EXPORT = recapExportSize(Platform.OS, PixelRatio.get())
// why: names and life totals are clipped by length, but wide glyphs still run long, so each column clips to its own box.
const NAMES_CLIP = "recap-names"
const HEADER_CLIP = "recap-header"
// why: an image drawn from SVG on web cannot load the app's web font, so it names system fonts.
const IMAGE_FONT = Platform.select({
  web: {
    regular: { fontFamily: "system-ui, sans-serif" },
    bold: { fontFamily: "system-ui, sans-serif", fontWeight: "700" },
  },
  default: {
    regular: { fontFamily: typography.primary.normal },
    bold: { fontFamily: typography.primary.normal, fontWeight: "700" },
  },
})

const clipped = (text: string, length: number) =>
  text.length > length ? `${text.slice(0, length - 1)}…` : text

function Mark({
  player,
  x,
  y,
  size,
}: {
  player: SummaryPlayer
  x: number
  y: number
  size: number
}) {
  return (
    <G transform={`translate(${x} ${y}) scale(${size / MARK_VIEW_BOX})`}>
      <MarkShape shape={player.shape ?? shapeForSeat(player.seat)} color={player.color} />
    </G>
  )
}

function RecapImage({ model, svgRef }: { model: GameSummaryModel; svgRef: React.Ref<Svg> }) {
  const { colors } = useAppTheme().theme
  const lives = model.recap?.lives
  const scale = lives ? lifeScale(lives) : undefined
  const winners = model.players.filter(({ outcome }) => outcome === "win")
  const winner = winners.length === 1 ? winners[0] : undefined
  const rows = standings(model)
  const height = Math.min(ROW_MAX, (ROWS_BOTTOM - ROWS_TOP) / rows.length)
  const roomy = height >= 50
  const lifeChars = Math.max(...rows.map(({ life }) => formatNumber(life).length)) * 0.68
  const lifeSize = Math.min(roomy ? 25 : 20, LIFE_COLUMN / lifeChars)
  const stripWidth = IMAGE_WIDTH - PAD - lifeChars * lifeSize - 10 - STRIP_LEFT
  const meta = joinParts([
    model.logged ? translate("play:history.logged") : undefined,
    model.system ? playSystemShortLabel(model.system) : undefined,
    model.format,
    playedFor(model),
    finishedOnLabel(model.finishedAt, model.logged),
  ])
  return (
    <Svg
      ref={svgRef}
      width={EXPORT.layout.width}
      height={EXPORT.layout.height}
      viewBox={`0 0 ${IMAGE_WIDTH} ${IMAGE_HEIGHT}`}
    >
      <Defs>
        <ClipPath id={NAMES_CLIP}>
          <Rect width={STRIP_LEFT - 8} height={IMAGE_HEIGHT} />
        </ClipPath>
        <ClipPath id={HEADER_CLIP}>
          <Rect width={IMAGE_WIDTH - PAD} height={IMAGE_HEIGHT} />
        </ClipPath>
      </Defs>
      <Rect width={IMAGE_WIDTH} height={IMAGE_HEIGHT} fill={colors.background} />
      {winner ? <Mark player={winner} x={PAD - 4} y={PAD - 2} size={34} /> : null}
      <G clipPath={`url(#${HEADER_CLIP})`}>
        <SvgText
          x={winner ? PAD + 36 : PAD}
          y={PAD + 26}
          {...IMAGE_FONT.bold}
          fontSize={29}
          fill={colors.text}
        >
          {clipped(recapHeadline(model), winner ? 17 : 20)}
        </SvgText>
        <SvgText x={PAD} y={PAD + 54} {...IMAGE_FONT.regular} fontSize={12.5} fill={colors.textDim}>
          {clipped(meta, 52)}
        </SvgText>
      </G>
      {rows.map((player, index) => {
        const top = ROWS_TOP + index * height
        const middle = top + height / 2
        const out = recapOut(model, player) !== undefined
        const detail = recapDetail(model, player)
        const nameSize = roomy ? 16 : 13
        const nameY = detail ? middle - 3 : middle + nameSize / 3
        return (
          <G key={player.id}>
            {index > 0 ? (
              <Line
                x1={PAD}
                x2={IMAGE_WIDTH - PAD}
                y1={top}
                y2={top}
                stroke={colors.separator}
                strokeWidth={0.67}
              />
            ) : null}
            <G clipPath={`url(#${NAMES_CLIP})`}>
              <Mark player={player} x={PAD - 2} y={nameY - nameSize} size={nameSize + 2} />
              <SvgText
                x={PAD + nameSize + 4}
                y={nameY}
                {...IMAGE_FONT.bold}
                fontSize={nameSize}
                fill={out ? colors.textDim : colors.text}
              >
                {clipped(player.name, 14)}
              </SvgText>
              {detail ? (
                <SvgText
                  x={PAD}
                  y={middle + (roomy ? 14 : 11)}
                  {...IMAGE_FONT.regular}
                  fontSize={roomy ? 9.5 : 9}
                  fill={colors.textDim}
                >
                  {clipped(detail, 34)}
                </SvgText>
              ) : null}
            </G>
            {lives && scale ? (
              <G transform={`translate(${STRIP_LEFT} ${top + height * 0.18})`}>
                <LifeStrip
                  lives={lives}
                  column={model.players.indexOf(player)}
                  scale={scale}
                  width={stripWidth}
                  height={height * 0.64}
                  color={player.color}
                  baseline={colors.separator}
                  out={out}
                  strokeWidth={roomy ? 1.7 : 1.4}
                />
              </G>
            ) : null}
            {model.logged ? null : (
              <SvgText
                x={IMAGE_WIDTH - PAD}
                y={middle + (roomy ? 9 : 7)}
                textAnchor="end"
                {...IMAGE_FONT.bold}
                fontSize={lifeSize}
                fill={out ? colors.textDim : colors.text}
              >
                {formatNumber(player.life)}
              </SvgText>
            )}
          </G>
        )
      })}
      <SvgText
        x={IMAGE_WIDTH - PAD}
        y={IMAGE_HEIGHT - PAD + 4}
        textAnchor="end"
        {...IMAGE_FONT.bold}
        fontSize={10}
        fill={colors.textDim}
      >
        {BRAND}
      </SvgText>
    </Svg>
  )
}

export function RecapShare({
  model,
  onDone,
}: {
  model: GameSummaryModel
  onDone: (error?: unknown) => void
}) {
  const svgRef = useRef<Svg>(null)
  const done = useEffectEvent(onDone)
  useEffect(() => {
    let active = true
    const frame = requestAnimationFrame(() =>
      svgRef.current?.toDataURL((base64) => {
        if (active) shareImage(base64, "scryve-recap.png").then(() => done(), done)
      }, EXPORT.request),
    )
    return () => {
      active = false
      cancelAnimationFrame(frame)
    }
  }, [])
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={$offscreen}
    >
      <RecapImage model={model} svgRef={svgRef} />
    </View>
  )
}

const $offscreen: ViewStyle = {
  position: "absolute",
  left: -10_000,
  top: 0,
  ...EXPORT.layout,
}
