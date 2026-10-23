import { ConvexError, v, type Infer } from "convex/values"

import type { Doc, Id } from "../_generated/dataModel"

export const FEEDBACK_KINDS = ["feature", "bug"] as const
export const FEEDBACK_STATUSES = ["review", "planned", "building", "shipped", "declined"] as const

export const feedbackKind = v.union(...FEEDBACK_KINDS.map((kind) => v.literal(kind)))
export const feedbackStatus = v.union(...FEEDBACK_STATUSES.map((status) => v.literal(status)))
export type FeedbackKind = Infer<typeof feedbackKind>
export type FeedbackStatus = Infer<typeof feedbackStatus>

export const FEEDBACK_LIMITS = { title: 120, body: 2000, message: 2000, version: 20 } as const

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

export const APOLLO_ACTIONS = [
  "reply",
  "edit",
  "publish",
  "hide",
  "planned",
  "building",
  "shipped",
  "declined",
] as const
export type ApolloAction = (typeof APOLLO_ACTIONS)[number]

const STATUS_LABELS: Record<FeedbackStatus, string> = {
  review: "In review",
  planned: "Planned",
  building: "In progress",
  shipped: "Shipped",
  declined: "Declined",
}

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
  const key = `${APOLLO_KEY_PREFIX}${request._id}`
  const label = request.kind === "bug" ? "Bug" : "Request"
  // why: the message window is bounded, so a count would stop changing on long threads; the newest player message's id always does.
  const playerTurn = messages.findLast((message) => message.from === "player")?._id ?? "request"
  const awaitingTeam = (messages.at(-1)?.from ?? "player") === "player"
  const thread = messages
    .slice(-6)
    .map((message) => `${message.from === "player" ? "Player" : "You"}: ${message.body}`)
  // why: Apollo shows cards from a scoped token as plain text, so player text can't carry a tappable link.
  const body = clipOldestFirst([request.body, ...thread], 4000)
  const status =
    request.status === "shipped" && request.shippedIn
      ? `Shipped in ${request.shippedIn}`
      : STATUS_LABELS[request.status]
  return {
    source: "feedback",
    key,
    kind: awaitingTeam ? "approval" : "update",
    // why: a new phase pushes again, so only the player's own messages and new reports notify Matthew.
    phase: `player:${playerTurn}:reports:${request.reports}`,
    push: "alert",
    title: clip(`${label}: ${request.title}`, 200),
    body,
    meta: {
      status: `${status}${request.published ? " · public" : " · private"}`,
      votes: String(request.votes),
      ...(request.reports ? { reports: String(request.reports) } : {}),
      ...(request.sentryEventId
        ? { sentry: `https://matthew-chisolm.sentry.io/issues/?query=${request.sentryEventId}` }
        : {}),
      from: account ?? "Anonymous",
      ...(request.appVersion || request.platform
        ? { app: [request.appVersion, request.platform].filter(Boolean).join(" · ") }
        : {}),
    },
    actions: [
      { id: "reply", label: "Reply", style: "primary", input: "text", repeat: true },
      {
        id: "edit",
        label: "Edit",
        input: "text",
        repeat: true,
        prefill: `${request.title}\n\n${request.body}`,
      },
      request.published
        ? { id: "hide", label: "Hide", repeat: true }
        : { id: "publish", label: "Publish", repeat: true },
      { id: "planned", label: "Planned", repeat: true },
      { id: "building", label: "Building", repeat: true },
      { id: "shipped", label: "Shipped in…", input: "text", repeat: true },
      { id: "declined", label: "Decline", style: "destructive", repeat: true },
    ],
  } as const
}
