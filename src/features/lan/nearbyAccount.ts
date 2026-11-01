import { load, save } from "@/utils/storage"

const CLAIMS_KEY = "lan.seatClaims"
const MAX_CLAIMS = 50
const CLAIM_LIFETIME_MS = 30 * 24 * 60 * 60_000

export interface SeatClaim {
  ownerId: string
  publicId: string
  token: string
  savedAt: number
  deckVersionId?: string
  deckFingerprint?: string
}

let owner: string | undefined
const listeners = new Set<() => void>()

/** why: the nearby session runs outside React, so the signed-in account reaches it here. Signed out is undefined, and then a finished game records nothing. */
export const setNearbyOwner = (ownerId: string | undefined) => {
  owner = ownerId
}

export const nearbyOwner = () => owner

const isClaim = (value: unknown): value is SeatClaim => {
  if (typeof value !== "object" || value === null) return false
  const { ownerId, publicId, token, savedAt, deckVersionId, deckFingerprint } = value as Record<
    string,
    unknown
  >
  return (
    typeof ownerId === "string" &&
    typeof publicId === "string" &&
    typeof token === "string" &&
    typeof savedAt === "number" &&
    (deckVersionId === undefined || typeof deckVersionId === "string") &&
    (deckFingerprint === undefined || typeof deckFingerprint === "string")
  )
}

function loadClaims(now: number) {
  const saved = load(CLAIMS_KEY)
  return Array.isArray(saved)
    ? saved.filter(isClaim).filter((claim) => now - claim.savedAt < CLAIM_LIFETIME_MS)
    : []
}

export function rememberSeatClaim(claim: Omit<SeatClaim, "ownerId">) {
  if (!owner) return false
  const claims = loadClaims(claim.savedAt)
  if (claims.some(({ publicId }) => publicId === claim.publicId)) return true
  return save(CLAIMS_KEY, [...claims, { ...claim, ownerId: owner }].slice(-MAX_CLAIMS))
}

export function retrySeatClaims() {
  for (const listener of listeners) listener()
}

export const pendingSeatClaims = (ownerId: string, now = Date.now()) =>
  loadClaims(now).filter((claim) => claim.ownerId === ownerId)

export function settleSeatClaim(publicId: string, now = Date.now()) {
  save(
    CLAIMS_KEY,
    loadClaims(now).filter((claim) => claim.publicId !== publicId),
  )
}

export function onSeatClaim(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
