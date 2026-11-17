const systems = {
  // ja: Game system means the game: ゲーム未設定. Never システム.
  // fr: "System" is the game (Magic, Pokémon…): say jeu, never système (Aucun jeu; salon sans jeu choisi).
  noSystem: "No system",
  // A game's short name, as its players know it in your language.
  gameName: {
    mtg: "Magic",
    ygo: "Yu-Gi-Oh!",
    pokemon: "Pokémon",
    lorcana: "Lorcana",
    fab: "FaB",
    riftbound: "Riftbound",
  },
  // An official Planechase or Archenemy deck's name. Use the name printed on the product in your language; keep the English name if the product was only sold in English.
  modeDeck: {
    "pc09-elemental-thunder": "Elemental Thunder",
    "pc09-metallic-dreams": "Metallic Dreams",
    "pc09-strike-force": "Strike Force",
    "pc09-zombie-empire": "Zombie Empire",
    "pc12-chaos-reigns": "Chaos Reigns",
    "pc12-night-of-the-ninja": "Night of the Ninja",
    "pc12-primordial-hunger": "Primordial Hunger",
    "pc12-savage-auras": "Savage Auras",
    "moc-call-for-backup": "Call for Backup",
    "moc-cavalry-charge": "Cavalry Charge",
    "moc-divine-convocation": "Divine Convocation",
    "moc-growing-threat": "Growing Threat",
    "moc-tinker-time": "Tinker Time",
    "who-blast-from-the-past": "Blast from the Past",
    "who-masters-of-evil": "Masters of Evil",
    "who-paradox-power": "Paradox Power",
    "who-timey-wimey": "Timey-Wimey",
    "arc-assemble-the-doomsday-machine": "Assemble the Doomsday Machine",
    "arc-bring-about-the-undead-apocalypse": "Bring About the Undead Apocalypse",
    "arc-scorch-the-world-with-dragonfire": "Scorch the World with Dragonfire",
    "arc-trample-civilization-underfoot": "Trample Civilization Underfoot",
    "e01-archenemy-nicol-bolas": "Archenemy: Nicol Bolas",
  },
  // The product a Planechase or Archenemy deck came in. Use its name in your language only if it was sold in your language.
  modeProduct: {
    pc09: "Planechase ({{year}})",
    pc12: "Planechase {{year}}",
    moc: "March of the Machine Commander",
    who: "Doctor Who Commander",
    arc: "Archenemy ({{year}})",
    e01: "Archenemy: Nicol Bolas",
  },
  // A Riftbound domain, one of the six card colors. Use the official name printed on cards in your language; where Riftbound isn't sold in your language, translate the word naturally.
  // fr: Riot's official French names: Fureur, Calme, Esprit, Corps, Chaos, Ordre.
  // hi: Transliterate as players say them: फ़्यूरी, कॉम, माइंड, बॉडी, कैओस, ऑर्डर. Never काम, which reads as 'work'.
  // ko: Mind is 정신, not 지혜.
  domain: {
    Fury: "Fury",
    Calm: "Calm",
    Mind: "Mind",
    Body: "Body",
    Chaos: "Chaos",
    Order: "Order",
  },
  // Magic supertypes and card types, as printed on cards in your language.
  cardType: {
    Legendary: "Legendary",
    Basic: "Basic",
    Snow: "Snow",
    Creature: "Creature",
    Instant: "Instant",
    Sorcery: "Sorcery",
    Artifact: "Artifact",
    Enchantment: "Enchantment",
    Planeswalker: "Planeswalker",
    Land: "Land",
    Battle: "Battle",
  },
  // A format's name, as its players know it in your language.
  formatName: {
    mtg: {
      commander: "Commander",
      standard: "Standard",
      pioneer: "Pioneer",
      modern: "Modern",
      legacy: "Legacy",
      vintage: "Vintage",
      pauper: "Pauper",
      brawl: "Brawl",
      limited: "Limited",
      constructed: "Constructed",
    },
    ygo: {
      advanced: "Advanced",
      traditional: "Traditional",
      rush: "Rush Duel",
      speed: "Speed Duel",
    },
    pokemon: {
      standard: "Standard",
      expanded: "Expanded",
      unlimited: "Unlimited",
    },
    lorcana: {
      core: "Core Constructed",
      infinity: "Infinity Constructed",
    },
    fab: {
      cc: "Classic Constructed",
      blitz: "Blitz",
      silverAge: "Silver Age",
      ll: "Living Legend",
      upf: "Ultimate Pit Fight",
    },
    riftbound: {
      constructed: "Constructed",
    },
  },
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
    none: "Starting life must be a whole number from {{min}} to {{max}}.",
    mtg: "Starting life must be a whole number from {{min}} to {{max}}.",
    ygo: "Starting Life Points must be a whole number from {{min}} to {{max}}.",
    pokemon: "Starting Prize cards must be a whole number from {{min}} to {{max}}.",
    lorcana: "Starting lore must be a whole number from {{min}} to {{max}}.",
    fab: "Starting life must be a whole number from {{min}} to {{max}}.",
    riftbound: "Starting points must be a whole number from {{min}} to {{max}}.",
  },
  tableItem: {
    poison: "Poison",
    // Magic: energy counters a player gains and spends. Use Magic's official term.
    energy: "Energy",
    // Magic: experience counters a player gains. Use Magic's official term.
    experience: "Experience",
    // Riftbound: experience points a player earns. Use Riftbound's official term or abbreviation.
    // ar: Riftbound experience points. Write "نقاط الخبرة", not XP.
    xp: "XP",
    commanderTax: "Commander tax",
    monarch: "Monarch",
    initiative: "Initiative",
    // Flesh and Blood: a hero is marked until an opponent's source hits them.
    marked: "Marked",
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
    // ar: Riftbound deck section. Write "الأسطورة", the same word the deck warnings use.
    // ko: Riot's Korean term: '전설'.
    legend: "Legend",
    // Riftbound: the champion unit that starts the game on the table.
    // ar: Riftbound deck section. Write "البطل المختار"; deck warnings call the card وحدة بطل.
    // ko: Riot's Korean term: '선발 챔피언'.
    champion: "Chosen Champion",
    // ko: Riot's Korean term: '전장'. 배틀 필드 is Pokémon's Active Spot.
    battlefields: "Battlefields",
    runes: "Rune deck",
    main: {
      // fr: Magic main deck: "Deck principal" ("Deck principal d’origine"), never Main Deck.
      mtg: "Main deck",
      ygo: "Main Deck",
      pokemon: "Deck",
      lorcana: "Deck",
      fab: "Deck",
      // ko: Riot's Korean term: '주 덱'.
      riftbound: "Main deck",
    },
  },
  // Headings in Magic card search filters.
  cardFilter: {
    // Heading over the formats a searched card must be legal in.
    // hi: Format legality: “इनमें लीगल”, not मान्य.
    format: "Legal in",
    // Heading over card types (Creature, Instant) and supertypes (Legendary, Basic, Snow).
    type: "Type",
    supertype: "Supertype",
    // Heading over subtypes such as Elf, Warrior, Aura or Equipment.
    subtype: "Subtype",
    manaValue: "Mana value",
    // Heading over steppers for how many of each colored mana symbol a card's cost has at least.
    manaCost: "Mana cost",
    keyword: "Keywords",
    power: "Power",
    toughness: "Toughness",
  },
  formatBlurb: {
    mtg: {
      commander: "{{cards}} cards, singleton",
      // ar: "Sets" are printed card sets: "التوسعات الحديثة". Never المجموعات, the deck word.
      standard: "Recent sets",
      // hi: Set name in Devanagari: “रिटर्न टू रैवनिका से आगे”.
      pioneer: "Return to Ravnica forward",
      // ar: Eighth Edition is a Magic set. Write "من الإصدار الثامن فصاعدًا", no digits or Latin.
      // hi: “8वें एडिशन से आगे”.
      modern: "8th Edition forward",
      // ar: "Sets" are printed card sets: "كل التوسعات تقريبًا". Never المجموعات, the deck word.
      legacy: "Nearly every set",
      vintage: "Restricted list",
      pauper: "Commons only",
      brawl: "{{cards}} cards, singleton",
      // ar: Write the two Limited formats in Arabic script: "درافت وسيلد".
      limited: "Draft and sealed",
      constructed: "Anything else",
    },
    fab: {
      // {{cards}} is a minimum deck size such as "60+". {{copies}} is the most copies of one card.
      cc: "{{cards, orMore}} cards, {{copies}} copies",
      blitz: "Young hero, {{cards}} cards",
      silverAge: "Commons and rares",
      ll: "Legends allowed",
      upf: "Multiplayer",
    },
    riftbound: {
      // {{copies}} is the most copies of one card.
      constructed: "{{cards}} cards, {{copies}} copies",
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
    // ko: Counts changes, not points: '점수 변경 {{count}}회', like the other games.
    // ja: A count of changes, like the other games: ポイント変動{{count}}回.
    riftbound_other: "{{count}} point changes",
  },
  // Pokémon only: no Prize cards taken yet.
  noneTaken: "no prizes taken",
  // Pokémon only: Prize cards the player has taken so far. Not damage.
  taken_one: "{{count}} prize taken",
  taken_other: "{{count}} prizes taken",
  // A counter back at its starting value: unchanged, not a tie.
  even: "unchanged",
  fromStart: "{{delta, signed}} from start",
}

export default systems
