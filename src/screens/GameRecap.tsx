import { useEffect, useEffectEvent, useRef } from "react"
import type { ViewStyle } from "react-native"
import { PixelRatio, Platform, View } from "react-native"
import Svg, { Circle, ClipPath, Defs, G, Rect, Text as SvgText } from "react-native-svg"

import { LifeStrip, lifePlot, lifeScale } from "@/components/LifeStrip"
import { formatNumber } from "@/i18n/format"
import { translate } from "@/i18n/translate"
import { colors as dark } from "@/theme/colorsDark"
import { useAppTheme } from "@/theme/context"
import { typography } from "@/theme/typography"
import { captureAnalytics } from "@/utils/analytics"
import { shareImage } from "@/utils/shareImage"

import type { GameSummaryModel, SummaryPlayer } from "./gameSummary"
import { recapOut } from "./gameSummary"
import { recapReceipt, type Receipt } from "./recapReceipt"

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
const PAD = 18
const INNER = IMAGE_WIDTH - PAD * 2
const CLAIM_Y = PAD + 30
const GRAPH_TOP = 68
const TILE_HEIGHT = 58
const TILE_GAP = 4
const FOOTER_Y = IMAGE_HEIGHT - PAD
const LINE_Y = FOOTER_Y - 24
const TRACE_WIDTH = 3
const MUTED_TRACE_WIDTH = 1.8
const EXPORT_PIXELS = { width: 1080, height: 1350 }
// why: the shared card stays dark in light mode, so it reads the dark palette, not the theme.
const CARD = {
  background: dark.palette.neutral100,
  border: dark.palette.primary300,
  number: dark.palette.primary300,
  text: dark.text,
  dim: dark.textDim,
  baseline: dark.separator,
  brand: dark.tint,
}

export function recapExportSize(os: typeof Platform.OS, pixelRatio: number) {
  const scale = os === "web" ? 1 : pixelRatio
  const layout = { width: EXPORT_PIXELS.width / scale, height: EXPORT_PIXELS.height / scale }
  return { layout, request: os === "ios" ? layout : EXPORT_PIXELS }
}

const EXPORT = recapExportSize(Platform.OS, PixelRatio.get())
// why: text is fitted by length, but wide glyphs still run long, so each text box clips to its own bounds.
const CLAIM_CLIP = "receipt-claim"
const LINE_CLIP = "receipt-line"
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

const GLYPH_WIDTH = 0.58

const clipped = (text: string, length: number) =>
  text.length > length ? `${text.slice(0, Math.max(1, length - 1))}…` : text

const fitted = (text: string, width: number, size: number, min: number) =>
  Math.max(min, Math.min(size, width / (text.length * GLYPH_WIDTH)))

function ReceiptImage({
  model,
  receipt,
  svgRef,
}: {
  model: GameSummaryModel
  receipt: Receipt
  svgRef: React.Ref<Svg>
}) {
  const lives = model.recap?.lives
  const scale = lives ? lifeScale(lives) : undefined
  const claimSize = fitted(receipt.claim, INNER, 30, 18)
  const number = receipt.life === undefined ? undefined : formatNumber(receipt.life)
  const numberSize = number ? fitted(number, 150, 116, 40) : 0
  const numberWidth = number ? number.length * numberSize * 0.62 : 0
  const perRow =
    receipt.seats.length <= 5 ? receipt.seats.length : Math.ceil(receipt.seats.length / 2)
  const tileRows = Math.ceil(receipt.seats.length / perRow)
  const tileWidth = (INNER - (perRow - 1) * TILE_GAP) / perRow
  const tilesBottom = receipt.line ? LINE_Y - 16 : FOOTER_Y - 20
  const tilesTop = tilesBottom - tileRows * TILE_HEIGHT - (tileRows - 1) * TILE_GAP
  const graphHeight = tilesTop - 20 - GRAPH_TOP
  const graphLeft = PAD + (number ? numberWidth + 12 : 0)
  const graphWidth = IMAGE_WIDTH - PAD - graphLeft
  const traces = receipt.seats
    .map((seat, column) => ({ ...seat, column }))
    .sort((left, right) => Number(left.won) - Number(right.won))
  const low = receipt.low && lives && scale ? receipt.low : undefined
  const plot =
    lives && scale ? lifePlot(lives.length, scale, graphWidth, graphHeight, TRACE_WIDTH) : undefined
  return (
    <Svg
      ref={svgRef}
      width={EXPORT.layout.width}
      height={EXPORT.layout.height}
      viewBox={`0 0 ${IMAGE_WIDTH} ${IMAGE_HEIGHT}`}
    >
      <Defs>
        <ClipPath id={CLAIM_CLIP}>
          <Rect x={PAD} width={INNER} height={GRAPH_TOP} />
        </ClipPath>
        <ClipPath id={LINE_CLIP}>
          <Rect x={PAD} width={INNER} height={IMAGE_HEIGHT} />
        </ClipPath>
        {receipt.seats.map((_, index) => (
          <ClipPath key={index} id={`receipt-seat-${index}`}>
            <Rect
              x={PAD + (index % perRow) * (tileWidth + TILE_GAP)}
              y={tilesTop + Math.floor(index / perRow) * (TILE_HEIGHT + TILE_GAP)}
              width={tileWidth}
              height={TILE_HEIGHT}
              rx={6}
            />
          </ClipPath>
        ))}
      </Defs>
      <Rect width={IMAGE_WIDTH} height={IMAGE_HEIGHT} fill={CARD.background} />
      <Rect
        x={1}
        y={1}
        width={IMAGE_WIDTH - 2}
        height={IMAGE_HEIGHT - 2}
        rx={18}
        fill="none"
        stroke={CARD.border}
        strokeWidth={2}
      />
      <G clipPath={`url(#${CLAIM_CLIP})`}>
        <SvgText x={PAD} y={CLAIM_Y} {...IMAGE_FONT.bold} fontSize={claimSize} fill={CARD.text}>
          {clipped(receipt.claim, Math.floor(INNER / (claimSize * GLYPH_WIDTH)))}
        </SvgText>
      </G>
      {number ? (
        <SvgText
          x={PAD}
          y={GRAPH_TOP + graphHeight / 2 + numberSize * 0.36}
          {...IMAGE_FONT.bold}
          fontSize={numberSize}
          fill={CARD.number}
        >
          {number}
        </SvgText>
      ) : null}
      {lives && scale && plot ? (
        <G transform={`translate(${graphLeft} ${GRAPH_TOP})`}>
          {traces.map(({ player, won, column }) => (
            <G key={player.id} opacity={won ? 1 : 0.55}>
              <LifeStrip
                lives={lives}
                column={column}
                scale={scale}
                width={graphWidth}
                height={graphHeight}
                color={player.color}
                baseline={CARD.baseline}
                out={recapOut(model, player) !== undefined}
                strokeWidth={won ? TRACE_WIDTH : MUTED_TRACE_WIDTH}
              />
            </G>
          ))}
          {low ? (
            <Circle
              cx={plot.x(low.row)}
              cy={plot.y(lives[low.row][low.column])}
              r={6.5}
              fill={CARD.background}
              stroke={model.players[low.column].color}
              strokeWidth={2.5}
            />
          ) : null}
        </G>
      ) : null}
      {receipt.seats.map(({ player, won, outTurn }, index) => {
        const x = PAD + (index % perRow) * (tileWidth + TILE_GAP)
        const y = tilesTop + Math.floor(index / perRow) * (TILE_HEIGHT + TILE_GAP)
        const chars = Math.floor((tileWidth - 14) / (11 * GLYPH_WIDTH))
        return (
          <G key={player.id} clipPath={`url(#receipt-seat-${index})`}>
            <Rect
              x={x}
              y={y}
              width={tileWidth}
              height={TILE_HEIGHT}
              rx={6}
              fill={player.color}
              fillOpacity={won ? 0.34 : 0.14}
            />
            <SvgText x={x + 7} y={y + 15} {...IMAGE_FONT.bold} fontSize={11} fill={player.color}>
              {clipped(player.name, chars)}
            </SvgText>
            {model.logged ? null : (
              <SvgText x={x + 7} y={y + 37} {...IMAGE_FONT.bold} fontSize={21} fill={player.color}>
                {formatNumber(player.life)}
              </SvgText>
            )}
            {outTurn === undefined ? null : (
              <SvgText x={x + 7} y={y + 51} {...IMAGE_FONT.regular} fontSize={10} fill={CARD.dim}>
                {translate("play:summary.receipt.outTurn", { turn: outTurn })}
              </SvgText>
            )}
          </G>
        )
      })}
      {receipt.line ? (
        <G clipPath={`url(#${LINE_CLIP})`}>
          <SvgText x={PAD} y={LINE_Y} {...IMAGE_FONT.regular} fontSize={12.5} fill={CARD.dim}>
            {clipped(receipt.line, Math.floor(INNER / (12.5 * 0.5)))}
          </SvgText>
        </G>
      ) : null}
      <SvgText x={PAD} y={FOOTER_Y} {...IMAGE_FONT.regular} fontSize={11} fill={CARD.dim}>
        {clipped(receipt.meta, 46)}
      </SvgText>
      <SvgText
        x={IMAGE_WIDTH - PAD}
        y={FOOTER_Y}
        textAnchor="end"
        {...IMAGE_FONT.bold}
        fontSize={12}
        letterSpacing={0.5}
        fill={CARD.brand}
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
  const receipt = recapReceipt(model)
  const caption = useEffectEvent(() => receipt.caption)
  useEffect(() => {
    let active = true
    const frame = requestAnimationFrame(() =>
      svgRef.current?.toDataURL((base64) => {
        if (!active) return
        shareImage(base64, "scryve-recap.png", caption()).then((outcome) => {
          if (outcome === "shared") captureAnalytics("recap_shared", {})
          done()
        }, done)
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
      <ReceiptImage model={model} receipt={receipt} svgRef={svgRef} />
    </View>
  )
}

const $offscreen: ViewStyle = {
  position: "absolute",
  left: -10_000,
  top: 0,
  ...EXPORT.layout,
}
