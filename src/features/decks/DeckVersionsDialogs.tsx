import type { TextStyle, ViewStyle } from "react-native"
import { ScrollView, TouchableOpacity, View } from "react-native"

import { AlertNote } from "@/components/AlertNote"
import { Button } from "@/components/Button"
import { DeckVersionDialog, type DeckVersionDraft } from "@/components/DeckVersionDialog"
import { $dialogActions, $dialogButton, $dialogText, DialogCard } from "@/components/DialogCard"
import { PressableIcon } from "@/components/Icon"
import { Text } from "@/components/Text"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { cardCountLabel } from "./deckCopy"
import { PlusAccessory } from "./DeckView"

export type VersionsRow<Id extends string = string> = {
  id: Id
  label: string
  note?: string
  record?: string
  cardQuantity: number
}

export function DeckVersionsDialogs<Id extends string>({
  dialog,
  rows,
  activeId,
  busy,
  error,
  chooseDisabled,
  newDisabled,
  copyFromLabel,
  rename,
  onChoose,
  onNew,
  onCreate,
  onManage,
  onRename,
  onDelete,
  onConfirmDelete,
  onClose,
}: {
  dialog: string | undefined
  rows: readonly VersionsRow<Id>[]
  activeId: Id | undefined
  busy?: boolean
  error?: string
  chooseDisabled?: boolean
  newDisabled?: boolean
  copyFromLabel?: string
  rename?: { name: string; note: string; notesLocked?: boolean }
  onChoose: (id: Id) => void
  onNew?: () => void
  onCreate: (draft: DeckVersionDraft) => void
  onManage?: () => void
  onRename: (draft: DeckVersionDraft) => void
  onDelete?: () => void
  onConfirmDelete: () => void
  onClose: () => void
}) {
  const { themed } = useAppTheme()
  if (dialog === "newVersion" && onNew)
    return (
      <DeckVersionDialog
        title={translate("decks:detail.newVersion")}
        submitLabel={translate("decks:detail.createVersion")}
        copyFromLabel={copyFromLabel}
        busy={busy}
        error={error}
        onSubmit={onCreate}
        onClose={onClose}
      />
    )
  if (dialog === "renameVersion" && rename)
    return (
      <DeckVersionDialog
        title={translate("decks:detail.versionDetails")}
        submitLabel={translate("common:save")}
        initialName={rename.name}
        initialNote={rename.note}
        notesLocked={rename.notesLocked}
        busy={busy}
        error={error}
        onSubmit={onRename}
        {...(onDelete ? { onDelete } : {})}
        onClose={onClose}
      />
    )
  if (dialog === "versions")
    return (
      <DialogCard
        visible
        onClose={onClose}
        closeDisabled={busy}
        backdropTestID="deck-versions-backdrop"
        backdropAccessibilityLabel={translate("common:close")}
        dialogTestID="deck-versions-dialog"
        accessibilityViewIsModal
        placement="bottom"
        wide
      >
        <ScrollView contentContainerStyle={themed($versions)}>
          <Text preset="subheading" tx="decks:detail.versions" />
          {rows.map((row) => {
            const selected = row.id === activeId
            return (
              <View key={row.id} style={themed($versionRow)}>
                <TouchableOpacity
                  testID={`version-picker-${row.id}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={themed($versionSelect)}
                  disabled={chooseDisabled}
                  onPress={() => onChoose(row.id)}
                >
                  <View
                    testID={`version-marker-${row.id}`}
                    style={[themed($versionMark), selected && themed($versionMarkSelected)]}
                  />
                  <View style={themed($versionCopy)}>
                    <Text weight="medium" text={row.label} />
                    {row.note ? (
                      <Text size="meta" tone="dim" text={row.note} numberOfLines={2} />
                    ) : null}
                  </View>
                  <View style={themed($versionContext)}>
                    {row.record ? (
                      <Text weight="medium" style={$tabularNumbers} text={row.record} />
                    ) : null}
                    <Text size="meta" tone="dim" text={cardCountLabel(row.cardQuantity)} />
                  </View>
                </TouchableOpacity>
                {selected && onManage ? (
                  <PressableIcon
                    icon="more"
                    testID="rename-version-button"
                    accessibilityRole="button"
                    accessibilityLabel={translate("decks:detail.versionDetails")}
                    containerStyle={$versionMore}
                    onPress={onManage}
                  />
                ) : null}
              </View>
            )
          })}
          {onNew ? (
            <Button
              testID="version-picker-__new__"
              tx="decks:detail.newVersion"
              LeftAccessory={PlusAccessory}
              disabled={newDisabled}
              onPress={onNew}
            />
          ) : null}
          {error ? <AlertNote text={error} /> : null}
        </ScrollView>
      </DialogCard>
    )
  if (dialog === "deleteVersion")
    return (
      <DialogCard
        visible
        onClose={onClose}
        closeDisabled={busy}
        backdropTestID="delete-version-backdrop"
        backdropAccessibilityLabel={translate("decks:detail.keepVersion")}
        dialogTestID="delete-version-dialog"
        dialogAccessibilityRole="alert"
        accessibilityViewIsModal
      >
        <Text
          preset="subheading"
          tx="decks:detail.deleteVersionTitle"
          style={themed($dialogText)}
        />
        <Text size="sm" tx="decks:detail.deleteVersionBody" style={themed($dialogText)} />
        {error ? <AlertNote text={error} /> : null}
        <View style={themed($dialogActions)}>
          <Button
            tx="common:cancel"
            style={themed($dialogButton)}
            disabled={busy}
            onPress={onClose}
          />
          <Button
            tx="common:delete"
            testID="delete-version-confirm"
            preset="destructive"
            style={themed($dialogButton)}
            disabled={busy}
            onPress={onConfirmDelete}
          />
        </View>
      </DialogCard>
    )
  return null
}

const $tabularNumbers: TextStyle = { fontVariant: ["tabular-nums"] }
const $versions: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $versionRow: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  minHeight: 72,
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  paddingVertical: spacing.xxs,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
const $versionSelect: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  flexDirection: "row",
  alignItems: "center",
  alignSelf: "stretch",
  gap: spacing.sm,
})
const $versionMore: ViewStyle = {
  minWidth: 44,
  minHeight: 44,
  alignItems: "center",
  justifyContent: "center",
}
const $versionMark: ThemedStyle<ViewStyle> = ({ radius }) => ({
  width: 5,
  height: 34,
  borderRadius: radius.full,
})
const $versionMarkSelected: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.tint,
})
const $versionCopy: ThemedStyle<ViewStyle> = ({ spacing }) => ({ flex: 1, gap: spacing.xxxs })
const $versionContext: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minWidth: 64,
  alignItems: "flex-end",
  gap: spacing.xxxs,
})
