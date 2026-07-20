import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  platform: 'node',
  dts: { sourcemap: true },
  sourcemap: true,
  clean: true,
  treeshake: true,
  deps: { neverBundle: ['zod', 'mongoose'] },
})
