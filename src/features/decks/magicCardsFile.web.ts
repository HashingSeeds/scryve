/** why: the browser's HTTP cache keeps the card file and revalidates it with its ETag, so web saves nothing itself. */
export function savedMagicCards(): (() => Promise<string>) | undefined {
  return undefined
}

export async function saveMagicCards(_text: string) {}
