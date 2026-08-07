import * as Crypto from "expo-crypto"

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

function bytesToBase64Url(bytes: Uint8Array) {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("")
  if (typeof btoa === "function")
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
  throw new Error("This runtime cannot encode secure invite bytes")
}

export async function createLobbyIdentifiers() {
  const [tokenBytes, publicBytes, codeBytes] = await Promise.all([
    Crypto.getRandomBytesAsync(32),
    Crypto.getRandomBytesAsync(18),
    Crypto.getRandomBytesAsync(48),
  ])
  const codes: string[] = []
  for (let offset = 0; offset < codeBytes.length; offset += 6) {
    codes.push(
      Array.from(
        codeBytes.slice(offset, offset + 6),
        (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length],
      ).join(""),
    )
  }
  return {
    inviteToken: bytesToBase64Url(tokenBytes),
    publicId: bytesToBase64Url(publicBytes),
    manualCodeCandidates: codes,
  }
}
