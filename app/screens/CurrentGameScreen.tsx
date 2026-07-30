import { useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { Modal, Pressable, View } from "react-native"
import { useKeepAwake } from "expo-keep-awake"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { Button } from "@/components/Button"
import { ConnectionBadge } from "@/components/ConnectionBadge"
import { Header } from "@/components/Header"
import { PlayerGrid } from "@/components/PlayerGrid"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import type { LocalGameRepository } from "@/features/game/localPersistence"
import type { LocalGame } from "@/features/game/types"
import { useLocalGame } from "@/features/game/useLocalGame"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

const HEADER_HEIGHT = 56

type PendingAction = "finish" | "abandon" | null

export interface CurrentGameScreenProps {
  initialGame: LocalGame
  onHome: () => void
  onGameEnded: (gameId: string) => void
  repository?: LocalGameRepository
}

export function CurrentGameScreen({
  initialGame,
  onHome,
  onGameEnded,
  repository,
}: CurrentGameScreenProps) {
  useKeepAwake("count-local-game")
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  const insets = useSafeAreaInsets()
  const runtime = useLocalGame(initialGame, repository)
  const [menuOpen, setMenuOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)

  function confirmEnd() {
    const ended = pendingAction === "finish" ? runtime.finish() : runtime.abandon()
    setPendingAction(null)
    if (ended.status !== "active") setTimeout(() => onGameEnded(ended.id), 0)
  }

  function chooseAction(action: Exclude<PendingAction, null>) {
    setMenuOpen(false)
    setPendingAction(action)
  }

  return (
    <Screen preset="fixed" safeAreaEdges={["bottom"]} contentContainerStyle={themed($screen)}>
      <View testID="game-board" style={themed($board)}>
        <Header
          titleTx="localGame:localGame"
          leftTx="localGame:home"
          onLeftPress={onHome}
          RightActionComponent={
            <View style={themed($headerActions)}>
              <Button
                testID="undo-button"
                tx="localGame:undo"
                accessibilityHint="Reverses your latest life change without deleting its history"
                disabled={!runtime.canUndo || pendingAction !== null}
                preset="filled"
                style={themed($undoButton)}
                textStyle={themed($undoText)}
                disabledStyle={themed($undoDisabled)}
                disabledTextStyle={themed($undoDisabledText)}
                onPress={runtime.undo}
              />
              <Pressable
                testID="game-menu-button"
                accessibilityRole="button"
                accessibilityLabel={translate("localGame:gameMenu")}
                accessibilityHint="Opens finish and abandon actions for this game"
                style={({ pressed }) => [
                  themed($menuButton),
                  pressed && { backgroundColor: colors.separator },
                ]}
                onPress={() => setMenuOpen(true)}
              >
                <Text text="⋯" style={themed($menuGlyph)} />
              </Pressable>
            </View>
          }
        />
        <View style={themed($statusRow)}>
          <ConnectionBadge />
        </View>
        <PlayerGrid
          players={runtime.game.players}
          disabled={pendingAction !== null}
          onChange={runtime.changeLife}
        />
      </View>

      {menuOpen ? (
        <Modal transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
          <Pressable
            testID="game-menu-backdrop"
            accessibilityRole="button"
            accessibilityLabel={translate("localGame:closeMenu")}
            style={[themed($menuBackdrop), { paddingTop: insets.top + HEADER_HEIGHT }]}
            onPress={() => setMenuOpen(false)}
          >
            <Pressable style={themed($menuPanel)} onPress={() => {}}>
              <Button
                testID="finish-button"
                tx="localGame:finish"
                style={themed($menuItem)}
                onPress={() => chooseAction("finish")}
              />
              <Button
                testID="abandon-button"
                tx="localGame:abandon"
                style={themed($menuItem)}
                onPress={() => chooseAction("abandon")}
              />
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}

      {pendingAction ? (
        <Modal transparent animationType="fade" onRequestClose={() => setPendingAction(null)}>
          <View style={themed($dialogBackdrop)}>
            <View accessibilityRole="alert" style={themed($dialog)}>
              <Text
                tx={
                  pendingAction === "finish"
                    ? "localGame:finishConfirmation"
                    : "localGame:abandonConfirmation"
                }
                weight="bold"
                style={themed($dialogText)}
              />
              <View style={themed($dialogActions)}>
                <Button
                  tx="localGame:cancel"
                  style={themed($dialogButton)}
                  onPress={() => setPendingAction(null)}
                />
                <Button
                  testID={`confirm-${pendingAction}-button`}
                  tx={pendingAction === "finish" ? "localGame:finishGame" : "localGame:abandonGame"}
                  preset="reversed"
                  style={themed($dialogButton)}
                  onPress={confirmEnd}
                />
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </Screen>
  )
}

const $screen: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  width: "100%",
  justifyContent: "flex-start",
})
const $board: ThemedStyle<ViewStyle> = () => ({ flex: 1, width: "100%" })

const $headerActions: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
  paddingEnd: spacing.sm,
})
const $undoButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 36,
  paddingVertical: 0,
  paddingHorizontal: spacing.sm,
  borderRadius: spacing.md,
})
const $undoText: ThemedStyle<TextStyle> = () => ({ fontSize: 14, lineHeight: 18 })
const $undoDisabled: ThemedStyle<ViewStyle> = ({ colors }) => ({
  borderStyle: "solid",
  borderColor: colors.transparent,
  opacity: 0.4,
})
const $undoDisabledText: ThemedStyle<TextStyle> = () => ({ textDecorationLine: "none" })
const $menuButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: 40,
  height: 40,
  alignItems: "center",
  justifyContent: "center",
  borderRadius: spacing.lg,
})
const $menuGlyph: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 24,
  lineHeight: 28,
  color: colors.text,
})

const $statusRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  paddingBottom: spacing.xs,
})

const $menuBackdrop: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flex: 1,
  alignItems: "flex-end",
  backgroundColor: colors.palette.overlay20,
  paddingEnd: spacing.sm,
})
const $menuPanel: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  minWidth: 180,
  gap: spacing.xs,
  padding: spacing.xs,
  borderRadius: spacing.md,
  borderWidth: 1,
  borderColor: colors.separator,
  backgroundColor: colors.background,
})
const $menuItem: ThemedStyle<ViewStyle> = () => ({ minHeight: 48 })

const $dialogBackdrop: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flex: 1,
  alignItems: "center",
  justifyContent: "center",
  padding: spacing.lg,
  backgroundColor: colors.palette.overlay50,
})
const $dialog: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  width: "100%",
  maxWidth: 420,
  gap: spacing.md,
  padding: spacing.lg,
  borderRadius: spacing.md,
  backgroundColor: colors.background,
})
const $dialogText: ThemedStyle<TextStyle> = () => ({ textAlign: "center" })
const $dialogActions: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.xs,
})
const $dialogButton: ThemedStyle<ViewStyle> = () => ({ flex: 1, minHeight: 48 })
