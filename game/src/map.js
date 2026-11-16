// Kiln Yard as a scene: the world's merged rectangles become plastered blocks with caps,
// windows and doors, crates, containers and barriers fill their cells exactly as they collide,
// and a dusk sky, distant mesas and the kiln chimneys frame the yard. Everything static is
// baked into a few vertex-coloured batches, so the whole map is a handful of draw calls.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { CELL, ROOF_HEIGHT, SITES } from './level.js';
import { BOMB_TIME } from './round.js';
import { rects, cellX, cellZ, COLS, ROWS, tileAt, cellIndex } from './world.js';
import { createBatch, vertexColored } from './batch.js';

const HALF = CELL / 2;
// Big blocks stay calm plaster and stone; small ones carry the terracotta and teal accents.
const BUILDING_TONES = [PALETTE.plaster, PALETTE.stone, PALETTE.stoneCap];
const ACCENT_TONES = [PALETTE.terracotta, PALETTE.teal, PALETTE.plaster, PALETTE.stone];
const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
// Each site's own colour, on its paving, its boundary stripe and its stencilled letter.
const SITE_TONES = { a: PALETTE.teal, b: PALETTE.terracotta };
const STRIPE = 0.32;
const THRESHOLD = '.,';
const mix = new THREE.Color();
const other = new THREE.Color();

// A stable hash of integers in [0, 1): the map's look never draws from the simulation's RNG.
function hash(a, b, c = 0) {
  let h = Math.imul(a * 374761393 + b * 668265263 + c * 2147483647, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function tinted(hexA, hexB, t) {
  return mix.set(hexA).lerp(other.set(hexB), t);
}

const isOpen = (col, row) => col >= 0 && row >= 0 && col < COLS && row < ROWS && tileAt(row * COLS + col) !== '#';

function building(batch, glow, r) {
  const x0 = cellX(r.col) - HALF;
  const z0 = cellZ(r.row) - HALF;
  const x1 = x0 + r.width * CELL;
  const z1 = z0 + r.depth * CELL;
  const h = r.height;
  const tones = r.width * r.depth > 12 ? BUILDING_TONES : ACCENT_TONES;
  const tone = tones[Math.floor(hash(r.col, r.row) * tones.length)];
  batch.box(x0, 0, z0, x1, h, z1, tone, 8);
  batch.box(x0 - 0.05, 0, z0 - 0.05, x1 + 0.05, 0.55, z1 + 0.05, PALETTE.stoneShade, 8);
  batch.box(x0 - 0.14, h, z0 - 0.14, x1 + 0.14, h + 0.32, z1 + 0.14, PALETTE.stoneCap, 8);
  // Rooftop clutter on the larger blocks: tanks, vents and the odd shed.
  const area = r.width * r.depth;
  for (let k = 0; k < Math.min(3, area >> 2); k += 1) {
    const px = x0 + 1 + hash(r.col, r.row, k + 1) * (x1 - x0 - 2);
    const pz = z0 + 1 + hash(r.row, r.col, k + 7) * (z1 - z0 - 2);
    const kind = hash(k, r.col, r.row);
    if (kind < 0.4) {
      batch.block(px, h + 0.9, pz, 1.4, 1.2, 1.4, PALETTE.metalLight);
      batch.block(px, h + 1.6, pz, 1.6, 0.16, 1.6, PALETTE.metal);
    } else if (kind < 0.75) {
      batch.block(px, h + 0.6, pz, 1.1, 0.6, 0.8, PALETTE.concrete);
      batch.block(px, h + 0.95, pz, 0.5, 0.12, 0.5, PALETTE.metal);
    } else {
      batch.block(px, h + 1.1, pz, 2.2, 1.6, 1.8, PALETTE.terracottaDark);
      batch.block(px, h + 1.95, pz, 2.5, 0.12, 2.1, PALETTE.wood);
    }
  }
  // Windows and doors on every face that looks onto the yard.
  for (let row = r.row; row < r.row + r.depth; row += 1) {
    for (let col = r.col; col < r.col + r.width; col += 1) {
      for (let s = 0; s < 4; s += 1) {
        const [dc, dr] = SIDES[s];
        if (!isOpen(col + dc, row + dr)) continue;
        const roll = hash(col, row, s);
        if (roll > 0.55) continue;
        const cx = cellX(col) + dc * HALF;
        const cz = cellZ(row) + dr * HALF;
        const along = dc === 0;
        const box = (y0, y1, half, depth, hex, target = batch) => {
          const ax = along ? half : depth;
          const az = along ? depth : half;
          target.box(cx - ax, y0, cz - az, cx + ax, y1, cz + az, hex);
        };
        if (roll < 0.12 && h > 4) {
          box(0, 2.15, 0.5, 0.06, PALETTE.wood);
          box(2.15, 2.3, 0.62, 0.1, PALETTE.stoneCap);
          box(2.5, 2.62, 0.75, 0.55, PALETTE.teal);
        } else if (h > 4.2) {
          const lit = roll > 0.44;
          box(2.5, 3.6, 0.42, 0.04, lit ? PALETTE.lamp : PALETTE.gear, lit ? glow : batch);
          box(2.36, 2.5, 0.52, 0.09, PALETTE.stoneCap);
          if (h > 6.2 && roll < 0.3) box(4.6, 5.5, 0.38, 0.04, PALETTE.tealDark);
        }
      }
    }
  }
}

function crate(batch, col, row) {
  const x = cellX(col);
  const z = cellZ(row);
  batch.box(x - HALF, 0, z - HALF, x + HALF, 1, z + HALF, PALETTE.woodLight, 8);
  for (const y of [0.08, 0.92]) batch.box(x - HALF - 0.02, y - 0.06, z - HALF - 0.02, x + HALF + 0.02, y + 0.06, z + HALF + 0.02, PALETTE.wood, 8);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const px = x + sx * (HALF - 0.05);
    const pz = z + sz * (HALF - 0.05);
    batch.box(px - 0.08, 0, pz - 0.08, px + 0.08, 1, pz + 0.08, PALETTE.wood, 8);
  }
}

function container(batch, r) {
  const x0 = cellX(r.col) - HALF;
  const z0 = cellZ(r.row) - HALF;
  const x1 = x0 + r.width * CELL;
  const z1 = z0 + r.depth * CELL;
  const tone = hash(r.col, r.row, 3) < 0.5 ? PALETTE.teal : PALETTE.terracotta;
  const dark = tone === PALETTE.teal ? PALETTE.tealDark : PALETTE.terracottaDark;
  batch.box(x0, 0, z0, x1, r.height, z1, tone, 8);
  // Corrugation ribs along the long sides, corner posts and a roof rail.
  const alongX = x1 - x0 >= z1 - z0;
  const length = alongX ? x1 - x0 : z1 - z0;
  for (let t = 0.3; t < length - 0.1; t += 0.42) {
    if (alongX) batch.box(x0 + t - 0.08, 0.1, z0 - 0.05, x0 + t + 0.08, r.height - 0.1, z1 + 0.05, dark, 8);
    else batch.box(x0 - 0.05, 0.1, z0 + t - 0.08, x1 + 0.05, r.height - 0.1, z0 + t + 0.08, dark, 8);
  }
  batch.box(x0 - 0.06, r.height - 0.12, z0 - 0.06, x1 + 0.06, r.height + 0.02, z1 + 0.06, dark);
  batch.box(x0 - 0.06, 0, z0 - 0.06, x1 + 0.06, 0.12, z1 + 0.06, dark, 8);
}

function barrier(batch, col, row) {
  const x = cellX(col);
  const z = cellZ(row);
  batch.box(x - HALF, 0, z - HALF, x + HALF, 0.35, z + HALF, PALETTE.concreteDark, 8);
  batch.box(x - HALF + 0.12, 0.35, z - HALF + 0.12, x + HALF - 0.12, 1, z + HALF - 0.12, PALETTE.concrete, 8);
  batch.box(x - HALF + 0.1, 0.62, z - HALF + 0.1, x + HALF - 0.1, 0.74, z + HALF - 0.1, PALETTE.raider, 8);
}

function floorCell(batch, col, row, ch) {
  const x0 = cellX(col) - HALF;
  const z0 = cellZ(row) - HALF;
  const jitter = hash(col, row, 9);
  if (ch === 'a' || ch === 'b') {
    // Site paving leans toward the site's colour, and a painted stripe runs along its edge.
    const tone = SITE_TONES[ch];
    const light = tinted(ch === 'a' ? PALETTE.stoneCap : PALETTE.plaster, tone, 0.2).getHex();
    const dark = tinted(ch === 'a' ? PALETTE.stone : PALETTE.concrete, tone, 0.34).getHex();
    for (let k = 0; k < 4; k += 1) {
      const ox = (k & 1) * HALF;
      const oz = (k >> 1) * HALF;
      const checker = ((col * 2 + (k & 1) + row * 2 + (k >> 1)) & 1) === 0;
      batch.floor(x0 + ox, z0 + oz, x0 + ox + HALF, z0 + oz + HALF, 0.005, tinted(checker ? light : dark, PALETTE.sand, jitter * 0.25));
    }
    for (const [dc, dr] of SIDES) {
      // Only where open ground meets the site: its thresholds, not its walls or props.
      const n = col + dc;
      const m = row + dr;
      if (!isOpen(n, m) || !THRESHOLD.includes(tileAt(m * COLS + n))) continue;
      const sx0 = dc === 1 ? x0 + CELL - STRIPE : x0;
      const sz0 = dr === 1 ? z0 + CELL - STRIPE : z0;
      const sx1 = dc === -1 ? x0 + STRIPE : x0 + CELL;
      const sz1 = dr === -1 ? z0 + STRIPE : z0 + CELL;
      batch.floor(sx0, sz0, sx1, sz1, 0.02, tone);
    }
  } else if (ch === ',') {
    batch.floor(x0, z0, x0 + CELL, z0 + CELL, 0.005, tinted(PALETTE.concrete, PALETTE.concreteDark, 0.2 + jitter * 0.4));
  } else {
    batch.floor(x0, z0, x0 + CELL, z0 + CELL, 0.005, tinted(PALETTE.sand, PALETTE.sandDark, jitter * 0.55));
  }
}

function tunnelRoof(batch, glow, r) {
  const x0 = cellX(r.col) - HALF;
  const z0 = cellZ(r.row) - HALF;
  const x1 = x0 + r.width * CELL;
  const z1 = z0 + r.depth * CELL;
  batch.box(x0, ROOF_HEIGHT, z0, x1, ROOF_HEIGHT + 0.4, z1, PALETTE.concreteDark);
  batch.box(x0 - 0.1, ROOF_HEIGHT + 0.4, z0 - 0.1, x1 + 0.1, ROOF_HEIGHT + 0.55, z1 + 0.1, PALETTE.stoneShade);
  const alongX = r.width >= r.depth;
  const length = alongX ? r.width : r.depth;
  for (let k = 0; k < length; k += 1) {
    const t = k * CELL + HALF;
    if (alongX) batch.box(x0 + t - 0.12, ROOF_HEIGHT - 0.22, z0, x0 + t + 0.12, ROOF_HEIGHT, z1, PALETTE.wood);
    else batch.box(x0, ROOF_HEIGHT - 0.22, z0 + t - 0.12, x1, ROOF_HEIGHT, z0 + t + 0.12, PALETTE.wood);
    if (k % 3 === 1) {
      const cx = alongX ? x0 + t + HALF : (x0 + x1) / 2;
      const cz = alongX ? (z0 + z1) / 2 : z0 + t + HALF;
      glow.block(cx, ROOF_HEIGHT - 0.08, cz, 0.5, 0.1, 0.2, PALETTE.lamp);
    }
  }
}

// A stencilled site letter on the floor, drawn once to a canvas. The letter's own texture is
// its glow map, so once the charge is down there the paint itself pulses.
function siteDecal(scene, site) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.strokeStyle = SITE_TONES[site.tile];
  g.fillStyle = SITE_TONES[site.tile];
  g.lineWidth = 14;
  g.beginPath();
  g.arc(128, 128, 104, 0, Math.PI * 2);
  g.stroke();
  g.font = 'bold 170px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(site.name, 128, 140);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const decal = new THREE.Mesh(
    new THREE.PlaneGeometry(4.2, 4.2),
    new THREE.MeshStandardMaterial({ map: texture, emissiveMap: texture, emissive: new THREE.Color(0x000000), transparent: true, opacity: 0.82, roughness: 1, depthWrite: false }),
  );
  decal.rotation.x = -Math.PI / 2;
  decal.position.set(cellX(site.plant[0]), 0.02, cellZ(site.plant[1]));
  decal.receiveShadow = true;
  scene.add(decal);
  return decal.material;
}

function chimney(batch, x, z, height) {
  batch.box(x - 1.5, 0, z - 1.5, x + 1.5, height, z + 1.5, PALETTE.terracottaDark);
  for (let y = 4; y < height; y += 4.5) batch.box(x - 1.6, y, z - 1.6, x + 1.6, y + 0.3, z + 1.6, PALETTE.terracotta);
  batch.box(x - 1.8, height, z - 1.8, x + 1.8, height + 0.6, z + 1.8, PALETTE.gear);
}

function sky(scene) {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(PALETTE.skyTop) },
      horizon: { value: new THREE.Color(PALETTE.skyHorizon) },
      sun: { value: new THREE.Color(PALETTE.sun) },
      sunDir: { value: SUN_DIRECTION },
    },
    vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }',
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sun; uniform vec3 sunDir; varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, 0.0, 1.0);
        vec3 c = mix(horizon, top, pow(h, 0.55));
        float s = max(dot(normalize(vDir), sunDir), 0.0);
        c += sun * (pow(s, 900.0) * 3.0 + pow(s, 12.0) * 0.35);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), material);
  dome.frustumCulled = false;
  dome.renderOrder = -1;
  scene.add(dome);
}

function mesas(batch) {
  for (let k = 0; k < 44; k += 1) {
    const angle = (k / 44) * Math.PI * 2 + hash(k, 1) * 0.1;
    const dist = 150 + hash(k, 2) * 90;
    const w = 20 + hash(k, 3) * 40;
    const h = 10 + hash(k, 4) * 26;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    batch.box(x - w / 2, -1, z - w / 2, x + w / 2, h, z + w / 2, tinted(PALETTE.stoneShade, PALETTE.terracottaDark, hash(k, 5) * 0.5), 8);
    batch.box(x - w * 0.35, h, z - w * 0.35, x + w * 0.35, h + 3 + hash(k, 6) * 5, z + w * 0.35, PALETTE.stone, 8);
  }
}

function softTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// A banner on a pole on top of a chimney, rippling in the evening wind. Its cloth is a small
// grid whose vertices are pushed each frame; the base shape is kept to wave from.
const FLAG_LENGTH = 4.4;
const FLAG_DROP = 2.3;
function banner(scene, x, z, height, hex, phase) {
  const group = new THREE.Group();
  group.position.set(x, height + 0.6, z);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 6.4, 6).translate(0, 3.2, 0), new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.metal) }));
  pole.castShadow = true;
  group.add(pole);
  const geometry = new THREE.PlaneGeometry(FLAG_LENGTH, FLAG_DROP, 14, 5).translate(FLAG_LENGTH / 2 + 0.06, 6.3 - FLAG_DROP / 2, 0);
  const cloth = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), side: THREE.DoubleSide, roughness: 0.9 }));
  cloth.castShadow = true;
  group.add(cloth);
  scene.add(group);
  const base = Float32Array.from(geometry.attributes.position.array);
  return { group, geometry, base, phase };
}

// The wind blows from the sun's side of the sky, so flags stream away from it (the cloth runs
// along its local +x) and swing a little about that heading.
const WIND_YAW = Math.atan2(0.66, 0.62);
function waveBanner(f, t) {
  const position = f.geometry.attributes.position;
  const a = position.array;
  for (let i = 0; i < a.length; i += 3) {
    const along = Math.max(0, f.base[i] - 0.06) / FLAG_LENGTH;
    const y = f.base[i + 1];
    // Ripples run out from the pole and grow toward the free end, which also droops a touch.
    const wave = Math.sin(along * 7 - t * 5.2 + f.phase) + Math.sin(along * 3.1 - t * 2.3 + y * 0.8 + f.phase) * 0.5;
    a[i + 2] = wave * 0.22 * along;
    a[i] = f.base[i] - along * along * 0.15;
    a[i + 1] = y - along * along * 0.25 + Math.sin(t * 1.7 + f.phase) * 0.06 * along;
  }
  position.needsUpdate = true;
  f.geometry.computeVertexNormals();
  f.group.rotation.y = WIND_YAW + Math.sin(t * 0.37 + f.phase) * 0.22;
}

// Dust devils out on the flats among the mesas: a few columns of soft sand-coloured puffs that
// wander slowly and twist, each puff bobbing around the column's axis.
const DEVIL_PUFFS = 12;
function dustDevils(scene) {
  const texture = softTexture();
  const devils = [];
  for (let k = 0; k < 4; k += 1) {
    const puffs = [];
    for (let p = 0; p < DEVIL_PUFFS; p += 1) {
      // Pale against the darker mesas behind them.
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, color: new THREE.Color(p % 3 ? PALETTE.stoneCap : PALETTE.plaster), transparent: true, depthWrite: false, fog: false }));
      scene.add(sprite);
      puffs.push(sprite);
    }
    devils.push({ puffs, angle: (k / 4) * Math.PI * 2 + 0.6 + hash(k, 21) * 0.8, dist: 105 + hash(k, 22) * 50, speed: (hash(k, 23) - 0.5) * 0.012, phase: k * 1.9 });
  }
  return devils;
}

function stirDevils(devils, t) {
  for (const d of devils) {
    const angle = d.angle + t * d.speed;
    const cx = Math.cos(angle) * (d.dist + Math.sin(t * 0.05 + d.phase) * 10);
    const cz = Math.sin(angle) * (d.dist + Math.sin(t * 0.05 + d.phase) * 10);
    // Each devil rises and fades over a slow cycle so the horizon never looks frozen.
    const life = 0.5 + 0.5 * Math.sin(t * 0.09 + d.phase);
    for (let p = 0; p < d.puffs.length; p += 1) {
      const sprite = d.puffs[p];
      const h = p / (d.puffs.length - 1);
      const spin = t * 2.2 + p * 0.9 + d.phase;
      const r = 0.8 + h * h * 6;
      sprite.position.set(cx + Math.cos(spin) * r, 2 + h * 26 * (0.6 + life * 0.4), cz + Math.sin(spin) * r);
      sprite.scale.setScalar(5 + h * 11);
      sprite.material.opacity = (0.62 - h * 0.34) * (0.35 + life * 0.65);
    }
  }
}

export const SUN_DIRECTION = new THREE.Vector3(-0.62, 0.42, 0.66).normalize();

export function buildMap(scene) {
  scene.background = new THREE.Color(PALETTE.skyHorizon);
  scene.fog = new THREE.Fog(new THREE.Color(PALETTE.fog), 70, 330);
  sky(scene);

  scene.add(new THREE.HemisphereLight(new THREE.Color(PALETTE.skyHorizon), new THREE.Color(PALETTE.sandDark), 1.35));
  const sun = new THREE.DirectionalLight(new THREE.Color(PALETTE.sun), 3.1);
  sun.position.copy(SUN_DIRECTION).multiplyScalar(90);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  // The shadow box is fitted to the yard as the sun sees it (every wall and chimney top lands
  // within x ±61, y -26..42, depth 31..145): a square box twice as tall would waste half the
  // map's texels along the sun's direction, which is the axis stretched most over the ground.
  Object.assign(sun.shadow.camera, { left: -63, right: 63, top: 44, bottom: -28, near: 20, far: 160 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  // Shadowless bounce from the far side of the yard, so faces turned away from the sun still read their form.
  const bounce = new THREE.DirectionalLight(new THREE.Color(PALETTE.terracotta), 0.9);
  bounce.position.set(-SUN_DIRECTION.x, 0.25, -SUN_DIRECTION.z).multiplyScalar(90);
  scene.add(bounce);

  const solid = createBatch();
  const ground = createBatch();
  const glow = createBatch();
  const far = createBatch();
  for (const r of rects) {
    if (r.ch === '#') building(solid, glow, r);
    else if (r.ch === 'C') container(solid, r);
    if (r.ch === ',') tunnelRoof(solid, glow, r);
    for (let row = r.row; row < r.row + r.depth; row += 1) {
      for (let col = r.col; col < r.col + r.width; col += 1) {
        if (r.ch === '#') continue;
        if (r.ch === 'c') crate(solid, col, row);
        else if (r.ch === 'h') barrier(solid, col, row);
        floorCell(ground, col, row, tileAt(cellIndex(cellX(col), cellZ(row))));
      }
    }
  }
  chimney(solid, cellX(13), cellZ(24), 24);
  chimney(solid, cellX(33), cellZ(20), 30);
  chimney(solid, cellX(40), cellZ(0), 21);
  mesas(far);
  ground.floor(-400, -400, 400, 400, -0.01, PALETTE.sandDark);

  const solidMesh = new THREE.Mesh(solid.build(), vertexColored());
  solidMesh.castShadow = true;
  solidMesh.receiveShadow = true;
  const groundMesh = new THREE.Mesh(ground.build(), vertexColored({ roughness: 1 }));
  groundMesh.receiveShadow = true;
  const glowMesh = new THREE.Mesh(glow.build(), new THREE.MeshBasicMaterial({ vertexColors: true }));
  const farMesh = new THREE.Mesh(far.build(), vertexColored({ roughness: 1 }));
  scene.add(solidMesh, groundMesh, glowMesh, farMesh);

  const decals = SITES.map((site) => siteDecal(scene, site));
  const banners = [
    banner(scene, cellX(33), cellZ(20), 30, PALETTE.terracotta, 0),
    banner(scene, cellX(13), cellZ(24), 24, PALETTE.teal, 2.1),
  ];
  const devils = dustDevils(scene);
  const glowColor = new THREE.Color();
  const white = new THREE.Color(0xffffff);
  let time = 0;

  return {
    // The map's few moving parts, once a frame: the banners, the dust devils and, while the
    // charge is down at a site, that site's letter pulsing in its colour, quicker as time runs out.
    update(dt, round = null) {
      time += dt;
      for (const f of banners) waveBanner(f, time);
      stirDevils(devils, time);
      const bomb = round ? round.bomb : null;
      for (let s = 0; s < decals.length; s += 1) {
        const material = decals[s];
        const live = bomb !== null && bomb.state === 'planted' && bomb.site === s;
        if (!live) {
          material.emissive.setRGB(0, 0, 0);
          material.opacity = 0.82;
          continue;
        }
        const urgency = 1 - Math.max(0, bomb.timer) / BOMB_TIME;
        const pulse = 0.5 + 0.5 * Math.sin(time * (3 + urgency * 9));
        // The site's colour lifted toward white, so even the dark teal of A reads as lit.
        material.emissive.copy(glowColor.set(SITE_TONES[SITES[s].tile]).lerp(white, 0.45)).multiplyScalar(0.25 + pulse * 1.1);
        material.opacity = 0.85 + pulse * 0.15;
      }
    },
  };
}
