import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // We deliberately use <img> for recipe images (backend-served URLs),
      // local file previews via URL.createObjectURL, and QR code data URLs.
      // <Image /> doesn't fit those well: blob/data URLs bypass its
      // optimizer, and remote backend URLs would require remotePatterns
      // config tied to deploy-time hostnames.
      "@next/next/no-img-element": "off",
    },
  },
]);

export default eslintConfig;
