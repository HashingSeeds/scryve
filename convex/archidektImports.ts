import { v } from "convex/values"

import { action } from "./_generated/server"
import { requireActionCapability } from "./lib/actionCapabilities"
import { limitDeckImport } from "./lib/deckRateLimits"
import { archidektDeckLink, resolveArchidektDeck } from "./lib/games/archidekt"

// eslint-disable-next-line self-explanatory-code/prefer-self-explanatory-code -- Records an installed-client compatibility constraint.
// Installed clients that predate `deckImports.resolveLink` still call this.
export const resolvePublic = action({
  args: { url: v.string() },
  handler: async (ctx, args) => {
    const link = archidektDeckLink(args.url)
    await limitDeckImport(ctx)
    await requireActionCapability(ctx, "mtg", "deckImport")
    return await resolveArchidektDeck(ctx, link)
  },
})
