import { englishDataset, englishRecommendedTransformers, RegExpMatcher } from "obscenity"

const datasetOptions = englishDataset.build()

const gateMatcher = new RegExpMatcher({ ...datasetOptions, ...englishRecommendedTransformers })

function gateVariantsOf(username: string) {
  const stripped = username.replace(/[_-]/g, "")
  return stripped === username ? [username] : [username, stripped]
}

/**
 * The report threshold adds evasions the gate deliberately does not chase, because chasing them at
 * signup costs false rejections: runs of repeated characters ("fuuuuck") and digit padding.
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
  return [...words]
}

export function usernameFailsGate(username: string) {
  return gateVariantsOf(username).some((variant) => gateMatcher.hasMatch(variant))
}

export function usernameFailsReportThreshold(username: string) {
  return reportVariantsOf(username).some((variant) => gateMatcher.hasMatch(variant))
}

export function describeUsernameMatches(username: string) {
  return matchedWords(username)
}
