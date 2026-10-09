const modulePathIgnorePatterns = ["<rootDir>/\\.delta/", "<rootDir>/\\.agents-work/"]

// why: Convex functions and pure logic never touch React Native, so they skip its preset and run in plain Node.
const nodeTestDirectories = ["<rootDir>/convex/", "<rootDir>/src/features/sync/"]

/**
 * Tests under test/config/ assert repo invariants by reading JSON and shelling out
 * to the Expo CLI. They run without the jest-expo preset, so they must not import
 * app code: no React Native transform, environment, or global mocks are available.
 *
 * @type {import('@jest/types').Config.InitialOptions}
 */
module.exports = {
  projects: [
    {
      displayName: "app",
      preset: "jest-expo",
      cacheDirectory: "<rootDir>/.jest-cache",
      modulePathIgnorePatterns,
      setupFiles: ["<rootDir>/test/setup.ts"],
      testPathIgnorePatterns: ["/node_modules/", "<rootDir>/test/config/", ...nodeTestDirectories],
      transformIgnorePatterns: [
        "/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|@convex-dev|convex-test|react-native-purchases|react-native-purchases-ui|@revenuecat))",
        "/node_modules/react-native-reanimated/plugin/",
      ],
    },
    {
      displayName: "node",
      cacheDirectory: "<rootDir>/.jest-cache",
      testEnvironment: "node",
      testMatch: nodeTestDirectories.map((directory) => `${directory}**/*.test.ts`),
      modulePathIgnorePatterns,
      transform: {
        "^.+\\.[jt]sx?$": "babel-jest",
      },
      // why: only convex-test and Convex components ship ESM; pnpm nests them under node_modules/.pnpm.
      transformIgnorePatterns: [
        "/node_modules/(?!(\\.pnpm/(convex-test|@convex-dev)[^/]*/node_modules/)?(convex-test|@convex-dev)/)",
      ],
    },
    {
      displayName: "config",
      cacheDirectory: "<rootDir>/.jest-cache",
      testEnvironment: "node",
      testMatch: ["<rootDir>/test/config/**/*.test.ts"],
      modulePathIgnorePatterns,
      transform: {
        "^.+\\.[jt]sx?$": "babel-jest",
      },
    },
  ],
}
