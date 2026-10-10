export type DeckSection = { readonly id: string; readonly label: string }

export type CounterDefinition = {
  readonly label: string
  readonly heading: string
  readonly singular: string
  readonly plural: string
  readonly defaultValue: number
  readonly presets: readonly number[]
  readonly tapStep: number
  readonly longPressStep?: number
  readonly quickAdjustments: readonly [number, number]
  readonly scrubStep: number
  readonly scrubSteps: number
  /** why: "down" counters (Pokémon prizes) count toward zero, so reaching zero wins instead of loses. */
  readonly direction: "open" | "down"
  readonly maxStartingValue: number
}

export type FormatDefinition = {
  readonly id: string
  readonly label: string
  readonly blurb?: string
  readonly sections: readonly DeckSection[]
  readonly startingValue?: number
  readonly multiplayerStartingValue?: number
  readonly hasCommanderDamage?: boolean
  readonly singleton?: boolean
}

export const CAPABILITY_KEYS = [
  "integration",
  "cardCatalog",
  "deckImport",
  "exampleDecks",
  "images",
  "playTracking",
  "aggregateMetagameStats",
] as const
export type CapabilityKey = (typeof CAPABILITY_KEYS)[number]
export type CapabilityRelease = "enabled" | "permission_required" | "disabled"

export type Capability = {
  readonly technical: "available" | "unavailable"
  readonly release: CapabilityRelease
  readonly provider?: string
  readonly note?: string
}

export type IntegrationDefinition = {
  readonly identityNamespace: string
  readonly capabilities: Readonly<Record<CapabilityKey, Capability>>
  readonly rights: {
    readonly review: "reviewed" | "permission_pending" | "blocked"
    readonly basis: "fan_policy" | "fair_use" | "explicit_license" | "publisher_api" | "unknown"
    readonly imageUse: "licensed" | "functional_card_context" | "text_only" | "none"
    readonly requiredNotices: readonly string[]
  }
}

/** why: an in-game counter beside the main one, like poison or commander tax, that each player tracks. */
export type TableCounterDefinition = {
  readonly id: string
  readonly label: string
  readonly step: number
  readonly max: number
  /** why: reaching this count loses the game (10 poison, Comprehensive Rules 104.3d). */
  readonly losesAt?: number
  /** why: commander tax only exists where a command zone does. */
  readonly commandZoneOnly?: boolean
}

/** why: a designation is held by at most one player; taking it moves it from whoever had it. */
export type DesignationDefinition = { readonly id: string; readonly label: string }

export type PokemonBoardDefinition = { readonly benchSize: number; readonly damageStep: number }

export type TableDefinition = {
  readonly counters: readonly TableCounterDefinition[]
  readonly designations: readonly DesignationDefinition[]
  /** why: Pokémon tracks HP and damage per Pokémon in play, and a knockout moves the opponent's prize counter. */
  readonly pokemon?: PokemonBoardDefinition
}

export type SystemDefinition = {
  readonly label: string
  readonly shortLabel: string
  readonly available: boolean
  /** why: deck creation starts Magic in Commander while a new game starts in Standard. */
  readonly defaultFormat: { readonly deck: string; readonly play: string }
  readonly counter: CounterDefinition
  readonly formats: readonly FormatDefinition[]
  readonly table: TableDefinition
  readonly integration: IntegrationDefinition
}

function available<const Provider extends string>(provider: Provider, note?: string) {
  return {
    technical: "available",
    release: "enabled",
    provider,
    ...(note ? { note } : {}),
  } as const
}

const MTG_COMMAND_ZONE_SECTIONS = [
  { id: "commander", label: "Commander" },
  { id: "main", label: "Main deck" },
  { id: "sideboard", label: "Sideboard" },
] as const

const MTG_CONSTRUCTED_SECTIONS = [
  { id: "main", label: "Main deck" },
  { id: "sideboard", label: "Sideboard" },
] as const

const YUGIOH_SECTIONS = [
  { id: "main", label: "Main Deck" },
  { id: "extra", label: "Extra Deck" },
  { id: "side", label: "Side Deck" },
] as const

const POKEMON_SECTIONS = [{ id: "main", label: "Deck" }] as const

export const SYSTEM_IDS = ["mtg", "ygo", "pokemon"] as const
export type SystemId = (typeof SYSTEM_IDS)[number]

export const SYSTEMS = {
  mtg: {
    label: "Magic: The Gathering",
    shortLabel: "Magic",
    available: true,
    defaultFormat: { deck: "commander", play: "standard" },
    counter: {
      label: "life",
      heading: "Life",
      singular: "life",
      plural: "life",
      defaultValue: 20,
      presets: [20, 30, 40],
      tapStep: 1,
      quickAdjustments: [10, 5],
      scrubStep: 1,
      scrubSteps: 20,
      direction: "open",
      maxStartingValue: 999,
    },
    formats: [
      {
        id: "commander",
        label: "Commander",
        blurb: "100 cards, singleton",
        sections: MTG_COMMAND_ZONE_SECTIONS,
        startingValue: 40,
        hasCommanderDamage: true,
        singleton: true,
      },
      {
        id: "standard",
        label: "Standard",
        blurb: "Recent sets",
        sections: MTG_CONSTRUCTED_SECTIONS,
      },
      {
        id: "pioneer",
        label: "Pioneer",
        blurb: "Return to Ravnica forward",
        sections: MTG_CONSTRUCTED_SECTIONS,
      },
      {
        id: "modern",
        label: "Modern",
        blurb: "8th Edition forward",
        sections: MTG_CONSTRUCTED_SECTIONS,
      },
      {
        id: "legacy",
        label: "Legacy",
        blurb: "Nearly every set",
        sections: MTG_CONSTRUCTED_SECTIONS,
      },
      {
        id: "vintage",
        label: "Vintage",
        blurb: "Restricted list",
        sections: MTG_CONSTRUCTED_SECTIONS,
      },
      { id: "pauper", label: "Pauper", blurb: "Commons only", sections: MTG_CONSTRUCTED_SECTIONS },
      {
        id: "brawl",
        label: "Brawl",
        blurb: "60 cards, singleton",
        sections: MTG_COMMAND_ZONE_SECTIONS,
        // why: Comprehensive Rules 903.12: Brawl starts at 25 (30 multiplayer) and skips the 21 commander damage loss.
        startingValue: 25,
        multiplayerStartingValue: 30,
        hasCommanderDamage: false,
        singleton: true,
      },
      {
        id: "limited",
        label: "Limited",
        blurb: "Draft and sealed",
        sections: MTG_CONSTRUCTED_SECTIONS,
      },
      {
        id: "constructed",
        label: "Constructed",
        blurb: "Anything else",
        sections: MTG_CONSTRUCTED_SECTIONS,
      },
    ],
    table: {
      counters: [
        { id: "poison", label: "Poison", step: 1, max: 99, losesAt: 10 },
        { id: "commanderTax", label: "Commander tax", step: 2, max: 98, commandZoneOnly: true },
      ],
      designations: [
        { id: "monarch", label: "Monarch" },
        { id: "initiative", label: "Initiative" },
      ],
    },
    integration: {
      identityNamespace: "scryfall-oracle",
      capabilities: {
        integration: available("scryve"),
        cardCatalog: available("scryfall"),
        deckImport: available("scryfall"),
        exampleDecks: available("mtgjson"),
        images: available("scryfall", "Functional card context only."),
        playTracking: available("scryve"),
        aggregateMetagameStats: available("scryve"),
      },
      rights: {
        review: "reviewed",
        basis: "fan_policy",
        imageUse: "functional_card_context",
        requiredNotices: ["Magic: The Gathering is property of Wizards of the Coast."],
      },
    },
  },
  ygo: {
    label: "Yu-Gi-Oh!",
    shortLabel: "Yu-Gi-Oh!",
    available: true,
    defaultFormat: { deck: "advanced", play: "advanced" },
    counter: {
      label: "Life Points",
      heading: "Life Points",
      singular: "Life Point",
      plural: "Life Points",
      defaultValue: 8000,
      presets: [8000],
      tapStep: 100,
      quickAdjustments: [1000, 50],
      scrubStep: 100,
      scrubSteps: 80,
      longPressStep: 1000,
      direction: "open",
      maxStartingValue: 999_999,
    },
    formats: [
      { id: "advanced", label: "Advanced", sections: YUGIOH_SECTIONS },
      { id: "traditional", label: "Traditional", sections: YUGIOH_SECTIONS },
      { id: "rush", label: "Rush Duel", sections: YUGIOH_SECTIONS },
    ],
    table: { counters: [], designations: [] },
    integration: {
      identityNamespace: "ygoprodeck-card",
      capabilities: {
        integration: available("scryve"),
        cardCatalog: available("ygoprodeck", "Card metadata is cached in Convex."),
        deckImport: available("ygoprodeck"),
        exampleDecks: available("ygoprodeck-decks", "Cleaned Top Decks only."),
        images: available("cloudflare-r2", "Functional card context through Scryve's mirror."),
        playTracking: available("scryve"),
        aggregateMetagameStats: available("scryve"),
      },
      rights: {
        review: "reviewed",
        basis: "fair_use",
        imageUse: "functional_card_context",
        requiredNotices: [
          "Yu-Gi-Oh! and related card content remain property of their respective owners.",
        ],
      },
    },
  },
  pokemon: {
    label: "Pokémon TCG",
    shortLabel: "Pokémon",
    available: true,
    defaultFormat: { deck: "standard", play: "standard" },
    counter: {
      label: "Prize cards",
      heading: "Prize cards",
      singular: "Prize card",
      plural: "Prize cards",
      defaultValue: 6,
      presets: [6],
      tapStep: 1,
      quickAdjustments: [2, 1],
      scrubStep: 1,
      scrubSteps: 20,
      direction: "down",
      maxStartingValue: 99,
    },
    formats: [
      { id: "standard", label: "Standard", sections: POKEMON_SECTIONS },
      { id: "expanded", label: "Expanded", sections: POKEMON_SECTIONS },
      { id: "unlimited", label: "Unlimited", sections: POKEMON_SECTIONS },
    ],
    table: { counters: [], designations: [], pokemon: { benchSize: 5, damageStep: 10 } },
    integration: {
      identityNamespace: "tcgdex-card",
      capabilities: {
        integration: available("scryve"),
        cardCatalog: available("tcgdex"),
        deckImport: available("tcgdex"),
        exampleDecks: available("limitless", "Cleaned tournament deck data only."),
        images: available("tcgdex", "Functional card context only."),
        playTracking: available("scryve"),
        aggregateMetagameStats: available("scryve"),
      },
      rights: {
        review: "reviewed",
        basis: "fair_use",
        imageUse: "functional_card_context",
        requiredNotices: [
          "Pokémon, card artwork, and related marks remain property of their respective owners.",
        ],
      },
    },
  },
} as const satisfies Record<SystemId, SystemDefinition>

export type FormatId<System extends SystemId = SystemId> =
  (typeof SYSTEMS)[System]["formats"][number]["id"]
export type CatalogProvider =
  (typeof SYSTEMS)[SystemId]["integration"]["capabilities"]["cardCatalog"]["provider"]
