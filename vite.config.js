import { execSync } from 'node:child_process';

// Build identifier shown in the behavioural logs (git short hash, '-dirty' if uncommitted changes exist).
let version = 'unknown';
try { version = execSync('git rev-parse --short HEAD').toString().trim() + (execSync('git status --porcelain').toString().trim() ? '-dirty' : ''); } catch { /* not a git checkout */ }

// Deployment: GitHub Pages serves this project at https://marlenercohen.github.io/block-game-v2/, so production builds use the base path
// /block-game-v2/ (override with VITE_BASE=/other-name/). Local development (npm run dev) keeps base '/'.
// Rapier's "compat" build embeds its WebAssembly as base64 inside the JS bundle, so no separate .wasm file needs to be served.
export default ({ command }) => ({
  define: { __APP_VERSION__: JSON.stringify(version) },
  base: command === 'build' ? (process.env.VITE_BASE ?? '/block-game-v2/') : '/',
  server: { port: 5174 },
  build: { target: 'esnext', chunkSizeWarningLimit: 6000 },
});
