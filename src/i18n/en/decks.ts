const decks = {
  cardCount_one: "{{count}} card",
  cardCount_other: "{{count}} cards",
  // A pasted deck list line the import could not read, shown in quotes. Use your language's quotation marks.
  importProblemLine: '"{{line}}"',
  // A deck list row read aloud, as in "4× Lightning Bolt".
  cardQuantity: "{{quantity}}× {{card}}",
  saving: "Saving…",
  deleting: "Deleting…",
  hiddenNameWarning: 'Other players will see "{{hiddenName}}" instead.',
  numberedVersion: "Version {{number}}",
  // The name of a deck's newest version until the player renames it.
  currentVersion: "Current",
  record: {
    noGames: "No games yet",
    // A win rate out of a number of games, such as "53% of 17".
    winRate: "{{rate, percent}} of {{games}}",
  },
  stats: {
    title: "Deck stats",
    compare: "Compare",
    // hi: “{{count}} से कम नतीजों का सैंपल छोटा होता है।”
    smallSample: "Under {{count}} results is a small sample.",
    emptyHint: "Play a game with this deck, or add a match result on its page.",
    ofGames: "of {{count}}",
    gameCount_one: "{{count}} game",
    gameCount_other: "{{count}} games",
    // {{expected}} is the win rate luck alone gives at this table size.
    // ja: "chance" is the win rate pure chance gives (one in pod size), not 期待値: {{podSize}}人対戦で{{rate, percent}} · 偶然なら{{expected, percent}}.
    // fr: {{expected}} is the win rate pure luck gives at this table size (25 % at 4 players), not this deck’s odds: "… · au hasard : {{expected, percent}}".
    chance: "{{rate, percent}} in {{podSize}}-player games · {{expected, percent}} by chance",
    // ja: A confidence range, not a forecast: 推定{{low, percent}}〜{{high, percent}}. Never 予想.
    likely: "Likely {{low, percent}} to {{high, percent}}",
    lists: "Lists",
    turnOrder: "Turn order",
    wentFirst: "Went first",
    notFirst: "Not first",
    turnOrderNotTracked: "Turn order not tracked",
    // Stats grouped by how many cards the player kept in their opening hand after mulligans.
    openingHand: "Opening hand",
    // ar: Opening hand size kept: "الاحتفاظ بـ{{count}}".
    keptHand: "Kept {{count}}",
    // {{value}} is an average with one decimal, as in "0.4 mulligans per game".
    mulligansPerGame: "{{value}} mulligans per game",
    podSize: "Pod size",
    sources: "Source",
    current: "Current",
    moreChanges: "{{count}} more",
    // A card added or cut between lists, as in "+2 Lightning Bolt". {{change}} is a signed count.
    cardChange: "{{change}} {{card}}",
    notTracked: "Not tracked",
    // fr: French date range: "Du {{first}} au {{last}}".
    dateSpan: "{{first}} to {{last}}",
    players_one: "{{count}} player",
    players_other: "{{count}} players",
    unknownPod: "Pod size not tracked",
    opponentsMissing: "Opponents not tracked",
    moreGames: "More games",
    record: "Record",
    winRate: "Win rate",
    cardChanges: "Card changes",
    missingLists: "One or both lists are not on this device.",
    noChanges: "No card changes.",
    comparePro: "Compare lists with Scryve Pro.",
    unavailable: "Stats unavailable.",
    signIn: "Sign in to see deck stats",
    viewStats: "View deck stats",
    onDeviceLabel: "{{name}}, on this device",
    limited: "Breakdowns cover the latest {{count}} results.",
    compareList: "List",
    compareWith: "Compared with",
    // hi: Hindi has no one-letter form; use the full word: “जीत”, never जी.
    winLetter: "W",
    // hi: Use the full word: “हार”, never हा.
    lossLetter: "L",
    // hi: Use the full word: “ड्रॉ”.
    drawLetter: "D",
    unknownLetter: "?",
    datesMissing: "Dates not tracked",
    loading: "Loading stats…",
    snapshotFailed: "Could not load lists on this device.",
    manual: "Manual",
    all: "All",
    games: "Games",
    matchesRecord: "Matches {{record}}",
    noResults: "No results yet",
  },
  commander: {
    multipleUnsupported: "Changing decks with multiple commanders is not supported yet.",
    chooseCardInDeck: "Choose a card already in this deck.",
    ineligible: "This card cannot be a commander.",
    eligibilityUnchecked: "Commander eligibility has not been checked for this card.",
    banned: "This card is banned in Commander.",
    legalityUnconfirmed: "Commander legality has not been confirmed for this card.",
    chooseColor: "Choose a color for this commander.",
    pairUnchecked: "Can't check this pair until your current commander's details load.",
    copyLimit: "This change would exceed the {{limit}}-copy limit for a card entry.",
    detailsMissing:
      "Some card details are missing. Deck color identity has not been fully checked.",
    duplicateCommander: "Another copy of this commander remains in the deck.",
    colorIdentityConflict: "Outside this commander's color identity: {{names}}.",
    colorIdentityConflictMore_one:
      "Outside this commander's color identity: {{names}} and {{count}} more.",
    colorIdentityConflictMore_other:
      "Outside this commander's color identity: {{names}} and {{count}} more.",
  },
  draft: {
    // ar: The limit is on copies of one card: "الحد الأقصى لنسخ البطاقة الواحدة: {{limit}}."
    // ja: Players say 同名カード: 同名カードは{{limit}}枚までです。
    copyLimit: "A card can have at most {{limit}} copies.",
    entryLimit: "A deck can have at most {{limit}} entries.",
  },
  sync: {
    editFailed: "Could not sync this edit",
    cardChangesFailed: "Could not sync these card changes",
  },
  syncReason: {
    deckConflict: "Deck changed on another device. Choose which copy to keep.",
    deckRejected: "The server can't accept this edit. Discard it and edit again.",
    versionConflict: "Deck cards changed on another device. Choose which card list to keep.",
    versionQueueConflict: "An earlier card edit conflicted. Choose which card list to keep.",
    // hi: Discard is छोड़ें, as in deckRejected and versionRejected: “यह ऑफ़लाइन ड्राफ़्ट कभी सिंक नहीं हुआ। इसे छोड़ दें और वर्शन दोबारा बनाएँ।”
    draftUnsynced: "This offline draft was never synced. Discard it and create the version again.",
    versionRejected: "The server can't accept these changes. Discard them and edit again.",
  },
  conflict: {
    name: "Name",
    format: "Format",
    notes: "Notes",
    syncFailed: "This edit could not be synced. Try again or discard it.",
    later: "Later",
    keepWhichCards: "Keep which card list?",
    reviewCards: "Review saved card edits",
    deletedCards: "Deck deleted. Your card edits are saved on this device.",
    changedCards:
      "The card list changed on another device after you saved. Your edits are still saved on this device.",
    cardsSummary: "{{cards}} cards · {{entries}} entries",
    noCards: "No cards",
    // ar: The revision number of the account copy: "التعديل رقم {{revision}}". مراجعة means review.
    accountCopy: "Account copy: {{cards}} cards · {{entries}} entries · revision {{revision}}",
    keepMine: "Keep mine",
    retrySync: "Retry sync",
    // Button: keep the deck version saved in the account and drop this device's edit.
    keepAccount: "Keep account copy",
    discardLocal: "Discard local edit",
    saveCardsFailed: "Could not save your card changes",
    discardCardsFailed: "Could not discard local card edits",
    keepWhichVersion: "Keep which copy?",
    reviewLocal: "Review local edit",
    thisDevice: "This device",
    account: "Account",
    empty: "Empty",
    localValue: "{{field}}, this device: {{value}}",
    accountValue: "{{field}}, account: {{value}}",
    bothMatch: "Both versions match.",
    deletedEdit: "Deck deleted. Your edit is saved on this device.",
    nameLine: "Name: {{name}}",
    formatLine: "Format: {{format}}",
    noteLine: "Note: {{note}}",
    noNote: "No note",
    saveFailed: "Could not save your changes",
    discardFailed: "Could not discard local edit",
  },
  detail: {
    notFound: "Deck not found",
    unavailable: "Deck unavailable",
    loading: "Loading deck",
    maybeDeleted: "This deck may have been deleted.",
    newList: "New list. Earlier results stay with the old one.",
    loadFailed: "Could not load this deck.",
    offlineCard: "You’re offline. Cards already in your decks can be added.",
    saveFailed: "Could not save deck",
    versionLimit_one: "This deck holds up to {{count}} version. Delete one to add another.",
    versionLimit_other: "This deck holds up to {{count}} versions. Delete one to add another.",
    cardsNotSaved: "Saved cards are not available. Reconnect or create an empty version.",
    createVersionFailed: "Could not create version",
    reconnectForVersions: "Reconnect to create versions.",
    updateVersionFailed: "Could not update version",
    deleteVersionFailed: "Could not delete version",
    updateFailed: "Could not update deck",
    deleteFailed: "Could not delete deck",
    reviewChanges: "Review changes",
    noOfflineCards: "No offline cards yet. Open cards online and they'll be available here.",
    newVersion: "New version",
    createVersion: "Create version",
    versionDetails: "Version details",
    versions: "Versions",
    // hi: “अभी नहीं खेला”.
    unplayed: "Unplayed",
    keepVersion: "Keep this version",
    deleteVersionTitle: "Delete this version?",
    deleteVersionBody:
      "Games already played with it keep their record, but the list will no longer be editable or selectable.",
    keepDeck: "Keep this deck",
    deleteDeckTitle: "Delete this deck?",
    keepEditing: "Keep editing",
    discardTitle: "Discard changes?",
    discardBody: "Your edits will be lost.",
    // Button that throws away unsaved edits. Must not read like Cancel.
    discard: "Discard",
  },
  guestStorage: {
    readFailed: "Unable to read guest decks.",
    malformed: "Stored guest deck is malformed; delete it explicitly first.",
    unsupported: "Stored guest deck is unsupported; delete it explicitly first.",
    saveFailed: "Unable to save guest deck.",
    deleteFailed: "Unable to delete guest deck.",
    deleteAllFailed: "Unable to delete guest decks.",
    invalid: "Guest deck payload is invalid.",
  },
  localSync: {
    pickTitle_one: "Choose {{count}} deck to sync",
    pickTitle_other: "Choose up to {{count}} decks to sync",
    pro: "Pro syncs up to {{premiumLimit}} decks and adds deck versions.",
    seePro: "See Pro",
    sync: "Sync",
    syncing: "Syncing…",
    addAsNew: "Add to your account as a new deck",
    addAsNewConfirm: "Add new deck",
    // A deck moved out of another account stays on this device when the player adds a separate copy.
    otherAccount:
      "This deck came from another account. Add a new deck with empty stats? You'll see it twice: synced and on this device.",
    failed: "Could not sync this deck. It is still saved on this device.",
    // fr: "Vous avez atteint la limite de decks synchronisés. Le deck reste enregistré sur cet appareil."
    limit_reached: "Your synced decks are full. The deck is still saved on this device.",
    version_limit:
      "This deck has more versions than your account keeps. Delete some on this device to sync.",
    versionLimit:
      "This deck has {{versions}} versions. Free accounts keep {{limit}}. Delete {{remove}} to sync.",
    conflict: "This deck changed on another device. It is still saved on this device.",
    kept_newer_edits: "This deck has newer edits. It is still saved on this device.",
  },
  cardDetails: {
    offline: "You're offline. Showing saved card info.",
    facesFailed: "Could not load both faces. Showing saved card info.",
    commanderRulesStale: "Commander rules could not be refreshed. Showing saved card info.",
    none: "No additional card details are available.",
    loadFailed: "Could not load card details",
  },
  actions: {
    close: "Close deck actions",
    nameAndFormat: "Name and format",
    moveToDevice: "Move to this device",
    sync: "Sync to account",
    share: "Share deck",
    stopSharing: "Stop sharing",
    delete: "Delete deck",
    // Shown under a blocked action while unsaved deck edits are open.
    saveFirst: "Save or discard your changes first.",
    // Shown under Move while edits made on this device are still uploading.
    editsSyncing: "Waiting for your changes to sync.",
  },
  settings: {
    close: "Close name and format",
    title: "Name and format",
    name: "Deck name",
    format: "Format",
    save: "Save changes",
  },
  versionDialog: {
    close: "Close version editor",
    name: "Version name",
    nameHelper: 'Something you will recognise later, like "vs Control" or "Budget swap".',
    notes: "Notes",
    notesHelper: "What changed, and what are you testing?",
    copyFrom: "Copy {{version}}",
    copyDetail: "Start from the current list",
    empty: "Start empty",
    emptyDetail: "Build this version from scratch",
    delete: "Delete version",
  },
  loading: {
    cards: "Cards",
  },
  filters: {
    remove: "Remove filter {{label}}",
    label: "Filters",
    withCount: "Filters ({{count}})",
  },
  image: {
    loading: "Loading…",
    missing: "No image found",
    loadingLabel: "{{card}}: Loading image",
    missingLabel: "{{card}}: No image found",
  },
  colors: {
    white: "White",
    blue: "Blue",
    black: "Black",
    red: "Red",
    green: "Green",
    colorless: "Colorless",
    withChosen: "{{colors}} + chosen color",
    chooseColor: "Choose a color",
    identity: "Color identity: {{identity}}",
    identityBothFaces: "Color identity: {{identity}} · Both faces",
  },
  cardFocus: {
    close: "Close card details",
    // The front face of a double-faced card.
    front: "Front",
    // The back face of a double-faced card, not navigation.
    back: "Back",
    loadingDetails: "Loading details…",
    // Screen reader action that shows what a card's keyword ability (such as Flying) means.
    defineKeyword: "Define {{keyword}}",
    // Expands a keyword's definition to list its numbered Comprehensive Rules entries.
    showRules: "Show rules",
    // Hides a keyword's numbered Comprehensive Rules entries again.
    hideRules: "Hide rules",
    // Screen reader label for the button that closes a keyword's definition.
    closeKeyword: "Close definition",
    // Official rulings from Wizards of the Coast that clarify how this card works.
    rulings: "Rulings",
    loadingRulings: "Loading rulings…",
    noRulings: "No rulings for this card yet.",
    rulingsFailed: "Couldn't load rulings.",
    commanderColor: "Commander color",
    setCommander: "Set as commander",
    quantityIn: "{{quantity}}× in {{section}}",
    eligibilityUnverified: "Commander eligibility not yet verified.",
    ineligible: "This card cannot be a commander on its own.",
    notLegal: "This card is not legal in Commander.",
  },
  // Screen readers say these in place of the symbol icons in card rules text, e.g. "{T}: Add {G}." is read as "tap: Add green mana."
  cardSymbols: {
    // Flesh and Blood: the attack stat.
    power: "power",
    // Flesh and Blood: the block stat.
    defense: "defense",
    life: "life",
    // Flesh and Blood: resource points paid for costs.
    resource: "resource",
    // Flesh and Blood: a resource that Mystic cards produce.
    chi: "chi",
    // Flesh and Blood: a hero's hand size.
    // ja: Flesh and Blood players say 知性.
    intellect: "intellect",
    // Turn the card sideways to use it.
    tap: "tap",
    untap: "untap",
    // Flesh and Blood: a variable amount of resource points.
    variableResource: "X resource",
    white: "white mana",
    blue: "blue mana",
    black: "black mana",
    red: "red mana",
    green: "green mana",
    colorless: "colorless mana",
    // {{amount}} is a number or the letter X.
    // ko: Generic mana is 일반 마나: '일반 마나 {{amount}}'. Never 무색, which is colorless {C}.
    // ja: Generic mana is 不特定マナ (CR 107.4b), not 無色マナ, which is the {C} symbol: 不特定マナ{{amount}}.
    generic: "{{amount}} generic mana",
    energy: "energy",
    snow: "snow mana",
    // A hybrid cost paid with either kind of mana.
    either: "{{first}} or {{second}}",
    // A Phyrexian cost paid with mana or with life.
    orLife: "{{mana}} or {{life}} life",
    // Riftbound: an energy cost. {{amount}} is a number.
    energyAmount: "{{amount}} energy",
    // Riftbound: a unit's combat stat.
    might: "Might",
    // Riftbound: turn the card sideways to use it, like tapping.
    // ja: Riftbound has no Japanese edition; players say エグゾースト. Never 疲労.
    exhaust: "exhaust",
    // Riftbound: a power cost of one domain. {{domain}} is a domain name such as Fury or Calm, already translated.
    domainPower: "{{domain}} power",
    // Riftbound: a power cost payable with any domain.
    anyPower: "power of any domain",
    // Lorcana: the resource paid for costs, as in "pay 3 ink".
    ink: "ink",
    // Lorcana: points a character earns when it quests.
    lore: "lore",
    // Lorcana: a character's damage stat.
    // ja: Lorcana's official term: 攻撃力.
    strength: "strength",
    // Lorcana: a character's toughness stat.
    // ja: Lorcana's official term: 意志力. Never タフネス or 意思.
    willpower: "willpower",
    // Lorcana: turn the card sideways to use it, like tapping.
    // ja: Lorcana's official term: エグザート.
    exert: "exert",
    // Lorcana: the inkwell mark on cards that can be put into the inkwell.
    inkwell: "inkwell symbol",
  },
  cardRow: {
    remove: "Remove {{card}}",
    decrease: "Decrease {{card}}",
    increase: "Increase {{card}}",
    // ⇄ on a deck row: moves one copy between the main deck and the sideboard.
    move: "Move one {{card}} to {{section}}",
    changeCommander: "Change commander",
    chooseCommander: "Choose commander",
    change: "Change",
    choose: "Choose",
  },
  cardSearch: {
    title: "Add cards",
    // Title of the card lookup screen, opened without a deck.
    lookupTitle: "Cards",
    showCard: "Show {{card}}",
    searchLabel: "Search cards",
    placeholder: "Search by card name",
    addTo: "Add to",
    inDeck: "In this deck",
    checking: "Checking commander eligibility…",
    noEligible: "No eligible commanders in this deck.",
    cachedCards: "Cached cards",
    searchCached: "Search cached commanders by name.",
    searchScryfall: "Search Scryfall for a commander.",
    searching: "Searching…",
    offline: "You’re offline. Searching cards already in your decks.",
    offlineCardFile: "You’re offline. Searching the card list on this device.",
    offlineSyntax: "You’re offline. Some of these search terms need a connection.",
    preview: "Preview {{card}} as commander",
    fromCache: "From your cached decks · {{game}}",
    add: "+ Add",
    addCard: "Add {{card}} to deck",
    // Link beside "+ Add" on a search result that adds one copy to the sideboard instead of the main deck.
    side: "Side",
    addToSection: "Add {{card}} to {{section}}",
    // Under "In this deck": how many copies of a card the deck holds, and in which part, e.g. "2 in Main deck".
    inSection: "{{count}} in {{section}}",
    addAnother: "Add another {{card}}",
    added: "Added {{card}}.",
    noCached: "No cached cards match. Cards appear here after you add them online.",
    noResults: "No cards found.",
    dismissFilters: "Dismiss commander filters",
    // Heading in card search filters over the color buttons.
    colors: "Colors",
    colorMatch: "Color match",
    // Segment under "Color match": cards use only the picked colors, or fewer.
    // fr: Completes the set Au moins / Exactement: "Au plus".
    // es: Sits beside "Al menos" and "Exactamente"; must not end in a preposition. Use "Solo estos".
    withinColors: "Within",
    // Segment under "Color match": cards use all the picked colors and may add more.
    allowAdditional: "At least",
    // Segment under "Color match": cards use exactly the picked colors.
    exactColors: "Exactly",
    // Placeholder over a card filter's options; {{filter}} is the filter's name in lowercase, e.g. "keywords".
    searchFilter: "Search {{filter}}",
    // Heading in card search filters over the color buttons, which match a card's color identity.
    colorIdentity: "Color identity",
    // Pills after a picked number for a card stat like mana value or power, e.g. "3" then "Or less".
    orLess: "Or less",
    exactly: "Exactly",
    orMore: "Or more",
    clearAll: "Clear all",
    checkFailed: "Could not check all cards in this deck.",
    searchFailed: "Could not search cards. Check your connection and try again.",
    // Button beside the card search field that opens the camera to read a card's name.
    scanLabel: "Scan a card with the camera",
  },
  cardScan: {
    title: "Scan cards",
    looking: "Hold a card inside the frame",
    loading: "Loading card names…",
    // es: Camera prompt while scanning a card. Use "No la muevas".
    steady: "Hold steady",
    unsure: "Couldn't tell which card this is. Hold it flat and try again.",
    failed: "Could not read the card. Try again.",
    // Shown at the bottom of the scanner before any card has been added.
    empty: "Scanned cards are added to the deck and show here.",
    // How many cards this scanner session has added to the deck.
    addedCount_one: "{{count}} added",
    addedCount_other: "{{count}} added",
    // Scanned cards whose lookup failed and will be tried again shortly.
    // fr: A count of cards waiting to be tried again: "À réessayer : {{count}}".
    retryingCount: "{{count}} retrying",
    // Scanned cards that still failed after retrying and are not in the deck.
    failedCount_one: "{{count}} not added",
    failedCount_other: "{{count}} not added",
    // Button next to the last scanned card when the scanner picked the wrong one.
    // ko: '잘못된 카드'.
    wrongCard: "Wrong card",
    // Accessibility label for tapping the last scanned card to see every card scanned so far.
    review: "Review scanned cards",
    // Closes the list of scanned cards and goes back to the camera.
    keepScanning: "Keep scanning",
    // A scanned card's add status in the review list. Added cards show no status.
    state: {
      adding: "Adding",
      retrying: "Retrying",
      failed: "Not added",
    },
    whichCard: "Which card is it?",
    removeIt: "Remove it",
    addFailed: "Couldn't add the scanned cards. Check your connection.",
    // The scanner skipped a card this deck already holds, such as a second copy in Commander.
    // ar: Start in Arabic: "البطاقة {{card}} موجودة بالفعل في المجموعة".
    alreadyInDeck: "{{card}} is already in the deck",
    // Asked the first time a basic land is scanned. The answer is that land's total in the deck.
    howMany: "How many in the deck?",
    // Adds the chosen number of the scanned basic land.
    addLands: "Add",
    notFound: "Couldn't find {{card}}.",
    permission: "Scryve uses the camera to read card names. Photos stay on this device.",
    permissionDenied: "Camera access is denied. Enable it in system settings to scan cards.",
    allow: "Allow camera",
    openSettings: "Open settings",
    torch: "Light",
    handheld: "Handheld",
    bulk: "Bulk",
    setLock: "Set",
    setLockAny: "Any set",
    setLockTitle: "Lock scanner to a set",
    setLockPlaceholder: "Set code (e.g. FDN, CMM)",
    setLockClear: "Clear set lock",
    notInLockedSet: "{{card}} isn't in {{set}}.",
    nextCopy: "Next copy",
    changePrinting: "Printing",
    finish: {
      nonfoil: "Nonfoil",
      foil: "Foil",
      etched: "Etched",
    },
    condition: {
      NM: "NM",
      LP: "LP",
      MP: "MP",
      HP: "HP",
      DMG: "DMG",
    },
    sessionTotal: "Session {{total}}",
    buylistShort: "Buylist {{value}}",
    // Technical card detection details shown over the camera with "Stats for nerds" on. Keep labels very short.
    stats: {
      // {{state}} is one of the words below.
      outline: "Outline: {{state}}",
      // The card was found and outlined.
      found: "found",
      none: "none",
      // How hot the phone is. {{state}} is one of the four words below, coolest first.
      heat: "Heat: {{state}}",
      nominal: "normal",
      fair: "warm",
      serious: "hot",
      critical: "very hot",
      noRectangles: "No rectangles",
      // One detected rectangle: width over height, its share of the frame as a percent, then a verdict word below.
      rectangle: "{{aspect}} · {{share, percent}} · {{verdict}}",
      // A rectangle the scanner accepted as the card.
      accepted: "card",
      // Rejected because its shape is not a card's.
      shape: "shape",
      // Rejected because it is not centered in the frame.
      position: "off-center",
      // Rejected because it is too small to be the card.
      size: "too small",
    },
  },

  collection: {
    pickPrinting: "Choose printing",
    finishLabel: "Finish",
    conditionLabel: "Condition",
    noPrintings: "No printings cached yet.",
    scanSession: "Scan session",
    scanMore: "Scan more",
    moveToBinder: "Move to binder",
    buyOnTcgplayer: "Buy on TCGplayer",
    tcgplayer: "TCGplayer",
    cardKingdom: "Card Kingdom",
    cardKingdomBuylist: "CK Buylist",
    retailTotal: "Retail {{total}}",
    buylistTotal: "Buylist {{total}}",
    sortRecent: "Recent",
    sortValue: "Highest value",
    sortName: "Name",
    emptySession: "No cards scanned in this session yet.",
    movedToBinder_one: "Moved {{count}} entry.",
    movedToBinder_other: "Moved {{count}} entries.",
    mainLibrary: "Main library",
    pricesUpdated: "Prices synced",
    syncingPrices: "Syncing prices…",
    tabDecks: "Decks",
    tabCollection: "Collection",
    tabScans: "Scans",
    allCards: "All cards",
    binders: "Binders",
    newBinder: "New binder",
    binderNamePlaceholder: "Binder name",
    createBinder: "Create",
    deleteBinder: "Delete binder",
    newScanSession: "New scan",
    scanSessionName: "Scan {{date}}",
    trade: "Trade",
    importExport: "Import / Export",
    importTitle: "Import or export CSV",
    importPlaceholder: "Paste Moxfield, Archidekt, or CSV list…",
    importAction: "Import",
    exportCopy: "Copy CSV",
    exportCopied: "CSV copied",
    importedSummary: "Imported {{imported}} rows ({{skipped}} skipped).",
    addCard: "Add card",
    searchCards: "Search collection…",
    searchCatalogPlaceholder: "Card name to add…",
    emptyCollection: "Your local collection is empty. Scan cards, import a CSV, or add a card.",
    emptyScans: "No scan sessions yet. Tap New scan to start pricing a stack.",
    tradeTitle: "Trade calculator",
    tradeGive: "You give",
    tradeReceive: "You receive",
    tradeEven: "Even trade",
    tradeAhead: "You gain {{delta}}",
    tradeBehind: "You give {{delta}} more",
    tradeCommit: "Commit trade",
    tradeCommitted: "Trade saved to your collection.",
    tradeInsufficientStock: "Not enough copies of {{card}} in that condition.",
    tradeClear: "Clear",
    tradeScanGive: "Scan give",
    tradeScanReceive: "Scan receive",
    ownershipSummary: "Owned {{owned}} of {{total}}",
    ownershipMissing: "{{missing}} missing · {{cost}}",
    ownershipComplete: "You own every card in this deck",
    buyMissing: "Buy missing",
  },

  deckLimit: {
    countLabel: "{{used}} of {{limit}} synced decks",
    countLabelFree: "{{used}} of {{limit}} free synced decks",
    opensPro: "Opens Scryve Pro",
    close: "Close deck limit",
    unavailable: "Deck slots unavailable. Your draft is kept.",
    moveFailed: "Could not move this deck to this device.",
    // ja: The move did not happen and the deck stays synced: 別のデバイスで変更されたため、このデッキは同期されたままです。 Never まだ同期されています, which reads as syncing in progress.
    moveConflict: "This deck changed on another device, so it is still synced. Try again.",
    title: "Synced deck limit reached",
    proBody: "Pro accounts sync {{limit}} decks. Move a deck to this device to make room.",
    // ko: '무료 계정은 덱을 {{limit}}개까지 동기화합니다. Pro로 업그레이드하면 {{premiumLimit}}개까지 가능합니다. 또는 덱 하나를 이 기기로 옮겨 슬롯을 확보하세요.'
    freeBody:
      "Free accounts sync {{limit}} decks. Get Pro for {{premiumLimit}}, or move a deck to this device to make room.",
    // es: Use "Pásate a Pro", not "Mejorar a Pro".
    upgrade: "Upgrade to Pro",
    moveADeck: "Move a deck to this device",
    notNow: "Not now",
    proUnavailable: "Pro purchases are unavailable in this build.",
    decksFailed: "Your decks could not load.",
    confirmTitle: "Move {{name}} to this device?",
    moveBody: "It stops syncing to your other devices. Its stats are kept.",
    move: "Move",
    moving: "Moving…",
    loading: "Loading decks…",
    moveNamed: "Move {{name}} to this device",
  },
  deleteDeck: {
    body: "Past games keep their record of this deck, but it will no longer be available to pick or edit.",
  },
  deckView: {
    title: "Deck",
    editTitle: "Edit deck",
    guestTitle: "Local deck",
    details: "Deck details",
    // Card count under the deck name when it has a sideboard: main deck count, then sideboard count, as bare numbers, e.g. "60 + 15".
    cardCountWithSide: "{{main}} + {{side}}",
    // The deck version on screen: its number, then the name the player gave it.
    version: "Version {{number}} · {{name}}",
    // Shown beside the version name when a newer version of this deck exists.
    notLatest: "Not the latest",
    addMatch: "Add result",
    // The deck screen's two views: using the deck at the table, and changing its list.
    play: "Play",
    build: "Build",
    notesLabel: "Deck notes",
    notePlaceholder: "Add a note",
    cardsLoading: "Loading cards…",
    cardsUnavailable: "Card list unavailable offline.",
    noCards: "No cards yet. Add your first card below.",
    removed: "Removed {{card}}",
    savedOnDevice: "Saved on device",
    saved: "Saved",
    addCards: "+ Add cards",
  },
  // Deck building warnings shown above the card list. They never stop a save. Each says what is wrong, then how to fix it. Riftbound terms (Legend, Champion unit, Signature) and domain names (Fury, Calm, Mind, Body, Chaos, Order) follow the publisher's official wording.
  issues: {
    // {{sections}} is a deck section, or several joined with " + ". {{have}} is how many cards it holds, e.g. "Main deck: 38 of 40. Add 2."
    sizeUnder: "{{sections}}: {{have}} of {{target}}. Add {{diff}}.",
    // e.g. "Rune deck: 13 of 12. Remove 1."
    sizeOver: "{{sections}}: {{have}} of {{target}}. Remove {{diff}}.",
    sizeAtLeast: "{{sections}}: {{have}}, at least {{target}}. Add {{diff}}.",
    // e.g. "Sideboard: 12, at most 10. Remove 2."
    sizeAtMost: "{{sections}}: {{have}}, at most {{target}}. Remove {{diff}}.",
    // Too many copies of one card by name, e.g. "Ahri, Alluring has 4 copies. Remove 1 to get to 3."
    // ar: Card names are Latin, so start in Arabic and avoid a counted noun: "عدد نسخ البطاقة {{card}}: {{have}}. أزل {{diff}} ليصبح العدد {{max}}."
    copies: "{{card}} has {{have}} copies. Remove {{diff}} to get to {{max}}.",
    // A section where every card must have a different name, e.g. "Battlefields must all differ. Remove 1 Altar to Unity."
    // es: {{section}} is a plural section name of any gender. Use "Las cartas de {{section}} deben ser distintas. Quita {{diff}} de {{card}}."
    unique: "{{section}} must all differ. Remove {{diff}} {{card}}.",
    // {{domains}} and {{identity}} are domain names separated by commas, e.g. "Svellsongur is Calm, outside your Legend's Fury, Chaos. Remove it."
    // ar: Riftbound. Legend is الأسطورة. Start in Arabic: "البطاقة {{card}} من {{domains}}، خارج {{identity}} أسطورتك. أزلها."
    // hi: Legend is लेजेंड, as in systems:section.legend: “{{card}} {{domains}} है, जो आपके लेजेंड के डोमेन ({{identity}}) से बाहर है। इसे हटाएँ।”
    domain: "{{card}} is {{domains}}, outside your Legend's {{identity}}. Remove it.",
    // The Chosen Champion must be a Champion unit of the Legend's champion, e.g. "Darius, Trifarian isn't a Jinx Champion unit. Choose one that is."
    // ar: Riftbound. Champion unit is وحدة بطل. Start in Arabic: "البطاقة {{card}} ليست وحدة بطل من {{champion}}. اختر وحدة مناسبة."
    // hi: “{{card}} {{champion}} चैंपियन यूनिट नहीं है। सही चैंपियन यूनिट चुनें।”
    champion: "{{card}} isn't a {{champion}} Champion unit. Choose one that is.",
    // ar: Riftbound. Champion unit is وحدة بطل. Start in Arabic: "البطاقة {{card}} ليست وحدة بطل. اختر وحدة مناسبة."
    // hi: “{{card}} चैंपियन यूनिट नहीं है। सही चैंपियन यूनिट चुनें।”
    championUnit: "{{card}} isn't a Champion unit. Choose one that is.",
    // A deck holds at most 3 Signature cards in total.
    // ar: Riftbound Signature cards are بطاقات التوقيع. Use a label so any number reads: "بطاقات التوقيع: {{have}}، والحد الأقصى {{max}}. أزل {{diff}}."
    signatureCount: "{{have}} Signature cards, at most {{max}}. Remove {{diff}}.",
    // ar: Riftbound Signature card: بطاقة التوقيع. "البطاقة {{card}} هي بطاقة التوقيع لبطل آخر. أزلها."
    signatureChampion: "{{card}} is another champion's Signature card. Remove it.",
    // {{format}} is a format name, e.g. "Mana Crypt is banned in Commander. Remove it."
    banned: "{{card}} is banned in {{format}}. Remove it.",
    notLegal: "{{card}} isn't legal in {{format}}. Remove it.",
    // Magic color identity as color letters (W, U, B, R, G), e.g. "Lightning Bolt is R, outside your commander's WU. Remove it."
    colorIdentity: "{{card}} is {{colors}}, outside your commander's {{identity}}. Remove it.",
    // Stands in for {{identity}} when the commander has no colors.
    colorless: "colorless",
  },
  play: {
    // Heading over the deck's versions. The player picks the one they bring to their next games.
    // ar: Heading over the deck version picker: "الإصدار الذي ستلعب به".
    // ja: Heading over the versions; the player picks the one to use next: 使うバージョン. Never 持っていく.
    bringing: "Playing next",
    results: "Results",
    // A recent game's opponents, named by their commanders or decks, e.g. "vs Atraxa, Krenko".
    versus: "vs {{opponents}}",
    startGame: "Start a game",
    // ja: Not a literal "bring": 使うバージョンを変更できませんでした。
    bringFailed: "Couldn't change the version you'll play next.",
    // Where a recent game was played.
    source: {
      local: "Local",
      nearby: "Nearby",
      online: "Online",
    },
    // Heading over the cards swapped in and out for the match in progress.
    thisMatch: "This match",
    // hi: The saved main deck before sideboarding: “बिना बदलाव वाला मेन डेक”.
    // fr: Magic main deck: "Deck principal" ("Deck principal d’origine"), never Main Deck.
    asBuilt: "Main deck as built",
    // Under "Main deck as built", e.g. "60 cards · 15 in sideboard". {{cards}} is already counted, like "60 cards".
    asBuiltDetail: "{{cards}} · {{side}} in sideboard",
    // A card brought in from the sideboard (+2 Rest in Peace) or taken out of the main deck (−2 Searing Blaze) for this match.
    swapped: "{{count, signed}} {{card}}",
    // ar: The sideboard swaps reset: "تُلغى التبديلات عند انتهاء المواجهة، ولا تتغير قائمتك."
    resetsNote: "Resets when the match ends. Your list doesn't change.",
    // Button: undo every swap for this match and play the deck as built.
    reset: "Reset",
  },
  // Swapping cards between main deck and sideboard between games of a match. It never edits the saved deck.
  sideboard: {
    // Opens the swap sheet. Also the name of the deck action.
    open: "Sideboard",
    title: "Sideboard for this match",
    close: "Close sideboard",
    inFromSide: "In from sideboard",
    outOfMain: "Out of main",
    // Under a sideboard card, e.g. "1 of 2 in side".
    leftInSide: "{{left}} of {{total}} in side",
    // Under a main deck card, e.g. "3 of 4 left".
    leftInMain: "{{left}} of {{total}} left",
    short: "Main would have {{count}}. Take fewer out or bring more in.",
    apply: "Apply",
    more: "Swap one more {{card}}",
    fewer: "Swap one fewer {{card}}",
    // Offered between games of a match, before the next game starts.
    // fr: Adjust the sideboard before the next game: "Ajuster la réserve d’abord".
    first: "Sideboard first",
    // Under "Sideboard first", e.g. "Boros Burn · 15 in sideboard".
    firstDetail: "{{deck}} · {{side}} in sideboard",
    // Opens the swap sheet from "Sideboard first".
    openAction: "Open",
  },
  build: {
    // Opens card search to find a card in this deck or add a new one.
    find: "Find or add a card",
    // Short for the deck's average mana value, shown beside a small mana curve.
    average: "Avg",
    analysis: "Analysis",
    notes: "Notes",
    // Unsaved edits waiting in the draft bar.
    changes_one: "{{count}} change",
    changes_other: "{{count}} changes",
    group: {
      creatures: "Creatures",
      spells: "Spells",
      artifacts: "Artifacts",
      lands: "Lands",
      other: "Other",
    },
  },
  analysis: {
    incomplete: "{{count}} of {{size}} cards. Odds use the cards listed.",
    noCommander: "No commander chosen.",
    curve: "Mana curve",
    average: "Average {{value}}",
    lands: "Lands",
    // ja: {{modal}} counts modal double-faced cards that can be played as lands; players say 両面: {{lands}} + 両面{{modal}}.
    // fr: {{modal}} counts modal double-faced cards: "{{lands}} + {{modal}} cartes modales".
    landsWithModal: "{{lands}} + {{modal}} modal",
    suggested: "Suggested lands",
    range: "{{low}} to {{high}}",
    // es: Use "Ramp", what Spanish-speaking deck builders say.
    ramp: "Ramp",
    cheapDraw: "Cheap card draw",
    colors: "Colors",
    pips: "Pips",
    sources: "Lands",
    color: {
      W: "White",
      U: "Blue",
      B: "Black",
      R: "Red",
      G: "Green",
    },
    landDrops: "Land drop odds",
    // "On the play" means going first, with no draw on turn one.
    // ja: No での before the verb clause: 先攻で土地を置ける確率.
    landDropsOnPlay: "Land drop odds on the play",
    turn: "Turn {{turn}}",
    openingHand: "Opening hand, keeping {{min}} to {{max}} lands",
    // Keep the opening hand of {{cards}} cards instead of taking a mulligan.
    keepHand: "Keep {{cards}}",
    mulligan: "Mulligan",
    // fr: "Deux mulligans".
    mulliganTwice: "Mulligan twice",
    // "Free" means it costs no card, not free of charge.
    freeMulligan: "The first mulligan is free in this format.",
    missing_one: "{{count}} card has no card data yet.",
    missing_other: "{{count}} cards have no card data yet.",
    credit: "Land suggestion from Frank Karsten's land count formula.",
  },
  shelf: {
    title: "Decks",
    addDeck: "Add deck",
    collectionAll: "All",
    collectionFavorites: "Favorites",
    collectionRecent: "Recent",
    emptyList: "Empty list",
    versionCount_one: "{{count}} version",
    versionCount_other: "{{count}} versions",
    needsReview: "{{name}}. Needs review",
    reviewChanges: "Review deck changes: {{name}}",
    addFavorite: "Add {{name}} to favorites",
    removeFavorite: "Remove {{name}} from favorites",
    loading: "Loading decks",
    unavailable: "Decks unavailable",
    loadFailed: "Could not load your decks.",
    noFavorites: "No favorite decks yet",
    noRecent: "No recent decks yet",
    noDecks: "No decks yet",
    noFavoritesDetail: "Use the star beside a deck to add it here.",
    noRecentDetail: "Open a deck to add it here.",
    noDecksDetail: "Add a deck to get started.",
    favoriteFailed: "Could not update this favorite.",
    reviewSavedEdit: "Review saved edit",
    reconnect: "Reconnect to load your decks.",
    nothingMatches: "Nothing matches",
    tryAnotherSearch: "Try another search or clear the filters.",
    clearSearch: "Clear search and filters",
    allFormats: "All formats",
    search: "Search decks",
    onDevice: "On this device",
    inAccountLabel: "{{name}}, in your account",
    guestEmpty: "Save a deck on this device. No account needed.",
    dismissFilters: "Dismiss filters",
    // ja: Game system means the game (Magic, Pokémon): ゲーム. Never システム.
    system: "System",
    // ja: Game system means the game: すべてのゲーム. Never システム.
    allSystems: "All systems",
    format: "Format",
    // fr: "System" is the game (Magic, Pokémon…): say jeu, never système (Aucun jeu; salon sans jeu choisi).
    chooseSystem: "Choose a system to filter by format.",
    clearFilters: "Clear filters",
    showDecks: "Show decks",
    syncUnavailable: "Deck sync is unavailable in this build.",
  },
  guestDetail: {
    unavailable: "Local deck unavailable",
    unavailableDetail: "This deck was deleted or has not been saved yet.",
    nameRequired: "Enter a deck name.",
    changedBeforeSave: "This deck changed elsewhere. Reload it before saving.",
    changedBeforeDelete: "This deck changed elsewhere. Reload it before deleting.",
    reload: "Reload saved deck",
    deleteTitle: "Delete guest deck?",
    cancelDelete: "Keep this guest deck",
    deleteBody: "This removes the deck from this device.",
  },
  addDeck: {
    // Saved as the note on a deck imported from a website. {{source}} is the site, {{author}} the deck's author, {{url}} the deck's address on its own line.
    importedNote: "Imported from {{source}}\n{{url}}",
    // es: {{author}} built the deck; they did not import it. Use "Importado desde {{source}}, mazo de {{author}} {{url}}".
    importedNoteBy: "Imported from {{source}} by {{author}}\n{{url}}",
    modeBrowse: "Browse",
    modeImport: "Import",
    modeBuild: "Build",
    linkHelperMtg: "HTTPS links to public Magic decks. For other sites, paste a text export.",
    linkHelperYgo: "Links to public YGOPRODeck decks. For other sites, paste a YDK or YDKe export.",
    linkHelperPokemon:
      "Limitless tournament decklists. For decks you built, paste a Pokémon TCG Live list.",
    sourceMtgoExample: "MTGO example",
    sourceTournament: "Tournament deck",
    sourceExample: "Example deck",
    saveLocalFailed: "Could not save deck locally",
    loadDecksFailed: "Could not load decks",
    previewFailed: "Could not load this deck",
    // ko: 'matching' means matching card names: '카드 이름을 맞춘 뒤 {{card}}이(가) {{max}}장을 넘습니다. 원본을 수정한 후 다시 시도하세요.'
    overflowAfterMatch:
      "{{card}} has more than {{max}} copies after matching. Correct the source and try again.",
    linkFailed: "Could not load this deck. Try again or paste its text export.",
    resolveFailed: "Could not resolve deck list. Try again.",
    notes: "Notes",
    noMatches: "No matching decks",
    noDecksHere: "No decks here yet",
    noMatchesDetail: "Try another search, paste a list, or start an empty deck.",
    noListsYet: "We don’t have {{format}} lists yet. Paste a list or start an empty deck.",
    pasteList: "Paste a list",
    viewOn: "View on {{source}}",
    // {{source}} is the deck website; {{author}} made the deck.
    // hi: “{{source}} पर देखें ({{author}} का डेक)”.
    // es: {{author}} built the deck. Use "Ver en {{source}} (mazo de {{author}})".
    viewOnBy: "View on {{source}} by {{author}}",
    openFailed: "Could not open {{source}}.",
    nameRequired: "Add a deck name.",
    datedExample: "Dated example. Cards may no longer be legal in this format.",
    openSourceFailed: "Could not open the deck source.",
    viewSource: "View source deck",
    // ar: Top Deck is the same feature as errors:deckProviderUnavailable. Write "جارٍ تحميل أفضل المجموعات".
    // ko: Top Decks is 인기 덱: '인기 덱 불러오는 중'.
    // Top Decks are decks that placed well in recent tournaments. A feature, not a service name.
    loadingTopDeck: "Loading Top Deck",
    openDeck: "Open {{card}}",
    saveDeckOnDevice: "Save deck on this device",
    saveDeck: "Save deck",
    originalPrecon: "Original precon list. Cards may no longer be legal in this format.",
    loadingImages: "Loading card images",
    loadingOfficial: "Loading official card list",
    previewUnavailable: "Preview unavailable",
    browseOffline: "You're offline. Decks will load when you reconnect.",
    // es: Singular form: "Actualización disponible en {{count}} segundo. Los resultados guardados siguen disponibles."
    rateLimited_one: "Refresh available in {{count}} seconds. Saved results remain available.",
    rateLimited_other: "Refresh available in {{count}} seconds. Saved results remain available.",
    refreshFailed: "Could not refresh decks. Saved results remain available.",
    checkAgain: "Check again",
    // hi: “कहाँ से शुरू करें”, not the geometry term शुरुआती बिंदु.
    startingPoint: "Starting point",
    importSource: "Import source",
    pasteText: "Paste text",
    sourceLink: "{{source}} link",
    deckList: "Deck list",
    // Card names, quoted examples and section headings are parser input; keep them in English exactly.
    listHelperYgo:
      "Paste YDK card IDs or lines like 3 Ash Blossom. Main, Extra, and Side headings are supported.",
    // Pokémon TCG Live is a product name; keep it in English.
    listHelperPokemon:
      "Paste a Pokémon TCG Live list with quantities, names, set codes, and card numbers.",
    // Card names, quoted examples and section headings are parser input; keep them in English exactly.
    listHelperMtg:
      'Use lines like "1 Sol Ring". Commander, Mainboard, and Sideboard headings are supported.',
    // Card names and quoted examples are parser input; keep them in English exactly.
    listHelperLorcana: 'Use lines like "4 Aladdin - Heroic Outlaw".',
    // Card names and quoted examples are parser input; keep them in English exactly.
    listHelperFab: 'Paste a Fabrary card list or lines like "3x Snatch (red)".',
    // Card names, quoted examples and section headings are parser input; keep them in English exactly.
    listHelperRiftbound:
      'Use lines like "3 Pouty Poro" under headings like Legend, Main Deck, Battlefields, and Runes.',
    returnToDeck: "Return to deck",
    loadingDeck: "Loading deck…",
    reloadSource: "Reload source",
    importSourceDeck: "Import {{source}} deck",
    importList: "Import deck list",
    createDeck: "Create deck",
  },
  importBuild: {
    title: "New deck",
    // {{card}} is our best guess for a card name the player misspelled in a pasted list.
    didYouMean: "Did you mean {{card}}?",
    // Swaps the misspelled line for the suggested card.
    useIt: "Use it",
    useItLabel: "Use {{card}} for {{line}}",
    notFound: "Not found",
    unreadable: "Couldn't read this line",
    search: "Search",
    searchLabel: "Search for a card to replace {{line}}",
    removeLabel: "Remove {{line}}",
    linesToFix: "Lines to fix",
    removeAll: "Remove all",
    useFailed: "Could not add {{card}}. Try again.",
  },
  saveTo: {
    // hi: Heading over a choice of Account or This device, not a button: “कहाँ सेव करें”.
    label: "Save to",
    account: "Account",
    // Free and Pro limits differ, so the count always comes from the player's real limit.
    left: "{{left}} of {{limit}} left",
    // ja: The synced deck slots are used up: 上限 · {{used}}/{{limit}}同期済み. Never 満杯.
    full: "Full · {{used}} of {{limit}} synced",
    checking: "Checking room…",
    offline: "Offline",
    freeSlot: "Free a slot",
    device: "This device",
    // ko: An option description, not an order: '이 기기에만 저장됩니다. 나중에 동기화할 수 있습니다.'
    deviceDetail: "Only here. Sync it later.",
  },
  saveStatus: {
    notSynced: "Local edit not synced",
    paused: "Sync paused. Resolve a saved local edit to continue.",
    pending: "Saved locally · Pending sync",
    synced: "Synced",
  },
  shared: {
    // Follows a deck name in the game setup deck picker: someone else's deck you opened from a link.
    tag: "Shared",
    // Text sent with the link in the system share sheet.
    message: "{{name}} on Scryve: {{url}}",
    shareFailed: "Could not share this deck",
    stopFailed: "Could not stop sharing this deck",
    // Shown after sharing on a browser with no share sheet: the deck link is on the clipboard.
    linkCopied: "Link copied",
    title: "Shared deck",
    play: "Play this deck",
    addToMine: "Add to my decks",
    // hi: “यह डेक अब शेयर नहीं हो रहा।”
    unavailable: "This deck is no longer shared.",
  },
}

export default decks
