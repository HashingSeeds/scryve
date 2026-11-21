import type { ObjectType, PropertyValidators } from "convex/values"

import type { MutationCtx, QueryCtx } from "../../_generated/server"

/** why: a `mutation()` exported from this folder would also register as a public `lib/games/*` function, so handlers stay plain until games.ts registers them as `games:*`. */
export const mutationHandler = <Args extends PropertyValidators, Result>(definition: {
  args: Args
  handler: (ctx: MutationCtx, args: ObjectType<Args>) => Promise<Result>
}) => definition

export const queryHandler = <Args extends PropertyValidators, Result>(definition: {
  args: Args
  handler: (ctx: QueryCtx, args: ObjectType<Args>) => Promise<Result>
}) => definition
