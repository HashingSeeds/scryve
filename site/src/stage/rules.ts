import { excerptSegments } from "@/features/rules/comprehensiveRules"

import atraxaSmall from "../assets/cards/atraxa-small.webp?url"
import grandUnifierSmall from "../assets/cards/atraxa-grand-unifier-small.webp?url"
import ixhelSmall from "../assets/cards/ixhel-small.webp?url"

type Row =
  | { kind: "term"; term: string; text: string; cite: string }
  | { kind: "rule"; id: string; topic?: string; section: string; text: string }
  | { kind: "card"; name: string; typeLine: string; text: string; image: string }

// Two searches from the app's rules sheet, with the rows it returns in its order. Rule text is
// quoted from the Comprehensive Rules (effective September 25, 2026); cards are Scryfall's.
const SEARCHES: readonly { query: string; rows: readonly Row[] }[] = [
  {
    query: "deathtouch",
    rows: [
      {
        kind: "term",
        term: "Deathtouch",
        text: "A keyword ability that causes damage dealt by an object to be especially effective. See rule ",
        cite: "702.2",
      },
      {
        kind: "rule",
        id: "704.5h",
        section: "State-Based Actions",
        text: "If a creature has toughness greater than 0, and it’s been dealt damage by a source with deathtouch since the last time state-based actions were checked, that creature is destroyed. Regeneration can replace this event.",
      },
      {
        kind: "rule",
        id: "122.1b",
        section: "Counters",
        text: "A keyword counter on a permanent or on a card in a zone other than the battlefield causes that object to gain that keyword. The keywords that a keyword counter can be are flying, first strike, double strike, deathtouch, decayed, exalted, haste, hexproof, indestructible, lifelink, menace, reach, shadow, trample, and vigilance, as well as any variants of those keywords. See rule 613.1f.",
      },
      {
        kind: "rule",
        id: "701.8b",
        topic: "Destroy",
        section: "Keyword Actions",
        text: "The only ways a permanent can be destroyed are as a result of an effect that uses the word “destroy” or as a result of the state-based actions that check for lethal damage (see rule 704.5g) or damage from a source with deathtouch (see rule 704.5h). If a permanent is put into its owner’s graveyard for any other reason, it hasn’t been “destroyed.”",
      },
      {
        kind: "rule",
        id: "120.4a",
        section: "Damage",
        text: "First, if an effect that’s causing damage to be dealt states that excess damage that would be dealt to a permanent is dealt to another permanent or player instead, the damage event is modified accordingly. If the first permanent is a creature, the excess damage is the amount of damage in excess of what would be lethal damage, taking into account damage already marked on the creature and damage from other sources that would be dealt at the same time. (See rule 120.6.) Any amount of damage greater than 1 is excess damage if the source dealing that damage to a creature has deathtouch. (See rule 702.2.) If the first permanent is a planeswalker, the excess damage is the amount of damage in excess of that planeswalker’s loyalty, taking into account damage from other sources that would be dealt at the same time. If the first permanent is a battle, the excess damage is the amount of damage in excess of that battle’s defense, taking into account damage from other sources that would be dealt at the same time. If the first permanent has multiple card types from among the list of creature, planeswalker, and battle, the excess damage is the greatest of the calculated amounts for each of the card types it has.",
      },
    ],
  },
  {
    query: "atraxa",
    rows: [
      {
        kind: "card",
        name: "Atraxa, Praetors' Voice",
        typeLine: "Legendary Creature — Phyrexian Angel Horror",
        text: "Flying, vigilance, deathtouch, lifelink",
        image: atraxaSmall,
      },
      {
        kind: "card",
        name: "Atraxa, Grand Unifier",
        typeLine: "Legendary Creature — Phyrexian Angel",
        text: "Flying, vigilance, deathtouch, lifelink",
        image: grandUnifierSmall,
      },
      {
        kind: "card",
        name: "Ixhel, Scion of Atraxa",
        typeLine: "Legendary Creature — Phyrexian Angel",
        text: "Flying, vigilance, toxic 2",
        image: ixhelSmall,
      },
    ],
  },
]

const TYPE_MS = 90
const HOLD_MS = 3200
const CLEAR_MS = 500

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

function rowHtml(row: Row, query: string) {
  switch (row.kind) {
    case "term":
      return `<div class="rules-row"><b>${row.term}</b><p>${escapeHtml(row.text)}<span class="rules-link">${row.cite}</span>, “${row.term}.”</p></div>`
    case "rule": {
      // The app's own excerpt: the match in bold, about 60 characters of lead-in.
      const excerpt = excerptSegments(row.text, undefined, query)
        .map(({ text, matched }) => (matched ? `<b>${escapeHtml(text)}</b>` : escapeHtml(text)))
        .join("")
      return `<div class="rules-row"><span class="rules-head"><span class="rules-link">${row.id}</span>${row.topic ? `<b>${row.topic}</b>` : ""}<small>${row.section}</small></span><p>${excerpt}</p></div>`
    }
    case "card":
      return `<div class="rules-row rules-card"><img src="${row.image}" alt="" width="36" height="50" /><span><b>${escapeHtml(row.name)}</b><small>${row.typeLine}</small><small>${row.text}</small></span></div>`
  }
}

// The rules sheet over the game, as in the app: one search box answers with rules and cards.
// While its scene shows, it types each sample search in turn; with reduced motion it swaps them.
// Returns the function to call whenever the stage changes scene.
export function setUpRulesSheet(sheet: HTMLElement, active: () => boolean) {
  const field = sheet.querySelector<HTMLElement>("[data-rules-query]")
  const list = sheet.querySelector<HTMLElement>("[data-rules-results]")
  if (!field || !list) return () => {}
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)")
  let search = 0
  let timer = 0

  const show = (index: number, upTo: number) => {
    const { query, rows } = SEARCHES[index] ?? SEARCHES[0]
    const typed = Math.min(upTo, query.length)
    field.textContent = query.slice(0, typed)
    field.classList.toggle("typing", typed < query.length)
    list.innerHTML = typed === query.length ? rows.map((row) => rowHtml(row, query)).join("") : ""
  }

  const step = (typed: number) => {
    window.clearTimeout(timer)
    if (!active()) return show(search, Infinity)
    const { query } = SEARCHES[search]
    if (reduced.matches) {
      show(search, query.length)
      timer = window.setTimeout(() => {
        search = (search + 1) % SEARCHES.length
        step(Infinity)
      }, HOLD_MS + CLEAR_MS)
      return
    }
    show(search, typed)
    if (typed < query.length) timer = window.setTimeout(() => step(typed + 1), TYPE_MS)
    else
      timer = window.setTimeout(() => {
        search = (search + 1) % SEARCHES.length
        show(search, 0)
        timer = window.setTimeout(() => step(1), CLEAR_MS)
      }, HOLD_MS)
  }

  show(search, Infinity)
  return () => {
    search = 0
    step(active() ? 0 : Infinity)
  }
}
