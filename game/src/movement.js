// Kinematic bodies for everyone, the player and the bots alike: acceleration toward a wished
// direction, ground friction, gravity, jump, crouch and a small step-up, resolved against the
// world's columns one axis at a time so a wall stops a body without swallowing it.
import { footprintTop } from './world.js';

export const RADIUS = 0.34;
export const STAND_HEIGHT = 1.8;
export const CROUCH_HEIGHT = 1.2;
export const STAND_EYE = 1.64;
export const CROUCH_EYE = 1.1;
export const RUN_SPEED = 5.4;
const WALK_FACTOR = 0.52;
const CROUCH_FACTOR = 0.36;
const GROUND_ACCEL = 9.5;
const AIR_ACCEL = 1.6;
const FRICTION = 7.5;
const STOP_SPEED = 1.2;
const GRAVITY = 20;
const JUMP_SPEED = 6.6;
const STEP_UP = 0.45;

export function createBody() {
  return { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, onGround: true, crouched: false, crouch: 0, landed: 0 };
}

export function placeBody(body, x, z, yaw) {
  body.x = x;
  body.y = 0;
  body.z = z;
  body.vx = 0;
  body.vy = 0;
  body.vz = 0;
  body.yaw = yaw;
  body.pitch = 0;
  body.onGround = true;
  body.crouched = false;
  body.crouch = 0;
}

export const eyeHeight = (body) => STAND_EYE + (CROUCH_EYE - STAND_EYE) * body.crouch;
export const bodyHeight = (body) => (body.crouched ? CROUCH_HEIGHT : STAND_HEIGHT);
export const groundSpeed = (body) => Math.hypot(body.vx, body.vz);

// Move one axis; returns false when blocked. A column no higher than STEP_UP above the feet is
// climbed when on the ground.
function tryMove(body, nx, nz, height) {
  const climb = body.onGround ? STEP_UP : 0.02;
  const ground = footprintTop(nx, nz, RADIUS, body.y + height, body.y + climb);
  if (ground < 0 || ground > body.y + climb) return false;
  if (ground > body.y) body.y = ground;
  body.x = nx;
  body.z = nz;
  return true;
}

// wishX/wishZ: a world-space direction (length 0..1). speedScale carries the weapon's weight.
export function stepBody(body, wishX, wishZ, walk, crouch, jump, speedScale, dt) {
  if (crouch && !body.crouched) body.crouched = true;
  else if (!crouch && body.crouched && footprintTop(body.x, body.z, RADIUS, body.y + STAND_HEIGHT, 1e6) >= 0) body.crouched = false;
  body.crouch += ((body.crouched ? 1 : 0) - body.crouch) * Math.min(1, dt * 14);

  const max = RUN_SPEED * speedScale * (body.crouched ? CROUCH_FACTOR : walk ? WALK_FACTOR : 1);
  const speed = Math.hypot(body.vx, body.vz);
  if (body.onGround && speed > 0) {
    const drop = Math.max(speed, STOP_SPEED) * FRICTION * dt;
    const scale = Math.max(0, speed - drop) / speed;
    body.vx *= scale;
    body.vz *= scale;
  }
  const wishLength = Math.hypot(wishX, wishZ);
  if (wishLength > 0) {
    const dirX = wishX / wishLength;
    const dirZ = wishZ / wishLength;
    const target = max * Math.min(1, wishLength);
    const current = body.vx * dirX + body.vz * dirZ;
    const add = Math.min(Math.max(0, target - current), (body.onGround ? GROUND_ACCEL : AIR_ACCEL) * max * dt);
    body.vx += dirX * add;
    body.vz += dirZ * add;
  }

  if (jump && body.onGround && !body.crouched) {
    body.vy = JUMP_SPEED;
    body.onGround = false;
  }
  body.vy = Math.max(-30, body.vy - GRAVITY * dt);

  const height = bodyHeight(body);
  if (!tryMove(body, body.x + body.vx * dt, body.z, height)) body.vx = 0;
  if (!tryMove(body, body.x, body.z + body.vz * dt, height)) body.vz = 0;

  const nextY = body.y + body.vy * dt;
  const ground = footprintTop(body.x, body.z, RADIUS, nextY + height, body.y + 0.02);
  const wasAirborne = !body.onGround;
  if (ground < 0 && body.vy > 0) {
    body.vy = 0;
  } else if (nextY <= ground) {
    if (wasAirborne) body.landed = -body.vy;
    body.y = ground;
    body.vy = 0;
    body.onGround = true;
  } else {
    body.y = nextY;
    body.onGround = false;
  }
}
