const encoder = new TextEncoder()

// why: `!==` stops at the first differing character, so timing leaks how much of a guess is right; hashing first also hides the length.
export async function secretMatches(given: string | null, expected: string) {
  if (given === null) return false
  const [givenDigest, expectedDigest] = await Promise.all(
    [given, expected].map(
      async (value) => new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))),
    ),
  )
  let difference = 0
  for (let index = 0; index < expectedDigest.length; index++)
    difference |= givenDigest[index] ^ expectedDigest[index]
  return difference === 0
}
