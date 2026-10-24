import { cardSection, type DeckCard } from "./deckCards"

const TITLES = [
  "Grand Arbiter",
  "Grand Warlord",
  "Fire Lord",
  "High Perfect",
  "Lord",
  "Lady",
  "Queen",
  "King",
  "Captain",
  "General",
  "Admiral",
  "Sir",
  "Syr",
  "Dragonlord",
  "God-Eternal",
  "Ghoulcaller",
  "Magus",
  "Avatar",
  "Doctor",
  "Dr.",
  "Mr.",
  "Ms.",
  "Old",
  "Ojer",
]
const LEADING_TITLE = new RegExp(
  `^(?:${TITLES.map((title) => title.replace(".", "\\.")).join("|")}) `,
)

const SPOKEN_NAMES: Record<string, string> = {
  "Elesh Norn": "Norn",
  "Nicol Bolas": "Bolas",
  "Captain America": "Cap",
  "Iron Man": "Iron Man",
  "Black Panther": "Panther",
  "Liberty Prime": "Liberty Prime",
  "Massacre Girl": "Massacre Girl",
  "Bristly Bill": "Bristly Bill",
  "Anim Pakal": "Anim Pakal",
  "Wan Shi Tong": "Wan Shi Tong",
  "Cosmic Spider-Man": "Spider-Man",
  "Honest Rutstein": "Rutstein",
  "Sliver Overlord": "Sliver Overlord",
  "Sliver Queen": "Sliver Queen",
  "Child of Alara": "Child of Alara",
  "Reaper King": "Reaper King",
  "Old Man Willow": "Old Man Willow",
  "Sliver Legion": "Sliver Legion",
  "Lord of the Nazgûl": "Nazgûl",
  "Vial Smasher the Fierce": "Vial Smasher",
  "Auntie Ool": "Auntie Ool",
}

export function commanderShortName(cardName: string): string {
  const base = cardName.split(" // ")[0].split(",")[0].trim().replace(/^A-/, "")
  const spoken = SPOKEN_NAMES[base]
  if (spoken) return spoken
  if (base.startsWith("The ")) return base.slice(4)
  let name = base.replace(/\s*"[^"]*"/g, "").split(/ (?:the|of|and|&) /)[0]
  if (TITLES.includes(name)) return base
  while (LEADING_TITLE.test(name)) name = name.replace(LEADING_TITLE, "")
  const words = name.split(" ")
  return words.length > 1 && words[0].length <= 3 ? words.slice(0, 2).join(" ") : words[0]
}

export function deckCommanderNames(cards: readonly DeckCard[]): string[] {
  return cards
    .filter((card) => cardSection(card) === "commander")
    .map((card) => commanderShortName(card.name))
}
