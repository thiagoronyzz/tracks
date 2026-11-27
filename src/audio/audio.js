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

  rustle() {
    this._burst({ duration: 0.2, gain: 0.06, type: 'highpass', freq: 2400 });
  }

  update(speed = 0) {
    if (!this.ready || !this.windGain) return;
    const target = 0.08 + Math.min(0.16, speed * 0.022);
    this.windGain.gain.value += (target - this.windGain.gain.value) * 0.02;
  }
}
