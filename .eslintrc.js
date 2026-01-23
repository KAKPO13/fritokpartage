module.exports = {
  root: true,
  env: {
    browser: true,   // pour ton code Next.js côté client
    node: true,      // pour tes fonctions Netlify et tailwind.config.js
    es2021: true,
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: "module",
    ecmaFeatures: {
      jsx: true,
    },
  },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
    "next/core-web-vitals"
  ],
  plugins: [
    "@typescript-eslint",
    "react",
    "react-hooks",
    "import"
  ],
  rules: {
    // Next.js specific
    "@next/next/no-html-link-for-pages": "off",

    // React best practices
    "react/react-in-jsx-scope": "off", // Next.js gère React automatiquement
    "react/prop-types": "off", // inutile avec TypeScript

    // TypeScript
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    "@typescript-eslint/explicit-module-boundary-types": "off",

    // Import hygiene
    "import/order": [
      "warn",
      {
        groups: [["builtin", "external", "internal"]],
        pathGroups: [
          {
            pattern: "react",
            group: "external",
            position: "before"
          },
          {
            pattern: "@supabase/**",
            group: "external",
            position: "after"
          },
          {
            pattern: "firebase-admin",
            group: "external",
            position: "after"
          }
        ],
        pathGroupsExcludedImportTypes: ["builtin"],
        "newlines-between": "always",
        alphabetize: { order: "asc", caseInsensitive: true }
      }
    ],

    // Autoriser console pour logs serveur
    "no-console": "off"
  },
  globals: {
    fetch: "readonly" // Node 18+ a fetch global
  },
  overrides: [
    {
      files: ["netlify/functions/**/*.js", "tailwind.config.js"],
      env: { node: true },
      rules: {
        "@typescript-eslint/no-require-imports": "off", // autoriser require()
      }
    }
  ],
  settings: {
    react: {
      version: "detect"
    }
  }
};

