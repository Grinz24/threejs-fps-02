# Kiln Yard

A round-based tactical first-person shooter in three.js: Raiders bring a demolition charge to
one of two sites in a sun-baked quarry town at dusk; Wardens hold the yard. Five a side, you plus
nine bots, first to 7 rounds. Original map, models, palette, names and synthesised sounds.

Play: `node serve.ts`, open http://localhost:8080, pick a side.

- **Move** WASD (acceleration and friction), Shift walk (silent), Ctrl/C crouch, Space jump
- **Fight** mouse look (pointer lock), LMB fire, RMB scope, R reload, 1–5 / Q weapons
- **Objective** hold E to plant at A or B, or to defuse; G drops the charge
- **Economy** B opens the buy menu in freeze time and the first seconds in spawn; Tab scoreboard

## How it is built

`game/src/` is plain ES modules, no build step. The simulation (`sim.js` with `actors`,
`combat`, `grenades`, `round`, `bots`, `movement`, `world`, `nav`) runs in fixed 60 Hz steps,
draws randomness only from one seeded stream and reports to the presentation only through a
pooled event queue. The presentation (`map`, `characters`, `viewmodel`, `effects`, `audio`,
`hud`, `radar`, `buymenu`) reads state and drains events once per rendered frame.

## Screenshots

`screenshots/` are real frames of the game, staged deterministically: `?shot=start|play|end&seed=1`
runs a bot-only match headless to the moment, replays the same seed with the camera in the chosen
bot's eyes, then sets `window.__shotReady` (see `shots.json` and `game/src/shot.js`).

`node tools/headless-match.mjs` plays twelve bot-only matches in Node and prints win rates,
round reasons, kills and weapon use, for balance checks.
