// Interface: carregamento, início, pausa, fôlego, FPS e avisos.

export class HUD {
  constructor() {
    this.loading = document.getElementById('loading');
    this.loadbar = document.getElementById('loadbar');
    this.loadpercent = document.getElementById('loadpercent');
    this.loadhint = document.getElementById('loadhint');
    this.start = document.getElementById('start');
    this.pause = document.getElementById('pause');
    this.hud = document.getElementById('hud');
    this.fpsEl = document.getElementById('fps');
    this.staminaWrap = document.getElementById('staminaWrap');
    this.staminaBar = document.getElementById('staminaBar');
    this.statusEl = document.getElementById('hudstatus');
    this.toastEl = document.getElementById('toast');
    this.helpEl = document.getElementById('help');
    this.mobile = document.getElementById('mobileControls');
    this.crosshair = document.getElementById('crosshair');
    this._toastTimer = 0;
    this.helpVisible = false;
  }

  setProgress(p, hint) {
    const pct = Math.round(Math.max(0, Math.min(1, p)) * 100);
    if (this.loadbar) this.loadbar.style.width = pct + '%';
    if (this.loadpercent) this.loadpercent.textContent = pct + '%';
    if (hint && this.loadhint) this.loadhint.textContent = hint;
  }

  loadingDone() {
    this.loading?.classList.add('hidden');
  }

  showStart() {
    this.start?.classList.remove('hidden');
  }

  hideStart() {
    this.start?.classList.add('hidden');
  }

  showPause() {
    this.pause?.classList.remove('hidden');
  }

  hidePause() {
    this.pause?.classList.add('hidden');
  }

  showGame() {
    this.hud?.classList.remove('hidden');
  }

  setTouchMode(on) {
    this.mobile?.classList.toggle('hidden', !on);
    if (on) this.crosshair?.classList.add('hidden');
  }

  setFps(n) {
    if (this.fpsEl) this.fpsEl.textContent = Math.round(n);
  }

  setStamina(v, visible) {
    this.staminaWrap?.classList.toggle('visible', visible);
    if (this.staminaBar) {
      this.staminaBar.style.width = Math.round(Math.max(0, Math.min(1, v)) * 100) + '%';
      this.staminaBar.style.background = v < 0.25
        ? 'linear-gradient(90deg, #e08a8a, #e5b38a)'
        : 'linear-gradient(90deg, #e5d38a, #c8e08a)';
    }
  }

  setStatus(text) {
    if (this.statusEl) this.statusEl.textContent = text;
  }

  toast(msg, ms = 2200) {
    if (!this.toastEl) return;
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('hidden');
    window.clearTimeout(this._toastTimer);
    this._toastTimer = window.setTimeout(() => {
      this.toastEl.classList.add('hidden');
    }, ms);
  }


  setCarPrompt(text) {
    if (!this.carPrompt) this.carPrompt = document.getElementById('carprompt');
    const el = this.carPrompt;
    if (!el) return;
    if (!text) { el.classList.add('hidden'); return; }
    const label = document.getElementById('carprompttext');
    if (label) label.textContent = text;
    el.classList.remove('hidden');
  }

  setDriving(on) {
    if (!this.speedo) this.speedo = document.getElementById('carspeed');
    if (!this.speedo) return;
    this.speedo.classList.toggle('hidden', !on);
  }

  setSpeed(kmh, health, dead) {
    const v = document.getElementById('speedval');
    if (v) v.textContent = Math.round(kmh);
    const bar = document.getElementById('dmgbar');
    if (bar) {
      bar.style.width = `${Math.max(0, Math.min(1, health)) * 100}%`;
      bar.style.background = dead ? '#6b1d16' : health > 0.55 ? '#8bbf4a' : health > 0.25 ? '#d8a13a' : '#cf4a33';
    }
  }

  toggleHelp(force) {
    this.helpVisible = force === undefined ? !this.helpVisible : force;
    this.helpEl?.classList.toggle('hidden', !this.helpVisible);
  }

  showError(message) {
    const box = document.getElementById('error');
    const text = document.getElementById('errorText');
    if (text) text.textContent = message;
    box?.classList.remove('hidden');
    this.loading?.classList.add('hidden');
  }
}
