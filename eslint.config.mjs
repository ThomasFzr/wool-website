import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Dette historique (nombreux `any` et apostrophes JSX) : en warning pour
      // que `npm run lint` reste actionnable sur les vraies erreurs.
      "@typescript-eslint/no-explicit-any": "warn",
      "react/no-unescaped-entities": "warn",
      // Pattern répandu dans le code existant (hydratation au montage) :
      // à corriger au fil de l'eau, en warning en attendant.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "scripts/optimize-cloudinary-images.js",
  ]),
]);

export default eslintConfig;
