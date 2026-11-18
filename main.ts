// Solara Keys - official make.fun gta6-01 entry for this repository (Node 22, standard library only).
// Solara Keys is set in Costa Luna with fixer Mara Quill and Luna PD.
// The playable game lives in ./game as plain static files loaded offline (no build, no network requests).
// This script copies game/ and screenshots/ to /output (or MAKEFUN_OUTPUT_DIR) and writes dossier.json
// with the vendored make.fun library using the scorer's required caps.
//
// Serve locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader container:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function copyDirIfPresent(src, dest) {
  if (!existsSync(src)) return;
  cpSync(src, dest, { recursive: true });
}

mkdirSync(out, { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
copyDirIfPresent(join(here, 'screenshots'), join(out, 'screenshots'));

// Scorer caps from reference/gate.json for the Solara Keys hand-in.
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
} as const;

const dossier = buildDossier(out, DOSSIER_CAPS);
writeFileSync(join(out, 'dossier.json'), dossier);
console.log('Solara Keys packaged to', out);
