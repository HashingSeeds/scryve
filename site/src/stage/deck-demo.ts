import card0Small from "../assets/cards/atraxa-small.webp?url"
import card0Normal from "../assets/cards/atraxa-normal.webp?url"
import card1Small from "../assets/cards/sol-ring-small.webp?url"
import card1Normal from "../assets/cards/sol-ring-normal.webp?url"
import card2Small from "../assets/cards/arcane-signet-small.webp?url"
import card2Normal from "../assets/cards/arcane-signet-normal.webp?url"
import card3Small from "../assets/cards/fellwar-stone-small.webp?url"
import card3Normal from "../assets/cards/fellwar-stone-normal.webp?url"
import card4Small from "../assets/cards/mind-stone-small.webp?url"
import card4Normal from "../assets/cards/mind-stone-normal.webp?url"
import card5Small from "../assets/cards/cultivate-small.webp?url"
import card5Normal from "../assets/cards/cultivate-normal.webp?url"

// Fixed sample printings from Scryfall. Images and details ship with the demo.
export const demoCards = [
  {
    name: "Atraxa, Praetors' Voice",
    manaCost: "{G}{W}{U}{B}",
    typeLine: "Legendary Creature — Phyrexian Angel Horror",
    oracleText:
      "Flying, vigilance, deathtouch, lifelink\nAt the beginning of your end step, proliferate. (Choose any number of permanents and/or players, then give each another counter of each kind already there.)",
    setName: "Double Masters",
    collectorNumber: "190",
    rarity: "mythic",
    colorIdentity: "Black, Green, Blue, White",
    thumbnail: card0Small,
    image: card0Normal,
    source: "https://scryfall.com/card/2xm/190/atraxa-praetors-voice?utm_source=api",
    board: "Commander",
  },
  {
    name: "Sol Ring",
    manaCost: "{1}",
    typeLine: "Artifact",
    oracleText: "{T}: Add {C}{C}.",
    setName: "Reality Fracture Commander",
    collectorNumber: "21",
    rarity: "uncommon",
    colorIdentity: "Colorless",
    thumbnail: card1Small,
    image: card1Normal,
    source: "https://scryfall.com/card/frc/21/sol-ring?utm_source=api",
    board: "Main deck",
  },
  {
    name: "Arcane Signet",
    manaCost: "{2}",
    typeLine: "Artifact",
    oracleText: "{T}: Add one mana of any color in your commander's color identity.",
    setName: "Reality Fracture Commander",
    collectorNumber: "20",
    rarity: "uncommon",
    colorIdentity: "Colorless",
    thumbnail: card2Small,
    image: card2Normal,
    source: "https://scryfall.com/card/frc/20/arcane-signet?utm_source=api",
    board: "Main deck",
  },
  {
    name: "Fellwar Stone",
    manaCost: "{2}",
    typeLine: "Artifact",
    oracleText: "{T}: Add one mana of any color that a land an opponent controls could produce.",
    setName: "Mystery Booster Commander Edition",
    collectorNumber: "74",
    rarity: "uncommon",
    colorIdentity: "Colorless",
    thumbnail: card3Small,
    image: card3Normal,
    source: "https://scryfall.com/card/mbc/74/fellwar-stone?utm_source=api",
    board: "Main deck",
  },
  {
    name: "Mind Stone",
    manaCost: "{2}",
    typeLine: "Artifact",
    oracleText: "{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card.",
    setName: "Mystery Booster Commander Edition",
    collectorNumber: "76",
    rarity: "uncommon",
    colorIdentity: "Colorless",
    thumbnail: card4Small,
    image: card4Normal,
    source: "https://scryfall.com/card/mbc/76/mind-stone?utm_source=api",
    board: "Main deck",
  },
  {
    name: "Cultivate",
    manaCost: "{2}{G}",
    typeLine: "Sorcery",
    oracleText:
      "Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.",
    setName: "Marvel Super Heroes Commander",
    collectorNumber: "172",
    rarity: "common",
    colorIdentity: "Green",
    thumbnail: card5Small,
    image: card5Normal,
    source: "https://scryfall.com/card/msc/172/cultivate?utm_source=api",
    board: "Main deck",
  },
]
