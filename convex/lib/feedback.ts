import { ConvexError, v, type Infer } from "convex/values"

import type { Doc, Id } from "../_generated/dataModel"

export const FEEDBACK_KINDS = ["feature", "bug"] as const

export const feedbackKind = v.union(...FEEDBACK_KINDS.map((kind) => v.literal(kind)))
export type FeedbackKind = Infer<typeof feedbackKind>

export const FEEDBACK_LIMITS = { body: 2000, message: 2000, version: 20 } as const

const FEEDBACK_KEY = /^[A-Za-z0-9_-]{32,128}$/

export async function senderHash(key: string) {
  if (!FEEDBACK_KEY.test(key))
    throw new ConvexError({ code: "invalid_key", message: "Invalid feedback key" })
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

export function cleanText(value: string, max: number, field: string) {
  const text = value.trim()
  if (!text || text.length > max)
    throw new ConvexError({
      code: "invalid_text",
      message: `${field} must be 1 to ${max} characters`,
    })
  return text
}

export const APOLLO_KEY_PREFIX = "scryve:"

function clip(text: string, max: number) {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

function clipOldestFirst(parts: string[], max: number) {
  const kept: string[] = []
  let room = max
  for (const part of [...parts].reverse()) {
    if (room <= 1) break
    const piece = clip(part, room)
    kept.unshift(piece)
    room -= piece.length + 2
  }
  return kept.join("\n\n")
}

export type FeedbackCardInput = {
  request: Doc<"feedbackRequests">
  messages: Doc<"feedbackMessages">[]
  account?: string
}

export function deletedFeedbackCard(requestId: Id<"feedbackRequests">) {
  return {
    source: "feedback",
    key: `${APOLLO_KEY_PREFIX}${requestId}`,
    kind: "update",
    push: "none",
    title: "Feedback deleted by the player",
  } as const
}

export function feedbackCard({ request, messages, account }: FeedbackCardInput) {
  const label = request.kind === "bug" ? "Bug" : "Idea"
  // why: the message window is bounded, so a count would stop changing on long threads; the newest player message's id always does.
  const playerTurn = messages.findLast((message) => message.from === "player")?._id ?? "request"
  const awaitingTeam = (messages.at(-1)?.from ?? "player") === "player"
  const thread = messages
    .slice(-6)
    .map((message) => `${message.from === "player" ? "Player" : "You"}: ${message.body}`)
  // why: Apollo shows cards from a scoped token as plain text, so player text can't carry a tappable link.
  const body = clipOldestFirst([request.body, ...thread], 4000)
  return {
    source: "feedback",
    key: `${APOLLO_KEY_PREFIX}${request._id}`,
    kind: awaitingTeam ? "approval" : "update",
    // why: a new phase pushes again, so only the player's own messages notify Matthew.
    phase: `player:${playerTurn}`,
    push: "alert",
    // why: the lock screen and Expo's servers get only this line, never what the player wrote.
    pushText:
      playerTurn === "request"
        ? `New ${request.kind === "bug" ? "bug report" : "idea"}`
        : "Player replied",
    title: clip(`${label}: ${request.body.split("\n")[0] ?? ""}`, 120),
    body,
    meta: {
      from: account ?? "Anonymous",
      ...(request.appVersion || request.platform
        ? { app: [request.appVersion, request.platform].filter(Boolean).join(" · ") }
        : {}),
    },
    actions: [
      { id: "reply", label: "Reply", style: "primary", input: "text", repeat: true },
      // why: Apollo hides a non-repeat action once the card turns into an update.
      ...(request.sentryEventId
        ? [
            {
              id: "sentry",
              label: "Sentry",
              url: `https://matthew-chisolm.sentry.io/issues/?query=${request.sentryEventId}`,
              repeat: true,
            },
          ]
        : []),
    ],
  } as const
}
