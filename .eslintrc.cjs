/* eslint-env node */
module.exports = {
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/eslint-recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:import/recommended",
    "plugin:import/typescript",
    "prettier",
  ],
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint", "import"],
  root: true,
  rules: {
    "@typescript-eslint/no-unused-vars": ["error"],
    "no-unused-vars": "warn",
  },
  globals: {
    expect: true,
  },
};
