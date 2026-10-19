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
  '#90caf9', // J - azul pálido
  '#ffb74d', // L - orange
];

// Versión más saturada para fondo claro
const COLORS_LIGHT = [
  null,
  '#00acc1', // I
  '#f9a825', // O
  '#8e24aa', // T
  '#43a047', // S
  '#e53935', // Z
  '#1e88e5', // J
  '#fb8c00', // L
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
const themeBtn = document.getElementById('theme-btn');

const startOverlay = document.getElementById('start-overlay');
const startBtn = document.getElementById('start-btn');
const startRecordsEl = document.getElementById('start-records');
const overRecordsEl = document.getElementById('over-records');
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');

let theme = 'dark';
let gridColor, highlightColor;

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, started = false, combo = 0, maxCombo = 0, pendingEntry = null;

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
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
  return cleared;
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
  if (clearLines()) {
    combo++;
    if (combo > maxCombo) maxCombo = combo;
  } else {
    combo = 0;
  }
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
  const color = (theme === 'light' ? COLORS_LIGHT : COLORS)[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = highlightColor;
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
  overlay.classList.remove('hidden');
  handleGameOverRecords(); // después de mostrar el overlay: focus() necesita el input visible
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
    nameForm.classList.add('hidden');
    overRecordsEl.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
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
  if (gameOver) return; // endGame() dentro del loop no puede cancelar el frame en curso
  animId = requestAnimationFrame(loop);
}

function applyTheme(name) {
  theme = name === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  const styles = getComputedStyle(document.documentElement);
  gridColor = styles.getPropertyValue('--grid').trim();
  highlightColor = styles.getPropertyValue('--highlight').trim();
  themeBtn.textContent = theme === 'light' ? 'Modo oscuro' : 'Modo claro';
  try { localStorage.setItem('theme', theme); } catch (e) {}
  // En pausa o game over el rAF está cancelado: redibujar a mano
  if (board) {
    draw();
    drawNext();
  }
}

function toggleTheme() {
  applyTheme(theme === 'light' ? 'dark' : 'light');
}

/* ---- Tabla de récords (localStorage 'tetrisRecords') ---- */
const RECORDS_KEY = 'tetrisRecords';
const NAME_KEY = 'tetrisLastName';
const MAX_RECORDS = 5;

function loadRecords() {
  const rec = { top: [], bestCombo: 0, maxLines: 0 };
  try {
    const data = JSON.parse(localStorage.getItem(RECORDS_KEY));
    if (data && typeof data === 'object') {
      if (Array.isArray(data.top)) {
        rec.top = data.top
          .filter(e => e && Number.isFinite(e.score))
          .map(e => ({
            name: String(e.name ?? '').slice(0, 12),
            score: e.score,
            lines: Number.isFinite(e.lines) ? e.lines : 0,
            level: Number.isFinite(e.level) ? e.level : 1,
            date: String(e.date ?? ''),
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, MAX_RECORDS);
      }
      if (Number.isFinite(data.bestCombo)) rec.bestCombo = data.bestCombo;
      if (Number.isFinite(data.maxLines)) rec.maxLines = data.maxLines;
    }
  } catch (e) {}
  return rec;
}

function saveRecords(rec) {
  try { localStorage.setItem(RECORDS_KEY, JSON.stringify(rec)); } catch (e) {}
}

function qualifiesForTop(rec, s) {
  return s > 0 && (rec.top.length < MAX_RECORDS || s > rec.top[rec.top.length - 1].score);
}

function el(tag, text, cls) {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}

// highlight: índice de la fila a resaltar (o -1)
function renderRecords(container, highlight) {
  const rec = loadRecords();
  container.textContent = '';
  container.appendChild(el('h3', 'MEJORES PUNTUACIONES'));
  if (!rec.top.length) {
    container.appendChild(el('p', 'Aún no hay récords', 'empty'));
  } else {
    const table = el('table');
    const head = el('tr');
    ['#', 'NOMBRE', 'PUNTOS', 'LÍNEAS'].forEach(t => head.appendChild(el('th', t)));
    table.appendChild(head);
    rec.top.forEach((e, i) => {
      const tr = el('tr', undefined, i === highlight ? 'current' : '');
      tr.appendChild(el('td', String(i + 1)));
      tr.appendChild(el('td', e.name || '---'));
      tr.appendChild(el('td', e.score.toLocaleString()));
      tr.appendChild(el('td', String(e.lines)));
      table.appendChild(tr);
    });
    container.appendChild(table);
  }
  const stats = el('div', undefined, 'stats');
  const a = el('span', 'Mejor combo: '); a.appendChild(el('b', String(rec.bestCombo)));
  const b = el('span', 'Líneas máx: '); b.appendChild(el('b', String(rec.maxLines)));
  stats.append(a, b);
  container.appendChild(stats);

  const reset = el('button', 'Resetear records', 'reset-btn');
  reset.type = 'button';
  let timer = null;
  reset.addEventListener('click', () => {
    reset.blur();
    if (!reset.classList.contains('armed')) {
      reset.classList.add('armed');
      reset.textContent = '¿Seguro? Pulsa de nuevo';
      timer = setTimeout(() => {
        reset.classList.remove('armed');
        reset.textContent = 'Resetear records';
      }, 3000);
      return;
    }
    clearTimeout(timer);
    try { localStorage.removeItem(RECORDS_KEY); } catch (e) {}
    renderRecords(container, -1);
  });
  container.appendChild(reset);
}

function handleGameOverRecords() {
  const rec = loadRecords();
  rec.bestCombo = Math.max(rec.bestCombo, maxCombo);
  rec.maxLines = Math.max(rec.maxLines, lines);
  saveRecords(rec);
  if (qualifiesForTop(rec, score)) {
    pendingEntry = { score, lines, level };
    let last = '';
    try { last = localStorage.getItem(NAME_KEY) || ''; } catch (e) {}
    nameInput.value = last.slice(0, 12);
    nameForm.classList.remove('hidden');
    nameInput.focus();
    nameInput.select();
  } else {
    pendingEntry = null;
    nameForm.classList.add('hidden');
  }
  renderRecords(overRecordsEl, -1);
}

// Evita que el auto-repeat de una tecla mantenida (p. ej. Space del hard drop) escriba en el campo
nameInput.addEventListener('keydown', e => { if (e.repeat) e.preventDefault(); });

function commitPendingEntry() {
  if (!pendingEntry) return -1;
  const name = nameInput.value.trim().slice(0, 12) || 'Anónimo';
  try { localStorage.setItem(NAME_KEY, name); } catch (err) {}
  const rec = loadRecords();
  const entry = { name, score: pendingEntry.score, lines: pendingEntry.lines, level: pendingEntry.level, date: new Date().toISOString() };
  pendingEntry = null;
  // se inserta después de los empates previos
  let idx = rec.top.findIndex(t => t.score < entry.score);
  if (idx === -1) idx = rec.top.length;
  rec.top.splice(idx, 0, entry);
  rec.top = rec.top.slice(0, MAX_RECORDS);
  saveRecords(rec);
  return idx < MAX_RECORDS ? idx : -1;
}

nameForm.addEventListener('submit', e => {
  e.preventDefault();
  if (!pendingEntry) return;
  const idx = commitPendingEntry();
  nameForm.classList.add('hidden');
  nameInput.blur();
  renderRecords(overRecordsEl, idx);
});

function init() {
  commitPendingEntry(); // si se reinicia sin pulsar Guardar, no se pierde el récord
  started = true;
  startOverlay.classList.add('hidden');
  nameForm.classList.add('hidden');
  pendingEntry = null;
  combo = 0;
  maxCombo = 0;
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
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  const tag = e.target && e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return; // teclear en el campo de nombre
  if (!started) {
    if (e.code === 'Enter' && tag !== 'BUTTON') init();
    else if (e.code === 'KeyT') toggleTheme();
    return;
  }
  if (e.code === 'KeyP') { togglePause(); return; }
  if (e.code === 'KeyT') { toggleTheme(); return; }
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
startBtn.addEventListener('click', () => { startBtn.blur(); init(); });
themeBtn.addEventListener('click', () => {
  toggleTheme();
  themeBtn.blur(); // evita que Space/Enter vuelvan a activar el botón
});

let savedTheme = 'dark';
try { savedTheme = localStorage.getItem('theme') || 'dark'; } catch (e) {}
applyTheme(savedTheme);
renderRecords(startRecordsEl, -1);
