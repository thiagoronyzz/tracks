import fs from 'fs';
const buf = fs.readFileSync('public/models/avatar.glb');
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString());
const binOff = 20 + jsonLen + 8;
fs.mkdirSync('/tmp/tex', { recursive: true });
json.images.forEach((img, i) => {
  const bv = json.bufferViews[img.bufferView];
  const data = buf.slice(binOff + (bv.byteOffset || 0), binOff + (bv.byteOffset || 0) + bv.byteLength);
  const ext = img.mimeType === 'image/png' ? 'png' : 'jpg';
  fs.writeFileSync(`/tmp/tex/${i}-${img.name || 'img'}.${ext}`.replace(/[^\w./-]/g,'_'), data);
});
// map materials -> textures
for (const m of json.materials || []) {
  const pbr = m.pbrMetallicRoughness || {};
  const tex = (idx) => idx !== undefined ? json.images[json.textures[idx].source].name : undefined;
  console.log(m.name, 'base:', tex(pbr.baseColorTexture?.index), 'mr:', tex(pbr.metallicRoughnessTexture?.index), 'normal:', tex(m.normalTexture?.index), 'factor:', pbr.baseColorFactor, 'metal:', pbr.metallicFactor, 'rough:', pbr.roughnessFactor);
}
