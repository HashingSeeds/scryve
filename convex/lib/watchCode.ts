export const WATCH_CODE_LENGTH = 8
// why: 32 symbols so each random byte maps without bias; no 0, 1, I or O, which read alike on a TV.
const WATCH_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
const WATCH_CODE = new RegExp(`^[${WATCH_CODE_ALPHABET}]{${WATCH_CODE_LENGTH}}$`)

export function normalizeWatchCode(value: string) {
  const code = value.trim().toUpperCase().replace(/[\s-]/g, "")
  return WATCH_CODE.test(code) ? code : null
}

export function newWatchCode() {
  const bytes = new Uint8Array(WATCH_CODE_LENGTH)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => WATCH_CODE_ALPHABET[byte % WATCH_CODE_ALPHABET.length]).join(
    "",
  )
}
