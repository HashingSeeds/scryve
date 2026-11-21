import type { WithoutSystemFields } from "convex/server"

import type { Doc } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"

type GameSetupField =
  | "startingLife"
  | "lifeStep"
  | "ruleset"
  | "deckRequired"
  | "game"
  | "system"
  | "format"
  | "variant"
  | "modeSetup"
  | "layout"
  | "lifeEditing"
  | "matchBestOf"
  | "firstPlayerMode"
  | "freeMulligans"

/** why: every key is required, so a new setup field fails to compile until each way of starting a game picks its value. */
export type GameSetup = { [Field in GameSetupField]: Doc<"games">[Field] }

export const gameSetupOf = ({
  startingLife,
  lifeStep,
  ruleset,
  deckRequired,
  game,
  system,
  format,
  variant,
  modeSetup,
  layout,
  lifeEditing,
  matchBestOf,
  firstPlayerMode,
  freeMulligans,
}: Doc<"games">): GameSetup => ({
  startingLife,
  lifeStep,
  ruleset,
  deckRequired,
  game,
  system,
  format,
  variant,
  modeSetup,
  layout,
  lifeEditing,
  matchBestOf,
  firstPlayerMode,
  freeMulligans,
})

export async function insertGame(
  ctx: MutationCtx,
  setup: GameSetup,
  row: Omit<WithoutSystemFields<Doc<"games">>, GameSetupField>,
) {
  return await ctx.db.insert("games", { ...row, ...setup })
}
