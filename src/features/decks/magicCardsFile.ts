import { File, Paths } from "expo-file-system"

/** why: the card file is about 21 MB, too big for MMKV. The cache directory skips backups, and if the OS clears it the file downloads again. */
const cardsFile = () => new File(Paths.cache, "mtg-cards.json")

export function savedMagicCards() {
  const file = cardsFile()
  return file.exists ? () => file.text() : undefined
}

export async function saveMagicCards(text: string) {
  await cardsFile().write(text)
}
