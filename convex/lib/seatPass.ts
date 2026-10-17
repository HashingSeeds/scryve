const SEAT_PASS_HASH = /^[0-9a-f]{64}$/

/** why: the host's app hashes with expo-crypto, and no test runs both sides, so any change here strands every guest's claim. */
export async function hashSeatPassToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

export const isSeatPassHash = (value: string) => SEAT_PASS_HASH.test(value)

/** why: nearby round IDs reach every guest, so a guest could publish under one first; scoping the stored ID to the uploader keeps the host's upload from colliding. */
export async function nearbyGamePublicId(roundId: string, hostUserId: string) {
  return `lan_${(await hashSeatPassToken(`${roundId}:${hostUserId}`)).slice(0, 40)}`
}
