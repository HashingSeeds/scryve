import { identitySection, identityStartingValue } from "./systems"
import type { Id } from "../_generated/dataModel"
import type { QueryCtx } from "../_generated/server"

export async function deckStartingValue(
  ctx: QueryCtx,
  deckVersionId: Id<"deckVersions">,
  system: string | undefined,
  format: string | undefined,
) {
  const section = identitySection(system, format)
  if (!section?.startingValueFacet) return undefined
  const identity = await ctx.db
    .query("deckCards")
    .withIndex("by_deck_version_and_section", (query) =>
      query.eq("deckVersionId", deckVersionId).eq("section", section.id),
    )
    .first()
  if (!identity?.cardId || !identity.identityNamespace) return undefined
  const { cardId, identityNamespace } = identity
  const card = await ctx.db
    .query("gameCards")
    .withIndex("by_game_and_identity_namespace_and_card_id", (query) =>
      query
        .eq("game", identity.game ?? system ?? "")
        .eq("identityNamespace", identityNamespace)
        .eq("cardId", cardId),
    )
    .unique()
  return identityStartingValue(system, format, card?.facets)
}
