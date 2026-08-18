import { Fragment } from "react"
import { Linking, type TextStyle } from "react-native"

import { Text, type TextProps } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

const linkPattern = /(https?:\/\/[^\s"<>]+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g
const trailingPunctuation = /[.,;:!?]+$/

export interface LinkedTextProps extends Omit<TextProps, "text" | "children"> {
  text: string
}

interface Segment {
  content: string
  href?: string
}

export function LinkedText({ text, ...rest }: LinkedTextProps) {
  const { themed } = useAppTheme()
  const segments = splitLinks(text)

  return (
    <Text {...rest}>
      {segments.map((segment, index) =>
        segment.href ? (
          <Text
            key={index}
            text={segment.content}
            accessibilityRole="link"
            style={themed($link)}
            onPress={() => void Linking.openURL(segment.href as string)}
          />
        ) : (
          <Fragment key={index}>{segment.content}</Fragment>
        ),
      )}
    </Text>
  )
}

export function splitLinks(text: string): Segment[] {
  const segments: Segment[] = []
  let lastIndex = 0

  for (const match of text.matchAll(linkPattern)) {
    const start = match.index
    let candidate = match[0]

    candidate = trimTrailingText(candidate)
    if (!candidate) continue

    if (start > lastIndex) segments.push({ content: text.slice(lastIndex, start) })
    segments.push({ content: candidate, href: toHref(candidate) })
    lastIndex = start + candidate.length
  }

  if (lastIndex < text.length) segments.push({ content: text.slice(lastIndex) })
  return segments
}

function trimTrailingText(candidate: string) {
  for (;;) {
    const withoutPunctuation = candidate.replace(trailingPunctuation, "")
    if (withoutPunctuation !== candidate) {
      candidate = withoutPunctuation
      continue
    }
    if (candidate.endsWith(")") && countUnbalancedClosingParens(candidate) > 0) {
      candidate = candidate.slice(0, -1)
      continue
    }
    return candidate
  }
}

function countUnbalancedClosingParens(candidate: string) {
  let depth = 0
  let unbalanced = 0
  for (const character of candidate) {
    if (character === "(") depth += 1
    else if (character === ")") {
      if (depth === 0) unbalanced += 1
      else depth -= 1
    }
  }
  return unbalanced
}

function toHref(candidate: string) {
  return candidate.startsWith("http") ? candidate : `mailto:${candidate}`
}

const $link: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.tint,
  textDecorationLine: "underline",
})
