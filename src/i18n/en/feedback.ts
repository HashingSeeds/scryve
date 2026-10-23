const feedback = {
  support: {
    search: "Search help",
    yourFeedback: "Your feedback",
    // Count of feedback threads with a reply the player hasn't opened.
    newCount_one: "{{count}} new",
    newCount_other: "{{count}} new",
    email: "Email support",
    emailDetail: "Account or billing questions",
    suggest: "Suggest a feature or report a bug",
    // {{query}} is what the player typed in search.
    noMatch: "No answers for “{{query}}”.",
    ask: "Ask us about “{{query}}”",
  },
  // Shown under the navigation bar while the app has no connection to Scryve's servers.
  offline: "Offline. Your draft stays here until you're back.",
  suggest: {
    title: "Send feedback",
    kind: "What is it?",
    feature: "Feature",
    bug: "Bug",
    bodyLabel: "Message",
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
    sendFailed: "Couldn't send. Try again.",
    // Shown when a player sent too much feedback in a short time.
    rateLimited_one: "Too many sends. Try again in {{count}} minute.",
    rateLimited_other: "Too many sends. Try again in {{count}} minutes.",
  },
  mine: {
    title: "Your feedback",
    empty: "Nothing sent from this device yet.",
    // Marks a thread with a reply the player hasn't opened.
    unread: "New",
    deleteAll: "Delete my feedback",
    deleteHint: "Removes what this device sent. Bug details already sent to Sentry stay there.",
    deleteConfirmTitle: "Delete your feedback?",
    deleteConfirmBody:
      "This removes what this device sent, along with its replies. Bug details already sent to Sentry stay there.",
    delete: "Delete",
    deleteFailed: "Couldn't delete your feedback. Try again when you're online.",
  },
  thread: {
    missing: "This feedback is gone.",
    you: "You",
    team: "Scryve",
    replyLabel: "Reply",
    replyPlaceholder: "Add a detail or answer a question",
    send: "Send",
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
