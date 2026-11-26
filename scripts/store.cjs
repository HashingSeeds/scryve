const crypto = require("node:crypto")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const {
  LOCALES,
  SOURCE_LOCALE,
  fillStoreText,
  loadModule,
  loadTs,
  namespacePath,
  paywallValues,
} = require("./i18n.cjs")
const { readSecret } = require("./secrets.cjs")

const ROOT = path.resolve(__dirname, "..")
const KEYWORDS_PATH = path.join(ROOT, "src/i18n/storeKeywords.json")
const APPLE_CONFIG_PATH = path.join(ROOT, "store.config.json")
const PACKAGE = "com.sowinghope.count"
const PLAY_SUBSCRIPTION = "monthly"
const PLAY_API = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE}`
// why: Apple's subscription terms require cancelling at least 24 hours before renewal.
const APPLE_RENEWAL_NOTICE_HOURS = 24
const URLS = {
  eula: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/",
  terms: "https://scryve.sow.care/terms",
  privacy: "https://scryve.sow.care/privacy",
}
// why: our Spanish and French read naturally in every region, so each store region gets the same text.
const PLAY_LANGUAGES = {
  en: ["en-US"],
  es: ["es-419", "es-ES", "es-US"],
  fr: ["fr-FR", "fr-CA"],
  hi: ["hi-IN"],
  ja: ["ja-JP"],
  ko: ["ko-KR"],
  ar: ["ar"],
}
const APPLE_LOCALES = {
  // why: Apple searches English (US) only in the US and Japan. Most other storefronts search English (U.K.), and Canada searches English (Canada).
  en: ["en-US", "en-GB", "en-CA"],
  es: ["es-MX", "es-ES"],
  fr: ["fr-FR", "fr-CA"],
  hi: ["hi"],
  ja: ["ja"],
  ko: ["ko"],
  ar: ["ar-SA"],
}
const LIMITS = { description: 4000, releaseNotes: 4000, playReleaseNotes: 500, keywords: 100 }
// why: release:native uploads Android here, and promoting the release in Play Console carries its notes along.
const PLAY_TRACK = "internal"
// why: keywords may name these games and no others, even once more games release.
const KEYWORD_GAMES = ["mtg", "ygo", "pokemon"]

// why: the App Store already searches the name and subtitle, so a keyword repeating their words wastes characters; and keywords name only KEYWORD_GAMES.
function keywordProblems(locale, copy, keywords) {
  const words = (text) =>
    text
      .toLocaleLowerCase(locale)
      .split(/[\s,:：・·、&＆!()]+/u)
      .filter(Boolean)
  const taken = new Set([...words(copy[locale].appStoreName), ...words(copy[locale].subtitle)])
  const otherGames = new Set(
    [locale, SOURCE_LOCALE].flatMap((source) =>
      Object.entries(copy[source].gameNames)
        .filter(([id]) => !KEYWORD_GAMES.includes(id))
        .flatMap(([id, name]) => [id, ...words(name).filter((word) => [...word].length > 3)]),
    ),
  )
  return keywords.split(",").flatMap((keyword) => {
    const word = keyword.toLocaleLowerCase(locale)
    if (taken.has(word))
      return [`${locale}: keyword "${keyword}" is already in the name or subtitle`]
    if (otherGames.has(word))
      return [`${locale}: keyword "${keyword}" names a game outside KEYWORD_GAMES`]
    return []
  })
}

function releasedGames() {
  const { SYSTEMS, SYSTEM_IDS } = loadModule(path.join(ROOT, "convex/lib/systems/definitions.ts"))
  return SYSTEM_IDS.filter((id) => SYSTEMS[id].release === "general")
}

function storeCopy(locale) {
  const { listing, paywall } = loadTs(namespacePath(locale, "storefront"))
  const { MAX_PLAYERS } = loadModule(path.join(ROOT, "convex/lib/policy.ts"))
  const games = releasedGames().map((id) => {
    if (!listing.gameName[id])
      throw new Error(`${locale}/storefront: listing.gameName.${id} is missing`)
    return listing.gameName[id]
  })
  const values = {
    ...paywallValues(),
    maxPlayers: MAX_PLAYERS,
    count: APPLE_RENEWAL_NOTICE_HOURS,
    games: new Intl.ListFormat(locale, { type: "conjunction" }).format(games),
  }
  const fill = (text, url) => fillStoreText(text, url ? { ...values, url } : values, locale)
  const d = listing.description
  const renewal = `appleBilling_${new Intl.PluralRules(locale).select(APPLE_RENEWAL_NOTICE_HOURS)}`
  const body = [
    d.players,
    d.play,
    d.games,
    d.decks,
    d.events,
    d.noAccount,
    `${d.proHeading}\n${d.pro}`,
  ]
  const links = (names) => names.map((name) => fill(d[name], URLS[name])).join("\n")
  return {
    appStoreName: listing.appStoreName,
    playTitle: listing.playTitle,
    subtitle: listing.subtitle,
    shortDescription: listing.shortDescription,
    appleDescription: [...body, d[renewal], links(["eula", "terms", "privacy"])]
      .map((part) => fill(part))
      .join("\n\n"),
    playDescription: [...body, d.googleBilling, links(["terms", "privacy"])]
      .map((part) => fill(part))
      .join("\n\n"),
    releaseNotes: listing.whatsNew,
    subscriptionTitle: paywall.title,
    gameNames: listing.gameName,
  }
}

function allCopy() {
  const locales = [SOURCE_LOCALE, ...Object.keys(LOCALES)]
  const copy = Object.fromEntries(locales.map((locale) => [locale, storeCopy(locale)]))
  const keywords = JSON.parse(fs.readFileSync(KEYWORDS_PATH, "utf8"))
  const problems = locales.flatMap((locale) => {
    const { appleDescription, playDescription, releaseNotes } = copy[locale]
    const words = keywords[locale]
    return [
      ...(words === undefined ? [`${locale}: no keywords in src/i18n/storeKeywords.json`] : []),
      ...(!PLAY_LANGUAGES[locale] || !APPLE_LOCALES[locale]
        ? [
            `${locale}: add its store languages to PLAY_LANGUAGES and APPLE_LOCALES in scripts/store.cjs`,
          ]
        : []),
      ...(words && /,\s/.test(words) ? [`${locale}: keywords have a space after a comma`] : []),
      ...(words ? keywordProblems(locale, copy, words) : []),
      ...(words && [...words].length > LIMITS.keywords
        ? [
            `${locale}: keywords are ${[...words].length} characters; the limit is ${LIMITS.keywords}`,
          ]
        : []),
      ...[
        ["App Store description", appleDescription, LIMITS.description],
        ["Play description", playDescription, LIMITS.description],
        ["App Store release notes", releaseNotes, LIMITS.releaseNotes],
        ["Play release notes", releaseNotes, LIMITS.playReleaseNotes],
      ].flatMap(([name, text, limit]) =>
        [...text].length > limit
          ? [`${locale}: ${name} is ${[...text].length} characters; the limit is ${limit}`]
          : [],
      ),
    ]
  })
  if (problems.length) throw new Error(problems.join("\n"))
  return { copy, keywords }
}

async function playClient() {
  const raw = readSecret("GOOGLE_PLAY_STORE_LISTING_KEY")
  if (!raw)
    throw new Error(
      "GOOGLE_PLAY_STORE_LISTING_KEY did not resolve; check .env.schema and 1Password",
    )
  const key = JSON.parse(raw)
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url")
  const now = Math.floor(Date.now() / 1000)
  const claims = {
    iss: key.client_email,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: key.token_uri,
    iat: now,
    exp: now + 600,
  }
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode(claims)}`
  const signature = crypto.sign("RSA-SHA256", Buffer.from(unsigned), key.private_key)
  const tokenResponse = await fetch(key.token_uri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature.toString("base64url")}`,
    }),
  })
  const token = await tokenResponse.json()
  if (!token.access_token)
    throw new Error(`Google sign-in failed: ${token.error_description ?? token.error}`)
  return async (method, route, body) => {
    const response = await fetch(`${PLAY_API}${route}`, {
      method,
      headers: {
        "authorization": `Bearer ${token.access_token}`,
        "content-type": "application/json",
      },
      body: body && JSON.stringify(body),
    })
    const text = await response.text()
    const json = text ? JSON.parse(text) : {}
    if (!response.ok)
      throw new Error(`${method} ${route}: ${json.error?.message ?? response.status}`)
    return json
  }
}

const FIELDS = ["title", "shortDescription", "fullDescription"]

function changedFields(current, next) {
  return FIELDS.filter((field) => (current?.[field] ?? "") !== next[field])
}

// why: Play keeps the listing in drafts called edits; nothing changes until an edit is committed, so a dry run opens one, reads, and deletes it.
async function play({ apply }) {
  const { copy } = allCopy()
  const call = await playClient()
  const edit = await call("POST", "/edits")
  let committed = false
  try {
    const { listings = [] } = await call("GET", `/edits/${edit.id}/listings`)
    const current = new Map(listings.map((listing) => [listing.language, listing]))
    const wanted = Object.entries(PLAY_LANGUAGES).flatMap(([locale, languages]) =>
      languages.map((language) => ({
        language,
        title: copy[locale].playTitle,
        shortDescription: copy[locale].shortDescription,
        fullDescription: copy[locale].playDescription,
      })),
    )
    const changes = wanted.filter(
      (listing) => changedFields(current.get(listing.language), listing).length,
    )

    const subscription = await call("GET", `/subscriptions/${PLAY_SUBSCRIPTION}`)
    const subscriptionListings = new Map(
      subscription.listings.map((listing) => [listing.languageCode, listing]),
    )
    const wantedTitles = Object.entries(PLAY_LANGUAGES).flatMap(([locale, languages]) =>
      languages.map((languageCode) => ({ languageCode, title: copy[locale].subscriptionTitle })),
    )
    const titleChanges = wantedTitles.filter(
      ({ languageCode, title }) => subscriptionListings.get(languageCode)?.title !== title,
    )

    const track = await call("GET", `/edits/${edit.id}/tracks/${PLAY_TRACK}`)
    const newest = track.releases.reduce((a, b) =>
      Math.max(...b.versionCodes.map(Number)) > Math.max(...a.versionCodes.map(Number)) ? b : a,
    )
    const releaseNotes = Object.entries(PLAY_LANGUAGES).flatMap(([locale, languages]) =>
      languages.map((language) => ({ language, text: copy[locale].releaseNotes })),
    )
    const currentNotes = new Map(newest.releaseNotes?.map((note) => [note.language, note.text]))
    const notesChanged = releaseNotes.some(
      ({ language, text }) => currentNotes.get(language) !== text,
    )

    const preview = path.join(os.tmpdir(), "scryve-play-listing.json")
    fs.writeFileSync(
      preview,
      `${JSON.stringify({ listings: changes, subscriptionTitles: titleChanges, releaseNotes: notesChanged ? releaseNotes : [] }, null, 2)}\n`,
    )
    for (const listing of changes) {
      const before = current.get(listing.language)
      console.log(
        `${listing.language}: ${before ? `changes ${changedFields(before, listing).join(", ")}` : "new language"}`,
      )
    }
    for (const { languageCode, title } of titleChanges)
      console.log(
        `subscription ${PLAY_SUBSCRIPTION} ${languageCode}: ${JSON.stringify(subscriptionListings.get(languageCode)?.title ?? null)} → ${JSON.stringify(title)}`,
      )
    if (notesChanged) console.log(`${PLAY_TRACK} release ${newest.name}: changes release notes`)
    console.log(`Full text: ${preview}`)
    if (!changes.length && !titleChanges.length && !notesChanged)
      return console.log("Play is up to date.")
    if (!apply) return console.log("Dry run; nothing changed. Run again with --apply to publish.")

    for (const listing of changes) {
      const { video } = current.get(listing.language) ?? {}
      await call("PUT", `/edits/${edit.id}/listings/${listing.language}`, {
        ...listing,
        ...(video ? { video } : {}),
      })
    }
    if (notesChanged) {
      newest.releaseNotes = releaseNotes
      await call("PUT", `/edits/${edit.id}/tracks/${PLAY_TRACK}`, track)
    }
    if (changes.length || notesChanged) {
      await call("POST", `/edits/${edit.id}:commit`)
      committed = true
      console.log(
        `Committed ${changes.length} listing(s)${notesChanged ? ` and ${newest.name}'s release notes` : ""}; Google reviews listings before they go live.`,
      )
    }
    if (titleChanges.length) {
      for (const { languageCode, title } of wantedTitles)
        subscriptionListings.set(languageCode, {
          ...subscriptionListings.get(languageCode),
          languageCode,
          title,
        })
      await call(
        "PATCH",
        `/subscriptions/${PLAY_SUBSCRIPTION}?updateMask=listings&regionsVersion.version=2022/02`,
        {
          packageName: PACKAGE,
          productId: PLAY_SUBSCRIPTION,
          listings: [...subscriptionListings.values()],
        },
      )
      console.log(
        `Renamed subscription ${PLAY_SUBSCRIPTION} in ${titleChanges.length} language(s).`,
      )
    }
  } finally {
    if (!committed) await call("DELETE", `/edits/${edit.id}`)
  }
}

// why: eas metadata:push sends the whole file, so this fills only the localized text in a pulled copy and keeps every other answer as App Store Connect has it. Media stays as Apple has it: push skips a locale with no screenshots, and a preview whose file is missing, but pull saves previews as HLS playlists that push would upload over the real videos.
function apple() {
  if (!fs.existsSync(APPLE_CONFIG_PATH))
    throw new Error(
      "Run `eas metadata:pull` first. This fills its localized text and keeps everything else.",
    )
  const { copy, keywords } = allCopy()
  const config = JSON.parse(fs.readFileSync(APPLE_CONFIG_PATH, "utf8"))
  // why: pull reads the live version until this one exists; push creates the version it names.
  config.apple.version = JSON.parse(
    fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
  ).version
  fs.rmSync(path.join(ROOT, "store/apple/preview"), { recursive: true, force: true })
  const info = (config.apple.info ??= {})
  for (const localized of Object.values(info)) delete localized.screenshots
  const urls = (({ marketingUrl, supportUrl, privacyPolicyUrl, privacyChoicesUrl }) => ({
    marketingUrl,
    supportUrl,
    privacyPolicyUrl,
    privacyChoicesUrl,
  }))(info["en-US"] ?? {})
  for (const [locale, appleLocales] of Object.entries(APPLE_LOCALES))
    for (const appleLocale of appleLocales)
      info[appleLocale] = JSON.parse(
        JSON.stringify({
          ...urls,
          ...info[appleLocale],
          title: copy[locale].appStoreName,
          subtitle: copy[locale].subtitle,
          description: copy[locale].appleDescription,
          keywords: keywords[locale].split(","),
          releaseNotes: copy[locale].releaseNotes,
        }),
      )
  fs.writeFileSync(APPLE_CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`)
  console.log(
    `Filled ${Object.values(APPLE_LOCALES).flat().join(", ")} for ${config.apple.version} in store.config.json. Review it, then run eas metadata:push.`,
  )
}

async function main() {
  const [command, ...rest] = process.argv.slice(2)
  if (command === "play") return play({ apply: rest.includes("--apply") })
  if (command === "apple") return apple()
  console.error("Usage: node scripts/store.cjs <play [--apply]|apple>")
  process.exitCode = 1
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
