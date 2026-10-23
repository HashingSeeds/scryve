import { useState } from "react"
import { View } from "react-native"

import { AlertNote } from "@/components/AlertNote"
import { Button } from "@/components/Button"
import { SegmentedControl } from "@/components/SegmentedControl"
import { SelectField } from "@/components/SelectField"
import { TextField } from "@/components/TextField"
import { Switch } from "@/components/Toggle/Switch"
import { ValueField } from "@/components/ValueField"
import type { CloudAccess } from "@/features/auth/CloudScreen"
import { playFormatOptions, playSystemFormat } from "@/features/game/playSystems"
import { defaultRoundClockMinutes } from "@/features/game/roundClock"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"

import { EventFrame, $section } from "./EventFrame"
import { MAX_ROUND_MINUTES, MIN_ROUND_MINUTES } from "../../../convex/lib/events/commands"
import {
  EVENT_STRUCTURES,
  MAX_EVENT_ROUNDS,
  type EventStructure,
} from "../../../convex/lib/events/model"
import { MATCH_BEST_OF, type MatchBestOf } from "../../../convex/lib/matchResults"

const EVENT_SYSTEM = "mtg" as const
const POD_FORMATS = new Set(["commander"])
const DEFAULT_ROUNDS = 3

export interface NewEventInput {
  name: string
  system: typeof EVENT_SYSTEM
  format: string
  structure: EventStructure
  bestOf: MatchBestOf
  plannedRounds: number
  roundMinutes: number
  joinAsPlayer: boolean
}

export function NewEventScreen({
  access,
  onBack,
  onCreate,
}: {
  access: CloudAccess
  onBack: () => void
  onCreate: (input: NewEventInput) => Promise<void>
}) {
  const { themed } = useAppTheme()
  const [name, setName] = useState("")
  const [format, setFormat] = useState(() => playSystemFormat(EVENT_SYSTEM))
  const [structure, setStructure] = useState<EventStructure>("swiss")
  const [chosenBestOf, setBestOf] = useState<MatchBestOf>(3)
  const bestOf = structure === "pods" ? 1 : chosenBestOf
  const [plannedRounds, setPlannedRounds] = useState(DEFAULT_ROUNDS)
  const [chosenMinutes, setMinutes] = useState<number>()
  const roundMinutes = chosenMinutes ?? defaultRoundClockMinutes(EVENT_SYSTEM, bestOf)
  const [joinAsPlayer, setJoinAsPlayer] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  function chooseFormat(id?: string) {
    if (!id) return
    setFormat(id)
    setStructure(POD_FORMATS.has(id) ? "pods" : "swiss")
  }

  async function create() {
    setBusy(true)
    setError(undefined)
    try {
      await onCreate({
        name: name.trim(),
        system: EVENT_SYSTEM,
        format,
        structure,
        bestOf,
        plannedRounds,
        roundMinutes,
        joinAsPlayer,
      })
    } catch {
      setError(translate("events:failed"))
      setBusy(false)
    }
  }

  return (
    <EventFrame
      title={translate("events:create.title")}
      access={access}
      onBack={onBack}
      footer={
        <>
          {error ? <AlertNote testID="new-event-error" text={error} /> : null}
          <Button
            testID="create-event-button"
            preset="reversed"
            disabled={busy || !name.trim()}
            text={translate(busy ? "events:create.creating" : "events:create.create")}
            onPress={() => void create()}
          />
        </>
      }
    >
      <TextField
        testID="event-name-input"
        labelTx="events:create.name"
        placeholder={translate("events:create.namePlaceholder")}
        value={name}
        maxLength={48}
        onChangeText={setName}
      />
      <SelectField
        testID="event-format"
        label={translate("events:create.format")}
        field="format"
        value={format}
        options={playFormatOptions(EVENT_SYSTEM)}
        onSelect={chooseFormat}
      />
      <View style={themed($section)}>
        <SegmentedControl
          testID="event-structure"
          accessibilityLabel={translate("events:create.structure")}
          segments={EVENT_STRUCTURES.map((id) => ({
            id,
            label: translate(`events:structure.${id}`),
          }))}
          selectedId={structure}
          onSelect={(id) => setStructure(EVENT_STRUCTURES.find((value) => value === id) ?? "swiss")}
        />
        {structure === "swiss" ? (
          <SegmentedControl
            testID="event-best-of"
            accessibilityLabel={translate("events:create.bestOf")}
            segments={MATCH_BEST_OF.map((value) => ({
              id: String(value),
              label: translate("events:bestOf", { bestOf: value }),
            }))}
            selectedId={String(bestOf)}
            onSelect={(id) => setBestOf(MATCH_BEST_OF.find((value) => String(value) === id) ?? 3)}
          />
        ) : null}
      </View>
      <ValueField
        testID="event-rounds"
        label={translate("events:create.rounds")}
        value={plannedRounds}
        min={1}
        max={MAX_EVENT_ROUNDS}
        onChange={setPlannedRounds}
      />
      <ValueField
        testID="event-round-minutes"
        label={translate("events:create.roundMinutes")}
        value={roundMinutes}
        min={MIN_ROUND_MINUTES}
        max={MAX_ROUND_MINUTES}
        step={5}
        onChange={setMinutes}
      />
      <Switch
        testID="event-playing-switch"
        labelTx="events:create.playing"
        value={joinAsPlayer}
        onValueChange={setJoinAsPlayer}
      />
    </EventFrame>
  )
}
