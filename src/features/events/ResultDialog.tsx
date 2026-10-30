import { useState } from "react"
import { ScrollView, View } from "react-native"

import { Button } from "@/components/Button"
import { ChoiceButton } from "@/components/ChoiceButton"
import { $dialogActions, $dialogButton, DialogCard } from "@/components/DialogCard"
import { Text } from "@/components/Text"
import { ValueField } from "@/components/ValueField"
import { isPlaySystemId } from "@/features/game/playSystems"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"

import { $section } from "./EventFrame"
import { playerName, resultIsValid } from "./eventLogic"
import type { EventTableView, EventView } from "./eventSource"
import type { TableResult } from "../../../convex/lib/events/model"
import { eventRules } from "../../../convex/lib/events/rules"
import { winsNeeded } from "../../../convex/lib/matchResults"

type Draft =
  | { kind: "match"; gamesWon: number[]; gamesDrawn: number }
  | { kind: "pod"; winnerSeat: number | null | undefined }

function initialDraft(view: EventView, table: EventTableView): Draft {
  const { result } = table
  if (view.structure === "pods")
    return { kind: "pod", winnerSeat: result?.kind === "pod" ? result.winnerSeat : undefined }
  return result?.kind === "match"
    ? { kind: "match", gamesWon: [...result.gamesWon], gamesDrawn: result.gamesDrawn }
    : { kind: "match", gamesWon: table.playerIds.map(() => 0), gamesDrawn: 0 }
}

const draftResult = (draft: Draft): TableResult | undefined =>
  draft.kind === "pod"
    ? draft.winnerSeat === undefined
      ? undefined
      : { kind: "pod", winnerSeat: draft.winnerSeat }
    : draft

export function ResultDialog({
  view,
  table,
  busy,
  onClose,
  onSave,
}: {
  view: EventView
  table: EventTableView
  busy: boolean
  onClose: () => void
  onSave: (result: TableResult | null) => void
}) {
  const { themed } = useAppTheme()
  const [draft, setDraft] = useState(() => initialDraft(view, table))
  const result = draftResult(draft)
  const valid = result !== undefined && resultIsValid(view, table, result)
  const draws = isPlaySystemId(view.system) && eventRules(view.system).draws
  const canClear = view.isOrganizer && table.result !== null
  return (
    <DialogCard
      visible
      onClose={onClose}
      closeDisabled={busy}
      placement="bottom"
      wide
      dialogTestID="result-dialog"
      backdropAccessibilityLabel={translate("common:cancel")}
      accessibilityViewIsModal
    >
      <ScrollView contentContainerStyle={themed($section)}>
        <Text
          preset="subheading"
          accessibilityRole="header"
          tx="events:result.title"
          txOptions={{ table: table.table }}
        />
        {draft.kind === "match" ? (
          <>
            {table.playerIds.map((id, seat) => (
              <ValueField
                key={id}
                testID={`games-won-${seat}`}
                label={playerName(view, id)}
                value={draft.gamesWon[seat] ?? 0}
                min={0}
                max={winsNeeded(view.bestOf)}
                onChange={(won) =>
                  setDraft({
                    ...draft,
                    gamesWon: draft.gamesWon.map((value, index) => (index === seat ? won : value)),
                  })
                }
              />
            ))}
            {draws ? (
              <ValueField
                testID="games-drawn"
                label={translate("events:result.drawnGames")}
                value={draft.gamesDrawn}
                min={0}
                max={view.bestOf}
                onChange={(gamesDrawn) => setDraft({ ...draft, gamesDrawn })}
              />
            ) : null}
            {valid ? null : <Text size="xs" tone="dim" tx="events:result.twoWinners" />}
          </>
        ) : (
          <>
            {table.playerIds.map((id, seat) => (
              <ChoiceButton
                key={id}
                testID={`winner-${seat}`}
                selected={draft.winnerSeat === seat}
                text={playerName(view, id)}
                onPress={() => setDraft({ kind: "pod", winnerSeat: seat })}
              />
            ))}
            {draws ? (
              <ChoiceButton
                testID="winner-draw"
                selected={draft.winnerSeat === null}
                tx="events:result.draw"
                onPress={() => setDraft({ kind: "pod", winnerSeat: null })}
              />
            ) : null}
          </>
        )}
      </ScrollView>
      <View style={themed($dialogActions)}>
        {canClear ? (
          <Button
            testID="clear-result-button"
            tx="events:result.clear"
            disabled={busy}
            style={themed($dialogButton)}
            onPress={() => onSave(null)}
          />
        ) : null}
        <Button
          testID="save-result-button"
          preset="primary"
          tx="events:result.save"
          disabled={busy || !valid}
          style={themed($dialogButton)}
          onPress={() => result && onSave(result)}
        />
      </View>
    </DialogCard>
  )
}
