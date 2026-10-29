import type { CardPhotoText } from "../../../modules/card-text-reader"

type Size = { width: number; height: number }
type Point = { x: number; y: number }

export type ScanFraming = { view: Size; frame: Size & { x: number; y: number } }

const FRAME_MARGIN = 1.1

function circularMeanRadians(lines: CardPhotoText["lines"]) {
  let sin = 0
  let cos = 0
  for (const line of lines) {
    const radians = (line.angle * Math.PI) / 180
    sin += Math.sin(radians) * line.text.length
    cos += Math.cos(radians) * line.text.length
  }
  return Math.atan2(sin, cos)
}

function insideCard(cardCorners: Point[], point: Point) {
  const sides = cardCorners.map((corner, index) => {
    const next = cardCorners[(index + 1) % cardCorners.length] ?? corner
    return (next.x - corner.x) * (point.y - corner.y) - (next.y - corner.y) * (point.x - corner.x)
  })
  return sides.every((side) => side >= 0) || sides.every((side) => side <= 0)
}

/**
 * why: a phone lying flat can save the photo turned 90° or 180° from the locked portrait
 * preview, so the frame is matched symmetrically around the photo's center.
 */
export function framedLinesFromCardTop(photo: CardPhotoText, framing: ScanFraming): string[] {
  const sideways = photo.width > photo.height !== framing.view.width > framing.view.height
  const view = sideways ? { width: framing.view.height, height: framing.view.width } : framing.view
  const scale = Math.max(view.width / photo.width, view.height / photo.height)
  const frameCenterOffset = {
    x: Math.abs(framing.frame.x + framing.frame.width / 2 - framing.view.width / 2),
    y: Math.abs(framing.frame.y + framing.frame.height / 2 - framing.view.height / 2),
  }
  const halfFrame = {
    x: (framing.frame.width / 2 + frameCenterOffset.x) / scale,
    y: (framing.frame.height / 2 + frameCenterOffset.y) / scale,
  }
  const half = sideways
    ? { x: halfFrame.y * FRAME_MARGIN, y: halfFrame.x * FRAME_MARGIN }
    : { x: halfFrame.x * FRAME_MARGIN, y: halfFrame.y * FRAME_MARGIN }
  const centered = photo.lines.map((line) => ({
    line,
    x: line.x + line.width / 2 - photo.width / 2,
    y: line.y + line.height / 2 - photo.height / 2,
  }))
  // why: a card the camera outlined excludes text from the card peeking out behind it.
  const { cardCorners } = photo
  const framed = cardCorners
    ? centered.filter(({ line }) =>
        insideCard(cardCorners, { x: line.x + line.width / 2, y: line.y + line.height / 2 }),
      )
    : centered.filter(({ x, y }) => Math.abs(x) <= half.x && Math.abs(y) <= half.y)
  const cardRotation = circularMeanRadians(framed.map(({ line }) => line))
  const downTheCard = ({ x, y }: { x: number; y: number }) =>
    -x * Math.sin(cardRotation) + y * Math.cos(cardRotation)
  return framed.sort((a, b) => downTheCard(a) - downTheCard(b)).map(({ line }) => line.text)
}
