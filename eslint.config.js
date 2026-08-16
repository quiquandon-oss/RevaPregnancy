export default [
  {
    files: ["public/js/**/*.js", "supabase/**/*.js", "tests/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        localStorage: "readonly",
        indexedDB: "readonly",
        fetch: "readonly",
        crypto: "readonly",
        console: "readonly",
        caches: "readonly",
        self: "readonly",
      },
    },
    rules: {
      "no-unused-vars": "warn",
      "no-undef": "error",
      eqeqeq: "warn",
      "no-var": "error",
      "prefer-const": "warn",
    },
  },
  {
    files: ["supabase/tests/**/*.js"],
    languageOptions: {
      globals: {
        process: "readonly",
      },
    },
  },
];
