// Every sound is synthesised with Web Audio from oscillators and one baked noise buffer: no
// files, no network. Sounds are placed by distance and side relative to the listener (the
// actor the camera follows), and far gunfire loses its top end the way it does outdoors. A
// quiet wind bed runs underneath from the first click.
import { EV } from './events.js';
import { WEAPONS } from './weapons.js';

export function createAudio() {
  let ctx = null;
  let master = null;
  let noise = null;

  function unlock() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    ctx = new AudioContext();
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.ratio.value = 5;
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(compressor).connect(ctx.destination);
    // A second of white noise from a fixed linear congruential sequence.
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    let seed = 22695477;
    for (let i = 0; i < data.length; i += 1) {
      seed = (Math.imul(seed, 1103515245) + 12345) | 0;
      data[i] = ((seed >>> 8) & 0xffff) / 32768 - 1;
    }
    ambience();
  }

  // A low desert wind under everything, for as long as the context lives: the noise looped
  // slow through a lowpass whose cutoff breathes on a slow oscillator, a thinner gust band
  // swelling on another, and the whole bed drifting between the ears. Kept far under the
  // compressor's threshold so it never pumps against the gunfire.
  function ambience() {
    const bed = ctx.createGain();
    bed.gain.value = 0.09;
    const drift = ctx.createStereoPanner();
    bed.connect(drift).connect(master);
    const lfo = (frequency, depth, target) => {
      const osc = ctx.createOscillator();
      osc.frequency.value = frequency;
      const amount = ctx.createGain();
      amount.gain.value = depth;
      osc.connect(amount).connect(target);
      osc.start();
    };
    const loop = (rate, type, frequency, q, level) => {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      src.playbackRate.value = rate;
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = frequency;
      filter.Q.value = q;
      const gain = ctx.createGain();
      gain.gain.value = level;
      src.connect(filter).connect(gain).connect(bed);
      src.start();
      return { filter, gain };
    };
    const wind = loop(0.37, 'lowpass', 360, 0.7, 1);
    lfo(0.071, 150, wind.filter.frequency);
    const gust = loop(0.53, 'bandpass', 950, 1.6, 0.22);
    lfo(0.113, 0.18, gust.gain.gain);
    lfo(0.19, 260, gust.filter.frequency);
    lfo(0.031, 0.35, drift.pan);
  }

  // A voice: gain envelope into a stereo panner into the master bus.
  function voice(at, volume, pan, attack, decay) {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), at + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    gain.connect(panner).connect(master);
    return gain;
  }

  function burst(volume, pan, decay, type, frequency, q, at = ctx.currentTime, sweepTo = 0) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.playbackRate.value = 0.7 + (frequency % 7) * 0.05;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(frequency, at);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, at + decay);
    filter.Q.value = q;
    src.connect(filter).connect(voice(at, volume, pan, 0.003, decay));
    src.start(at, (frequency * 0.0137) % 0.5, decay + 0.05);
  }

  function tone(volume, pan, decay, type, from, to, at = ctx.currentTime, attack = 0.004) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, at);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, at + decay);
    osc.connect(voice(at, volume, pan, attack, decay));
    osc.start(at);
    osc.stop(at + attack + decay + 0.05);
  }

  // Distance gain and side for a world point heard from the listener.
  const place = { gain: 1, pan: 0, far: 0 };
  function locate(x, z, listener) {
    if (!listener) {
      place.gain = 1;
      place.pan = 0;
      place.far = 0;
      return place;
    }
    const dx = x - listener.x;
    const dz = z - listener.z;
    const d = Math.hypot(dx, dz);
    place.gain = 1 / (1 + d / 9);
    place.far = Math.min(1, d / 45);
    if (d < 0.5) place.pan = 0;
    else {
      const right = (dx * Math.cos(listener.yaw) - dz * Math.sin(listener.yaw)) / d;
      place.pan = Math.max(-0.85, Math.min(0.85, right * 0.85));
    }
    return place;
  }

  function gunshot(weaponId, x, z, listener) {
    const def = WEAPONS[weaponId];
    const p = locate(x, z, listener);
    const pitch = def?.pitch ?? 1;
    const cutoff = 9000 * (1 - p.far * 0.85);
    burst(0.9 * p.gain, p.pan, 0.16 / pitch + 0.04, 'lowpass', cutoff, 0.7);
    burst(0.5 * p.gain, p.pan, 0.05, 'bandpass', 1800 * pitch, 1.2);
    tone(0.7 * p.gain, p.pan, 0.14 / pitch, 'sine', 170 * pitch, 45);
    if (p.far > 0.2) burst(0.25 * p.gain, p.pan, 0.5, 'lowpass', 600, 0.5, ctx.currentTime + 0.05 + p.far * 0.12);
  }

  function chord(notes, gap, volume, type = 'triangle') {
    const now = ctx.currentTime;
    notes.forEach((f, k) => tone(volume, 0, 0.5, type, f, f, now + k * gap, 0.01));
  }

  return {
    unlock,
    // listener: the watched body ({ x, z, yaw }); viewer: the actor whose own sounds are close.
    onEvent(e, listener, viewer) {
      if (!ctx) return;
      const mine = viewer !== null && e.actor === viewer;
      const now = ctx.currentTime;
      const { gain, pan } = locate(e.x, e.z, listener);
      const t = e.type;
      if (t === EV.SHOT) gunshot(e.weapon, e.x, e.z, listener);
      else if (t === EV.STEP && !mine) burst(0.35 * gain, pan, 0.06, 'bandpass', 420, 1.4);
      else if (t === EV.RELOAD || t === EV.EQUIP) {
        tone(0.18 * gain, pan, 0.03, 'square', 1400, 900);
        tone(0.16 * gain, pan, 0.04, 'square', 900, 700, now + (t === EV.RELOAD ? 0.5 : 0.12));
      } else if (t === EV.DRY && mine) tone(0.2, 0, 0.02, 'square', 2200, 2000);
      else if (t === EV.SWING) burst(0.3 * gain, pan, 0.12, 'bandpass', 2400, 2, now, 800);
      else if (t === EV.HIT && mine) {
        // A head shot rings; a body shot thuds.
        if (e.b === 1) {
          tone(0.35, 0, 0.18, 'sine', 3200, 3000);
          tone(0.22, 0, 0.12, 'sine', 4700, 4500);
        } else tone(0.25, 0, 0.05, 'triangle', 1500, 1300);
      } else if (t === EV.HIT && viewer && e.target === viewer) burst(0.5, 0, 0.12, 'lowpass', 700, 1);
      else if (t === EV.KILL && mine) tone(0.35, 0, 0.25, 'sine', 600, 300);
      else if (t === EV.THROW) burst(0.3 * gain, pan, 0.25, 'bandpass', 600, 2, now, 2400);
      else if (t === EV.BOUNCE) tone(0.2 * gain, pan, 0.05, 'square', 700, 500);
      else if (t === EV.BLAST && e.weapon === 'smoke') burst(0.6 * gain, pan, 1.6, 'lowpass', 1200, 0.4, now, 300);
      else if (t === EV.BLAST) {
        burst(1.4 * gain, pan, e.weapon === 'flash' ? 0.4 : 1.1, 'lowpass', 2400, 0.5, now, 120);
        tone(gain, pan, 0.7, 'sine', 90, 30);
      } else if (t === EV.EXPLODED) {
        burst(2.2 * Math.max(0.4, gain), pan, 2.6, 'lowpass', 3000, 0.4, now, 60);
        tone(1.6, pan, 1.6, 'sine', 70, 22);
      } else if (t === EV.BEEP) tone(0.28 * Math.max(0.25, gain), pan, 0.07, 'square', 1850, 1850);
      else if (t === EV.PLANTED) chord([880, 660], 0.18, 0.25, 'square');
      else if (t === EV.DEFUSED) chord([660, 880, 1320], 0.1, 0.25, 'square');
      else if (t === EV.ROUND_LIVE) chord([392, 523], 0.12, 0.22);
      else if (t === EV.ROUND_END) chord(viewer && e.a === viewer.team ? [523, 659, 784] : [392, 311, 262], 0.16, 0.3);
      else if (t === EV.BUY && mine) tone(0.18, 0, 0.06, 'triangle', 900, 1300);
      else if (t === EV.PICKUP && mine) tone(0.2, 0, 0.08, 'triangle', 700, 1000);
    },
  };
}
