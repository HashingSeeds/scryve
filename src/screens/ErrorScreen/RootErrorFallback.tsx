// eslint-disable-next-line no-restricted-imports -- this fallback must not depend on app providers
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"

interface RootErrorFallbackProps {
  error: Error
  onRetry(): Promise<void>
  showDetails?: boolean
}

export function RootErrorFallback({
  error,
  onRetry,
  showDetails = __DEV__,
}: RootErrorFallbackProps) {
  return (
    <View style={styles.screen}>
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          Something went wrong
        </Text>
        <Text style={styles.message}>
          Scryve hit an unexpected error. Try again, or restart the app if the problem continues.
        </Text>

        {showDetails ? (
          <ScrollView style={styles.details} contentContainerStyle={styles.detailsContent}>
            <Text selectable style={styles.detailsText}>
              {String(error)}
            </Text>
            {error.stack ? (
              <Text selectable style={styles.stackText}>
                {error.stack}
              </Text>
            ) : null}
          </ScrollView>
        ) : null}

        <Pressable
          accessibilityRole="button"
          onPress={() => void onRetry()}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    </View>
  )
}

const fallbackColors = {
  buttonBackground: "#B95261",
  buttonText: "#FFF7F8",
  detailsBackground: "#292226",
  errorText: "#FFB4AB",
  primaryText: "#F4ECEF",
  screenBackground: "#191518",
  secondaryText: "#CFC4C8",
  stackText: "#B9ADB2",
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: fallbackColors.buttonBackground,
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    color: fallbackColors.buttonText,
    fontSize: 16,
    fontWeight: "700",
  },
  content: {
    alignSelf: "center",
    gap: 16,
    maxWidth: 560,
    width: "100%",
  },
  details: {
    backgroundColor: fallbackColors.detailsBackground,
    borderRadius: 8,
    maxHeight: 240,
  },
  detailsContent: {
    padding: 16,
  },
  detailsText: {
    color: fallbackColors.errorText,
    fontSize: 14,
    fontWeight: "600",
  },
  message: {
    color: fallbackColors.secondaryText,
    fontSize: 17,
    lineHeight: 25,
  },
  screen: {
    backgroundColor: fallbackColors.screenBackground,
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  stackText: {
    color: fallbackColors.stackText,
    fontFamily: "monospace",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 12,
  },
  title: {
    color: fallbackColors.primaryText,
    fontSize: 28,
    fontWeight: "700",
  },
})
