import { englishDataset, englishRecommendedTransformers, RegExpMatcher } from "obscenity"

const datasetOptions = englishDataset.build()

const gateMatcher = new RegExpMatcher({ ...datasetOptions, ...englishRecommendedTransformers })

/**
 * The obscenity dataset covers profanity, not hate speech, so slurs and extremist references reach
 * both thresholds untouched. These lists close that gap. They are matched separately from the
 * dataset rather than added to it because the leetspeak transformers rewrite digits before
 * matching, which would defeat a numeric reference like 1488.
 */
const HATE_TERMS_ANYWHERE = ["hitler", "kkk", "1488", "pedophile"]

/**
 * Short enough to appear inside ordinary words ("raccoon", "torpedo", "auspicious", "skyscraper"),
 * so these only match when no letter sits either side of them. A separator or a digit still counts
 * as a boundary, which is where an evasion like "kys-loser" or "pedo42" lands.
 */
const HATE_TERMS_STANDALONE = [
  "beaner",
  "chink",
  "coon",
  "gook",
  "kys",
  "nazi",
  "pedo",
  "spic",
  "tranny",
  "wetback",
]

const hateAnywhere = new RegExp(HATE_TERMS_ANYWHERE.join("|"))
const hateStandalone = new RegExp(`(?<![a-z])(${HATE_TERMS_STANDALONE.join("|")})(?![a-z])`)

function matchedHateTerms(username: string) {
  const lower = username.toLowerCase()
  const stripped = lower.replace(/[_-]/g, "")
  const terms = new Set<string>()
  for (const term of HATE_TERMS_ANYWHERE) if (stripped.includes(term)) terms.add(term)
  for (const variant of [lower, stripped]) {
    const match = hateStandalone.exec(variant)
    if (match) terms.add(match[1])
  }
  return [...terms]
}

function failsHateList(username: string) {
  const lower = username.toLowerCase()
  const stripped = lower.replace(/[_-]/g, "")
  return hateAnywhere.test(stripped) || [lower, stripped].some((v) => hateStandalone.test(v))
}

function gateVariantsOf(username: string) {
  const stripped = username.replace(/[_-]/g, "")
  return stripped === username ? [username] : [username, stripped]
}

/**
 * The report threshold adds the evasion the gate deliberately does not chase, because chasing it at
 * signup costs false rejections: digit padding, which would also strip "classic7" down to a match.
 * It keeps the dataset's whitelist, so an ordinary name like "assassin-42" cannot be auto-held by
 * someone filing a malicious report.
 */
function reportVariantsOf(username: string) {
  const variants = new Set(gateVariantsOf(username))
  for (const variant of [...variants]) {
    variants.add(variant.replace(/(.)\1{1,}/g, "$1"))
    variants.add(variant.replace(/[0-9]/g, ""))
  }
  return [...variants]
}

function matchedWords(username: string) {
  const words = new Set<string>()
  for (const variant of reportVariantsOf(username)) {
    for (const match of gateMatcher.getAllMatches(variant, true)) {
      const phrase = englishDataset.getPayloadWithPhraseMetadata(match)
      const word = phrase.phraseMetadata?.originalWord
      if (word) words.add(word)
    }
  }
  for (const term of matchedHateTerms(username)) words.add(term)
  return [...words]
}

export function usernameFailsGate(username: string) {
  return failsHateList(username) || gateVariantsOf(username).some((v) => gateMatcher.hasMatch(v))
}

export function usernameFailsReportThreshold(username: string) {
  return failsHateList(username) || reportVariantsOf(username).some((v) => gateMatcher.hasMatch(v))
}

export function describeUsernameMatches(username: string) {
  return matchedWords(username)
}
