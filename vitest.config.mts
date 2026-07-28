/// <reference types="vitest" />
// ShuChat test harness (fork addition — upstream Cinny ships no tests).
// Deliberately minimal: only the plugins tests need (react + vanilla-extract),
// NOT the full build pipeline (PWA/wasm/static-copy stay out of test runs).
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';

export default defineConfig({
  plugins: [react(), vanillaExtractPlugin()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // folds/matrix-js-sdk are ESM-heavy; let vitest transform them
    server: { deps: { inline: ['folds'] } },
  },
});
