// Kiln Yard as a scene: the world's merged rectangles become plastered blocks with caps,
// windows and doors, crates, containers and barriers fill their cells exactly as they collide,
// and a dusk sky, distant mesas and the kiln chimneys frame the yard. Everything static is
// baked into a few vertex-coloured batches, so the whole map is a handful of draw calls.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { CELL, ROOF_HEIGHT, SITES } from './level.js';
import { rects, cellX, cellZ, COLS, ROWS, tileAt, cellIndex } from './world.js';
import { createBatch, vertexColored } from './batch.js';

const HALF = CELL / 2;
// Big blocks stay calm plaster and stone; small ones carry the terracotta and teal accents.
const BUILDING_TONES = [PALETTE.plaster, PALETTE.stone, PALETTE.stoneCap];
const ACCENT_TONES = [PALETTE.terracotta, PALETTE.teal, PALETTE.plaster, PALETTE.stone];
const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
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
    const light = ch === 'a' ? PALETTE.stoneCap : PALETTE.plaster;
    const dark = ch === 'a' ? PALETTE.stone : PALETTE.concrete;
    for (let k = 0; k < 4; k += 1) {
      const ox = (k & 1) * HALF;
      const oz = (k >> 1) * HALF;
      const checker = ((col * 2 + (k & 1) + row * 2 + (k >> 1)) & 1) === 0;
      batch.floor(x0 + ox, z0 + oz, x0 + ox + HALF, z0 + oz + HALF, 0.005, tinted(checker ? light : dark, PALETTE.sand, jitter * 0.25));
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

// A stencilled site letter on the floor, drawn once to a canvas.
function siteDecal(scene, site) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.strokeStyle = PALETTE.terracotta;
  g.fillStyle = PALETTE.terracotta;
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
    new THREE.MeshStandardMaterial({ map: texture, transparent: true, opacity: 0.82, roughness: 1, depthWrite: false }),
  );
  decal.rotation.x = -Math.PI / 2;
  decal.position.set(cellX(site.plant[0]), 0.02, cellZ(site.plant[1]));
  decal.receiveShadow = true;
  scene.add(decal);
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
  const extent = 62;
  Object.assign(sun.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, near: 10, far: 200 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

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

  for (const site of SITES) siteDecal(scene, site);
}
