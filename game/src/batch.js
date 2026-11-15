// Low-poly geometry by the box: a batch collects axis-aligned boxes and flat quads with one
// colour each and bakes them into a single vertex-coloured BufferGeometry, one draw call for
// a whole map layer, character limb or weapon.
import * as THREE from 'three';

// The six faces of a unit box: normal, then four corners as (x, y, z) picks of min (0) or max (1).
const FACES = [
  [1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 1, 1],
  [-1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 0, 1, 0],
  [0, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 0],
  [0, -1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1],
  [0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1],
  [0, 0, -1, 1, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 0],
];

export function createBatch() {
  const positions = [];
  const normals = [];
  const colors = [];
  const color = new THREE.Color();

  function vertex(x, y, z, nx, ny, nz) {
    positions.push(x, y, z);
    normals.push(nx, ny, nz);
    colors.push(color.r, color.g, color.b);
  }

  // A box from corner to corner. `skip` is a bitmask of faces to leave out (bit i = FACES[i]).
  function box(x0, y0, z0, x1, y1, z1, hex, skip = 0) {
    color.set(hex);
    const xs = [x0, x1];
    const ys = [y0, y1];
    const zs = [z0, z1];
    for (let f = 0; f < 6; f += 1) {
      if (skip & (1 << f)) continue;
      const d = FACES[f];
      const corner = (k) => vertex(xs[d[3 + k * 3]], ys[d[4 + k * 3]], zs[d[5 + k * 3]], d[0], d[1], d[2]);
      corner(0);
      corner(1);
      corner(2);
      corner(0);
      corner(2);
      corner(3);
    }
  }

  // A box by centre and size, for props and models.
  function block(cx, cy, cz, sx, sy, sz, hex) {
    box(cx - sx / 2, cy - sy / 2, cz - sz / 2, cx + sx / 2, cy + sy / 2, cz + sz / 2, hex);
  }

  // A horizontal quad facing up at height y.
  function floor(x0, z0, x1, z1, y, hex) {
    color.set(hex);
    vertex(x0, y, z0, 0, 1, 0);
    vertex(x0, y, z1, 0, 1, 0);
    vertex(x1, y, z1, 0, 1, 0);
    vertex(x0, y, z0, 0, 1, 0);
    vertex(x1, y, z1, 0, 1, 0);
    vertex(x1, y, z0, 0, 1, 0);
  }

  function build() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeBoundingSphere();
    return geometry;
  }

  return { box, block, floor, build, get empty() { return positions.length === 0; } };
}

export const vertexColored = (options = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, ...options });
