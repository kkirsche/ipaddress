import comments from "@eslint-community/eslint-plugin-eslint-comments/configs";
import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";
import prettier from "eslint-config-prettier/flat";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";
import { importX } from "eslint-plugin-import-x";
import jest from "eslint-plugin-jest";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  { ignores: ["build/", "coverage/"] },

  {
    linterOptions: {
      reportUnusedDisableDirectives: "error",
      reportUnusedInlineConfigs: "error",
    },
  },

  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  importX.flatConfigs.recommended,
  importX.flatConfigs.typescript,
  comments.recommended,

  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["*.js", "eslint.config.ts"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      "import-x/resolver-next": [createTypeScriptImportResolver()],
    },
    rules: {
      eqeqeq: ["error", "always"],
      "no-console": "error",
      "object-shorthand": "error",
      "prefer-template": "error",

      // Keep type-only imports/exports explicit so they're erased under
      // isolatedModules transpilers such as Babel.
      "@typescript-eslint/consistent-type-exports": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-import-type-side-effects": "error",

      "@typescript-eslint/explicit-module-boundary-types": "error",
      "@typescript-eslint/switch-exhaustiveness-check": [
        "error",
        { considerDefaultExhaustiveForUnions: true },
      ],
      // Numbers and bigints stringify predictably; everything else must be
      // converted explicitly.
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true },
      ],
      // Conflicts with no-non-null-assertion from the strict preset.
      "@typescript-eslint/non-nullable-type-assertion-style": "off",
      // Subclasses implement abstract accessors such as `version`, which
      // must stay on the prototype so they're readable during super() and
      // don't become own enumerable properties of every instance.
      "@typescript-eslint/class-literal-property-style": ["error", "getters"],

      // TypeScript already reports unresolved and missing imports.
      "import-x/no-unresolved": "off",
      "import-x/namespace": "off",
      "import-x/default": "off",
      "import-x/no-named-as-default-member": "off",

      "import-x/consistent-type-specifier-style": ["error", "prefer-top-level"],
      "import-x/first": "error",
      "import-x/newline-after-import": "error",
      "import-x/no-duplicates": "error",
      "import-x/no-extraneous-dependencies": [
        "error",
        {
          devDependencies: ["**/*.test.ts", "*.config.{js,ts}", "scripts/**"],
        },
      ],
      "import-x/no-mutable-exports": "error",
      "import-x/no-self-import": "error",
      "import-x/no-useless-path-segments": "error",

      "@eslint-community/eslint-comments/require-description": "error",
    },
  },

  {
    files: ["src/**/*.test.ts"],
    extends: [jest.configs["flat/recommended"], jest.configs["flat/style"]],
    rules: {
      "jest/consistent-test-it": "error",
      "jest/no-conditional-in-test": "error",
      "jest/prefer-hooks-on-top": "error",
      "jest/require-to-throw-message": "error",
      // Prefer the jest-aware variant so `expect(obj.method)` isn't flagged.
      "@typescript-eslint/unbound-method": "off",
      "jest/unbound-method": "error",
    },
  },

  {
    // Replays recorded Python calls by name against duck-typed objects, so
    // values are deliberately untyped and each case branches on its fixture.
    files: ["src/compatibility.test.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "jest/no-conditional-expect": "off",
      "jest/no-conditional-in-test": "off",
    },
  },

  {
    files: ["**/*.js"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      sourceType: "commonjs",
      globals: globals.node,
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },

  prettier
);
