/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accountDeletion from "../accountDeletion.js";
import type * as accountDeletionActions from "../accountDeletionActions.js";
import type * as cards from "../cards.js";
import type * as crons from "../crons.js";
import type * as deckImports from "../deckImports.js";
import type * as decks from "../decks.js";
import type * as entitlements from "../entitlements.js";
import type * as games from "../games.js";
import type * as http from "../http.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_authConfig from "../lib/authConfig.js";
import type * as lib_deckGames from "../lib/deckGames.js";
import type * as lib_entitlements from "../lib/entitlements.js";
import type * as lib_pagination from "../lib/pagination.js";
import type * as lib_policy from "../lib/policy.js";
import type * as lib_scryfall from "../lib/scryfall.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accountDeletion: typeof accountDeletion;
  accountDeletionActions: typeof accountDeletionActions;
  cards: typeof cards;
  crons: typeof crons;
  deckImports: typeof deckImports;
  decks: typeof decks;
  entitlements: typeof entitlements;
  games: typeof games;
  http: typeof http;
  "lib/auth": typeof lib_auth;
  "lib/authConfig": typeof lib_authConfig;
  "lib/deckGames": typeof lib_deckGames;
  "lib/entitlements": typeof lib_entitlements;
  "lib/pagination": typeof lib_pagination;
  "lib/policy": typeof lib_policy;
  "lib/scryfall": typeof lib_scryfall;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
