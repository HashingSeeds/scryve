import { ConvexError, v, type Infer } from "convex/values"

import type { Doc, Id } from "../_generated/dataModel"

export const FEEDBACK_KINDS = ["feature", "bug"] as const

export const feedbackKind = v.union(...FEEDBACK_KINDS.map((kind) => v.literal(kind)))
export type FeedbackKind = Infer<typeof feedbackKind>

export const FEEDBACK_LIMITS = { body: 2000, message: 2000, version: 20, runtime: 64 } as const

export const feedbackFix = v.object({
  commit: v.string(),
  at: v.number(),
  runtimes: v.object({ ios: v.optional(v.string()), android: v.optional(v.string()) }),
})
type FeedbackFix = Infer<typeof feedbackFix>

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
const ISSUES_URL = "https://github.com/HashingSeeds/scryve/issues/"

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

const STORES = { ios: "App Store", android: "Google Play" } as const

export function isStorePlatform(platform: string | undefined): platform is keyof typeof STORES {
  return platform === "ios" || platform === "android"
}

type LiveStoreRelease = Pick<Doc<"storeReleases">, "runtimeVersion" | "commitAt">

export function fixReach(
  request: Doc<"feedbackRequests">,
  fix: FeedbackFix,
  store: LiveStoreRelease | null,
) {
  if (request.platform === "web") return "update"
  if (!isStorePlatform(request.platform)) return "unknown"
  const shipped = fix.runtimes[request.platform]
  if (shipped && shipped === request.runtimeVersion) return "update"
  const live = !!store && (store.runtimeVersion === shipped || (store.commitAt ?? 0) >= fix.at)
  if (!live) return "waiting"
  return request.runtimeVersion ? "store" : "unknown"
}

export function fixedReply(
  request: Doc<"feedbackRequests">,
  reach: Exclude<ReturnType<typeof fixReach>, "waiting">,
) {
  const news = request.kind === "bug" ? "We fixed this bug 🐞 😁" : "We added this feature! 🎉"
  const store =
    request.platform === "ios"
      ? "the App Store"
      : request.platform === "android"
        ? "Google Play"
        : "the store"
  if (reach === "update") return `${news} Restart Scryve to update.`
  if (reach === "store") return `${news} Update Scryve from ${store}.`
  return `${news} Restart Scryve to update. Still not there? Update from ${store}.`
}

function fixedMeta(request: Doc<"feedbackRequests">, fix: FeedbackFix) {
  const where = request.awaitingStore
    ? `waiting on ${STORES[request.awaitingStore]}`
    : isStorePlatform(request.platform) && fix.runtimes[request.platform] !== request.runtimeVersion
      ? STORES[request.platform]
      : "update"
  return `${fix.commit.slice(0, 7)} · ${where}`
}

function newIssueUrl(request: Doc<"feedbackRequests">, title: string, app: string | undefined) {
  const body = [
    clip(request.body, 1000),
    "",
    ...(app ? [`Scryve ${app}`] : []),
    ...(request.sentryEventId ? [`Sentry: ${sentryUrl(request.sentryEventId)}`] : []),
  ].join("\n")
  const labels = request.kind === "bug" ? "bug" : "enhancement"
  return `${ISSUES_URL}new?${new URLSearchParams({ title, body: body.trim(), labels })}`
}

function sentryUrl(eventId: string) {
  return `https://matthew-chisolm.sentry.io/issues/?query=${eventId}`
}

export function feedbackCard({ request, messages, account }: FeedbackCardInput) {
  const label = request.kind === "bug" ? "Bug" : "Idea"
  const lastPlayer = messages.findLast((message) => message.from === "player")
  // why: the message window is bounded, so a count would stop changing on long threads; the newest player message's id always does.
  const playerTurn = lastPlayer?._id ?? "request"
  const fix = request.fixedIn
  const awaitingTeam = (messages.at(-1)?.from ?? "player") === "player"
  const title = clip(`${label}: ${request.body.split("\n")[0] ?? ""}`, 120)
  const app = [request.appVersion, request.platform].filter(Boolean).join(" · ") || undefined
  const thread = messages
    .slice(-6)
    .map((message) => `${message.from === "player" ? "Player" : "You"}: ${message.body}`)
  // why: Apollo shows cards from a scoped token as plain text, so player text can't carry a tappable link.
  const body = clipOldestFirst([request.body, ...thread], 4000)
  return {
    source: "feedback",
    key: `${APOLLO_KEY_PREFIX}${request._id}`,
    kind: awaitingTeam ? "approval" : "update",
    phase: fix
      ? `fixed:${fix.commit.slice(0, 7)}:${request.awaitingStore ? "w" : "s"}:${Math.round(lastPlayer?._creationTime ?? request._creationTime)}`
      : `player:${playerTurn}`,
    push: "alert",
    // why: the lock screen and Expo's servers get only this line, never what the player wrote.
    pushText:
      fix && ((lastPlayer?._creationTime ?? 0) < fix.at || messages.at(-1)?.from === "team")
        ? request.awaitingStore
          ? "Fix waiting on the store"
          : "Fix shipped, player told"
        : playerTurn === "request"
          ? `New ${request.kind === "bug" ? "bug report" : "idea"}`
          : "Player replied",
    title,
    body,
    meta: {
      from: account ?? "Anonymous",
      ...(app ? { app } : {}),
      ...(request.issue ? { issue: `#${request.issue}` } : {}),
      ...(fix ? { fixed: fixedMeta(request, fix) } : {}),
    },
    actions: [
      {
        id: "reply",
        label: "Reply",
        style: "primary",
        input: "text",
        repeat: true,
      },
      // why: Apollo hides a non-repeat action once the card turns into an update.
      ...(request.sentryEventId
        ? [{ id: "sentry", label: "Sentry", url: sentryUrl(request.sentryEventId), repeat: true }]
        : []),
      request.issue
        ? {
            id: "issue",
            label: `#${request.issue}`,
            url: `${ISSUES_URL}${request.issue}`,
            repeat: true,
          }
        : {
            id: "file_issue",
            label: "File issue",
            url: newIssueUrl(request, title, app),
            repeat: true,
          },
      { id: "link_issue", label: "Link issue", input: "text", repeat: true },
    ],
  } as const
}
