import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import { defineConfig } from "eslint/config";

export default defineConfig([
  { files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"], plugins: { js }, extends: ["js/recommended"], languageOptions: { globals: globals.browser } },
  tseslint.configs.recommended,
  pluginReact.configs.flat.recommended,
  {
    // プロジェクト固有のルール
    rules: {
      // セミコロン強制
      "semi": ["warn", "always"],

      // 開発時に便利な警告
      "no-console": "warn",
      "no-debugger": "warn",

      // コード品質
      "no-var": "error",
      "prefer-const": "warn",
      "eqeqeq": ["error", "always"],
      "curly": ["error", "all"],

      // 未使用変数は警告（先頭に _ があるものは無視）
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_", "caughtErrorsIgnorePattern": "^_" }
      ],

      "react/react-in-jsx-scope": "off",
    },
  },
]);
