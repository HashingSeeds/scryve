/* eslint-env node */
const { join } = require("node:path")

const rootDir = join(__dirname, "../../../..")

// why: the stress harness is opt-in and must travel as one folder, so it carries its own Jest config instead of joining the repo's projects.
module.exports = {
  rootDir,
  displayName: "outbox-stress",
  cacheDirectory: "<rootDir>/.jest-cache",
  testEnvironment: "node",
  testMatch: ["<rootDir>/src/features/sync/stress/**/*.stress.ts"],
  modulePathIgnorePatterns: ["<rootDir>/\\.delta/", "<rootDir>/\\.agents-work/"],
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
  transform: { "^.+\\.[jt]sx?$": "babel-jest" },
  transformIgnorePatterns: [
    "/node_modules/(?!(\\.pnpm/(convex-test|@convex-dev|expo)[^/]*/node_modules/)?(convex-test|@convex-dev|expo/virtual)/)",
  ],
}
