# Vale Aberto — jogo 3D em terceira pessoa

Campo aberto com relevo, morros, casas espalhadas, árvores, pedras e grama
instanciada. Um personagem humanoide realista (avatar RPM de 1,87 m) com
animações de *walk / run* reamostradas de um rig de Mixamo e física de
controlador de personagem (Rapier KCC) sobre o terreno em malha.

```bash
npm install
npm run dev     # http://localhost:5173
npm run build
```

## Controles

| Ação | Tecla |
| --- | --- |
| Andar | `W` `A` `S` `D` |
| Correr | `Shift` (gasta fôlego) |
| Pular | `Espaço` (segurar = mais alto) |
| Agachar | `C` |
| Olhar | mouse (pointer lock; se o navegador bloquear, arraste com o botão) |
| Aproximar | roda do mouse |
| Pausar | `Esc` |
| Som | `M` |
| Ajuda | `H` |
| Voltar ao centro | `R` |

No celular: metade esquerda da tela = analógico, metade direita = olhar,
botões de pular / correr / agachar.

## Como está organizado

```
src/main.js                 boot, carregamento, laço principal, qualidade adaptativa
src/core/{math,input}.js    utilidades matemáticas; teclado, mouse e toque
src/world/textures.js       texturas procedurais (grama, telha, madeira, reboco, pedra)
src/world/terrain.js        terreno 900×900 m em malha + colisor trimesh + heightAt/normalAt
src/world/houses.js         vila: 13 casas com fundação, paredes, telhado e colisores
src/world/props.js          árvores, pedras, cercas, fardos (com colisores)
src/world/sky.js            céu em gradiente, sol, nuvens, montanhas distantes, luz e sombra
src/world/grass.js          grama instanciada por célula (sem "teleporte" ao andar)
src/character/retarget.js   retarget do rig Mixamo para o avatar, com alinhamento de eixos
src/character/clip.js       reamostragem e mistura de poses por osso
src/character/character.js  personagem: locomoção, agachar, pulo, pouso, olhar, passos
src/character/controller.js física do jogador (KCC), pulo variável, cóiote, fôlego
src/camera/thirdPerson.js   câmera em terceira pessoa com colisão, bob e shake
src/ui/hud.js, src/style.css  HUD, telas e estilos
src/audio/audio.js          vento, passos, pulo e impacto (WebAudio procedural)
```

## Notas técnicas

- Física em passo fixo de 1/120 s com acumulador e interpolação de render.
- Cápsula do jogador 1,80 m (raio 0,30 m); terreno, casas e árvores são colisores
  estáticos no mesmo mundo Rapier.
- A velocidade da passada é sincronizada com a distância percorrida, então não há
  pé arrastando no chão.
- Calibração automática na carga: mede a altura real da sola do sapato nas poses
  parado/andando/agachado e ajusta o modelo para apoiar no chão.

## Ferramentas de verificação (Node, sem navegador)

```
node tests/character-poses.mjs   # grade de poses + medidas de calibração
node tests/boot-sim.mjs          # simula o jogo (mundo + física + câmera) por ~20 s
node tests/world-view.mjs        # render de software do terreno e das casas
node tests/frame-view.mjs        # enquadramento da câmera com o personagem
```
