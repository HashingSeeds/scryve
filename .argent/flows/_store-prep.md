# Store capture prerequisite

These `store-*` flows assume the legal consent gate has already been accepted on
the capture simulator. Argent flows are deterministic and cannot branch, so the
gate cannot be handled conditionally inside a flow.

One-time, per simulator, before the first capture run:

    agent-device open com.sowinghope.count --platform ios
    # accept "Before you start" -> accept-legal-button
    agent-device close

Any flow here then starts from a launched, consented app with no active game.
