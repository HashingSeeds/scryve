import { useState } from "react"
import { View } from "react-native"
import { useAction, useMutation, useQuery } from "convex/react"

import { $alert, $alertText } from "@/components/BottomActionBar"
import { Button } from "@/components/Button"
import { Card } from "@/components/Card"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { useAppTheme } from "@/theme/context"
import { convexErrorMessage } from "@/utils/convexError"

import { api } from "../../convex/_generated/api"
import { preconstructedFormat } from "../../convex/lib/deckGames"

type CreationMode = "precon" | "paste" | "blank"

type PreconstructedDeck = {
  fileName: string
  name: string
  code?: string
  releaseDate?: string
  type?: string
}

type ImportedCard = {
  oracleId: string
  scryfallId: string
  name: string
  imageUrl?: string
  smallImageUrl?: string
  quantity: number
  board: "main" | "sideboard" | "commander"
}

function importCards(cards: ImportedCard[]) {
  return cards.map(({ oracleId, scryfallId, name, imageUrl, smallImageUrl, quantity, board }) => ({
    oracleId,
    scryfallId,
    name,
    ...(imageUrl ? { imageUrl } : {}),
    ...(smallImageUrl ? { smallImageUrl } : {}),
    quantity,
    board,
  }))
}

export function AddDeckScreen({
  onBack,
  onCreated,
}: {
  onBack: () => void
  onCreated: (deckId: string) => void
}) {
  const { themed } = useAppTheme()
  const mine = useQuery(api.decks.listMine)
  const capacity = mine?.capacity
  const atCapacity = capacity !== undefined && !capacity.canCreate
  const createDeck = useMutation(api.decks.create)
  const createImportedDeck = useMutation(api.decks.importResolved)
  const searchPreconstructed = useAction(api.deckImports.searchPreconstructed)
  const resolvePreconstructed = useAction(api.deckImports.resolvePreconstructed)
  const resolvePasted = useAction(api.deckImports.resolvePasted)
  const [mode, setMode] = useState<CreationMode>("precon")
  const [name, setName] = useState("")
  const [format, setFormat] = useState("commander")
  const [deckList, setDeckList] = useState("")
  const [preconQuery, setPreconQuery] = useState("")
  const [precons, setPrecons] = useState<PreconstructedDeck[]>([])
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  function begin() {
    setBusy(true)
    setError(undefined)
  }

  function fail(cause: unknown, fallback: string) {
    setError(convexErrorMessage(cause, fallback))
  }

  async function createBlank() {
    try {
      begin()
      const deckId = await createDeck({ name, format })
      setName("")
      onCreated(deckId)
    } catch (cause) {
      fail(cause, "Could not create deck")
    } finally {
      setBusy(false)
    }
  }

  async function searchPrecons() {
    try {
      begin()
      setPrecons(await searchPreconstructed({ query: preconQuery }))
    } catch (cause) {
      fail(cause, "Could not search official decks")
    } finally {
      setBusy(false)
    }
  }

  async function importPrecon(deck: PreconstructedDeck) {
    try {
      begin()
      const resolved = await resolvePreconstructed({ fileName: deck.fileName })
      if (resolved.unresolved.length) {
        setError(
          `Could not match ${resolved.unresolved.length} card(s): ${resolved.unresolved.join(", ")}`,
        )
        return
      }
      const deckId = await createImportedDeck({
        name: resolved.name || deck.name,
        format: preconstructedFormat(deck.type),
        cards: importCards(resolved.cards),
      })
      onCreated(deckId)
    } catch (cause) {
      fail(cause, "Could not import official deck")
    } finally {
      setBusy(false)
    }
  }

  async function importPasted() {
    try {
      begin()
      const resolved = await resolvePasted({ list: deckList })
      const problems = [
        resolved.unresolved.length
          ? `Unmatched cards: ${resolved.unresolved.join(", ")}`
          : undefined,
        resolved.invalidLines.length
          ? `Lines not understood: ${resolved.invalidLines.slice(0, 8).join(" | ")}`
          : undefined,
      ].filter((problem): problem is string => problem !== undefined)
      if (problems.length) {
        setError(problems.join(". "))
        return
      }
      const deckId = await createImportedDeck({
        name,
        format,
        cards: importCards(resolved.cards),
      })
      setName("")
      setDeckList("")
      onCreated(deckId)
    } catch (cause) {
      fail(cause, "Could not import deck list")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen preset="scroll" safeAreaEdges={["bottom"]} contentInset="standard">
      <Header title="Add a deck" leftTx="common:back" onLeftPress={onBack} />
      <View style={$stack}>
        <Text
          size="sm"
          text="Start with an official preconstructed deck, paste an exported list, or build from scratch."
        />
        <View style={$modeRow}>
          <Button
            text="Official precon"
            preset={mode === "precon" ? "reversed" : "default"}
            style={$modeButton}
            onPress={() => setMode("precon")}
          />
          <Button
            text="Paste list"
            preset={mode === "paste" ? "reversed" : "default"}
            style={$modeButton}
            onPress={() => setMode("paste")}
          />
          <Button
            text="Blank"
            preset={mode === "blank" ? "reversed" : "default"}
            style={$modeButton}
            onPress={() => setMode("blank")}
          />
        </View>

        {mode === "precon" ? (
          <View style={$stack}>
            <TextField
              label="Search official decks"
              testID="precon-search-input"
              helper="Try a deck name, set code, or product type."
              value={preconQuery}
              maxLength={120}
              onChangeText={setPreconQuery}
              onSubmitEditing={searchPrecons}
            />
            <Button
              text={busy ? "Searching…" : "Search preconstructed decks"}
              preset="reversed"
              disabled={busy || atCapacity || preconQuery.trim().length < 2}
              onPress={searchPrecons}
            />
            {precons.map((deck) => (
              <Card
                key={deck.fileName}
                heading={deck.name}
                content={[deck.type, deck.code, deck.releaseDate].filter(Boolean).join(" · ")}
                footer="Import as an editable deck"
                disabled={busy || atCapacity}
                onPress={() => importPrecon(deck)}
              />
            ))}
          </View>
        ) : null}

        {mode === "paste" ? (
          <View style={$stack}>
            <TextField label="Deck name" value={name} maxLength={80} onChangeText={setName} />
            <TextField label="Format" value={format} maxLength={32} onChangeText={setFormat} />
            <TextField
              label="Deck list"
              helper={
                'Use lines like "1 Sol Ring". Commander, Mainboard, and Sideboard headings are supported.'
              }
              value={deckList}
              multiline
              numberOfLines={12}
              textAlignVertical="top"
              maxLength={50_000}
              onChangeText={setDeckList}
            />
            <Button
              text={busy ? "Resolving cards…" : "Import deck list"}
              preset="reversed"
              disabled={busy || atCapacity || !name.trim() || !format.trim() || !deckList.trim()}
              onPress={importPasted}
            />
          </View>
        ) : null}

        {mode === "blank" ? (
          <View style={$stack}>
            <TextField label="Deck name" value={name} maxLength={80} onChangeText={setName} />
            <TextField label="Format" value={format} maxLength={32} onChangeText={setFormat} />
            <Button
              text={busy ? "Creating…" : "Create blank deck"}
              preset="reversed"
              disabled={busy || atCapacity || !name.trim() || !format.trim()}
              onPress={createBlank}
            />
          </View>
        ) : null}

        {error ? (
          <View style={themed($alert)}>
            <Text accessibilityRole="alert" style={themed($alertText)} text={error} />
          </View>
        ) : null}
        {atCapacity ? (
          <View style={themed($alert)}>
            <Text
              accessibilityRole="alert"
              style={themed($alertText)}
              text={
                capacity?.premium
                  ? "You've reached the deck limit. Archive a deck to add another."
                  : "Free accounts include one deck. Premium unlocks more — archive your deck or upgrade to add another."
              }
            />
          </View>
        ) : capacity && !capacity.premium ? (
          <Text size="xs" text="Free accounts include one deck. Premium unlocks unlimited decks." />
        ) : null}
      </View>
    </Screen>
  )
}

const $stack = { gap: 12, marginTop: 12 } as const
const $modeRow = { flexDirection: "row", gap: 8 } as const
const $modeButton = { flex: 1, minHeight: 48, paddingHorizontal: 6 } as const
