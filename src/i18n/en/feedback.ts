const feedback = {
  board: {
    title: "Feature requests",
    empty: "No public requests yet. Suggest the first one.",
    suggest: "Suggest a feature",
    mine: "My requests",
    // Shown beside "My requests" when the team replied or changed a status.
    mineUnread_one: "My requests · {{count}} new",
    mineUnread_other: "My requests · {{count}} new",
    filters: "Filter by status",
    all: "All",
    // Accessibility label on the vote button of a request.
    vote: "Vote for {{title}}, {{count}} votes",
    removeVote: "Remove your vote for {{title}}, {{count}} votes",
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
  report: {
    action: "Report",
    // Accessibility label on the Report button of a public request.
    label: "Report {{title}}",
    done: "Reported",
    title: "Report this request?",
    body: "We'll review it and hide it if it breaks the rules. The sender won't know who reported it.",
    confirm: "Report",
  },
  form: {
    title: "Send feedback",
    kind: "What is it?",
    feature: "Feature",
    bug: "Bug",
    titleLabel: "Title",
    titlePlaceholder: "One line",
    bodyLabel: "Details",
    bodyPlaceholder: {
      feature: "What would you like, and when would you use it?",
      bug: "What happened? What did you expect?",
    },
    includeAccount: "Include my account",
    includeAccountHelper:
      "Replies follow you to every device you sign in on, and we see your username.",
    anonymous:
      "Sent without your account. Replies show on this device, and reinstalling may lose them.",
    signInToKeep: "Sign in to keep it",
    send: "Send",
    sendFailed: "Couldn't send. Try again.",
    private: "We read everything. Feature requests go on the public board once we review them.",
  },
  mine: {
    title: "My requests",
    empty: "Nothing sent from this device yet.",
    // Marks a request with a reply or status change the player hasn't opened.
    unread: "New",
    private: "Private",
    deleteAll: "Delete my feedback",
    deleteConfirmTitle: "Delete your feedback?",
    deleteConfirmBody:
      "This removes everything sent from this device, along with its replies and votes.",
    delete: "Delete",
  },
  thread: {
    title: "Request",
    missing: "This request is gone.",
    you: "You",
    team: "Scryve",
    replyLabel: "Reply",
    replyPlaceholder: "Add a detail or answer a question",
    send: "Send",
    sendFailed: "Couldn't send. Try again.",
    includeAccount: "Include my account",
    includeAccountHelper: "Lets us see your username and keeps this thread on every device.",
    linked: "Sent with your account",
    signInToKeep: "Sign in to keep this thread if you reinstall",
  },
  unavailable: "Feedback needs Scryve's cloud, which isn't set up in this build.",
}

export default feedback
