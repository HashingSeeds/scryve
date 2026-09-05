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
import type * as cardCatalog from "../cardCatalog.js";
import type * as cards from "../cards.js";
import type * as crons from "../crons.js";
import type * as deckCatalogs from "../deckCatalogs.js";
import type * as deckImports from "../deckImports.js";
import type * as decks from "../decks.js";
import type * as entitlements from "../entitlements.js";
import type * as externalApiRateLimits from "../externalApiRateLimits.js";
import type * as games from "../games.js";
import type * as http from "../http.js";
import type * as integrationManifest from "../integrationManifest.js";
import type * as legal from "../legal.js";
import type * as lib_actionCapabilities from "../lib/actionCapabilities.js";
import type * as lib_appearance from "../lib/appearance.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_authConfig from "../lib/authConfig.js";
import type * as lib_deckGames from "../lib/deckGames.js";
import type * as lib_deckVersions from "../lib/deckVersions.js";
import type * as lib_entitlements from "../lib/entitlements.js";
import type * as lib_games_cards from "../lib/games/cards.js";
import type * as lib_games_limitless from "../lib/games/limitless.js";
import type * as lib_games_magic from "../lib/games/magic.js";
import type * as lib_games_pokemon from "../lib/games/pokemon.js";
import type * as lib_games_yugioh from "../lib/games/yugioh.js";
import type * as lib_games_yugiohDecks from "../lib/games/yugiohDecks.js";
import type * as lib_integrations from "../lib/integrations.js";
import type * as lib_moderation from "../lib/moderation.js";
import type * as lib_moderationRetention from "../lib/moderationRetention.js";
import type * as lib_nameFilter from "../lib/nameFilter.js";
import type * as lib_pagination from "../lib/pagination.js";
import type * as lib_policy from "../lib/policy.js";
import type * as lib_scryfall from "../lib/scryfall.js";
import type * as lib_usernameSuggestions from "../lib/usernameSuggestions.js";
import type * as moderation from "../moderation.js";
import type * as providerHealth from "../providerHealth.js";
import type * as users from "../users.js";
import type * as waitlist from "../waitlist.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accountDeletion: typeof accountDeletion;
  accountDeletionActions: typeof accountDeletionActions;
  cardCatalog: typeof cardCatalog;
  cards: typeof cards;
  crons: typeof crons;
  deckCatalogs: typeof deckCatalogs;
  deckImports: typeof deckImports;
  decks: typeof decks;
  entitlements: typeof entitlements;
  externalApiRateLimits: typeof externalApiRateLimits;
  games: typeof games;
  http: typeof http;
  integrationManifest: typeof integrationManifest;
  legal: typeof legal;
  "lib/actionCapabilities": typeof lib_actionCapabilities;
  "lib/appearance": typeof lib_appearance;
  "lib/auth": typeof lib_auth;
  "lib/authConfig": typeof lib_authConfig;
  "lib/deckGames": typeof lib_deckGames;
  "lib/deckVersions": typeof lib_deckVersions;
  "lib/entitlements": typeof lib_entitlements;
  "lib/games/cards": typeof lib_games_cards;
  "lib/games/limitless": typeof lib_games_limitless;
  "lib/games/magic": typeof lib_games_magic;
  "lib/games/pokemon": typeof lib_games_pokemon;
  "lib/games/yugioh": typeof lib_games_yugioh;
  "lib/games/yugiohDecks": typeof lib_games_yugiohDecks;
  "lib/integrations": typeof lib_integrations;
  "lib/moderation": typeof lib_moderation;
  "lib/moderationRetention": typeof lib_moderationRetention;
  "lib/nameFilter": typeof lib_nameFilter;
  "lib/pagination": typeof lib_pagination;
  "lib/policy": typeof lib_policy;
  "lib/scryfall": typeof lib_scryfall;
  "lib/usernameSuggestions": typeof lib_usernameSuggestions;
  moderation: typeof moderation;
  providerHealth: typeof providerHealth;
  users: typeof users;
  waitlist: typeof waitlist;
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
