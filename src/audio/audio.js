// Áudio procedural (WebAudio): vento, passos, pulo e impacto. Sem arquivos.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.master = null;
    this.windGain = null;
    this.ready = false;
  }

  init() {
    if (this.ctx) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      this._makeNoise();
      this._startWind();
      this.ready = true;
    } catch (e) {
      this.ready = false;
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setEnabled(v) {
    this.enabled = v;
    if (this.master) this.master.gain.value = v ? 0.55 : 0;
  }

  _makeNoise() {
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    this.noiseBuffer = buf;
  }

  _startWind() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const gain = ctx.createGain();
    gain.gain.value = 0.11;
    // LFO suave para o vento respirar
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    this.windGain = gain;
    this.windFilter = filter;
  }

  _burst({ duration = 0.12, gain = 0.3, type = 'lowpass', freq = 900, q = 0.8, decay = 1 }) {
    if (!this.ready || !this.enabled) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 0.8 + Math.random() * 0.5;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(gain, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration * decay);
    src.connect(filter).connect(g).connect(this.master);
    src.start(now, Math.random() * 1.5, duration + 0.05);
    src.stop(now + duration + 0.06);
  }

  _thump({ freq = 90, gain = 0.35, duration = 0.18 }) {
    if (!this.ready || !this.enabled) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.55, now + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(gain, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(g).connect(this.master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  footstep({ speed = 1, crouch = 0 }) {
    if (!this.ready || !this.enabled) return;
    const s = Math.min(1, speed / 4);
    this._burst({
      duration: 0.11 + s * 0.05,
      gain: (0.085 + s * 0.13) * (1 - crouch * 0.55),
      type: 'lowpass',
      freq: 700 + Math.random() * 900,
    });
    this._thump({ freq: 105 + Math.random() * 25, gain: 0.05 + s * 0.1, duration: 0.12 });
  }

  jump() {
    this._burst({ duration: 0.18, gain: 0.14, type: 'bandpass', freq: 1200, q: 1.2 });
    this._thump({ freq: 150, gain: 0.12, duration: 0.1 });
  }

  land(impact = 0.5) {
    const i = Math.min(1, Math.max(0.15, impact));
    this._thump({ freq: 80, gain: 0.22 * i + 0.08, duration: 0.22 });
    this._burst({ duration: 0.16, gain: 0.1 * i + 0.04, type: 'lowpass', freq: 520 });
  }


  // ---- carro -------------------------------------------------------------
  startEngine() {
    if (!this.ready || this.engineGain) return;
    const ctx = this.ctx;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0.0001;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 600;
    this.engineFilter.Q.value = 3.5;
    this.engineOsc1 = ctx.createOscillator();
    this.engineOsc1.type = 'sawtooth';
    this.engineOsc1.frequency.value = 55;
    this.engineOsc2 = ctx.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineOsc2.frequency.value = 110;
    const g2 = ctx.createGain();
    g2.gain.value = 0.28;
    const rasp = ctx.createBufferSource();
    rasp.buffer = this.noiseBuffer;
    rasp.loop = true;
    const raspFilter = ctx.createBiquadFilter();
    raspFilter.type = 'bandpass';
    raspFilter.frequency.value = 220;
    raspFilter.Q.value = 1.4;
    const raspGain = ctx.createGain();
    raspGain.gain.value = 0.05;
    this.engineOsc1.connect(this.engineFilter);
    this.engineOsc2.connect(g2).connect(this.engineFilter);
    rasp.connect(raspFilter).connect(raspGain).connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain).connect(this.master);
    this.engineOsc1.start();
    this.engineOsc2.start();
    rasp.start();
    this.engineRasp = rasp;
    this.engineGain.gain.setTargetAtTime(0.09, ctx.currentTime, 0.25);
  }

  /** rpm01: 0..1 (marcha lenta → corte), load: 0..1 (acelerador). */
  setEngine(rpm01, load = 0) {
    if (!this.engineGain || !this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const rpm = Math.max(0, Math.min(1, rpm01));
    const base = 42 + rpm * 128;
    this.engineOsc1.frequency.setTargetAtTime(base, now, 0.06);
    this.engineOsc2.frequency.setTargetAtTime(base * 2.02, now, 0.06);
    this.engineFilter.frequency.setTargetAtTime(420 + rpm * 2200 + load * 900, now, 0.08);
    this.engineGain.gain.setTargetAtTime(0.07 + load * 0.06 + rpm * 0.03, now, 0.1);
  }

  stopEngine() {
    if (!this.engineGain || !this.ctx) return;
    const ctx = this.ctx;
    this.engineGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.12);
    const g = this.engineGain;
    const o1 = this.engineOsc1, o2 = this.engineOsc2, rasp = this.engineRasp;
    setTimeout(() => {
      try { o1.stop(); o2.stop(); rasp.stop(); g.disconnect(); } catch (e) { /* já parado */ }
    }, 500);
    this.engineGain = null;
    this.engineOsc1 = null;
    this.engineOsc2 = null;
    this.engineRasp = null;
  }

  crash(force = 1) {
    const k = Math.min(1, force / 60);
    this._burst({ duration: 0.32, gain: 0.22 + k * 0.3, type: 'lowpass', freq: 1400 + k * 2200, decay: 1.4 });
    this._thump({ freq: 70, gain: 0.2 + k * 0.35, duration: 0.4 });
  }

  explosion() {
    this._burst({ duration: 1.1, gain: 0.5, type: 'lowpass', freq: 900, decay: 1.1 });
    this._thump({ freq: 55, gain: 0.55, duration: 0.9 });
    this._burst({ duration: 0.5, gain: 0.25, type: 'bandpass', freq: 2600, q: 0.7, decay: 1 });
  }

  rustle() {
    this._burst({ duration: 0.2, gain: 0.06, type: 'highpass', freq: 2400 });
  }

  update(speed = 0) {
    if (!this.ready || !this.windGain) return;
    const target = 0.08 + Math.min(0.16, speed * 0.022);
    this.windGain.gain.value += (target - this.windGain.gain.value) * 0.02;
  }
}
