const connected = {
  relativeTime: {
    justNow: "just now",
    // A short "time ago" stamp in a list row. Abbreviate the unit the way your language does in compact UI.
    minutes_one: "{{count}}m ago",
    minutes_other: "{{count}}m ago",
    hours_one: "{{count}}h ago",
    hours_other: "{{count}}h ago",
    days_one: "{{count}}d ago",
    days_other: "{{count}}d ago",
  },
  resumeTitle: {
    hostingLobby: "Hosting · waiting to start",
    hostingActive: "Hosting · in progress",
    // ar: Status for a game you joined but don't host: "مشارك · بانتظار البدء". A bare لعب reads as "Play".
    playingLobby: "Playing · waiting to start",
    // ar: Status for a game you joined but don't host: "مشارك · قيد اللعب". A bare لعب reads as "Play".
    playingActive: "Playing · in progress",
  },
  seatCount_one: "{{count}} seat",
  seatCount_other: "{{count}} seats",
  allSeatsClaimed: "All seats claimed",
  waitingForPlayers_one: "Waiting for {{count}} more player",
  waitingForPlayers_other: "Waiting for {{count}} more players",
  decksRequired: "Decks required",
  yourSeat: "Your seat",
  seatNumber: "Seat {{seat}}",
  noDeckSelected: "No deck selected",
  lobbyExit: {
    // Host only: closes the lobby for everyone.
    abandon: {
      title: "Abandon this lobby?",
      message:
        "This closes the lobby for everyone and saves a terminal summary. It cannot be undone.",
      confirmText: "Abandon lobby",
    },
    // Only you leave; the lobby stays open for the others.
    leave: {
      title: "Leave this lobby?",
      message:
        "The lobby drops off your resume list. Other players and their history stay unchanged.",
      confirmText: "Leave lobby",
    },
  },
  onlineOnly: {
    // ja: "Never queued" means it cannot wait offline and send later: 開始はオンライン時のみ可能で、オフライン中は保留できません。 Never 順番待ち or キュー.
    start: "Reconnect to start the game. Starting is online-only and is never queued.",
    // ja: "Never queued" means it cannot wait offline and send later: …オンライン時のみ可能で、オフライン中は保留できません。 Never 順番待ち or キュー.
    exit: "Reconnect to leave or abandon this lobby. These actions are online-only and are never queued.",
    // ja: "Never queued" means it cannot wait offline and send later: 席の確保はオンライン時のみ可能で、オフライン中は保留できません。 Never 順番待ち or キュー.
    join: "Reconnect to claim a seat. Seat claims are online-only and are never queued.",
    // ja: "Never queued" means it cannot wait offline and send later: デッキの選択はオンライン時のみ可能で、オフライン中は保留できません。 Never 順番待ち or キュー.
    deck: "Reconnect to change decks. Deck choices are online-only and are never queued.",
  },
  gameGone: "This game no longer exists.",
  saving: "Saving…",
  waitingForHost: "Waiting for the host to start.",
  sync: {
    offline: "Offline",
    status: {
      slow: "Slow connection · sending {{unsent}}",
      offlineSaved_one: "Offline · {{count}} change saved",
      offlineSaved_other: "Offline · {{count}} changes saved",
      catchingUp: "Back online · sending {{unsent}}",
      notAccepted_one: "{{count}} change not accepted",
      notAccepted_other: "{{count}} changes not accepted",
      needsAttention: "Changes need attention",
    },
    accessibility: {
      slow_one: "Slow connection, {{count}} change sending",
      slow_other: "Slow connection, {{count}} changes sending",
      offlineSaved_one: "Offline, {{count}} change saved on this device",
      offlineSaved_other: "Offline, {{count}} changes saved on this device",
      catchingUp_one: "Back online, sending {{count}} change",
      catchingUp_other: "Back online, sending {{count}} changes",
    },
    announcement: {
      offline: "Offline. Changes are saved on this device.",
      attention: "A change needs attention.",
    },
  },
  outbox: {
    queueFull:
      "The offline queue for pending changes is full. Reconnect and sync before making more changes.",
    // Shown when an undo of several life changes could queue only some of them before the offline queue filled up.
    // es: Use "La cola sin conexión se llenó mientras se deshacían los cambios, así que solo se guardó una parte. Vuelve a conectarte y sincroniza, luego deshaz el resto."
    undoPartial:
      "The offline queue filled up partway through this undo, so only part of it was saved. Reconnect and sync, then undo the rest.",
    commanderDamageRange: "Commander damage changes have to be between {{min}} and {{max}}.",
    commanderSelfDamage: "A commander cannot damage itself",
    // Shown to the attacking player when their commander damage could not be added because the defender's total changed before it arrived, for example after someone else undid the same hit. {{name}} is the defending player; {{delta}} is the damage that was not added.
    commanderClaimDeclined:
      "{{delta}} commander damage to {{name}} wasn't added because their total changed first. Check the board and try again.",
    // hi: “और बदलाव रखने से पहले, जो बदलाव नहीं हो सके उन्हें देखकर हटाएँ, फिर दोबारा सिंक करें।”
    failureCapacity:
      "Failed changes need review before more rejected changes can be retained. Dismiss reviewed failures, then retry syncing.",
    finish: {
      // fr: Two separate fixes, network and account: "Reconnectez-vous à Internet et à votre compte avant de terminer cette partie."
      signIn: "Connect and sign in before finishing this game.",
      pendingChanges: "Wait for pending life changes to sync before finishing this game.",
      failedChanges: "Review failed life changes before finishing this game.",
      failed: "Could not finish the game",
    },
    abandon: {
      // fr: Two separate fixes, network and account: "Reconnectez-vous à Internet et à votre compte avant de terminer cette partie sans résultat."
      signIn: "Connect and sign in before abandoning this game.",
      pendingChanges: "Wait for pending life changes to sync before abandoning this game.",
      failedChanges: "Review failed life changes before abandoning this game.",
      failed: "Could not abandon the game",
    },
  },
  username: {
    rules: {
      minLength_one: "At least {{count}} character",
      minLength_other: "At least {{count}} characters",
      maxLength_one: "At most {{count}} character",
      maxLength_other: "At most {{count}} characters",
      allowedCharacters: "Letters, numbers, dashes, and underscores only",
      notNumbersAlone: "At least one letter, dash, or underscore",
    },
    ruleMet: "{{rule}}: met",
    ruleNotMet: "{{rule}}: not met yet",
    errors: {
      disabled:
        "Usernames are turned off for this app right now, so we could not save yours. Please try again later or contact support.",
      taken: "That username is already taken. Try another one.",
      saveFailed: "Could not save username",
    },
  },
  profile: {
    prepareFailed: "Could not prepare connected play",
    signedOut: "You are signed out or your session expired.",
    sessionRejected: "Convex rejected this signed-in session.",
  },
  gate: {
    checkingSession: "Checking your session… Local play remains available.",
    backToLocalPlay: "Back to local play",
    signInPrompt: "Sign in to play across devices. Local games remain available.",
    signIn: "Sign in",
    signInAgain: "Sign in again",
    username: {
      // hi: “अपना खिलाड़ी यूज़रनेम चुनें”, matching account:cloud.chooseUsername.
      title: "Choose your player username",
      // ar: Drop the lone @: "اسم المستخدم الفريد الخاص بك يعرّف بك في سجل المباريات المتصلة."
      // hi: Unique means it belongs only to you: “आपका @यूज़रनेम सिर्फ़ आपका है और कनेक्टेड गेम की हिस्ट्री में आपकी पहचान है।”
      description: "Your unique @username identifies you in connected game history.",
      label: "Username",
      suggest: "Suggest a username",
      save: "Save username",
      notAllowed:
        "That username is not allowed. Other players will see this name, so please choose another.",
    },
    offline: "Connected play is offline. Local play remains available.",
    connecting: "Connecting… Local play remains available.",
    authFailed: "We couldn’t connect your account. Try signing in again.",
    retrySetup: "Retry connected setup",
    preparingProfile: "Preparing your game profile…",
  },
  errorBoundary: {
    title: "Connected game unavailable",
    // hi: “Game membership” means being in this game, not a plan: “अपना इंटरनेट कनेक्शन और इनवाइट जाँचें, और देखें कि आप इस गेम में शामिल हैं। फिर दोबारा कोशिश करें। {{error}}”.
    message:
      "Check your internet connection, invitation, and game membership, then retry. {{error}}",
    back: "Back to a safe screen",
  },
  appearance: {
    color: "Color",
    // ko: 'mark' is the player's on-board shape: 모양 (색상과 모양). 표식 is only Flesh and Blood's Marked. Here: '모양'.
    // hi: “निशान”, as in रंग और निशान elsewhere; never चिह्न.
    mark: "Mark",
    colorOption: "Color {{color}}",
    colorOptionTaken: "Color {{color}}, already taken",
    // fr: Shapes are mostly feminine, so avoid agreement: "{{shape}}, indisponible".
    shapeTaken: "{{shape}}, already taken",
    shapePro: "{{shape}}, Scryve Pro",
    opensPro: "Opens Scryve Pro",
    pro: "Pro",
    // Two-Headed Giant: under a player's grayed-out colors. Teammates share one team color, picked in the Teams list; tapping this goes there. "Teams" is that list's heading.
    // hi: “Teams” is a heading name; quote it so the case ending stays: टीम का रंग “टीमें” में सेट होता है.
    teamColorInTeams: "Team color is set in Teams",
    shapes: {
      // A plant leaf, the player mark's shape.
      // ar: A leaf: "ورقة", the same word on both screens.
      heart: "leaf",
      // A scalloped round badge, like a prize ribbon's seal.
      // ar: A rosette badge: "وسام". Never وردة (a rose).
      triangle: "rosette",
      // hi: “चौकोर”, same as board:shape.square; never वर्ग.
      square: "square",
      // hi: “हीरा”, same as board:shape.diamond; never समचतुर्भुज.
      diamond: "diamond",
      star: "star",
      // hi: “षट्कोण”, same as board:shape.hexagon.
      hexagon: "hexagon",
      // hi: “प्लस”, same as board:shape.plus.
      plus: "plus",
      shield: "shield",
      // A crescent moon, the player mark's shape.
      // ko: Same shape as board:shape.moon: '초승달'.
      // ja: A crescent, same as the board: 三日月.
      moon: "moon",
      // A round ring with a hole in the middle, the player mark's shape.
      ring: "ring",
      // hi: “गोला”, same as board:shape.circle; never वृत्त.
      circle: "circle",
      // A hanging cloth banner with a notched bottom, the player mark's shape.
      banner: "banner",
      // A four-lobed shape like a four-leaf clover, the player mark's shape.
      // ko: Same shape as board:shape.quatrefoil: '네잎 무늬'.
      // es: Use "trébol de cuatro hojas", the same as board:shape.quatrefoil.
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
  },
  blockedPlayers: {
    title: "Blocked players",
    description: "Blocked players cannot join the same connected game as you.",
    loadingLabel: "Loading blocked players",
    loading: "Loading blocked players…",
    signedOut: "Sign in to manage blocked players.",
    empty: "No blocked players.",
    unblock: "Unblock",
    unblocking: "Unblocking…",
    unblockPlayer: "Unblock {{username}}",
    unblockFailed: "Could not unblock that player",
    loadFailed: "Couldn't load blocked players.",
    retryHint: "Loads blocked players again",
  },
  setup: {
    connecting: "Connecting… You can keep editing.",
    signInToHost: "Sign in to host",
    chooseUsername: "Choose username",
    unavailable: "Connected play is unavailable.",
  },
  host: {
    checkFailed: "Could not check for an existing hosted game.",
    checkingGames: "Checking your games…",
    // ja: "Not queued" means it cannot wait offline and send later: ロビーの作成はオフライン中は保留できません。 Never 順番待ち or キュー.
    reconnectToHost: "Reconnect before hosting; lobby creation is not queued.",
    profileNotReady: "Connected profile is not ready yet.",
    createFailed: "Could not create lobby",
    // ja: 退出 takes から: ゲームから退出または終了する前に再接続してください。
    reconnectToExit: "Reconnect before leaving or ending a game.",
    exitFailed: "Could not update this game.",
    offline: "You’re offline. Your setup is kept.",
    alreadyHosting: "End your hosted game before hosting another.",
  },
  publish: {
    failed: "Could not connect this game.",
    // ja: Same wording as connected:publish.twoVsTwo: 双頭巨人戦はまだ通信対戦にできません。デバイスで遊ぶには、新しいゲームを始めてください。
    twoHeadedGiant:
      "Two-Headed Giant games can't be connected yet. Start a new one to play on devices.",
    // hi: Keep “yet”: “2v2 गेम अभी कनेक्ट नहीं किए जा सकते। डिवाइस पर खेलने के लिए नया गेम शुरू करें।”
    twoVsTwo: "2v2 games can't be connected yet. Start a new one to play on devices.",
  },
  invite: {
    label: "Invite",
    title: "Invite players",
    close: "Close invite",
    code: "Invite code",
    scanOrEnter: "Scan to join or enter code {{code}}.",
    share: "Share invite",
    shareMessage: "Join my Scryve game: {{url}}",
    shareMessageCode: "Join my Scryve game with code {{code}}",
    shareFailed: "Could not open sharing",
  },
  // A read-only live view of a game that anyone with the link can open on a TV, laptop or stream. Never "Spectate" or "Stream".
  watch: {
    // Button that opens the Watch link for this game.
    label: "Watch link",
    title: "Watch this game",
    // Label above the code a viewer types after the site's address.
    code: "Watch code",
    // Under the QR code. {{url}} is the full address, as in "scryve.app/watch/K7QXM2PD".
    hint: "Scan or open {{url}} on any screen. Watchers can't change the game.",
    share: "Share watch link",
    shareMessage: "Watch my Scryve game live: {{url}}",
    failed: "Could not get a watch link",
    // On the TV when the link's code matches no game.
    notFound: "No game with that watch code",
    // On the TV when the host ended the game without a result.
    ended: "This game has ended",
    // On the TV before the host starts the game.
    waiting: "Waiting for the game to start",
    // On the TV once the game has a result.
    // ko: The game is over, not a finals match: '최종 결과'. Never 결승.
    // fr: Shown once the game is over, not a final match: "Terminé". Never Finale.
    final: "Final",
    // A counter on a player's tile, as in "Poison 3". {{name}} is the counter's short name.
    counter: "{{name}} {{value}}",
    // On a player's tile once they have lost and are out of the game.
    out: "Out",
    // Screen reader text for a mark showing damage from one player's commander, as in "7 commander damage from Ada".
    commanderDamage: "{{total}} commander damage from {{name}}",
    // Screen reader text for damage from the second of a player's two partner commanders, as in "7 commander damage from Ada's partner commander".
    partnerDamage: "{{total}} commander damage from {{name}}'s partner commander",
  },
  invalidInvite: {
    header: "Invitation",
    title: "Invalid invitation",
    message:
      "This Scryve invitation is malformed or incomplete. Ask the host for a new link or enter the {{length}}-character code.",
    enterCode: "Enter a manual code",
    // Button that goes to the Play tab.
    openPlay: "Go to Play",
  },
  seats: {
    openSeat: "Open seat",
    waiting: "Waiting",
    // ko: 'mark' is the player's on-board shape: 모양 (색상과 모양). 표식 is only Flesh and Blood's Marked.
    changeAppearance: "Change your color and mark",
    you: "You",
    deckSelected: "Deck selected",
    noDeck: "No deck",
    // This player is ready to start, which is more than having a deck.
    // fr: Never « Deck choisi » or a gendered « Prêt »: « ✓ C'est bon ».
    ready: "✓ Ready",
    chooseDeck: "○ Choose a deck",
    needsDeck: "○ Needs a deck",
    newDeck: "+ New deck",
    manageDecks: "Manage decks",
    account: "Account",
    accountDeckLabel: "{{name}}, synced",
    onDevice: "On this device",
    // Heading over decks other people shared by link, which this player opened and played.
    sharedWithYou: "Shared with you",
    sharedDeckLabel: "{{name}}, shared with you",
    syncAndUse: "Sync and use",
    syncAndUseLabel: "Sync and use {{name}}",
    syncing: "Syncing…",
    reconnectToSync: "Reconnect to continue.",
    // ko: Means the account's deck slots are used up: '계정의 덱 슬롯이 가득 찼습니다.'
    // ja: The account has used all its synced deck slots: 同期できるデッキが上限に達しています。 Never 満員.
    // fr: The synced-deck limit is reached, not the account: "Limite de decks atteinte."
    accountFull: "Account full.",
    freeSlot: "Free a slot",
    decksNotUsed: "Decks are not used for this game.",
    loadingDecksLabel: "Loading decks",
    loadingDecks: "Loading decks…",
    decksUnavailableRequired: "Decks unavailable. A deck is required to start.",
    decksUnavailableOptional: "Decks unavailable. You can play without one.",
    addDeckToJoin: "Sync a deck to join.",
    noDecksYet: "No synced decks yet.",
    deck: "Deck",
    deckVersion: "Deck version",
    selectingDeck: "Selecting deck…",
  },
  // "Seated with them" means put in the same game as them.
  playerActions: {
    title: "Players",
    // ja: "Seated with them" means put in the same game: …ブロックして同じゲームに入らないようにできます。 Never 同じ席.
    // hi: “Seated with them” means being in the same game: “कोई आपत्तिजनक नाम रिपोर्ट करें, या किसी खिलाड़ी को ब्लॉक करें ताकि वह आपके गेम में न आए।”
    description:
      "Report a name you find offensive, or block a player to stop being seated with them.",
    yourRole: "Your role",
    close: "Close player actions",
    thanks: "Thanks — that's been recorded",
    reportPlayer: "Report {{name}}",
    // hi: Refer to the player as उनका / उनके, and say not put in a game with them: “रिपोर्ट करने पर यह खिलाड़ी आपके लिए तुरंत ब्लॉक भी हो जाता है। आपको उनका यूज़रनेम नहीं दिखेगा और आपको दोबारा उनके साथ किसी गेम में नहीं रखा जाएगा। हम हर रिपोर्ट {{count}} घंटे के अंदर देखते हैं।”
    reportExplanation_one:
      "Reporting also blocks this player for you immediately. You will stop seeing their username and will not be seated with them again. We review every report within {{count}} hour.",
    // ja: "Seated with them" means put in the same game: 今後同じゲームになることもありません。 Never 同じ席に着く.
    // hi: Same as the _one form, with “{{count}} घंटे के अंदर” (not घंटों): “…आपको उनका यूज़रनेम नहीं दिखेगा और आपको दोबारा उनके साथ किसी गेम में नहीं रखा जाएगा। हम हर रिपोर्ट {{count}} घंटे के अंदर देखते हैं।”
    reportExplanation_other:
      "Reporting also blocks this player for you immediately. You will stop seeing their username and will not be seated with them again. We review every report within {{count}} hours.",
    reasons: {
      offensiveUsername: "Offensive username",
      harassment: "Harassment or abuse",
      // hi: “किसी और की नकल करना”, not the mythological रूप धरना.
      impersonation: "Impersonation",
      other: "Something else",
    },
    noteLabel: "Anything else we should know? (optional)",
    sending: "Sending…",
    sendReport: "Send report",
    // ja: "Seated with them" means put in the same game: 今後同じゲームになることはありません。 Never 同じ席.
    // es: Never «lo» or «él» for {{name}}: «…y bloqueamos a esa persona por ti.»
    reportConfirmation:
      "We received your report about {{name}} and blocked them for you. You will not be seated with them again.",
    // ja: "Seated with them" means put in the same game: 今後同じゲームになることはなく、… Never 同じ席.
    blockConfirmation:
      "{{name}} is blocked. You will not be seated with them again, and their name is hidden from you.",
    requestFailed: "Could not complete that request",
    noOtherPlayers: "No other players in this game.",
    report: "Report",
    block: "Block",
  },
  // A small technical table on the game board, behind the "Stats for nerds" setting. Keep every label very short.
  syncStats: {
    // Row for this device.
    you: "You",
    // Round-trip time to whoever runs the game.
    ping: "ping",
    // Median time for another player's change to show up here, in milliseconds.
    p50: "p50",
    // 90th percentile of the same time.
    p90: "p90",
    // 99th percentile of the same time.
    p99: "p99",
    // How many changes were timed.
    count: "n",
    // Median time from a tap on another phone to the change showing here, for a change to the tapper's own seat. Keep very short.
    tapOwn: "tap",
    // Median time from a tap on another phone to the change showing here, for a change the tapper made to someone else's seat. Keep very short.
    tapCross: "cross",
  },
  board: {
    checkingSession: "Checking connected session…",
    sessionUnavailable: "Connected session unavailable",
    unavailable: "Connected board unavailable",
    loading: "Loading connected board…",
    notCached: "This board is not saved on this device. Reconnect so the game can be loaded here.",
    anotherSeat: "Another seat",
    failedAction: {
      life: {
        none: "A {{delta}} life change could not sync",
        mtg: "A {{delta}} life change could not sync",
        ygo: "A {{delta}} Life Points change could not sync",
        pokemon: "A {{delta}} Prize cards change could not sync",
        lorcana: "A {{delta}} lore change could not sync",
        fab: "A {{delta}} life change could not sync",
        riftbound: "A {{delta}} point change could not sync",
      },
      commanderDamage: "A {{delta}} commander damage assignment could not sync",
      table: "A table change could not sync",
      confirmCommanderDamage: "Confirming commander damage could not sync",
      declineCommanderDamage: "Declining commander damage could not sync",
      // A change that could not sync, then why. {{action}} is one of the lines above; {{reason}} comes from the server.
      withReason: "{{action}}: {{reason}}",
    },
    menu: {
      players: "Players",
      history: "History",
      // fr: An action, not a label: "Terminer", never Fin.
      end: "End",
      leave: "Leave",
    },
    status: {
      close: "Close connected-game status",
      // Title for the summary of a finished connected game.
      summary: "Game over",
      offlineFor: "Offline for {{elapsed}}",
      slow: "Slow connection",
      backOnline: "Back online",
      connectedGame: "Connected game",
      connected: "Connected",
      finalChanges: "{{changes}} accepted · final",
      startsWith: "{{format}} · starts with {{value}}",
      otherPlayers: "Other players",
      updatedAgo: "Updated {{elapsed}} ago",
      mayArriveLate: "May arrive late",
      live: "Live",
      yourChanges: "Your changes",
      allSent: "All sent",
      // fr: {{unsent}} is "N modifications" (feminine): "Enregistré sur cet appareil : {{unsent}}. Envoi à votre reconnexion."
      savedOffline: "{{unsent}} saved on this device. They send when you reconnect.",
      sending: "Sending {{unsent}}",
      finishGame: "Finish game",
      // ja: Status row saying the game can be finished now: 終了できます. Never a bare 可能.
      finishAvailable: "Available",
      dismissFailure: "Dismiss after reviewing",
      readOnlyLobby: "This game hasn't started yet, so the board is read-only.",
      readOnlyAbandoned: "This game is abandoned and is read-only on the board.",
    },
    finishBlocker: {
      offline: { petal: "needs connection", detail: "Needs a connection" },
      sending: { petal: "sending changes", detail: "After your changes send" },
      rejected: { petal: "review first", detail: "Review the changes below first" },
    },
    abandoned: {
      dismiss: "Dismiss game ended notice",
      title: "Game ended",
      message: "The host ended this game. Its board stays read-only.",
      leave: "Leave",
    },
    finish: {
      cancel: "Cancel ending the connected game",
      title: "Who won?",
      // ja: Offers an option under the who-won title: 結果を記録せずに終了することもできます。サマリーは全員に確定されます。
      subtitle: "Skip to end without recording a result. The summary is final for everyone.",
      draw: "Draw",
      playerOption: "{{name}}, {{life}}",
      winnerOption: "{{name}}, {{life}}, winner",
    },
  },
  lobby: {
    // {{names}} lists the players, comma separated, whose Scryve is too old to let anyone change any player's seat. Until they update, the game plays the old way: each player changes only their own seat. Starting anyway is fine.
    // hi: “जब तक {{names}} Scryve अपडेट नहीं करते, कोई दूसरों की सीट नहीं बदल पाएगा। आप अभी शुरू कर सकते हैं। हर खिलाड़ी सिर्फ़ अपनी सीट बदल पाएगा।”
    outdatedApps_one:
      "{{names}} needs to update Scryve before everyone can edit any seat. You can start now. Each player will change only their own seat.",
    // ko: Everyone is held back until {{names}} update: '모든 플레이어가 다른 자리도 수정하려면 {{names}}님이 Scryve를 업데이트해야 합니다. 지금 시작해도 됩니다. 그동안 각 플레이어는 자기 자리만 수정할 수 있습니다.'
    // hi: “जब तक {{names}} Scryve अपडेट नहीं करते, कोई दूसरों की सीट नहीं बदल पाएगा। आप अभी शुरू कर सकते हैं। हर खिलाड़ी सिर्फ़ अपनी सीट बदल पाएगा।”
    outdatedApps_other:
      "{{names}} need to update Scryve before everyone can edit any seat. You can start now. Each player will change only their own seat.",
    title: "Lobby",
    loadingLabel: "Loading lobby",
    loading: "Loading lobby…",
    unavailable: "This lobby is unavailable.",
    players: "Players",
    playerCount: "Number of players",
    readyCount: "{{ready}} of {{total}} ready",
    starting: "Starting…",
    waitingForDecks: "Waiting for decks",
    keepOpen: "Keep this lobby open",
    errors: {
      selectDeck: "Could not select deck",
      updateSettings: "Could not update lobby settings",
      start: "Could not start the game",
      // ko: 'mark' is the player's on-board shape: 모양 (색상과 모양). 표식 is only Flesh and Blood's Marked.
      appearance: "Could not update your color and mark",
      leave: "Could not leave lobby",
    },
    closed: {
      close: "Close lobby",
      title: "Lobby closed",
      // ja: 参加 takes に, so split the verbs: 別のゲームを始めるか、ほかのゲームに参加できます。
      abandoned: "This game was abandoned. You can start or join another game.",
      // ja: 参加 takes に, so split the verbs: 別のゲームを始めるか、ほかのゲームに参加できます。
      // hi: Offer a different game, not the one that ended: “यह गेम खत्म हो चुका है। आप नया गेम शुरू कर सकते हैं या किसी दूसरे गेम में शामिल हो सकते हैं।”
      // es: Use "Esta partida terminó. Puedes iniciar otra partida o unirte a una."
      ended: "This game has ended. You can start or join another game.",
      ok: "OK",
    },
    appearance: {
      // ko: 'mark' is the player's on-board shape: 모양 (색상과 모양). 표식 is only Flesh and Blood's Marked.
      close: "Close color and mark picker",
      // ko: 'mark' is the player's on-board shape: 모양 (색상과 모양). 표식 is only Flesh and Blood's Marked.
      title: "Your color and mark",
    },
  },
  scanner: {
    title: "Scan invite",
    // ko: '기기 스캐너로 Scryve 초대 QR을 스캔하세요. 인식은 기기에서만 이루어지며 이미지는 저장되지 않습니다.'
    body: "Use the device scanner to find a trusted Scryve invite QR. Recognition stays on-device and no image is saved.",
    webUnavailable:
      "Camera QR scanning is available in the iOS and Android app. Enter the {{length}}-character code instead.",
    nativeUnavailable:
      "The native QR scanner is unavailable on this device. Enter the invitation code manually.",
    untrusted: "That QR is not a trusted Scryve invitation. Try another code or enter it manually.",
    openFailed: "The QR scanner couldn't open on this device. Try again or enter the code instead.",
    enterManually: "Enter code manually",
    open: "Open QR scanner",
    opening: "Opening scanner…",
    cancel: "Cancel and enter code",
    permission: {
      title: "Camera permission",
      body: "Scryve uses the camera only while this screen is open to read an invitation QR. Images are not captured, stored, or uploaded.",
      denied:
        "Camera access is denied. You can enable it in system settings or enter the code manually.",
      allow: "Allow camera",
      openSettings: "Open settings",
    },
  },
  join: {
    invitedTitle: "Join invited lobby",
    codeTitle: "Join with code",
    invitedBody: "Join your friends using this invitation.",
    codeBody: "Enter the host's {{length}}-character code.",
    // es: Same text as errors:invalidInvite; use caducar: "La invitación no es válida, caducó o fue revocada".
    invalidInvite: "Invite is invalid, expired, or revoked",
    localGameActive: "Finish or abandon your active local game before joining a connected game.",
    invalidCode: "Enter a valid invitation code.",
    invalidManualCode: "Enter a valid {{length}}-character invitation code.",
    seatTaken: "That seat was just taken. Pick another seat.",
    // es: Use "No pudiste unirte a la sala".
    failed: "Could not join lobby",
    scan: "Scan QR code",
    differentInvitation: "Use a different invitation",
    // fr: Joining a game, not signing in: "Vous rejoignez en tant que @{{username}}".
    joiningAs: "Joining as @{{username}}",
    pickSeat: "Pick your seat",
    pickSeatBody: "Each open seat carries its own counters from the game already in progress.",
    // Joining a connected game, not signing in.
    joining: "Joining…",
    join: "Join game",
  },
  treachery: {
    name: "Treachery",
    roles: {
      // fr: Official French Treachery role: "Seigneur".
      leader: "Leader",
      guardian: "Guardian",
      // hi: “असैसिन”, matching the Leader's goal text; never हत्यारा.
      assassin: "Assassin",
      // hi: “ट्रेटर”, matching the Leader's goal text; never गद्दार.
      traitor: "Traitor",
    },
    goals: {
      // ar: Use the present tense, as the Guardian line does: "تفوز عندما يخرج كل القتلة والخونة." "افز" is not a word.
      // ja: Use the role names and 脱落: すべてのアサシンと裏切り者が脱落すると勝ちです。
      leader: "Win once every Assassin and Traitor is out.",
      // fr: The Leader is le Seigneur (official French Treachery role).
      guardian: "Keep the Leader alive. You win with them.",
      // ar: Use the present tense, as the Guardian line does: "تفوز عندما يخرج الزعيم." "افز" is not a word.
      // ja: Use 脱落 like the other goals: リーダーが脱落したら勝ちです。
      // fr: The Leader is le Seigneur (official French Treachery role).
      assassin: "Win when the Leader is out.",
      traitor: "Be the last player standing.",
    },
    revealFailed: "Could not reveal your role",
    hideRole: "Hide your role",
    // hi: The subject is your role (भूमिका, feminine): “सबको दिख रही है।”
    // fr: "Visible par toute la table."
    faceUp: "Face up for the table.",
    // hi: The subject is your role (भूमिका, feminine): “टेबल से छिपी है। दिखाने के लिए दोबारा कनेक्ट करें।”
    // fr: "Caché aux autres joueurs. Reconnectez-vous pour le révéler."
    hiddenOffline: "Hidden from the table. Reconnect to reveal it.",
    // hi: The subject is your role (भूमिका, feminine): “टेबल से छिपी है।”
    // fr: Hidden from the other players: "Caché aux autres joueurs." Never pour la table.
    hidden: "Hidden from the table.",
    hide: "Hide",
    revealing: "Revealing…",
    revealConfirm: "Reveal to all?",
    reveal: "Reveal",
  },
  nearby: {
    title: "Nearby games",
    accessTitle: "Nearby access is off",
    accessDenied: "Allow nearby devices access in Settings to find and host games.",
    openSettings: "Open settings",
    starting: "Starting lobby…",
    connecting: "Connecting…",
    connectingTo: "Connecting to {{name}}…",
    reconnecting: "Reconnecting…",
    reconnectingTo: "Reconnecting to {{name}}…",
    nameLabel: "Your name",
    namePlaceholder: "Shown to the table",
    empty: "No games on this network yet.",
    notFound:
      "No games found. Check that you're on the same Wi-Fi as the host. Guest and public Wi-Fi often block this.",
    join: "Join {{name}}",
    you: "{{name}} (you)",
    // A seated player whose phone lost its connection to the nearby game. Not about distance.
    // ar: A player who stepped away or dropped off: "غائب". بعيد reads as out of range.
    away: "Away",
    startAgain: "Start again",
    backToGame: "Back to game",
    errors: {
      hostFailed: "Could not host: {{error}}",
      unreachable:
        "Couldn't reach {{name}}. The game may have ended, or this Wi-Fi blocks devices from connecting.",
      lostHost: "Lost the host. The game may have ended.",
    },
    rejected: {
      seatTaken: "That seat belongs to another device.",
      started: "This game has already started.",
      full: "This game is full.",
      update: "Update Scryve to join this game.",
      hostOutdated: "The host needs to update Scryve first.",
    },
  },
}

export default connected
