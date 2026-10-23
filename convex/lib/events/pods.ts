import { MAX_POD_SIZE, MIN_POD_SIZE, type PairingInput, type RoundPairings } from "./model"
import { metBefore, pairingOrder, shuffle } from "./pairing"

export function podSizes(playerCount: number): readonly number[] {
  if (playerCount < MIN_POD_SIZE) throw new Error(`Pods need at least ${MIN_POD_SIZE} players`)
  if (playerCount === MAX_POD_SIZE) return [MAX_POD_SIZE]
  const threes = (4 - (playerCount % 4)) % 4
  const fours = (playerCount - 3 * threes) / 4
  return [...Array<number>(fours).fill(4), ...Array<number>(threes).fill(3)]
}

export function pairPodRound(input: PairingInput): RoundPairings {
  const left = pairingOrder(input)
  const met = metBefore(input.tables)
  return podSizes(left.length).map((size) => {
    const pod = left.splice(0, 1)
    while (pod.length < size) {
      const window = left.slice(0, size)
      const repeats = window.map((id) => pod.filter((podmate) => met.get(id)?.has(podmate)).length)
      pod.push(...left.splice(repeats.indexOf(Math.min(...repeats)), 1))
    }
    return shuffle(pod, input.random)
  })
}
