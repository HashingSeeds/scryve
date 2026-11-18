const board = {
  dice: {
    tool: {
      coin: "Coin",
      d4: "d4",
      d6: "d6",
      d8: "d8",
      d10: "d10",
      d12: "d12",
      d20: "d20",
      d100: "d100",
    },
    // Button beside the bag's three quick dice; opens the rest of the dice.
    moreDice: "More dice",
    // {{identity}} is the seat, such as "Seat 2, Ana".
    openBag: "{{identity}}, dice and counters",
    coinFace: { Heads: "Heads", Tails: "Tails" },
    unnamedPlayer: "Player",
    rollResult: "{{name}}, {{tool}}, {{value}}",
    rolledGoFirstOrSecond: "{{name}} rolled {{value}}. Go first or second",
    tieRollAgain: "Tie at {{value}}, {{names}}. Rolling again",
    goesFirst: "{{name}} goes first",
    wonFlipGoFirstOrSecond: "{{name}} won the flip. Go first or second",
    goFirstOrSecond: "{{name}}, go first or second",
    choseSecond: "{{name}} chose second",
    clearsResult: "Clears this result",
    // Tiny badge on the player who goes first: the ordinal "first", as short as your language allows. Where the region writes its own digits, use a word, never a digit.
    // ar: An ordinal badge: "الأول". Never the adverb أولًا.
    // es: Spanish writes Latin digits, so use "1.º".
    firstShort: "1st",
    settlesResult: "Settles this result",
    goesFirstQuestion: "Goes first?",
    goesFirstHeadline: "Goes first",
    goesOrder: { first: "{{name}} goes first", second: "{{name}} goes second" },
    goOrder: { first: "Go first", second: "Go second" },
    // Tiny label under a tied roll; the tied seats reroll on their own.
    tie: "Tie",
    flippingForFirst: "Flipping for who goes first",
    out: "Out",
    choiceReason: {
      flip: "Won the flip",
      roll: "Won the roll",
      loss: "Lost the last game",
    },
    rolloffLabel: {
      won: "{{name}} rolled {{value}}, goes first",
      // ar: Start in Arabic: "رمية {{name}}: {{value}}، والفوز بالرمي".
      chooses: "{{name}} rolled {{value}}, won the roll",
      tied: "{{name}} rolled {{value}}, tied, rolling again",
      out: "{{name}} rolled {{value}}, out",
      lost: "{{name}} rolled {{value}}",
    },
    choiceLabel: {
      // ar: Start in Arabic, name last: "الفوز برمي العملة واختيار من يبدأ: {{name}}".
      // ja: They choose the turn order and may let the other player start: {{name}}がコイントスに勝ち、先攻か後攻かを選びます. Never 先攻を選びます.
      flip: "{{name}} won the flip and chooses who goes first",
      // ar: Start in Arabic, name last: "الفوز بالرمي واختيار من يبدأ: {{name}}".
      // ja: They choose the turn order and may let the other player start: {{name}}がダイスに勝ち、先攻か後攻かを選びます. Never 先攻を選びます.
      roll: "{{name}} won the roll and chooses who goes first",
      // ar: Start in Arabic, name last: "خسارة المباراة السابقة واختيار من يبدأ: {{name}}".
      // ja: They choose the turn order and may let the other player start: {{name}}が前のゲームに負けたので、先攻か後攻かを選びます. Never 先攻を選びます.
      loss: "{{name}} lost the last game and chooses who goes first",
    },
    waitingForChoice: "Waiting for the choice",
    firstLabel: { won: "{{name}} goes first", lost: "{{name}} does not go first" },
  },
  playerNames: {
    // The name a seat gets when nobody types one. It is saved into the game, so keep it short.
    default: "Player {{number}}",
    required: "Enter a player name.",
    tooLong: "Use {{max}} characters or fewer.",
    unique: "Player names must be unique.",
    invalid: "Enter valid player names.",
    gameChanged: "This game changed. Reopen setup to edit its players.",
  },
  match: {
    draws_one: "{{count}} draw",
    draws_other: "{{count}} draws",
    context: "Game {{number}} · {{score}}",
    statusLine: "{{context}} · Best of {{bestOf}}",
    closeScore: "Close match score",
    scoreTitle: "Best of {{bestOf}} · Game {{number}}",
    // ja: Ends the match counting games up to the last finished one: 終了済みのゲームまでの結果でマッチを終了します.
    endHint: "Ends the match after its last finished game",
    leave: "Play single game",
    // ja: Drops the match and keeps this board as one game: マッチをやめ、このボードを単発のゲームとして続けます.
    // hi: “यह बोर्ड मैच के बजाय अलग गेम की तरह खेला जाएगा”.
    leaveHint: "Stops the match. This board keeps playing as one game.",
    continue: "Continue to the next game",
    gameSaved: "Game {{number}} saved",
    limitReached: "A match holds at most ten games, so this one ends here.",
    playerScore: "{{name}} {{wins}}",
    nextGame: "Next game",
  },
  firstPlayer: {
    // fr: "Pile ou face pour savoir qui commence".
    flip: "Flip for who goes first",
    // fr: "Lancer les dés pour savoir qui commence".
    roll: "Roll for who goes first",
    claim: "Mark {{name}} as going first",
    // Short, on each player's card before the game: tap any card to roll for everyone.
    // ar: The roll decides who goes first, not the game start: "ارمِ لتحديد البادئ".
    // hi: Short, on each player's card: “पहला कौन? रोल करें”.
    // fr: Short chip: "Tirer au sort".
    // es: Must stay short on every seat card. Use "Tira para empezar".
    rollPrompt: "Roll for first",
    // ar: The flip decides who goes first, not the game start: "اقلب العملة لتحديد البادئ".
    // hi: Short, on each player's card: “पहला कौन? टॉस करें”.
    // es: Must stay short on every seat card. Use "Lanza para empezar".
    flipPrompt: "Flip for first",
    // Short, on each player's card before the game: tap the card of the player who goes first.
    // ko: Short, on every player's card: '선공?'.
    pickPrompt: "Going first?",
  },
  // Magic only. Before the game, on the card of the player whose deck is tracked: they redraw their opening hand (a "mulligan") until they keep one.
  mulligan: {
    // A question with two answers below it: "Mulligan" or "Keep". {{count}} is the number of cards they would keep.
    keepQuestion_one: "Keep {{count}}?",
    keepQuestion_other: "Keep {{count}}?",
    // Shorthand players say at the table: draw a new hand of {{hand}} cards; this one cost no card.
    freeLine: "Free, draw {{hand}}",
    // Shorthand: draw {{hand}} cards, then put {{count}} of them on the bottom of the deck.
    bottomLine: "Draw {{hand}}, bottom {{count}}",
    mulligan: "Mulligan",
    keep: "Keep",
    // Don't record a mulligan this game.
    skip: "Skip",
    help: "How mulligans work",
    // es: Use "Baraja y roba {{hand}}. Por cada mulligan, pon {{bottom}} al fondo."
    steps: "Shuffle, draw {{hand}}. Bottom {{bottom}} card per mulligan.",
    // The group's house rule, chosen in game setup.
    rule: {
      none: "No free mulligans",
      first: "First mulligan free",
      all: "Every mulligan free",
    },
    // Opens the official rule text.
    fullRule: "Full rule",
    done: "Done",
  },
  layout: {
    balanced: "Balanced",
    // fr: "Priorité en haut" (same words as its layout label).
    topFocus: "Top focus",
    // fr: "Priorité en bas" (same words as its layout label).
    bottomFocus: "Bottom focus",
    // fr: "Grille régulière" (same words as its layout label).
    evenGrid: "Even grid",
    table: "Table",
  },
  teams: {
    // A team of players who share a turn, named by its players, as in "Ada & Grace" or "Ada, Grace & Kim".
    name: "{{first}} & {{second}}",
  },
  seats: {
    title: "Swap seats",
    seat: "{{name}}'s seat",
  },
  layoutOption: {
    balanced: "Balanced layout",
    topFocus: "Top focus layout",
    bottomFocus: "Bottom focus layout",
    evenGrid: "Even grid layout",
    table: "Table layout",
  },
  roundClock: {
    turnsDone: "Turns done",
    finishTurn: "Finish turn",
    turnOf: "Turn {{turn}} of {{turns}}",
    close: "Close round clock",
    // fr: "Prolongation restante : {{time}}".
    overtimeLeft: "{{time}} of overtime left",
    nextTurn: "Next turn",
    // Button that adds or removes minutes, as in "+1 min".
    adjustMinutes: "{{minutes, signed}} min",
    removeMinute: "Remove a minute",
    addMinute: "Add a minute",
    resume: "Resume",
    pause: "Pause",
    // Declares the round's time over, as a judge calls time. Not a timeout.
    // es: Button that declares the round's time over, as a judge calls time. Use "Fin del tiempo". Never "Pedir tiempo", which means asking for a timeout.
    callTime: "Call time",
    bonusTurns_one: "{{count, signed}} turn",
    bonusTurns_other: "{{count, signed}} turns",
    turnOff: "Turn off",
    tied: {
      none: "Tied on life",
      mtg: "Tied on life",
      ygo: "Tied on life points",
      pokemon: "Tied on prize cards",
      lorcana: "Tied on lore",
      fab: "Tied on life",
      // hi: Copy the life wording: “पॉइंट बराबर”.
      riftbound: "Tied on points",
    },
    leads: {
      none: "{{name}} leads on life",
      mtg: "{{name}} leads on life",
      ygo: "{{name}} leads on life points",
      pokemon: "{{name}} leads on prize cards",
      lorcana: "{{name}} leads on lore",
      fab: "{{name}} leads on life",
      riftbound: "{{name}} leads on points",
    },
  },
  clock: {
    time: "Time",
    timeWith: "Time, {{time}}",
    paused: "Paused",
    opensRoundClock: "Opens the round clock",
    // fr: {{time}} is a clock value like 4:32, so nothing may agree with it: "Temps restant : {{time}}".
    left: "{{time}} left",
    // fr: "Temps restant : {{time}}, en pause".
    leftPaused: "{{time}} left, paused",
    // fr: "Temps écoulé : {{time}}".
    elapsed: "{{time}} elapsed",
    // fr: "Temps écoulé : {{time}}, en pause".
    elapsedPaused: "{{time}} elapsed, paused",
  },
  matchEnd: {
    outcome: { win: "Win", loss: "Loss", draw: "Draw" },
    failed: "Could not end this match.",
    noFinishedGame: "This match has no finished game to end.",
    cancel: "Cancel ending the match",
    title: "Match result",
    playerResult: "{{name}} match result",
    // es: Use "Empate entre los que siguen".
    drawRemaining: "Draw for remaining",
    // es: Use "Da empate a los asientos que siguen jugando y derrota a los eliminados".
    drawRemainingHint: "Draws every seat still playing and gives eliminated seats a loss",
    // Ends the whole best-of-N match, not one game.
    end: "End match",
    scoreErrors: {
      // ar: Write "يجب أن يكون عدد المباريات التي فاز بها كل مقعد بين {{min}} و{{max}} في مواجهة الأفضل من {{bestOf}}". Never مربوحة.
      gamesWonRange: "Games won must be {{min}}–{{max}} in a best of {{bestOf}}",
      gamesDrawnRange: "Games drawn must be {{min}}–{{max}}",
      // ja: A neutral form error: {{bestOf}}本勝負で{{wins}}勝にはなりません. Never ありえません.
      tooManyWins: "A best of {{bestOf}} cannot have {{wins}} wins",
      // ar: Write "أدخل عدد المباريات التي فاز بها كل مقعد، أو اترك النتيجة فارغة". Never المباريات الفائزة (the games themselves did not win).
      partialScore: "Enter games won for every seat or leave the score blank",
      oneWinner: "A match can only have one winner",
      needsWinner: "A match needs a winner unless it was drawn",
      // ar: Write "يجب أن يكون للفائز أكبر عدد من الانتصارات".
      winnerLeads: "The winner must have the most game wins",
      // ar: Write "يجب أن يكون المقعد صاحب أكبر عدد من الانتصارات هو الفائز".
      leaderWins: "The seat with the most game wins must be the winner",
    },
  },
  claim: {
    matchStanding: "Best of {{bestOf}} · {{score}}",
    matchWonBy: "Best of {{bestOf}} · {{score}} · Won by {{name}}",
    matchDraw: "Best of {{bestOf}} · {{score}} · Draw",
    draw: "Draw",
    wonBy: "Won by {{names}}",
    noResult: "No result",
    seatMark: "{{name}}, {{shape}}",
    seatFallback: "Seat {{seat}}",
    saveFailed: "Could not save your choice. Try again.",
    decideLater: "Decide later",
    title: "Add games to this account?",
    // ja: The rest are kept, not saved again: 残りはこのデバイスにだけ残ります。
    body: "These games were played signed out. Selected games are added to this account. The rest stay on this device only.",
    // ar: Field label for the seat you played: "مقعدك". كنت alone is an unfinished sentence.
    youWere: "You were",
    gameLabel: "{{names}}, {{detail}}",
    seatNote:
      "Your seat sets your win record and can't be changed later. No seat records no win or loss.",
    notNow: "Not now",
    keepOnDevice: "Keep on device",
    addGames_one: "Add {{count}} game",
    addGames_other: "Add {{count}} games",
  },
  shape: {
    // A plant leaf, the player mark's shape.
    // ar: A leaf: "ورقة", the same word on both screens.
    heart: "leaf",
    // A scalloped round badge, like a prize ribbon's seal.
    // ar: A rosette badge: "وسام". Never وردة (a rose).
    triangle: "rosette",
    // hi: “चौकोर”, same as connected:appearance.shapes.square.
    square: "square",
    // hi: “हीरा”, same as connected:appearance.shapes.diamond.
    diamond: "diamond",
    star: "star",
    // hi: “षट्कोण”, same as connected:appearance.shapes.hexagon.
    hexagon: "hexagon",
    // hi: “प्लस” (जमा is arithmetic), same as connected:appearance.shapes.plus.
    plus: "plus",
    shield: "shield",
    // A crescent moon, the player mark's shape.
    moon: "moon",
    // A round ring with a hole in the middle, the player mark's shape.
    // ko: Same shape as connected:appearance.shapes.ring: '고리'.
    ring: "ring",
    // hi: “गोला”, same as connected:appearance.shapes.circle.
    circle: "circle",
    // A hanging cloth banner with a notched bottom, the player mark's shape.
    banner: "banner",
    // A four-lobed shape like a four-leaf clover, the player mark's shape.
    // es: Use "trébol de cuatro hojas", the same as connected:appearance.shapes.quatrefoil.
    quatrefoil: "quatrefoil",
    // The little wooden person piece from board games, the player mark's shape.
    meeple: "meeple",
    // A sand timer, the player mark's shape.
    hourglass: "hourglass",
    crown: "crown",
    flame: "flame",
    bolt: "bolt",
    eye: "eye",
    skull: "skull",
    // ar: The card suit: "بستوني", without the article.
    spade: "spade",
    gem: "gem",
    tower: "tower",
  },
  savedToast: {
    gameSaved: "Game saved",
    matchSaved: "Match saved",
    summary: "Summary",
  },
  abandonedToast: {
    // Shown after a game is thrown away without a result, next to an Undo button, until the next game is played.
    message: "Game abandoned",
  },
  saveFailed: {
    // Shown once when the device refuses to store the game, usually because storage is full.
    title: "Can't save this game",
    message:
      "You can keep playing, but the game may be lost if you leave the board or close Scryve.",
  },
  endGame: {
    failed: "Could not end this game.",
    cancel: "Cancel ending the game",
    title: "Who won?",
    subtitle: "Choose a winner or record a draw.",
    player: "{{name}}, {{value}}",
    playerWinner: "{{name}}, {{value}}, winner",
    draw: "Draw",
    // Ends this local game with no winner recorded. Not a concession.
    abandon: "Abandon",
    end: "End game",
  },
  pokemon: {
    unnamed: "Pokémon",
    knockedOut: "{{name}} knocked out.",
    knockedOutTakes_one: "{{name}} knocked out. {{taker}} takes {{count}} prize.",
    knockedOutTakes_other: "{{name}} knocked out. {{taker}} takes {{count}} prizes.",
    searchUnavailable: "Card search unavailable.",
    undoFailed: "Could not undo. {{name}} stays knocked out.",
    undoReturns: {
      active: "Undo. {{name}} returns to Active.",
      bench: "Undo. {{name}} returns to the bench.",
    },
    undoReturnsGivesBack: {
      active_one: "Undo. {{name}} returns to Active, {{taker}} gives back {{count}} prize.",
      active_other: "Undo. {{name}} returns to Active, {{taker}} gives back {{count}} prizes.",
      bench_one: "Undo. {{name}} returns to the bench, {{taker}} gives back {{count}} prize.",
      bench_other: "Undo. {{name}} returns to the bench, {{taker}} gives back {{count}} prizes.",
    },
    benchLabel: "{{identity}}, bench, {{filled}} of {{size}}",
    addBench: "{{identity}}, add a bench Pokémon",
    noActiveLabel: "{{identity}}, no Active Pokémon",
    placeActiveFromBenchHint: "Tap a bench Pokémon to make it Active, or tap here to place one",
    placeActiveHint: "Tap to place an Active Pokémon. Long press to choose its card.",
    placeActiveDeckHint:
      "Tap to choose an Active Pokémon. Long press to count damage without a card.",
    // ar: Button that puts a Pokémon in the Active Spot. Write "ضع بوكيمون نشطًا"; a bare وضع reads as "mode".
    placeActive: "Place Active",
    // ar: No Pokémon in the Active Spot. Write "بلا بوكيمون نشط".
    noActive: "No Active",
    orTapBench: "or tap a bench Pokémon",
    holdToChoose: "hold to choose a card",
    holdToChooseHint: "Long press to choose its card",
    chooseCard: "Choose card",
    holdToCount: "hold to count damage",
    holdToCountHint: "Long press to count damage without a card",
    countDamage: "Count damage without a card",
    // Short labels for Pokémon HP and damage.
    unit: { hp: "HP", damage: "DMG" },
    prizesHint: "Tap to take a prize. Long press to put one back.",
    putPrizeBack: "Put a prize back",
    whoTakes_one: "{{name}} knocked out. Who takes {{count}} prize?",
    whoTakes_other: "{{name}} knocked out. Who takes {{count}} prizes?",
    // hi: Honorific like its siblings: “{{name}} प्राइज़ कार्ड लेते हैं”.
    takesPrizes: "{{name}} takes the prizes",
    // Undo marking this Pokémon Knocked Out.
    cancelKnockout: "Cancel knockout",
    undoKnockout: "Undo, {{name}} returns",
    // ja: The bench is full, so the Pokémon cannot come back: ベンチに空きがないため戻せません.
    noRoomToUndo: "No room to undo",
    benchSlot: "Bench, {{name}}",
    hpLeft: "{{name}}, {{remaining}} HP left",
    damageOn: "{{name}}, {{damage}} damage",
    addDamage: "{{identity}}, {{slot}}, add {{amount}} damage",
    // ja: Pokémon cards say HPを回復: {{identity}}、{{slot}}、HPを{{amount}}回復.
    heal: "{{identity}}, {{slot}}, heal {{amount}}",
    longPressToEdit: "Long press to edit {{name}}",
    edit: "Edit {{name}}",
    hpLabel: "{{identity}}, {{slot}}, {{remaining}} HP left of {{hp}}, {{damage}} damage",
    // ar: "no card set" means no card has been chosen for this Pokémon: "دون بطاقة". It is not a printed card set (توسعة).
    // hi: “no card set” means no card has been chosen for this Pokémon yet, not a card set: “कोई कार्ड नहीं चुना”.
    damageLabel: "{{identity}}, {{slot}}, {{damage}} damage, no card chosen",
    benchTag: "BENCH",
    damageShort: "{{damage}} dmg",
    damageCaption: "{{damage}} damage · {{hp}} HP",
    damageCounted: "damage · no card",
    switch: {
      // ar: Pokémon Switch: "تبديل". إدخال reads as data input.
      // hi: “स्विच इन”, matching its screen-reader label स्विच इन करें.
      // fr: Same verb as the Pokémon cards and its screen reader label: "Échanger".
      switchIn: "Switch in",
      // ko: Tight button: '배틀 필드로'.
      makeActive: "Make Active",
    },
    // Pokémon TCG Special Conditions on the Active Pokémon, shown on its card and as toggles in its edit sheet.
    condition: {
      asleep: "Asleep",
      confused: "Confused",
      paralyzed: "Paralyzed",
      poisoned: "Poisoned",
      burned: "Burned",
    },
    switchLabel: {
      // ar: Pokémon Switch: "تبديل، يصبح {{name}} نشطًا". إدخال reads as data input.
      switchIn: "Switch in, {{name}} becomes Active",
      // ko: '배틀 필드로, {{name}}이(가) 배틀 포켓몬이 됩니다'.
      makeActive: "Make Active, {{name}} becomes Active",
    },
    benchChipLabel: "Bench, {{name}}, {{remaining}} of {{hp}} HP, {{damage}} damage",
    // ar: "no card set" means no card has been chosen for this Pokémon: "دون بطاقة". It is not a printed card set (توسعة).
    // hi: “no card set” means no card has been chosen yet, not a card set: “कोई कार्ड नहीं चुना”.
    benchChipDamageLabel: "Bench, {{name}}, {{damage}} damage, no card chosen",
    // ko: A choice, not a sequence: '탭하여 배틀 포켓몬으로 지정하거나 편집하세요.'
    benchPromoteHint: "Tap to make Active, or edit.",
    // ko: Three alternatives: '탭하여 데미지를 세거나, 교체하거나, 편집하세요.'
    benchFocusHint: "Tap to count damage on it or switch it in, or edit.",
  },
  // Magic Commander damage: damage a commander card dealt to a player. {{seat}} is a seat number.
  commander: {
    assignFromSeat: "Assign commander damage from seat {{seat}}",
    assigningFromSeat: "Assigning commander damage from seat {{seat}}",
    submitAssigningFromSeat: {
      done: "Done assigning commander damage from seat {{seat}}",
      send: "Send commander damage from seat {{seat}}",
    },
    // {{name}} is the player who takes the damage.
    dealTo: "Deal {{damage}} commander damage to {{name}}",
    // ar: Undoing a commander damage hit: "التراجع عن ضرر القائد {{damage}}". Never سحب, which means drawing cards.
    undoHit: "Take back {{damage}} commander damage",
    // The attacking commander's power: how much one hit deals.
    power: "Commander power {{power}}",
    raisePower: "Raise commander power",
    lowerPower: "Lower commander power",
    // {{name}} is one of two partner commanders that attack together.
    raisePowerOf: "Raise {{name}}'s power",
    lowerPowerOf: "Lower {{name}}'s power",
    // Shown dimmed in place of the commander's name when the seat has no deck.
    unnamed: "Commander",
    totalFrom: "{{damage}} commander damage from {{name}}",
    amountFrom: "{{amount}} from {{name}}",
    unknownAttacker: "Commander",
    assignFrom: "Assign commander damage from {{identity}}",
    // {{sources}} lists the commander damage this seat has taken, such as "6 from Ana, 3 from Ben".
    // ko: Match its sibling labels: '{{identity}}의 커맨더 피해 지정. 받은 피해: {{sources}}'.
    assignFromWithDamage: "Assign commander damage from {{identity}}. Taken: {{sources}}",
    // fr: Out of date: "pas à jour", never périmé.
    assignFromStale: "Assign commander damage from {{identity}}, out of date",
  },
  outReason: {
    commanderDamage: "commander damage",
    poison: "poison",
  },
  counters: {
    seatItem: "{{identity}}, {{label}}",
    valueOutOf: "{{value}} of {{max}}",
    chipHint: "Tap to add {{step}}. Long press to edit or remove.",
    edit: "Edit {{label}}",
    // ko: Designations are statuses a player holds: '{{identity}}, 카운터와 상태'. 지정 alone means assignment.
    addLabel: "{{identity}}, counters and designations",
    changed: "{{label}} {{value}}",
    nowHolds: "now {{label}}",
    announcement: "{{identity}}, {{changes}}",
    // ar: {{label}} is a definite noun (نقاط الحياة، السم). Join it with a preposition so any number reads: "{{identity}}، إضافة {{step}} إلى {{label}}".
    add: "{{identity}}, add {{step}} {{label}}",
    // ar: {{label}} is a definite noun (نقاط الحياة، السم). Join it with a preposition so any number reads: "{{identity}}، طرح {{step}} من {{label}}".
    subtract: "{{identity}}, subtract {{step}} {{label}}",
    remove: "Remove {{label}}",
    editWithValue: "Edit {{label}}, {{value}}",
    // {{label}} is a Magic designation such as the Monarch or the Initiative; the player stops holding it.
    // fr: {{label}} is Monarque or Initiative, so no article can agree: "Céder : {{label}}".
    giveUp: "Give up {{label}}",
    // ja: {{label}} is 統治者 or イニシアチブ, so use the verb players use for both: {{label}}を取る. Never を得る.
    // fr: {{label}} is Monarque or Initiative, so no article can agree: "Obtenir : {{label}}".
    take: "Take {{label}}",
    rule: "Rule {{rule}}",
    // Opens a field where the player names their own counter, for a mechanic the app doesn't list (Speed, rad counters, the Ring).
    custom: "Name a counter",
    // Short form of "Name a counter" for a narrow button.
    customShort: "Custom",
    // Placeholder in the field for a counter's name.
    customName: "Counter name",
    // Adds the named counter to the player's seat.
    customAdd: "Add",
    // Screen reader label for a recently used counter name; tapping it adds that counter. {{label}} is the name.
    customRecent: "Add {{label}}",
    // Suggested names for a player's own counter, before they've named any. Use the term printed on Magic cards in this language. Keep under 20 characters.
    starter: {
      speed: "Speed",
      // fr: French Fallout cards say marqueurs radiation: "Radiation".
      rad: "Rad",
      // fr: Magic French for storm: "Déluge".
      storm: "Storm",
    },
    // Screen reader label for a "+2" button on a seat; it opens the seat's counters that didn't fit on the card.
    more_one: "{{identity}}, {{count}} more counter",
    more_other: "{{identity}}, {{count}} more counters",
  },
  seat: {
    identity: "Seat {{seat}}, {{name}}",
    unnamedPlayer: "unnamed player",
    updatedAgo: "Updated {{elapsed}} ago",
    ownership: {
      owned: "Your seat",
      // Seat status: you can see this seat but not change it.
      unowned: "View only",
      disabled: "Controls unavailable",
    },
  },
  lifeCard: {
    now: "{{identity}}, now {{value}}",
    // ar: The player is out of this game: "خارج المباراة: {{reason}}". Never اللعبة, the game-system word.
    // ja: Same word as the Out label: 脱落：{{reason}}. Never 敗北.
    out: "out: {{reason}}",
    // Shown under a player's life total once they are out of the game.
    outLabel: "Out",
    // Why a player is out, read after "out:". {{total}} is commander damage taken from {{name}}'s commander.
    outFrom: "{{total}} commander damage from {{name}}",
    // Why a player is out, read after "out:": the game's main counter ran out (or another player won the race).
    outOn: {
      none: "life",
      mtg: "life",
      ygo: "Life Points",
      pokemon: "Prize cards",
      lorcana: "lore",
      fab: "life",
      riftbound: "points",
    },
    openCalculator: "Open calculator for {{identity}}",
  },
  lifeControls: {
    add: "{{identity}}, add {{amount}}",
    subtract: "{{identity}}, subtract {{amount}}",
    hint: {
      none: "Tap to change {{identity}}'s life by {{delta}}. Long press for more controls.",
      mtg: "Tap to change {{identity}}'s life by {{delta}}. Long press for more controls.",
      ygo: "Tap to change {{identity}}'s Life Points by {{delta}}. Long press for more controls.",
      pokemon:
        "Tap to change {{identity}}'s Prize cards by {{delta}}. Long press for more controls.",
      lorcana: "Tap to change {{identity}}'s lore by {{delta}}. Long press for more controls.",
      fab: "Tap to change {{identity}}'s life by {{delta}}. Long press for more controls.",
      // hi: Copy the life wording: “{{identity}} के पॉइंट {{delta}} बदलने के लिए टैप करें। और विकल्पों के लिए देर तक दबाएँ।”
      // fr: End like every other game: "Appui long pour plus de commandes."
      riftbound: "Tap to change {{identity}}'s points by {{delta}}. Long press for more controls.",
    },
    moreControls: {
      none: "{{identity}}, more life controls",
      mtg: "{{identity}}, more life controls",
      ygo: "{{identity}}, more Life Points controls",
      pokemon: "{{identity}}, more Prize cards controls",
      lorcana: "{{identity}}, more lore controls",
      fab: "{{identity}}, more life controls",
      // hi: Copy the life wording: “{{identity}}, पॉइंट के और विकल्प”.
      // fr: Match the other games: "{{identity}}, plus de commandes de points".
      riftbound: "{{identity}}, more point controls",
    },
  },
  grid: {
    label: {
      // ar: One player. Drop {{count}} and write للاعب واحد at the end (شبكة نقاط الحياة للاعب واحد). Never للاعب {{count}}, which reads as "for Player 1".
      // ar: Form zero: Put the number before the noun: لـ {{count}} لاعب (شبكة نقاط الحياة لـ {{count}} لاعب). Never للاعب {{count}}, a seat name.
      // ar: Form two: Two players. Drop {{count}} and use the dual للاعبَين at the end (شبكة نقاط الحياة للاعبَين). Never للاعبين {{count}}, which reads as "for players 2".
      none_one: "{{count}} player life grid",
      none_other: "{{count}} player life grid",
      // ar: One player. Drop {{count}} and write للاعب واحد at the end (شبكة نقاط الحياة للاعب واحد). Never للاعب {{count}}, which reads as "for Player 1".
      // ar: Form zero: Put the number before the noun: لـ {{count}} لاعب (شبكة نقاط الحياة لـ {{count}} لاعب). Never للاعب {{count}}, a seat name.
      // ar: Form two: Two players. Drop {{count}} and use the dual للاعبَين at the end (شبكة نقاط الحياة للاعبَين). Never للاعبين {{count}}, which reads as "for players 2".
      mtg_one: "{{count}} player life grid",
      mtg_other: "{{count}} player life grid",
      // ar: One player. Drop {{count}} and write للاعب واحد at the end (شبكة نقاط الحياة للاعب واحد). Never للاعب {{count}}, which reads as "for Player 1".
      // ar: Form zero: Put the number before the noun: لـ {{count}} لاعب (شبكة نقاط الحياة لـ {{count}} لاعب). Never للاعب {{count}}, a seat name.
      // ar: Form two: Two players. Drop {{count}} and use the dual للاعبَين at the end (شبكة نقاط الحياة للاعبَين). Never للاعبين {{count}}, which reads as "for players 2".
      ygo_one: "{{count}} player Life Points grid",
      ygo_other: "{{count}} player Life Points grid",
      // ar: One player. Drop {{count}} and write للاعب واحد at the end (شبكة نقاط الحياة للاعب واحد). Never للاعب {{count}}, which reads as "for Player 1".
      // ar: Form zero: Put the number before the noun: لـ {{count}} لاعب (شبكة نقاط الحياة لـ {{count}} لاعب). Never للاعب {{count}}, a seat name.
      // ar: Form two: Two players. Drop {{count}} and use the dual للاعبَين at the end (شبكة نقاط الحياة للاعبَين). Never للاعبين {{count}}, which reads as "for players 2".
      pokemon_one: "{{count}} player Prize cards grid",
      pokemon_other: "{{count}} player Prize cards grid",
      // ar: One player. Drop {{count}} and write للاعب واحد at the end (شبكة نقاط الحياة للاعب واحد). Never للاعب {{count}}, which reads as "for Player 1".
      // ar: Form zero: Put the number before the noun: لـ {{count}} لاعب (شبكة نقاط الحياة لـ {{count}} لاعب). Never للاعب {{count}}, a seat name.
      // ar: Form two: Two players. Drop {{count}} and use the dual للاعبَين at the end (شبكة نقاط الحياة للاعبَين). Never للاعبين {{count}}, which reads as "for players 2".
      lorcana_one: "{{count}} player lore grid",
      lorcana_other: "{{count}} player lore grid",
      // ar: One player. Drop {{count}} and write للاعب واحد at the end (شبكة نقاط الحياة للاعب واحد). Never للاعب {{count}}, which reads as "for Player 1".
      // ar: Form zero: Put the number before the noun: لـ {{count}} لاعب (شبكة نقاط الحياة لـ {{count}} لاعب). Never للاعب {{count}}, a seat name.
      // ar: Form two: Two players. Drop {{count}} and use the dual للاعبَين at the end (شبكة نقاط الحياة للاعبَين). Never للاعبين {{count}}, which reads as "for players 2".
      fab_one: "{{count}} player life grid",
      fab_other: "{{count}} player life grid",
      // ar: One player. Drop {{count}} and write للاعب واحد at the end (شبكة نقاط الحياة للاعب واحد). Never للاعب {{count}}, which reads as "for Player 1".
      // hi: Copy the life grid wording; ग्रिड is feminine: “{{count}} खिलाड़ी की पॉइंट ग्रिड”.
      // ar: Form zero: Put the number before the noun: لـ {{count}} لاعب (شبكة نقاط الحياة لـ {{count}} لاعب). Never للاعب {{count}}, a seat name.
      // ar: Form two: Two players. Drop {{count}} and use the dual للاعبَين at the end (شبكة نقاط الحياة للاعبَين). Never للاعبين {{count}}, which reads as "for players 2".
      riftbound_one: "{{count}} player point grid",
      // hi: Copy the life grid wording; ग्रिड is feminine: “{{count}} खिलाड़ियों की पॉइंट ग्रिड”.
      riftbound_other: "{{count}} player point grid",
    },
  },
  pokemonSheet: {
    title: {
      place: { active: "Place Active", bench: "Add to bench" },
      edit: { active: "Active", bench: "Bench" },
    },
    loadFailed: "Could not load that card. Type its HP instead.",
    // ar: Write "تعذّر وضع البوكيمون. حاول مرة أخرى."
    // ja: Pokémon rules say 出す: 出せませんでした。もう一度お試しください。
    // hi: “इसे रखा नहीं जा सका। फिर कोशिश करें।”
    placeFailed: "Could not place it. Try again.",
    hpAboveDamage: "HP must be above the damage on it.",
    saveFailed: "Could not save it. Try again.",
    lookUpLabel: "Look up in the card catalog",
    lookUp: "Look up",
    prizes: "Prizes",
    // ar: Button that places the chosen Pokémon. Write "ضعه", never a bare وضع ("mode").
    // ja: Pokémon rules put a Pokémon into play with 出す: 出す. Never 配置.
    // hi: “रखें”, as in board:pokemon.placeActive.
    place: "Place",
    saveAndClose: "Save and close",
    searchLabel: "Search the card catalog",
    searchPlaceholder: "Search cards",
    noResults: "No cards found",
    nameLabel: "Pokémon name",
    namePlaceholder: "Name",
    catalogOffline: "Catalog offline. Type the name and HP.",
    // ar: Masculine verb, as for every Pokémon: "يمنح بطاقة جائزة واحدة".
    // ar: Form two: Masculine verb, as for every Pokémon: "يمنح بطاقتَي جائزة".
    // ar: Form many: The Prize cards this Pokémon gives when Knocked Out. Masculine verb, as for every Pokémon: "يمنح {{count}} ..." with بطاقة جائزة in the form this slot needs.
    // ar: Form few: The Prize cards this Pokémon gives when Knocked Out. Masculine verb, as for every Pokémon: "يمنح {{count}} ..." with بطاقة جائزة in the form this slot needs.
    // ar: Form zero: The Prize cards this Pokémon gives when Knocked Out. Masculine verb, as for every Pokémon: "يمنح {{count}} ..." with بطاقة جائزة in the form this slot needs.
    worth_one: "Worth {{count}} prize",
    // ar: The Prize cards this Pokémon gives when Knocked Out. Masculine verb, as for every Pokémon: "يمنح {{count}} ..." with بطاقة جائزة in the form this slot needs.
    // ko: Prizes the opponent takes on a KO: '기절 시 프라이즈 {{count}}장'.
    worth_other: "Worth {{count}} prizes",
    notListedLabel: "Not listed? Type the name and HP",
    notListed: "Not listed? Type it in",
    damageLabel: "{{name}}, {{damage}} damage, {{remaining}} HP left",
    damageCaption: "damage · {{remaining}} left",
    addDamage: "Add {{amount}} damage",
    // ja: Pokémon cards say HPを回復: HPを{{amount}}回復. Never ダメージを回復.
    healDamage: "Heal {{amount}} damage",
    makeActiveLabel: "Make {{name}} Active",
    knockedOutLabel: "{{name}} knocked out",
    knockedOut: "Knocked out",
    // es: Stops tracking the card; not a Pokémon retreat. Use "Quitar a {{name}} de la mesa". Never retirar, which is the official word for retreat.
    removeLabel: "Remove {{name}} from play",
  },
  keypad: {
    shift: "Shift",
    hide: "Hide keypad",
    lettersKey: "ABC",
    letters: "Letters",
    numbers: "Numbers",
    spaceKey: "space",
    space: "Space",
  },
  menu: {
    layout: "Layout",
    game: "Game",
    history: "History",
    // This game's list of life changes, opened from the game menu. Not the app's History of past games.
    log: "Log",
    rules: "Rules",
    // Turns this local game into a connected game. Not sign in.
    connect: "Connect",
    // fr: An action, not a label: "Terminer", never Fin.
    end: "End",
    closeDice: "Close dice",
    closeLayoutChooser: "Close layout chooser",
    showsConnectionDetails: "Shows connection details",
    open: "Game options",
    close: "Close game options",
    collapses: "Collapses the game controls",
    expands: "Expands the game controls",
    actionWithDetail: "{{label}}, {{detail}}",
  },
  turn: {
    // On the active player's turn chip, before their turn clock starts. Tapping starts it. Very short.
    // hi: Very short chip label: “शुरू”.
    start: "Start",
    startHint: "Tap to start the turn clock",
    // Very short tap target on the turn chip that ends this player's turn and starts the next player's. Never "End turn".
    pass: "Pass",
    // On the turn chip when there is no clock, as in "Turn 3". Very short.
    chipNumber: "Turn {{number}}",
    // Screen reader label for the turn chip, as in "Turn 4, Ada".
    label: "Turn {{number}}, {{name}}",
    passHintTo: "Tap to pass to {{name}}",
    // Screen reader text when a player's chess clock bank has run out. Play continues.
    outOfTime: "Out of time",
    longPressHint: "Long press for turn controls",
    // Title of the turn controls dialog, as in "Turn 4".
    title: "Turn {{number}}",
    noTurnTitle: "Turns",
    // Above the list of players in the turn controls, to fix whose turn it is after a mistake.
    whoseTurn: "Whose turn is it?",
    whoFirstHeading: "Who goes first?",
    // Shown instead of the player list in event play, where only passing changes the turn.
    // fr: Name the button: "En événement, seul « Passer » change le tour".
    // es: Use "En eventos, solo pasar cambia el turno".
    eventPlay: "Event play: only passing changes the turn",
    undoPass: "Take back the pass",
    // A chess clock: each player's own time bank counts down only on their turn.
    chessBank: "Time per player",
    chessMinutes: "{{minutes}} min",
    chessOff: "Off",
    roundClock: "Round clock",
    // The log divider at the start of each turn, as in "Turn 4 · Ada".
    divider: "Turn {{number}} · {{name}}",
  },
  // Planechase, a Magic variant with a shared deck of plane cards and a six-sided planar die. Use the official terms in your language for plane, phenomenon, planeswalk and chaos.
  planar: {
    title: "Planechase",
    // A plane card the players are on. As in "Plane: Eloren Wilds".
    plane: "Plane",
    phenomenon: "Phenomenon",
    // Screen reader label for the plane plate on the board, as in "Plane: Eloren Wilds".
    planeNamed: "Plane: {{name}}",
    phenomenonNamed: "Phenomenon: {{name}}",
    ownCards: "Your planar deck",
    // Button that rolls the planar die.
    roll: "Roll",
    // Mana the next planar die roll costs this turn, as in "Next roll: 2".
    // ja: The mana the next planar die roll costs: 次に振るコスト：{{cost}}.
    nextCost: "Next roll: {{cost}}",
    // Short cost badge on the die button, as in "+2" mana for the next roll.
    costBadge: "{{cost, signed}}",
    // ja: The roll costs no mana: コストなし. Never 無料.
    free: "Free",
    // ar: Write "تصفير التكلفة". إعادة التكلفة means refunding it.
    reset: "Reset cost",
    planeswalk: "Planeswalk",
    // Button shown while a phenomenon is face up: its effect happens, then the active player planeswalks.
    resolve: "Resolved, planeswalk",
    // Shown to a player who can't roll because it isn't their turn.
    activeOnly: "Only the active player rolls",
    faces: {
      planeswalk: "Planeswalk",
      chaos: "Chaos",
      blank: "Blank",
    },
    dieLabel: "Planar die, next roll costs {{cost}}",
    opensPlane: "Opens the plane",
    // Log rows. "rolled" as in "Ada rolled Chaos, paid 1".
    rolledFree: "{{name}} rolled {{face}}",
    // ja: {{cost}} is mana: {{name}}が{{face}}を出し、{{cost}}マナを支払いました.
    rolledPaid: "{{name}} rolled {{face}}, paid {{cost}}",
    walkedTo: "{{name}} planeswalked to {{plane}}",
    walked: "{{name}} planeswalked",
    resetBy: "{{name}} reset the roll cost",
  },
  // Archenemy, a Magic variant where one player with a scheme deck faces a team. Use the official terms in your language for scheme, ongoing, set in motion and abandon.
  scheme: {
    title: "Archenemy",
    // fr: The player, not the mode: "Archennemi".
    archenemy: "Archenemy",
    // Screen reader label for the scheme plate on the board, as in "Archenemy: Scheme due".
    // fr: The player, not the mode: "Archennemi : {{label}}".
    archenemyPlate: "Archenemy: {{label}}",
    // Button the archenemy taps at the start of their main phase to reveal the top scheme.
    setInMotion: "Set a scheme in motion",
    // Short plate text on the board when the archenemy still has to reveal a scheme this turn.
    due: "Scheme due",
    schemes: "Schemes",
    // Count of ongoing schemes on the board plate, as in "2 ongoing".
    ongoingCount_one: "{{count}} ongoing",
    ongoingCount_other: "{{count}} ongoing",
    ongoing: "Ongoing",
    abandon: "Abandon",
    last: "Last scheme",
    ownCards: "Your scheme deck",
    archenemyOnly: "Only the archenemy sets schemes in motion",
    opensSchemes: "Opens the schemes",
    // Log rows, as in "Ada set Behold the Power of Destruction in motion".
    revealed: "{{name}} set {{scheme}} in motion",
    revealedOwn: "{{name}} set a scheme in motion",
    abandoned: "{{name}} abandoned {{scheme}}",
  },
  log: {
    close: "Close log",
    empty: "No changes yet",
    // Under a commander damage row in the game log, naming whose commander dealt it, as in "From Grace's commander". Keep it short so the name fits.
    commanderFrom: "From {{name}}'s commander",
    // Two-Headed Giant: under a team's life change in the game log, naming the teammate who made it, as in "By Ada". Keep it short.
    by: "By {{name}}",
    // One row of the game log: a player's life change and the total it left them on, as in "Ada −3 to 17".
    // ja: This log also holds Prize cards, lore and points, so name no counter: {{name}} {{delta}} → {{life}}, like counterRow.
    // hi: Write “to {{life}}” as “, अब {{life}}”: “{{name}} {{delta}}, अब {{life}}”. “{{delta}} से {{life}}” reads as “from {{delta}} to {{life}}”.
    // fr: Never à or pour, which read as a range: "{{name}} {{delta}} → {{life}}".
    row: "{{name}} {{delta}} to {{life}}",
    // A commander damage row, as in "Ada −5 from Grace's commander, to 12".
    // ja: Name no counter: {{name}} {{delta}}（{{from}}の統率者から）→ {{life}}.
    // hi: Match the other log rows: “{{name}} {{delta}}, {{from}} के कमांडर से, अब {{life}}”.
    // fr: "{{name}} {{delta}} par le commandant de {{from}} → {{life}}".
    commanderRow: "{{name}} {{delta}} from {{from}}'s commander, to {{life}}",
    // A counter row in the game log, as in "Ada poison +1 to 3". {{counter}} is a counter such as poison, or a name the player gave their own counter.
    // fr: "{{name}} {{counter}} {{delta}} → {{value}}".
    counterRow: "{{name}} {{counter}} {{delta}} to {{value}}",
    undoLast: "Undo the last change",
    // Connected games: Undo takes back the newest change this player made, not anyone else's.
    undoMine: "Undo your last change",
  },
  // Only Yu-Gi-Oh! seats open this calculator, so use Yu-Gi-Oh!'s official words for damage and Life Points.
  calculator: {
    damage: "− Damage",
    // hi: A noun label beside “− डैमेज”, not a verb: “+ गेन”.
    gain: "+ Gain",
    subtractFrom: "Subtract {{amount}} from {{name}}",
    halve: "Halve {{name}}'s total",
    addTo: "Add {{amount}} to {{name}}",
    typeAmount: "Type an amount",
    // ja: Same word as board:lifeCard.openCalculator: {{name}}の電卓を閉じる.
    close: "Close {{name}}'s calculator",
    // One step of the life history: the change, then the total it led to, as in "-3 to 17".
    // hi: Write “to {{life}}” as “, अब {{life}}”: “{{delta}}, अब {{life}}”.
    // fr: Same arrow as the game log: "{{delta}} → {{life}}".
    logStep: "{{delta}} to {{life}}",
    log: "{{name}}'s life log: {{steps}}",
  },
  lifeEditor: {
    close: "Close life controls",
    slider: {
      none: "{{name}} life change",
      mtg: "{{name}} life change",
      ygo: "{{name}} Life Points change",
      pokemon: "{{name}} Prize cards change",
      lorcana: "{{name}} lore change",
      fab: "{{name}} life change",
      // hi: Copy the life wording: “{{name}} के पॉइंट में बदलाव”.
      riftbound: "{{name}} point change",
    },
    add: {
      none_one: "Add {{count}} life",
      none_other: "Add {{count}} life",
      mtg_one: "Add {{count}} life",
      mtg_other: "Add {{count}} life",
      ygo_one: "Add {{count}} Life Point",
      ygo_other: "Add {{count}} Life Points",
      pokemon_one: "Add {{count}} Prize card",
      pokemon_other: "Add {{count}} Prize cards",
      lorcana_one: "Add {{count}} lore",
      lorcana_other: "Add {{count}} lore",
      fab_one: "Add {{count}} life",
      fab_other: "Add {{count}} life",
      riftbound_one: "Add {{count}} point",
      riftbound_other: "Add {{count}} points",
    },
    subtract: {
      none_one: "Subtract {{count}} life",
      none_other: "Subtract {{count}} life",
      mtg_one: "Subtract {{count}} life",
      mtg_other: "Subtract {{count}} life",
      ygo_one: "Subtract {{count}} Life Point",
      ygo_other: "Subtract {{count}} Life Points",
      pokemon_one: "Subtract {{count}} Prize card",
      pokemon_other: "Subtract {{count}} Prize cards",
      lorcana_one: "Subtract {{count}} lore",
      lorcana_other: "Subtract {{count}} lore",
      fab_one: "Subtract {{count}} life",
      fab_other: "Subtract {{count}} life",
      riftbound_one: "Subtract {{count}} point",
      riftbound_other: "Subtract {{count}} points",
    },
  },
}

export default board
