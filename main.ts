// Entry point for the make.fun threejs-fps bounty (Node 22, standard library only).
//
// The playable game lives in game/ as static ES modules (three.js comes in through an import map), and
// screenshots/ holds the PNG/JPEG shots, the first by name being the cover. This script stages both into
// the output directory and then writes dossier.json there, the summary the judge reads, using the
// vendored make.fun library.
//
// The grader runs it with /output; locally, point MAKEFUN_OUTPUT_DIR somewhere else:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// To play it in a browser, run `node serve.ts` and open http://localhost:8080.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const sourceRoot = dirname(fileURLToPath(import.meta.url));
const outputRoot = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** Copies a directory beside this file into the output tree under the same name. */
function stage(name: string, { required }: { required: boolean }): void {
  const from = join(sourceRoot, name);
  const to = join(outputRoot, name);
  mkdirSync(to, { recursive: true });
  if (required || existsSync(from)) cpSync(from, to, { recursive: true });
}

mkdirSync(outputRoot, { recursive: true });
stage('game', { required: true });
// screenshots/ is optional in the source tree, but the output always gets the directory.
stage('screenshots', { required: false });

// Limits mirror the scorer's gate: text_max_bytes is the only one that shapes the dossier's contents; the rest
// make buildDossier refuse an entry the scorer would refuse anyway (over 4 screenshots or any over 256 KiB; over
// 993 files or 48 MiB in game/, which shares /output's 1000-entry budget with screenshots/ and dossier.json).
const dossier = buildDossier(outputRoot, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(outputRoot, 'dossier.json'), dossier);
