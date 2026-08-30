import type { LegalDocumentContent } from "./legal"

export const gameContentNotices = {
  id: "gameContentNotices",
  title: "THIRD-PARTY GAME CONTENT",
  version: "2026-08-29",
  effectiveDate: "August 29, 2026",
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
          text: "Access to supported card catalogs and card images is free. Paid Scryve features cover Scryve services such as additional saved decks, synchronization, and statistics, not the sale of third-party game content.",
        },
      ],
    },
    {
      heading: "Magic: The Gathering",
      blocks: [
        {
          type: "paragraph",
          text: "Magic: The Gathering, card names, card artwork, and related marks are property of Wizards of the Coast. Card data and images used by Scryve are provided through Scryfall. Scryve is not affiliated with Wizards of the Coast or Scryfall.",
        },
      ],
    },
    {
      heading: "Yu-Gi-Oh!",
      blocks: [
        {
          type: "paragraph",
          text: "Yu-Gi-Oh!, card names, card artwork, and related marks remain property of their respective owners. Card data used by Scryve is provided through YGOPRODeck. Scryve is not affiliated with or endorsed by Konami or YGOPRODeck.",
        },
      ],
    },
    {
      heading: "Pokémon Trading Card Game",
      blocks: [
        {
          type: "paragraph",
          text: "Pokémon, card names, card artwork, characters, and related marks remain property of Nintendo, Creatures, GAME FREAK, The Pokémon Company, and their respective owners. Card data used by Scryve is provided through TCGdex. Tournament deck data is provided through Limitless. Scryve is not affiliated with or endorsed by those organizations.",
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
