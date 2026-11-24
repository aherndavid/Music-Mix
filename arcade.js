/* ─────────────────────────────────────────────────────────────
   ARCADE — "Lantern Run", opened by the ARCADE button.
   A ninja runs a bamboo maze (a new one every level) gathering rice
   balls while lantern spirits give chase. Pick up throwing stars and
   throw them to pop the spirits. The music carries on underneath.
   ───────────────────────────────────────────────────────────── */
let arcadeOpen = false;
(() => {
const COLS = 13, ROWS = 15, T = 12;                 // maze size in squares; dots per square
const $ = id => document.getElementById(id);
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const INK = { b: '#3f6bff', d: '#1c2f8f', s: '#ffcf9e', r: '#e53935', w: '#ffffff', k: '#111111' };
const NINJA = [
  ['..bbbbbb..', '.bbbbbbbb.', '.rrrrrrrr.', '.bsskssks.', '.bbbbbbbb.', '..bbbbbb..', '.sbbddbbs.', '..rrrrrr..', '..bb..bb..', '.dd...dd..'],
  ['..bbbbbb..', '.bbbbbbbb.', '.rrrrrrrr.', '.bsskssks.', '.bbbbbbbb.', '..bbbbbb..', '.sbbddbbs.', '..rrrrrr..', '...bbbb...', '...d..d...']];
const SPIRIT = ['...kkkk...', '..cccccc..', '.cccccccc.', '.cwwccwwc.', '.cwkccwkc.', '.cccccccc.', '.ckckckck.', '..cccrrc..', '...kkrr...', '.....rr...'];
const RICE = ['..w..', '.www.', '.www.', 'wkkkw', 'wkkkw'];
const STAR = [['..w..', '.www.', 'wwkww', '.www.', '..w..'], ['.w.w.', 'wwwww', '.wkw.', 'wwwww', '.w.w.']];

const canvas = $('arcade-canvas'), g = canvas.getContext('2d');
canvas.width = COLS * T; canvas.height = ROWS * T;

let wall, items, left, ninja, spirits, shots, pops;
let state = 'title', score = 0, lives = 3, stars = 2, level = 1, wait = 0, clock = 0, last = 0, best = 0;
try { best = parseInt(localStorage.getItem('arcadeBest')) || 0; } catch (e) {}

const open = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS && !wall[y][x];
const rnd = n => Math.floor(Math.random() * n);

// A fresh maze: carve one, then knock through every dead end so
// there is always another way out
function makeMaze() {
  wall = Array.from({ length: ROWS }, () => Array(COLS).fill(true));
  const stack = [[1, 1]]; wall[1][1] = false;
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const next = Object.values(DIRS).filter(([dx, dy]) => {
      const nx = x + dx * 2, ny = y + dy * 2;
      return nx > 0 && ny > 0 && nx < COLS - 1 && ny < ROWS - 1 && wall[ny][nx];
    });
    if (!next.length) { stack.pop(); continue; }
    const [dx, dy] = next[rnd(next.length)];
    wall[y + dy][x + dx] = false; wall[y + dy * 2][x + dx * 2] = false;
    stack.push([x + dx * 2, y + dy * 2]);
  }
  for (let y = 1; y < ROWS; y += 2) for (let x = 1; x < COLS; x += 2) {
    const ways = Object.values(DIRS);
    if (ways.filter(([dx, dy]) => open(x + dx, y + dy)).length > 1) continue;
    const shut = ways.filter(([dx, dy]) => {
      const nx = x + dx * 2, ny = y + dy * 2;
      return nx > 0 && ny > 0 && nx < COLS - 1 && ny < ROWS - 1 && wall[y + dy][x + dx];
    });
    if (shut.length) { const [dx, dy] = shut[rnd(shut.length)]; wall[y + dy][x + dx] = false; }
  }
}

const mover = (x, y, speed) => ({ x, y, fx: x, fy: y, p: 1, speed });   // square it's heading to, square it left, how far across
const px = m => [m.fx + (m.x - m.fx) * m.p, m.fy + (m.y - m.fy) * m.p];

function place() {                                   // everyone to their starting squares
  ninja = Object.assign(mover(1, ROWS - 2, 5), { dir: null, want: null, face: 'right' });
  spirits = [['#ff8c00', COLS - 2, 1, 0.1], ['#3ddc5a', 1, 1, 0.5], ['#ff5cb8', 7, 1, 0.3]].map(([colour, x, y, daft], i) =>
    Object.assign(mover(x, y, Math.min(4.6, 2.9 + level * 0.25)), { colour, daft, home: [x, y], out: 1 + i }));
  shots = []; pops = []; wait = 1;
}
function newLevel() {
  makeMaze();
  items = {}; left = 0;
  const free = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++)
    if (!wall[y][x] && !(x === 1 && y === ROWS - 2)) { items[x + ',' + y] = 'rice'; left++; free.push(x + ',' + y); }
  for (let k = 0; k < 4; k++) {
    const at = free.splice(rnd(free.length), 1)[0];
    items[at] = 'star'; left--;
  }
  place();
}
function newGame() { score = 0; lives = 3; stars = 2; level = 1; newLevel(); state = 'play'; message(''); hud(); }

function hud() {
  $('arcade-score').textContent = 'SCORE ' + score;
  $('arcade-best').textContent = 'BEST ' + best;
  $('arcade-lives').textContent = '♥'.repeat(Math.max(0, lives)) + '  ★ ' + stars;
}
function message(text) { $('arcade-msg').textContent = text; $('arcade-msg').hidden = !text; }
function add(n) {
  score += n;
  if (score > best) { best = score; try { localStorage.setItem('arcadeBest', best); } catch (e) {} }
}

function distances(tx, ty) {                         // steps from every square to this one
  const d = { [tx + ',' + ty]: 0 }, q = [[tx, ty]];
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i];
    for (const [dx, dy] of Object.values(DIRS)) {
      const k = (x + dx) + ',' + (y + dy);
      if (open(x + dx, y + dy) && !(k in d)) { d[k] = d[x + ',' + y] + 1; q.push([x + dx, y + dy]); }
    }
  }
  return d;
}
function spiritTurn(s) {
  let ways = Object.values(DIRS).filter(([dx, dy]) => open(s.x + dx, s.y + dy));
  const on = ways.filter(([dx, dy]) => s.x + dx !== s.fx || s.y + dy !== s.fy);
  if (on.length) ways = on;                          // no turning back unless it must
  let way = ways[rnd(ways.length)];
  if (Math.random() > s.daft) {
    let tx = ninja.x, ty = ninja.y;
    if (s.colour === '#ff5cb8') {                    // pink heads you off
      const [dx, dy] = DIRS[ninja.face];
      for (let k = 0; k < 3 && open(tx + dx, ty + dy); k++) { tx += dx; ty += dy; }
    }
    const d = distances(tx, ty);
    way = ways.reduce((a, b) => d[(s.x + b[0]) + ',' + (s.y + b[1])] < d[(s.x + a[0]) + ',' + (s.y + a[1])] ? b : a);
  }
  s.fx = s.x; s.fy = s.y; s.x += way[0]; s.y += way[1];
}
function ninjaTurn() {
  for (const d of [ninja.want, ninja.dir]) {
    if (!d) continue;
    const [dx, dy] = DIRS[d];
    if (open(ninja.x + dx, ninja.y + dy)) {
      ninja.dir = ninja.face = d;
      ninja.fx = ninja.x; ninja.fy = ninja.y; ninja.x += dx; ninja.y += dy;
      return true;
    }
  }
  ninja.dir = null;
  ninja.fx = ninja.x; ninja.fy = ninja.y;
  return false;
}
function advance(m, dt, turn) {
  m.p += m.speed * dt;
  while (m.p >= 1) {
    if (turn(m) === false) { m.p = 1; return; }
    m.p -= 1;
  }
}
function steer(d) {
  if (state !== 'play') return;
  ninja.want = d;
  // turning straight back happens at once, even between squares
  const [dx, dy] = DIRS[d];
  if (ninja.p < 1 && ninja.fx === ninja.x + dx && ninja.fy === ninja.y + dy) {
    [ninja.x, ninja.fx] = [ninja.fx, ninja.x]; [ninja.y, ninja.fy] = [ninja.fy, ninja.y];
    ninja.p = 1 - ninja.p; ninja.dir = ninja.face = d;
  }
}
function action() {                                  // throw, or start / restart
  if (state !== 'play') { if (wait <= 0) newGame(); return; }
  if (!stars || wait > 0) return;
  stars--;
  const [x, y] = px(ninja);
  shots.push({ x: Math.round(x), y: Math.round(y), d: DIRS[ninja.face] });
  hud();
}

function update(dt) {
  clock += dt;
  if (wait > 0) { wait -= dt; return; }
  if (state !== 'play') return;
  advance(ninja, dt, ninjaTurn);
  const [nx, ny] = px(ninja), key = Math.round(nx) + ',' + Math.round(ny);
  if (items[key]) {
    if (items[key] === 'rice') { left--; add(10); } else { stars++; add(50); }
    delete items[key]; hud();
  }
  for (const s of spirits) {
    if (s.out > 0) { s.out -= dt; continue; }
    advance(s, dt, spiritTurn);
  }
  for (const shot of shots) {
    shot.x += shot.d[0] * 12 * dt; shot.y += shot.d[1] * 12 * dt;
    if (!open(Math.round(shot.x), Math.round(shot.y))) shot.gone = true;
    for (const s of spirits) {
      const [x, y] = px(s);
      if (s.out <= 0 && !shot.gone && Math.hypot(x - shot.x, y - shot.y) < 0.8) {
        shot.gone = true; add(200); hud();
        pops.push({ x, y, colour: s.colour, t: 0 });
        Object.assign(s, mover(s.home[0], s.home[1], s.speed), { out: 5 });
      }
    }
  }
  shots = shots.filter(s => !s.gone);
  pops.forEach(p => { p.t += dt; }); pops = pops.filter(p => p.t < 0.6);
  if (spirits.some(s => { const [x, y] = px(s); return s.out <= 0 && Math.hypot(x - nx, y - ny) < 0.65; })) {
    lives--;
    if (lives > 0) place();
    else { state = 'over'; wait = 0.8; message('GAME OVER\nSCORE ' + score + '\nTAP TO PLAY AGAIN'); }
    hud();
  } else if (left <= 0) { level++; add(500); newLevel(); hud(); }
}

function sprite(rows, x, y, colour, flip) {
  x = Math.round(x); y = Math.round(y);
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const c = row[flip ? row.length - 1 - i : i];
      if (c === '.') continue;
      g.fillStyle = c === 'c' ? colour : INK[c];
      g.fillRect(x + i, y + j, 1, 1);
    }
  });
}
function draw() {
  g.fillStyle = '#1b1247'; g.fillRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const X = x * T, Y = y * T;
    if (wall[y][x]) {                                // bamboo
      for (let k = 0; k < 3; k++) {
        g.fillStyle = '#2e9e4a'; g.fillRect(X + k * 4, Y, 3, T);
        g.fillStyle = '#7be08f'; g.fillRect(X + k * 4, Y, 1, T);
        g.fillStyle = '#17612b'; g.fillRect(X + k * 4, Y + (x * 5 + k * 4 + y * 3) % T, 3, 1);
      }
    } else {
      const it = items[x + ',' + y];
      if (it === 'rice') sprite(RICE, X + 4, Y + 4);
      if (it === 'star') sprite(STAR[Math.floor(clock * 6) % 2].map(r => r.replace(/w/g, 'c')), X + 4, Y + 4, '#ffd400');
    }
  }
  for (const s of shots) sprite(STAR[Math.floor(clock * 20) % 2], s.x * T + 4, s.y * T + 4);
  for (const s of spirits) {
    if (s.out > 0 && Math.floor(clock * 8) % 2) continue;   // blinking: not out yet
    const [x, y] = px(s);
    sprite(SPIRIT, x * T + 1, y * T + 1 + Math.sin(clock * 6 + s.daft * 9), s.colour);
  }
  if (!(wait > 0 && state === 'play' && Math.floor(clock * 8) % 2)) {
    const [x, y] = px(ninja);
    sprite(NINJA[ninja.dir && Math.floor(clock * 10) % 2 ? 1 : 0], x * T + 1, y * T + 1, null, ninja.face === 'left');
  }
  for (const p of pops) {
    g.fillStyle = p.colour;
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4, d = 3 + p.t * 22;
      g.fillRect(Math.round(p.x * T + 5 + Math.cos(a) * d), Math.round(p.y * T + 5 + Math.sin(a) * d), 2, 2);
    }
  }
}
function frame(now) {
  if (!arcadeOpen) return;
  update(Math.min(0.05, (now - last) / 1000));
  last = now;
  draw();
  requestAnimationFrame(frame);
}

window.openArcade = () => {
  if (arcadeOpen) return;
  arcadeOpen = true;
  $('arcade').hidden = false;
  if (state !== 'play') { newLevel(); wait = 0; message('LANTERN RUN\n\nGather the rice balls.\nThrow ★ at the lanterns.\n\nTAP TO START'); state = 'title'; }
  else wait = 1;                                     // carrying on: a moment to get ready
  hud();
  last = performance.now();
  requestAnimationFrame(frame);
};
window.closeArcade = () => {
  arcadeOpen = false;
  $('arcade').hidden = true;
  eqStart();
};

// Controls: arrow buttons, swipes, or a keyboard
document.querySelectorAll('#arcade [data-dir]').forEach(b =>
  b.addEventListener('pointerdown', e => { e.preventDefault(); if (state === 'play') steer(b.dataset.dir); else action(); }));
$('arcade-throw').addEventListener('pointerdown', e => { e.preventDefault(); action(); });
let from = null;
const stage = $('arcade-stage');
stage.addEventListener('pointerdown', e => { e.preventDefault(); from = { x: e.clientX, y: e.clientY, swiped: false }; });
window.addEventListener('pointermove', e => {
  if (!from) return;
  const dx = e.clientX - from.x, dy = e.clientY - from.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
  steer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  from = { x: e.clientX, y: e.clientY, swiped: true };   // keep swiping without lifting
});
window.addEventListener('pointerup', () => { if (from && !from.swiped) action(); from = null; });
window.addEventListener('pointercancel', () => { from = null; });
window.addEventListener('keydown', e => {
  if (!arcadeOpen) return;
  const d = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key];
  if (d) { e.preventDefault(); steer(d); }
  else if (e.key === ' ' && e.target.id !== 'btn-arcade-close') { e.preventDefault(); action(); }
  else if (e.key === 'Escape') closeArcade();
});
// For testing
window.arcadeState = () => ({ state, score, lives, stars, level, left, ninja: ninja && px(ninja), spirits: spirits && spirits.map(px),
  dead: wall && wall.flatMap((r, y) => r.map((w, x) => !w && Object.values(DIRS).filter(([a, b]) => open(x + a, y + b)).length < 2)).filter(Boolean).length });
})();
