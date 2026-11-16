// why: a game's rules live in its system definition, so code that compares game IDs drifts from it.
const gameIdSelectors = [
  {
    selector:
      "BinaryExpression[operator=/^[!=]==$/]:matches([left.name=/([sS]ystem|[gG]ame)(Id)?$/], [left.property.name=/([sS]ystem|[gG]ame)(Id)?$/], [right.name=/([sS]ystem|[gG]ame)(Id)?$/], [right.property.name=/([sS]ystem|[gG]ame)(Id)?$/]):matches([left.value=/^(mtg|ygo|pokemon)$/], [right.value=/^(mtg|ygo|pokemon)$/])",
    message:
      "Read game rules from the system definition (convex/lib/systems) instead of comparing a game ID.",
  },
  {
    selector: "SwitchCase[test.value=/^(mtg|ygo|pokemon)$/]",
    message:
      "Read game rules from the system definition (convex/lib/systems) instead of switching on a game ID.",
  },
]

const UI_TEXT_ATTRIBUTE =
  "/^(text|title|subtitle|label|placeholder|heading|content|message|description|helper|caption|accessibilityLabel|accessibilityHint|accessibilityValue|count)$/"

// why: numbers, dates, signs, and joined text read wrong in other languages unless src/i18n/format.ts writes them.
const localeSelectors = [
  {
    selector: "CallExpression[callee.property.name=/^toLocale(String|DateString|TimeString)$/]",
    message: "Format with formatNumber, formatDate, or formatTime from @/i18n/format.",
  },
  {
    selector: "NewExpression[callee.object.name='Intl']",
    message: "Format with @/i18n/format, which knows the app's language and calendar.",
  },
  {
    selector: "CallExpression[callee.property.name='join'][arguments.0.value=/[·•+&]|, /]",
    message:
      "Join UI text with joinParts, formatList, formatConjunction, or formatSum from @/i18n/format.",
  },
  {
    selector: "TemplateLiteral > TemplateElement[value.raw=/×/]",
    message: "Write a card count with formatCopies from @/i18n/format.",
  },
  {
    selector:
      "JSXOpeningElement[name.name='TrailingNumber'] > JSXAttribute[name.name='value'] > JSXExpressionContainer > TemplateLiteral[expressions.length>0]",
    message: "Pass the number to TrailingNumber, or format it with @/i18n/format.",
  },
  {
    selector: "TemplateLiteral > TemplateElement[value.raw=/ [·•] /]",
    message: "Join UI text with joinParts from @/i18n/format.",
  },
  {
    selector:
      "ConditionalExpression:matches([consequent.value=/^[+−]$/], [alternate.value=/^[+−]$/])",
    message: "Write a signed number with formatSigned from @/i18n/format.",
  },
  {
    selector: "TemplateLiteral[quasis.0.value.raw=/^[+−]$/]",
    message: "Write a signed number with formatSigned from @/i18n/format.",
  },
  {
    selector: `JSXAttribute[name.name=${UI_TEXT_ATTRIBUTE}] CallExpression:matches([callee.name='String'], [callee.property.name=/^(toString|toFixed)$/])`,
    message: "Pass the number to Text, or format it with formatNumber from @/i18n/format.",
  },
  {
    selector: `JSXAttribute[name.name=${UI_TEXT_ATTRIBUTE}] > JSXExpressionContainer > TemplateLiteral[expressions.length>0]`,
    message:
      "Build UI text with translate() or @/i18n/format, so word order and digits follow the language.",
  },
]

module.exports = {
  root: true,
  extends: [
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
    "plugin:react-native/all",
    "expo",
    // `jsx-runtime` must come after `expo` or it will be overridden
    "plugin:react/jsx-runtime",
    "prettier",
  ],
  plugins: ["reactotron", "prettier", "self-explanatory-code"],
  rules: {
    "prettier/prettier": "error",
    "self-explanatory-code/prefer-self-explanatory-code": [
      "error",
      {
        baselineFile: ".eslint-comments-baseline.json",
        allowPatterns: ["^(?:\\*\\s*)*why:"],
      },
    ],
    "@typescript-eslint/array-type": 0,
    "@typescript-eslint/ban-ts-comment": 0,
    "@typescript-eslint/no-explicit-any": 0,
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
      },
    ],
    "@typescript-eslint/no-var-requires": 0,
    "@typescript-eslint/no-require-imports": 0,
    "@typescript-eslint/no-empty-object-type": 0,
    // eslint
    "no-use-before-define": 0,
    "no-restricted-imports": [
      "error",
      {
        paths: [
          {
            name: "react",
            importNames: ["default"],
            message: "Import named exports from 'react' instead.",
          },
          {
            name: "react-native",
            importNames: ["SafeAreaView"],
            message: "Use the SafeAreaView from 'react-native-safe-area-context' instead.",
          },
          {
            name: "react-native",
            importNames: ["Text", "Button", "TextInput"],
            message: "Use the custom wrapper component from '@/components'.",
          },
        ],
      },
    ],
    "react/prop-types": 0,
    "react-hooks/preserve-manual-memoization": 0,
    "react-hooks/purity": 0,
    "react-hooks/refs": 0,
    "react-hooks/set-state-in-effect": 0,
    "react-native/no-raw-text": 0,
    "reactotron/no-tron-in-production": "error",
    // eslint-config-standard overrides
    "comma-dangle": 0,
    "no-global-assign": 0,
    "quotes": 0,
    "space-before-function-paren": 0,
    // eslint-import
    "import/order": [
      "error",
      {
        "alphabetize": {
          order: "asc",
          caseInsensitive: true,
        },
        "newlines-between": "always",
        "groups": [["builtin", "external"], "internal", "unknown", ["parent", "sibling"], "index"],
        "distinctGroup": false,
        "pathGroups": [
          {
            pattern: "react",
            group: "external",
            position: "before",
          },
          {
            pattern: "react-native",
            group: "external",
            position: "before",
          },
          {
            pattern: "expo{,-*}",
            group: "external",
            position: "before",
          },
          {
            pattern: "@/**",
            group: "unknown",
            position: "after",
          },
        ],
        "pathGroupsExcludedImportTypes": ["react", "react-native", "expo", "expo-*"],
      },
    ],
    "import/newline-after-import": 1,
  },
  overrides: [
    {
      // why: comments in English copy are translator notes that `pnpm i18n:translate` sends to the model.
      files: ["src/i18n/en/*.ts"],
      rules: { "self-explanatory-code/prefer-self-explanatory-code": 0 },
    },
    {
      files: ["src/**/*.{ts,tsx}", "convex/**/*.ts"],
      excludedFiles: ["**/*.test.{ts,tsx}", "convex/_generated/**"],
      rules: {
        "@typescript-eslint/no-explicit-any": "error",
      },
    },
    {
      files: ["src/**/*.{ts,tsx}", "convex/**/*.ts"],
      excludedFiles: [
        "**/*.test.{ts,tsx}",
        "convex/_generated/**",
        "convex/lib/systems/**",
        "convex/lib/games/**",
        "src/devtools/seeds/**",
        "src/app/dev/seed/**",
        "src/features/game/localPersistence.ts",
      ],
      rules: {
        "no-restricted-syntax": ["error", ...gameIdSelectors],
      },
    },
    {
      files: ["src/**/*.{ts,tsx}"],
      excludedFiles: [
        "**/*.test.{ts,tsx}",
        "src/devtools/**",
        "src/devtools/seeds/**",
        "src/app/dev/**",
        "src/features/game/localPersistence.ts",
        "src/i18n/format.ts",
      ],
      rules: {
        "no-restricted-syntax": ["error", ...gameIdSelectors, ...localeSelectors],
      },
    },
    {
      files: ["src/**/*.tsx"],
      excludedFiles: ["**/*.test.tsx", "src/app/dev/**"],
      plugins: ["i18next"],
      rules: {
        "i18next/no-literal-string": [
          "error",
          {
            "mode": "jsx-only",
            "should-validate-template": true,
            "callees": {
              exclude: [
                "translate",
                "separator",
                "i18n(ext)?",
                "t",
                "require",
                "addEventListener",
                "removeEventListener",
                "includes",
                "indexOf",
                "endsWith",
                "startsWith",
              ],
            },
            "jsx-attributes": {
              include: [
                "^(text|title|subtitle|label|placeholder|heading|content|message|description|helper|caption)$",
                "^(leftText|rightText|confirmText|cancelText|emptyText|buttonText|actionText)$",
                "^accessibility(Label|Hint|Value)$",
              ],
            },
          },
        ],
      },
    },
  ],
}
