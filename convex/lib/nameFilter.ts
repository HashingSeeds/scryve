import {
  DataSet,
  englishDataset,
  englishRecommendedTransformers,
  pattern,
  RegExpMatcher,
} from "obscenity"

type PhraseMetadata = { originalWord: string }

const policyDataset = new DataSet<PhraseMetadata>()
  .addPhrase((phrase) => phrase.setMetadata({ originalWord: "hitler" }).addPattern(pattern`hitler`))
  .addPhrase((phrase) => phrase.setMetadata({ originalWord: "kkk" }).addPattern(pattern`kkk`))
  .addPhrase((phrase) =>
    phrase.setMetadata({ originalWord: "pedophile" }).addPattern(pattern`pedophile`),
  )
  .addPhrase((phrase) =>
    phrase.setMetadata({ originalWord: "beaner" }).addPattern(pattern`|beaner|`),
  )
  .addPhrase((phrase) => phrase.setMetadata({ originalWord: "coon" }).addPattern(pattern`|coon|`))
  .addPhrase((phrase) => phrase.setMetadata({ originalWord: "gook" }).addPattern(pattern`|gook|`))
  .addPhrase((phrase) => phrase.setMetadata({ originalWord: "kys" }).addPattern(pattern`|kys|`))
  .addPhrase((phrase) => phrase.setMetadata({ originalWord: "nazi" }).addPattern(pattern`|nazi|`))
  .addPhrase((phrase) => phrase.setMetadata({ originalWord: "pedo" }).addPattern(pattern`|pedo|`))
  .addPhrase((phrase) => phrase.setMetadata({ originalWord: "spic" }).addPattern(pattern`|spic|`))
  .addPhrase((phrase) =>
    phrase.setMetadata({ originalWord: "wetback" }).addPattern(pattern`|wetback|`),
  )
  .addPhrase((phrase) => phrase.setMetadata({ originalWord: "1488" }).addPattern(pattern`1488`))

const englishMatcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
})
// Policy patterns are intentionally untransformed. English's leetspeak and duplicate transformers
// would rewrite numeric references and repeated-letter terms before these literal patterns run.
const policyMatcher = new RegExpMatcher(policyDataset.build())

function gateVariantsOf(username: string) {
  const stripped = username.replace(/[_-]/g, "")
  return stripped === username ? [username] : [username, stripped]
}

function policyVariantsOf(variants: string[]) {
  const policyVariants = new Set<string>()
  // Obscenity treats digits as word characters. Splitting letter/number transitions lets bounded
  // policy terms catch names such as "pedo42" without making "pedometer" a match.
  for (const variant of variants) {
    const lower = variant.toLowerCase()
    policyVariants.add(lower)
    policyVariants.add(lower.replace(/([a-z])([0-9])|([0-9])([a-z])/g, "$1$3-$2$4"))
  }
  return [...policyVariants]
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

function matchesFor(variants: string[]) {
  const words = new Set<string>()
  for (const variant of variants) {
    for (const match of englishMatcher.getAllMatches(variant, true)) {
      const phrase = englishDataset.getPayloadWithPhraseMetadata(match)
      const word = phrase.phraseMetadata?.originalWord
      if (word) words.add(word)
    }
  }
  for (const variant of policyVariantsOf(variants)) {
    for (const match of policyMatcher.getAllMatches(variant, true)) {
      const phrase = policyDataset.getPayloadWithPhraseMetadata(match)
      const word = phrase.phraseMetadata?.originalWord
      if (word) words.add(word)
    }
  }
  return [...words]
}

export function usernameFailsGate(username: string) {
  return matchesFor(gateVariantsOf(username)).length > 0
}

export function usernameFailsReportThreshold(username: string) {
  return matchesFor(reportVariantsOf(username)).length > 0
}

export function describeUsernameMatches(username: string) {
  return matchesFor(reportVariantsOf(username))
}
