import type { LegalDocumentContent } from "./legal"
import { SYSTEMS, type SystemId } from "../../convex/lib/systems"

const requiredNotices = (system: SystemId) =>
  SYSTEMS[system].integration.rights.requiredNotices.map((text) => ({
    type: "paragraph" as const,
    text,
  }))

export const gameContentNotices = {
  id: "gameContentNotices",
  title: "THIRD-PARTY GAME CONTENT",
  version: "2026-10-17",
  effectiveDate: "October 17, 2026",
  sections: [
    {
      blocks: [
        {
          type: "paragraph",
          text: "Scryve is an independent game-management application. It is not affiliated with, endorsed by, sponsored by, or approved by the publishers of the games it supports unless a notice below expressly says otherwise.",
        },
        {
          type: "paragraph",
          text: "Card names, card images, rules information, trademarks, characters, and other third-party materials remain the property of their respective owners. Scryve displays them only where needed to identify cards and provide deck construction, play tracking, reference, and statistics features. Scryve does not offer card artwork as standalone downloadable content.",
        },
        {
          type: "paragraph",
          text: "Access to supported card catalogs, card images, and rules references is free. Paid Scryve features cover Scryve services such as additional saved decks, deck versions, synchronization, and statistics, not the sale of third-party game content.",
        },
      ],
    },
    {
      heading: "Magic: The Gathering",
      blocks: [
        ...requiredNotices("mtg"),
        {
          type: "paragraph",
          text: "Magic: The Gathering card data and images are provided through Scryfall. Scryve is not affiliated with Wizards of the Coast or Scryfall.",
        },
        {
          type: "paragraph",
          text: "The Magic: The Gathering Comprehensive Rules are downloaded from Wizards of the Coast to your device when you start a Magic game or open Rules, and shown with their original notices. Scryve does not host or distribute them. The official rules are at https://magic.wizards.com/en/rules.",
        },
      ],
    },
    {
      heading: "Yu-Gi-Oh!",
      blocks: [
        ...requiredNotices("ygo"),
        {
          type: "paragraph",
          text: "Scryve uses these materials for card identification, deck management, play tracking, and reference. Card data is provided through YGOPRODeck. Scryve is not affiliated with or endorsed by YGOPRODeck.",
        },
      ],
    },
    {
      heading: "Pokémon Trading Card Game",
      blocks: [
        ...requiredNotices("pokemon"),
        {
          type: "paragraph",
          text: "Scryve uses these materials for card identification, deck management, play tracking, and reference. Card data is provided through TCGdex, and tournament deck data is provided through Limitless. Scryve is not affiliated with or endorsed by TCGdex or Limitless.",
        },
      ],
    },
    {
      heading: "Disney Lorcana",
      blocks: [
        ...requiredNotices("lorcana"),
        {
          type: "paragraph",
          text: "Scryve uses these materials for card identification, deck management, play tracking, and reference. Card data and official starter deck lists are provided through LorcanaJSON, and card images load from Ravensburger. Scryve is not affiliated with or endorsed by LorcanaJSON.",
        },
      ],
    },
    {
      heading: "Open source",
      blocks: [
        {
          type: "paragraph",
          text: "Scryve's source-code license applies to Scryve's code. It does not grant rights to third-party game content. Publisher assets are fetched at runtime and are not distributed as part of the source repository.",
        },
      ],
    },
    {
      heading: "Questions from rights holders",
      blocks: [
        {
          type: "paragraph",
          text: "Rights holders with questions or concerns about content displayed in Scryve can contact contact@sowinghope.how.",
        },
      ],
    },
  ],
} as const satisfies LegalDocumentContent
