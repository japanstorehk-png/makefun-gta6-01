// Solara Keys — an original offline open-world crime game set in Costa Luna.
// Entry for the make.fun gta6-01 bounty (Node 22, standard library only).
//
// The playable game lives in game/ as plain static files (game/index.html and ES modules,
// no build step and no network requests). This program packages game/ and screenshots/
// into /output (or MAKEFUN_OUTPUT_DIR) and writes dossier.json using the vendored
// make.fun library so the grader can score the submission.
//
// Serve locally: `node serve.ts`, then open http://localhost:8080.
// Outside the grader container:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// Scorer caps: text_max_bytes shapes dossier text; the rest refuse entries that would be refused.
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(out, 'dossier.json'), dossier);

console.log('Solara Keys dossier written to', join(out, 'dossier.json'));
