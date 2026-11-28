// Canvas 2D falso para permitir gerar texturas procedurais fora do navegador.
class FakeGradient {
  addColorStop() {}
}
class FakeContext {
  constructor(canvas) { this.canvas = canvas; }
  createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; }
  getImageData(x, y, w, h) { return this.createImageData(w, h); }
  putImageData() {}
  createLinearGradient() { return new FakeGradient(); }
  createRadialGradient() { return new FakeGradient(); }
  fillRect() {} strokeRect() {} clearRect() {}
  beginPath() {} closePath() {} moveTo() {} lineTo() {} arc() {} rect() {} roundRect() {}
  fill() {} stroke() {} save() {} restore() {} translate() {} rotate() {} scale() {}
  drawImage() {} clip() {} setTransform() {} measureText() { return { width: 10 }; }
  fillText() {} strokeText() {}
  set fillStyle(v) { this._fill = v; } get fillStyle() { return this._fill; }
  set strokeStyle(v) { this._stroke = v; } get strokeStyle() { return this._stroke; }
}
class FakeCanvas {
  constructor() { this.width = 1; this.height = 1; this.style = {}; }
  getContext() { return new FakeContext(this); }
  toDataURL() { return ''; }
  addEventListener() {}
  dispatchEvent() {}
}

function makeImg() {
  const img = new EventTarget();
  img.width = 4; img.height = 4;
  img.setAttribute = () => {};
  img.style = {};
  Object.defineProperty(img, 'src', {
    set() { setTimeout(() => img.dispatchEvent(new Event('load')), 0); },
    get() { return ''; },
  });
  return img;
}

export function installCanvasStub() {
  if (typeof global.document === 'undefined') global.document = {};
  global.document.createElement = (tag) => (String(tag).toLowerCase() === 'canvas' ? new FakeCanvas() : makeImg());
  global.document.createElementNS = (ns, tag) => (String(tag).toLowerCase() === 'canvas' ? new FakeCanvas() : makeImg());
  if (!global.document.addEventListener) global.document.addEventListener = () => {};
  if (!global.document.documentElement) global.document.documentElement = {};
  if (!global.document.body) global.document.body = {};
  if (!global.self) global.self = global;
  if (!global.URL.createObjectURL) global.URL.createObjectURL = () => 'blob:stub';
  if (!global.window) global.window = global;
  if (!global.performance) global.performance = { now: () => Date.now() };
  if (!global.requestAnimationFrame) global.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  if (!global.devicePixelRatio) global.devicePixelRatio = 1;
}
