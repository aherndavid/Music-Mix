/* ─────────────────────────────────────────────────────────────
   ARCADE — "Sakura Stack", opened from the ARCADE menu.
   Painted tiles fall on a night garden: fill a row to clear it, and
   everything above drops into the gaps, which can set off a chain.
   A lantern in a cleared row bursts and takes its neighbours with it.
   The music carries on underneath.
   ───────────────────────────────────────────────────────────── */
(() => {
const COLS = 9, ROWS = 15, T = 12, PANEL = 4;        // garden size in tiles; dots per tile; side panel in tiles
const $ = id => document.getElementById(id);
// Each shape has its own woodblock pattern; "often" is how many go in the bag
const SHAPES = [
  { rows: ['xx'], often: 2, ink: ['#e8739b', '#ffd3e0', '#a83a63'], mark: ['.x.x.', 'xxxxx', '.xxx.', 'xxxxx', '.x.x.'] },              // blossom
  { rows: ['xxx'], often: 3, ink: ['#2f7fc4', '#bfe4ff', '#174a80'], mark: ['.xxx.', 'x...x', '..x..', '.x.x.', 'x...x'] },             // waves
  { rows: ['x.', 'xx'], often: 4, ink: ['#3d9b57', '#c8f0b8', '#1c5c31'], mark: ['..x..', '.xxx.', 'xxxxx', '..x..', '..x..'] },        // pine
  { rows: ['x.x', 'xxx'], often: 1, ink: ['#d63a2f', '#ffc9a8', '#85190f'], mark: ['xxxxx', '.x.x.', 'xxxxx', '.x.x.', '.x.x.'] },      // gate
  { rows: ['x..', 'x..', 'xxx'], often: 1, ink: ['#d99a1c', '#fff0b0', '#8a5a08'], mark: ['x.x.x', 'x.x.x', '.xxx.', '.xxx.', '..x..'] },   // fan
  { rows: ['x..', 'xx.', '.xx'], often: 1, ink: ['#7d55b8', '#e0ccff', '#472a78'], mark: ['x...x', '.x.x.', '..x..', '.x.x.', 'x...x'] },   // weave
];
const LANTERN = ['..kkkk..', '.rrrrrr.', 'ryyyyyyr', 'rrrrrrrr', 'ryyyyyyr', 'rrrrrrrr', '.rrrrrr.', '..kkkk..'];
const INK = { k: '#2a1208', r: '#ff5a36', y: '#ffe873' };

const canvas = $('stack-canvas'), g = canvas.getContext('2d');
canvas.width = (COLS + PANEL) * T; canvas.height = ROWS * T;

let shown = false, state = 'title', grid, piece, next, bag = [], doomed = null, flash = 0, chain = 0;
let score = 0, rowsDone = 0, level = 1, fall = 0, wait = 0, clock = 0, last = 0, best = 0;
try { best = parseInt(localStorage.getItem('stackBest')) || 0; } catch (e) {}
const petals = Array.from({ length: 14 }, (_, i) => ({ x: i * 37 % 108, y: i * 53 % 180, v: 7 + i % 5 * 3 }));
const rnd = n => Math.floor(Math.random() * n);
const emptyRow = () => Array(COLS).fill(null);

function draw1() {                                   // the next shape out of the bag
  if (!bag.length) SHAPES.forEach((s, k) => { for (let i = 0; i < s.often; i++) bag.push(k); });
  const k = bag.splice(rnd(bag.length), 1)[0];
  const m = SHAPES[k].rows.map(r => [...r].map(c => c === 'x' ? { k } : null));
  if (Math.random() < 0.22) { const on = m.flat().filter(Boolean); on[rnd(on.length)].lantern = true; }
  return m;
}
const fits = (m, x, y) => m.every((r, j) => r.every((c, i) =>
  !c || (x + i >= 0 && x + i < COLS && y + j >= 0 && y + j < ROWS && !grid[y + j][x + i])));
function spawn() {
  const m = next; next = draw1();
  piece = { m, x: Math.floor((COLS - m[0].length) / 2), y: 0 };
  fall = 0;
  if (!fits(m, piece.x, 0)) {
    state = 'over'; wait = 0.8;
    message('GAME OVER\nSCORE ' + score + '\nTAP TO PLAY AGAIN');
  }
}
function newGame() {
  grid = Array.from({ length: ROWS }, emptyRow);
  score = rowsDone = chain = 0; level = 1; doomed = null; bag = [];
  next = draw1(); state = 'play'; message(''); spawn(); hud();
}
function hud() {
  $('stack-score').textContent = 'SCORE ' + score;
  $('stack-best').textContent = 'BEST ' + best;
  $('stack-level').textContent = 'LEVEL ' + level;
}
function message(text) { $('stack-msg').textContent = text; $('stack-msg').hidden = !text; }
function add(n) {
  score += n;
  if (score > best) { best = score; try { localStorage.setItem('stackBest', best); } catch (e) {} }
}

const busy = () => state !== 'play' || doomed || wait > 0;
function move(dx) { if (!busy() && fits(piece.m, piece.x + dx, piece.y)) piece.x += dx; }
function turn() {
  if (busy()) return;
  const m = piece.m[0].map((_, i) => piece.m.map(r => r[i]).reverse());
  for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [-2, 0], [2, 0]])   // nudge off walls and tiles
    if (fits(m, piece.x + dx, piece.y + dy)) { piece.m = m; piece.x += dx; piece.y += dy; return; }
}
function step() {
  fall = 0;
  if (fits(piece.m, piece.x, piece.y + 1)) { piece.y++; return true; }
  piece.m.forEach((r, j) => r.forEach((c, i) => { if (c) grid[piece.y + j][piece.x + i] = c; }));
  piece = null; chain = 0;
  if (!findRows()) spawn();
  return false;
}
function down() { if (!busy()) step(); }
function drop() {
  if (busy()) return;
  let n = 0;
  while (step()) n++;
  add(n); hud();
}
function findRows() {                                // marks what is about to clear
  const full = grid.map((r, y) => r.every(Boolean) ? y : -1).filter(y => y >= 0);
  if (!full.length) return false;
  doomed = new Set(); flash = 0.4; chain++;
  const todo = full.flatMap(y => grid[y].map((_, x) => [x, y]));
  while (todo.length) {
    const [x, y] = todo.pop();
    if (!grid[y] || !grid[y][x] || doomed.has(y * COLS + x)) continue;
    doomed.add(y * COLS + x);
    if (grid[y][x].lantern)
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) todo.push([x + a, y + b]);
  }
  add((full.length * full.length * 100 + (doomed.size - full.length * COLS) * 20) * chain);
  rowsDone += full.length; level = 1 + Math.floor(rowsDone / 8);
  hud();
  return true;
}
function settle() {                                  // clear, then every column drops into its gaps
  for (let x = 0; x < COLS; x++) {
    const keep = [];
    for (let y = 0; y < ROWS; y++) if (grid[y][x] && !doomed.has(y * COLS + x)) keep.push(grid[y][x]);
    while (keep.length < ROWS) keep.unshift(null);
    keep.forEach((c, y) => { grid[y][x] = c; });
  }
  doomed = null;
  if (!findRows()) spawn();
}
function start() { if (wait <= 0) newGame(); }

function update(dt) {
  clock += dt;
  for (const p of petals) { p.y = (p.y + p.v * dt) % 180; p.x = (p.x + p.v * 0.5 * dt) % 108; }
  if (wait > 0) { wait -= dt; return; }
  if (state !== 'play') return;
  if (doomed) { flash -= dt; if (flash <= 0) settle(); return; }
  fall += dt;
  if (fall >= Math.max(0.12, 0.8 - (level - 1) * 0.06)) step();
}

function dots(rows, x, y, ink) {
  rows.forEach((r, j) => [...r].forEach((c, i) => {
    if (c !== '.') { g.fillStyle = typeof ink === 'string' ? ink : ink[c]; g.fillRect(x + i, y + j, 1, 1); }
  }));
}
function tile(c, X, Y) {
  const s = SHAPES[c.k];
  g.fillStyle = s.ink[2]; g.fillRect(X, Y, T, T);
  g.fillStyle = s.ink[0]; g.fillRect(X, Y, T - 1, T - 1);
  if (c.lantern) {
    g.fillStyle = Math.floor(clock * 4) % 2 ? '#ffe873' : s.ink[1]; g.fillRect(X + 1, Y + 1, T - 3, T - 3);
    dots(LANTERN, X + 2, Y + 2, INK);
  } else dots(s.mark, X + 3, Y + 3, s.ink[1]);
}
// Night garden: moon, snowy mountain, hills. Painted once.
const scene = document.createElement('canvas');
scene.width = canvas.width; scene.height = canvas.height;
(() => {
  const s = scene.getContext('2d'), W = COLS * T;
  ['#14123a', '#1a1848', '#211d56', '#2b2462', '#382a6b'].forEach((c, i) => { s.fillStyle = c; s.fillRect(0, i * 28, W, 180); });
  s.fillStyle = '#8f2f42';
  for (let y = -20; y <= 20; y++) { const w = Math.floor(Math.sqrt(400 - y * y)); s.fillRect(74 - w, 44 + y, w * 2, 1); }
  for (let y = 0; y < 80; y++) {
    const w = 5 + Math.floor(y * 0.75);
    s.fillStyle = y < 18 + (y * 7 % 3) ? '#7b80a8' : '#29305f';
    s.fillRect(50 - w, 80 + y, w * 2, 1);
  }
  for (let x = 0; x < W; x++) {
    const h = 24 + Math.round(Math.sin(x / 13) * 5 + Math.sin(x / 5) * 2);
    s.fillStyle = '#172645'; s.fillRect(x, 180 - h, 1, h);
  }
  s.fillStyle = '#4a1512'; s.fillRect(W, 0, PANEL * T, 180);
  s.fillStyle = '#7d2419'; for (let y = 4; y < 180; y += 9) s.fillRect(W + 2, y, PANEL * T - 2, 1);
  s.fillStyle = '#ffd400'; s.fillRect(W, 0, 2, 180);
  s.fillStyle = '#1a0d0a'; s.fillRect(W + 5, 18, 40, 44);
  s.textAlign = 'center';
  s.fillStyle = '#ffd400'; s.font = 'bold 11px sans-serif'; s.fillText('次', W + 25, 13);
  s.fillStyle = '#ffd3e0'; s.font = 'bold 22px serif';
  ['桜', '積', '木'].forEach((c, i) => s.fillText(c, W + 25, 96 + i * 30));
})();

function draw() {
  g.drawImage(scene, 0, 0);
  g.fillStyle = '#8c5a86';
  for (const p of petals) g.fillRect(Math.floor(p.x), Math.floor(p.y), 2, 1);
  if (!grid) return;
  grid.forEach((r, y) => r.forEach((c, x) => {
    if (!c) return;
    tile(c, x * T, y * T);
    if (doomed && doomed.has(y * COLS + x)) {        // blossoms white, then shrinks away
      const n = Math.max(0, Math.round(flash / 0.4 * 6));
      g.fillStyle = '#14123a'; g.fillRect(x * T, y * T, T, T);
      g.fillStyle = Math.floor(clock * 16) % 2 ? '#ffffff' : '#ff9fc0';
      g.fillRect(x * T + 6 - n, y * T + 6 - n, n * 2, n * 2);
    }
  }));
  if (piece) {
    let y = piece.y;
    while (state === 'play' && fits(piece.m, piece.x, y + 1)) y++;
    piece.m.forEach((r, j) => r.forEach((c, i) => {  // where it will land
      if (!c) return;
      g.strokeStyle = '#b9a9e0'; g.lineWidth = 1;
      g.strokeRect((piece.x + i) * T + 1.5, (y + j) * T + 1.5, T - 4, T - 4);
    }));
    piece.m.forEach((r, j) => r.forEach((c, i) => { if (c) tile(c, (piece.x + i) * T, (piece.y + j) * T); }));
  }
  if (next) {
    const X = COLS * T + 25 - next[0].length * 6, Y = 40 - next.length * 6;
    next.forEach((r, j) => r.forEach((c, i) => { if (c) tile(c, X + i * T, Y + j * T); }));
  }
  if (doomed && chain > 1) {
    g.fillStyle = '#ffd400'; g.font = 'bold 16px monospace'; g.textAlign = 'center';
    g.fillText('CHAIN x' + chain, COLS * T / 2, 30);
  }
}
function frame(now) {
  if (!shown) return;
  update(Math.min(0.05, Math.max(0, now - last) / 1000));
  last = now;
  draw();
  requestAnimationFrame(frame);
}

window.openStack = () => {
  $('arcade-menu').hidden = true;
  if (shown) return;
  shown = true;
  $('stack').hidden = false;
  if (state !== 'play') {
    state = 'title'; wait = 0; grid = piece = next = null;
    message('桜 SAKURA STACK\n\nFill a row to clear it.\nLanterns burst!\n\nTAP TO START');
  } else wait = 1;                                   // carrying on: a moment to get ready
  hud();
  last = performance.now();
  requestAnimationFrame(frame);
};
window.closeStack = () => { shown = false; letGo(); from = null; $('stack').hidden = true; eqStart(); };
window.openArcadeMenu = () => { $('arcade-menu').hidden = false; };
window.closeArcadeMenu = () => { $('arcade-menu').hidden = true; eqStart(); };

// Controls: buttons (hold to repeat), drags, or a keyboard
const ACTS = { left: () => move(-1), right: () => move(1), down, turn, drop };
let holding = null;
function letGo() { clearTimeout(holding); holding = null; }
document.querySelectorAll('#stack [data-act]').forEach(b => {
  b.addEventListener('pointerdown', e => {
    e.preventDefault(); letGo();
    if (state !== 'play') { start(); return; }
    const a = b.dataset.act;
    ACTS[a]();
    if (a === 'turn' || a === 'drop') return;
    const again = () => { ACTS[a](); holding = setTimeout(again, 70); };
    holding = setTimeout(again, 230);
  });
});
window.addEventListener('pointerup', letGo);
window.addEventListener('pointercancel', letGo);
window.addEventListener('blur', letGo);
let from = null;                                     // tap to turn, drag to move
$('stack-stage').addEventListener('pointerdown', e => { e.preventDefault(); from = { x: e.clientX, y: e.clientY, dragged: false }; });
window.addEventListener('pointermove', e => {
  if (!from || state !== 'play') return;
  const size = 24;
  let dx = e.clientX - from.x, dy = e.clientY - from.y;
  while (Math.abs(dx) >= size && Math.abs(dx) >= Math.abs(dy)) {
    const d = Math.sign(dx); move(d); dx -= d * size; from.x += d * size; from.dragged = true;
  }
  while (dy >= size) { down(); dy -= size; from.y += size; from.dragged = true; }
});
window.addEventListener('pointerup', () => {
  if (from && !from.dragged) { if (state === 'play') turn(); else start(); }
  from = null;
});
window.addEventListener('pointercancel', () => { from = null; });
window.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('arcade-menu').hidden) { closeArcadeMenu(); return; }
  if (!shown) return;
  if (e.key === 'Escape') { closeStack(); return; }
  if (e.key === ' ' && e.target.id === 'btn-stack-close') return;
  const a = { ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'down', ArrowUp: 'turn', ' ': 'drop' }[e.key];
  if (!a) return;
  e.preventDefault();
  if (e.repeat && (a === 'turn' || a === 'drop')) return;
  if (state !== 'play') { if (a === 'drop') start(); } else ACTS[a]();
});
// For testing
window.stackState = () => ({ state, score, rowsDone, level, chain, grid, piece, doomed });
})();
