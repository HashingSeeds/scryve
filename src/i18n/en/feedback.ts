const feedback = {
  support: {
    search: "Search help and requests",
    allRequests: "All requests",
    yourRequests: "Your requests",
    // Count of requests with a reply or status change the player hasn't opened.
    newCount_one: "{{count}} new",
    newCount_other: "{{count}} new",
    email: "Email support",
    emailDetail: "Account, billing, or anything private",
    suggest: "Suggest a feature or report a bug",
  },
  // Shown under the navigation bar while the app has no connection to Scryve's servers.
  offline: "Offline. What you send waits and goes out when you're back.",
  board: {
    title: "Feature requests",
    search: "Search requests and bugs",
    tabs: {
      label: "Show",
      all: "All",
      features: "Features",
      bugs: "Bugs",
      shipped: "Shipped",
    },
    empty: "No public requests yet. Suggest the first one.",
    // {{query}} is what the player typed in search.
    noMatch: "Nothing matches “{{query}}”.",
    suggestQuery: "Suggest “{{query}}”",
    suggest: "Suggest a feature or report a bug",
    mine: "Your requests",
    mineUnread_one: "Your requests · {{count}} new",
    mineUnread_other: "Your requests · {{count}} new",
    // Marks a request on the board that this player sent.
    yours: "Yours",
    bug: "Bug",
    // Accessibility label on the vote button of a request.
    vote_one: "Vote for {{title}}, {{count}} vote",
    vote_other: "Vote for {{title}}, {{count}} votes",
    removeVote_one: "Remove your vote for {{title}}, {{count}} vote",
    removeVote_other: "Remove your vote for {{title}}, {{count}} votes",
    offlineVotes: "Votes count here now and sync when you're back.",
    voteFailed: "Couldn't save your vote. Try again.",
  },
  status: {
    review: "In review",
    planned: "Planned",
    building: "In progress",
    shipped: "Shipped",
    // A badge on a finished request, e.g. "Shipped in 2.1.0".
    shippedIn: "Shipped in {{version}}",
    declined: "Declined",
  },
  request: {
    // Under a request: how many players voted for it, including the sender.
    want_one: "{{count}} player wants this",
    want_other: "{{count}} players want this",
    report: "Report this request",
    reported: "Reported. Thanks, we'll review it.",
    reportFailed: "Couldn't report. Try again.",
    missing: "This request isn't on the board.",
  },
  report: {
    title: "Report this request?",
    body: "It comes off the board until we review it. The sender won't know who reported it.",
    confirm: "Report",
  },
  suggest: {
    title: "Suggest",
    kind: "What is it?",
    feature: "Feature",
    bug: "Bug",
    titleLabel: "Title",
    titlePlaceholder: "Try “timer” or “commander”",
    matchesHint: "Requests like yours show here as you type.",
    noMatches: "Nothing like it yet.",
    matchesIntro: "Already asked? Vote instead.",
    continue: "Continue",
    editTitle: "Edit title",
    bodyLabel: "Details",
    bodyPlaceholder: {
      feature: "What would you like, and when would you use it?",
      bug: "What happened? What did you expect?",
    },
    addScreenshot: "Add screenshot",
    removeScreenshot: "Remove screenshot",
    selectedScreenshot: "Selected screenshot",
    screenshotFailed: "Couldn't add that screenshot. Try another image.",
    bugDisclosure: "Bug reports also send your device details and any screenshot to Sentry.",
    translationNotice:
      "Write in any language. We may use AI tools to translate it. See our <privacy>Privacy Policy</privacy>.",
    includeAccount: "Include my account",
    includeAccountHelper:
      "Replies follow you to every device you sign in on, and we see your username.",
    anonymous:
      "Sent without your account. Replies show on this device, and reinstalling may lose them.",
    signInToKeep: "Sign in to keep it",
    send: "Send",
    sendOffline: "Send when online",
    sendFailed: "Couldn't send. Try again.",
    // Shown when a player sent too much feedback in a short time.
    rateLimited_one: "Too many sends. Try again in {{count}} minute.",
    rateLimited_other: "Too many sends. Try again in {{count}} minutes.",
  },
  mine: {
    title: "Your requests",
    empty: "Nothing sent from this device yet.",
    // Marks a request with a reply or status change the player hasn't opened.
    unread: "New",
    public: "Public",
    private: "Private",
    bug: "Bug",
    waiting: "Waiting for connection. Sends when you're back.",
    sending: "Sending…",
    // {{reason}} is a short error, e.g. "Sign in to include your account".
    notSent: "Not sent. {{reason}}",
    // Reason a request queued with the player's account was held back after they switched accounts.
    otherAccount: "You switched accounts before it sent",
    discard: "Discard",
    deleteAll: "Delete my feedback",
    deleteHint: "Removes what this device sent. Bug details already sent to Sentry stay there.",
    deleteConfirmTitle: "Delete your feedback?",
    deleteConfirmBody:
      "This removes what this device sent, along with its replies and votes. Bug details already sent to Sentry stay there.",
    delete: "Delete",
    deleteFailed: "Couldn't delete your feedback. Try again when you're online.",
  },
  thread: {
    missing: "This request is gone.",
    you: "You",
    team: "Scryve",
    // A toggle under a request the Scryve team reworded; it reveals what the player first sent.
    editedShow: "Edited by Scryve · show what you sent",
    editedHide: "Edited by Scryve · hide what you sent",
    replyLabel: "Reply",
    replyPlaceholder: "Add a detail or answer a question",
    send: "Send",
    sendOffline: "Send when online",
    sendFailed: "Couldn't send. Try again.",
    includeAccount: "Include my account",
    includeAccountHelper: "Lets us see your username and keeps this thread on every device.",
    linked: "Sent with your account",
    linkedElsewhere: "Sent with a different account",
    signInToKeep: "Sign in to keep this thread if you reinstall",
  },
  unavailable: "Feedback needs Scryve's cloud, which isn't set up in this build.",
}

export default feedback
