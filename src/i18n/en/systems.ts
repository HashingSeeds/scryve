const systems = {
  noSystem: "No system",
  counterHeading: {
    none: "Life",
    mtg: "Life",
    ygo: "Life Points",
    pokemon: "Prize cards",
    lorcana: "Lore",
    fab: "Life",
    riftbound: "Points",
  },
  // Lowercase noun that follows a number in other strings, as in "add 5 life".
  counterLabel: {
    none: "life",
    mtg: "life",
    ygo: "Life Points",
    pokemon: "Prize cards",
    lorcana: "lore",
    fab: "life",
    riftbound: "points",
  },
  startingValueRange: {
    none: "Starting life must be a whole number from 1 to {{max}}.",
    mtg: "Starting life must be a whole number from 1 to {{max}}.",
    ygo: "Starting Life Points must be a whole number from 1 to {{max}}.",
    pokemon: "Starting Prize cards must be a whole number from 1 to {{max}}.",
    lorcana: "Starting lore must be a whole number from 0 to {{max}}.",
    fab: "Starting life must be a whole number from 1 to {{max}}.",
    riftbound: "Starting points must be a whole number from 0 to {{max}}.",
  },
  tableItem: {
    poison: "Poison",
    commanderTax: "Commander tax",
    monarch: "Monarch",
    initiative: "Initiative",
  },
  // Shorter name shown where the full name does not fit, such as narrow counter menus.
  tableItemShort: {
    commanderTax: "Tax",
  },
  section: {
    // Deck section holding the commander card, not the format.
    commander: "Commander",
    sideboard: "Sideboard",
    extra: "Extra Deck",
    side: "Side Deck",
    hero: "Hero",
    arena: "Arena",
    // Riftbound: the deck's Legend card, which sets its two domains.
    legend: "Legend",
    // Riftbound: the champion unit that starts the game on the table.
    champion: "Chosen Champion",
    battlefields: "Battlefields",
    runes: "Rune deck",
    main: {
      mtg: "Main deck",
      ygo: "Main Deck",
      pokemon: "Deck",
      lorcana: "Deck",
      fab: "Deck",
      riftbound: "Main deck",
    },
  },
  formatBlurb: {
    mtg: {
      commander: "100 cards, singleton",
      standard: "Recent sets",
      pioneer: "Return to Ravnica forward",
      modern: "8th Edition forward",
      legacy: "Nearly every set",
      vintage: "Restricted list",
      pauper: "Commons only",
      brawl: "60 cards, singleton",
      limited: "Draft and sealed",
      constructed: "Anything else",
    },
    fab: {
      cc: "60+ cards, 3 copies",
      blitz: "Young hero, 40 cards",
      silverAge: "Commons and rares",
      ll: "Legends allowed",
      upf: "Multiplayer",
    },
    riftbound: {
      constructed: "40 cards, 3 copies",
    },
  },
  counterValue: {
    none_one: "{{count}} life",
    none_other: "{{count}} life",
    mtg_one: "{{count}} life",
    mtg_other: "{{count}} life",
    ygo_one: "{{count}} Life Point",
    ygo_other: "{{count}} Life Points",
    pokemon_one: "{{count}} Prize card",
    pokemon_other: "{{count}} Prize cards",
    lorcana_one: "{{count}} lore",
    lorcana_other: "{{count}} lore",
    fab_one: "{{count}} life",
    fab_other: "{{count}} life",
    riftbound_one: "{{count}} point",
    riftbound_other: "{{count}} points",
  },
  counterChange: {
    none_one: "{{count}} life change",
    none_other: "{{count}} life changes",
    mtg_one: "{{count}} life change",
    mtg_other: "{{count}} life changes",
    ygo_one: "{{count}} life point change",
    ygo_other: "{{count}} life points changes",
    pokemon_one: "{{count}} prize card change",
    pokemon_other: "{{count}} prize cards changes",
    lorcana_one: "{{count}} lore change",
    lorcana_other: "{{count}} lore changes",
    fab_one: "{{count}} life change",
    fab_other: "{{count}} life changes",
    riftbound_one: "{{count}} point change",
    riftbound_other: "{{count}} point changes",
  },
  // Pokémon only: no Prize cards taken yet.
  noneTaken: "no prizes taken",
  // Pokémon only: Prize cards the player has taken so far. Not damage.
  taken: "{{amount}} prizes taken",
  // A counter back at its starting value: unchanged, not a tie.
  even: "unchanged",
  fromStart: "{{delta}} from start",
}

export default systems
