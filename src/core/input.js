// Entrada: teclado + mouse (pointer lock) e controles de toque.

export class Input {
  constructor({ domElement, onPointerLockChange, onAction }) {
    this.dom = domElement;
    this.keys = new Set();
    this.moveX = 0;
    this.moveZ = 0;
    this.run = false;
    this.crouch = false;
    this.jumpHeld = false;
    this.jumpPressed = false;
    this.lookDx = 0;
    this.lookDy = 0;
    this.wheel = 0;
    this.dragging = false;
    this.dragLook = false;
    this.touch = {
      active: false,
      moveId: null,
      moveOrigin: { x: 0, y: 0 },
      moveValue: { x: 0, y: 0 },
      lookId: null,
      lookLast: { x: 0, y: 0 },
    };
    this._onAction = onAction;
    this._onPointerLockChange = onPointerLockChange;
    this._bind();
  }

  _bind() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) {
        if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) e.preventDefault();
        return;
      }
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) {
        e.preventDefault();
      }
      if (e.code === 'Space') {
        this.jumpPressed = true;
        this.jumpHeld = true;
      }
      this._onAction?.(e.code, e);
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'Space') this.jumpHeld = false;
    });

    window.addEventListener('blur', () => {
      this.keys.clear();
      this.jumpHeld = false;
      this.run = false;
      this.crouch = false;
    });

    document.addEventListener('pointerlockchange', () => {
      this._onPointerLockChange?.(document.pointerLockElement === this.dom);
    });

    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === this.dom) {
        this.lookDx += e.movementX;
        this.lookDy += e.movementY;
        return;
      }
      if (this.dragLook && this.dragging) {
        this.lookDx += e.movementX || 0;
        this.lookDy += e.movementY || 0;
      }
    });

    this.dom.addEventListener('mousedown', () => { this.dragging = true; });
    window.addEventListener('mouseup', () => { this.dragging = false; });
    this.dom.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('wheel', (e) => {
      this.wheel += e.deltaY;
    }, { passive: true });

    // ---- toque -------------------------------------------------------------
    const touchStart = (e) => {
      this.touch.active = true;
      for (const t of e.changedTouches) {
        const isLeft = t.clientX < window.innerWidth * 0.45;
        if (isLeft && this.touch.moveId === null) {
          this.touch.moveId = t.identifier;
          this.touch.moveOrigin = { x: t.clientX, y: t.clientY };
          this.touch.moveValue = { x: 0, y: 0 };
        } else if (!isLeft && this.touch.lookId === null) {
          this.touch.lookId = t.identifier;
          this.touch.lookLast = { x: t.clientX, y: t.clientY };
        }
      }
    };
    const touchMove = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.touch.moveId) {
          const dx = t.clientX - this.touch.moveOrigin.x;
          const dy = t.clientY - this.touch.moveOrigin.y;
          const max = Math.min(window.innerWidth * 0.14, 90);
          this.touch.moveValue.x = Math.max(-1, Math.min(1, dx / max));
          this.touch.moveValue.y = Math.max(-1, Math.min(1, dy / max));
        } else if (t.identifier === this.touch.lookId) {
          this.lookDx += (t.clientX - this.touch.lookLast.x) * 1.6;
          this.lookDy += (t.clientY - this.touch.lookLast.y) * 1.6;
          this.touch.lookLast = { x: t.clientX, y: t.clientY };
        }
      }
      if (this.touch.moveId !== null) e.preventDefault();
    };
    const touchEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.touch.moveId) {
          this.touch.moveId = null;
          this.touch.moveValue = { x: 0, y: 0 };
        }
        if (t.identifier === this.touch.lookId) this.touch.lookId = null;
      }
    };
    this.dom.addEventListener('touchstart', touchStart, { passive: false });
    this.dom.addEventListener('touchmove', touchMove, { passive: false });
    this.dom.addEventListener('touchend', touchEnd);
    this.dom.addEventListener('touchcancel', touchEnd);
  }

  requestPointerLock() {
    if (this.dom.requestPointerLock) this.dom.requestPointerLock();
  }

  get pointerLocked() {
    return document.pointerLockElement === this.dom;
  }

  /** Consome o estado do frame. */
  poll() {
    const k = this.keys;
    let z = 0, x = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) z += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) z -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;

    if (this.touch.active && this.touch.moveId !== null) {
      x += this.touch.moveValue.x;
      z -= this.touch.moveValue.y;
    }

    const len = Math.hypot(x, z);
    if (len > 1) { x /= len; z /= len; }

    const out = {
      moveX: x,
      moveZ: z,
      run: k.has('ShiftLeft') || k.has('ShiftRight') || this.run,
      crouch: k.has('KeyC') || k.has('ControlLeft') || k.has('ControlRight') || this.crouch,
      jumpHeld: this.jumpHeld,
      jumpPressed: this.jumpPressed,
      lookDx: this.lookDx,
      lookDy: this.lookDy,
      wheel: this.wheel,
    };

    this.jumpPressed = false;
    this.lookDx = 0;
    this.lookDy = 0;
    this.wheel = 0;
    return out;
  }
}
