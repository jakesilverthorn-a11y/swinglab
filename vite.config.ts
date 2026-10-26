import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const mediapipeVersion: string = JSON.parse(
  readFileSync('./node_modules/@mediapipe/tasks-vision/package.json', 'utf-8'),
).version;

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: {
    __MEDIAPIPE_VERSION__: JSON.stringify(mediapipeVersion),
    // `npm run build:hosted` ships the pose runtime and model next to the page, so the app can skip probing for them.
    ...(mode === 'hosted' ? { 'import.meta.env.VITE_BUNDLED': JSON.stringify('1') } : {}),
  },
  // The Archivo font file is inlined into the stylesheet so the app has no font request and works offline from the start.
  build: { assetsInlineLimit: 150_000 },
  server: { host: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
}));
