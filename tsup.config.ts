import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "exact/facilitator/index": "src/exact/facilitator/index.ts",
    "exact/facilitator/register": "src/exact/facilitator/register.ts",
    "exact/client/index": "src/exact/client/index.ts",
    "exact/client/register": "src/exact/client/register.ts",
    "exact/server/index": "src/exact/server/index.ts",
    "exact/server/register": "src/exact/server/register.ts",
  },
  format: ["cjs", "esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  external: ["@x402/core", "tronweb"],
});
