'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');

let gridColor = '#22222e';
let combo, maxCombo;
let started = false;
let pendingRecord = null; // { score, lines, level } pendiente de guardar
const startScreen = document.getElementById('start-screen');
const goExtra = document.getElementById('go-extra');
let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  // Combo: piezas seguidas que limpian líneas
  combo = cleared ? combo + 1 : 0;
  if (combo > maxCombo) maxCombo = combo;
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  showGameOverRecords();
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  if (gameOver || paused) return;
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  // endGame() pudo ocurrir en este tick: cancelAnimationFrame no cancela el frame en curso
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  combo = 0;
  maxCombo = 0;
  started = true;
  pendingRecord = null;
  startScreen.classList.add('hidden');
  goExtra.classList.add('hidden');
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  // No disparar acciones de juego mientras se escribe (nombre) o antes de empezar
  if (e.target instanceof HTMLInputElement || !started) return;
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const isLight = theme === 'light';
  themeToggle.textContent = isLight ? 'Modo oscuro' : 'Modo claro';
  themeToggle.setAttribute('aria-pressed', String(isLight));
  gridColor = getComputedStyle(document.documentElement).getPropertyValue('--grid').trim() || gridColor;
}

themeToggle.addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  applyTheme(theme);
  try { localStorage.setItem('theme', theme); } catch (e) { /* almacenamiento no disponible */ }
  // Repintar aunque el juego esté en pausa o terminado
  if (started) { draw(); drawNext(); }
  // Evita que Espacio/flechas vuelvan a activar el botón
  themeToggle.blur();
});

applyTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

// ---- Records (localStorage) ----
const RECORDS_KEY = 'tetris-records';
const MAX_RECORDS = 5;
const recordsStart = document.getElementById('records-start');
const recordsGo = document.getElementById('records-go');
const recordsForm = document.getElementById('records-form');
const recordsName = document.getElementById('records-name');

function emptyRecords() {
  return { top: [], bestCombo: 0, maxLines: 0 };
}

function num(v) {
  return Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}

function loadRecords() {
  try {
    const raw = JSON.parse(localStorage.getItem(RECORDS_KEY));
    if (!raw || typeof raw !== 'object') return emptyRecords();
    const top = (Array.isArray(raw.top) ? raw.top : [])
      .filter(r => r && typeof r === 'object' && Number.isFinite(r.score))
      .map(r => ({
        name: String(r.name ?? '').slice(0, 12),
        score: num(r.score), lines: num(r.lines), level: num(r.level),
        date: typeof r.date === 'string' ? r.date : '',
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RECORDS);
    return { top, bestCombo: num(raw.bestCombo), maxLines: num(raw.maxLines) };
  } catch (e) {
    return emptyRecords();
  }
}

function saveRecords(rec) {
  try { localStorage.setItem(RECORDS_KEY, JSON.stringify(rec)); } catch (e) { /* almacenamiento no disponible */ }
}

function qualifies(rec, sc) {
  return sc > 0 && (rec.top.length < MAX_RECORDS || sc > rec.top[rec.top.length - 1].score);
}

// Renderiza la tabla con textContent (sin innerHTML); highlightIdx resalta una fila
function renderRecords(container, rec, highlightIdx) {
  container.replaceChildren();
  const title = document.createElement('p');
  title.className = 'records-title';
  title.textContent = 'TOP 5';
  const list = document.createElement('ol');
  list.className = 'records-list';
  if (!rec.top.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Sin records todavía';
    list.append(li);
  }
  rec.top.forEach((r, i) => {
    const li = document.createElement('li');
    if (i === highlightIdx) li.classList.add('highlight');
    const pos = document.createElement('span');
    pos.textContent = `${i + 1}.`;
    const name = document.createElement('span');
    name.textContent = r.name || 'Anónimo';
    const sc = document.createElement('span');
    sc.className = 'r-score';
    sc.textContent = r.score.toLocaleString();
    li.append(pos, name, sc);
    list.append(li);
  });
  const stats = document.createElement('div');
  stats.className = 'records-stats';
  const bc = document.createElement('span');
  bc.textContent = `Mejor combo: ${rec.bestCombo}`;
  const ml = document.createElement('span');
  ml.textContent = `Líneas máx: ${rec.maxLines}`;
  stats.append(bc, ml);
  container.append(title, list, stats);
}

function showGameOverRecords() {
  const rec = loadRecords();
  rec.bestCombo = Math.max(rec.bestCombo, maxCombo);
  rec.maxLines = Math.max(rec.maxLines, lines);
  const enters = qualifies(rec, score);
  pendingRecord = enters ? { score, lines, level } : null;
  saveRecords(rec);
  renderRecords(recordsGo, rec, -1);
  recordsForm.classList.toggle('hidden', !enters);
  goExtra.classList.remove('hidden');
  if (enters) {
    recordsName.value = '';
    // Pequeña espera para que Espacio (caída) no escriba en el campo
    setTimeout(() => { if (pendingRecord) recordsName.focus(); }, 400);
  }
}

recordsForm.addEventListener('submit', e => {
  e.preventDefault();
  if (!pendingRecord) return;
  const rec = loadRecords();
  const entry = {
    name: recordsName.value.trim().slice(0, 12) || 'Anónimo',
    score: pendingRecord.score, lines: pendingRecord.lines, level: pendingRecord.level,
    date: new Date().toISOString(),
  };
  pendingRecord = null;
  rec.top.push(entry);
  rec.top.sort((a, b) => b.score - a.score);
  const idx = rec.top.indexOf(entry);
  rec.top = rec.top.slice(0, MAX_RECORDS);
  saveRecords(rec);
  renderRecords(recordsGo, rec, idx < MAX_RECORDS ? idx : -1);
  recordsForm.classList.add('hidden');
  recordsName.blur();
});

document.getElementById('start-btn').addEventListener('click', init);

document.getElementById('records-reset').addEventListener('click', () => {
  if (!confirm('¿Borrar todos los records?')) return;
  try { localStorage.removeItem(RECORDS_KEY); } catch (e) { /* almacenamiento no disponible */ }
  renderRecords(recordsStart, emptyRecords(), -1);
});

// Pantalla de inicio: el juego no arranca hasta pulsar "Jugar"
renderRecords(recordsStart, loadRecords(), -1);
