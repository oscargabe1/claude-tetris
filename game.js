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

// Paletas por skin. Retro usa COLORS/COLORS_LIGHT según el tema.
const NEON_COLORS = [null, '#00f0ff', '#fff700', '#d400ff', '#39ff14', '#ff073a', '#2979ff', '#ff9100'];
const PASTEL_COLORS = [null, '#a8e6ef', '#fff1b8', '#d9b8f0', '#b9e8c0', '#f8b9b9', '#b8d4f5', '#fcd5a5'];
const PIXEL_COLORS = [null, '#29b6f6', '#fdd835', '#ab47bc', '#66bb6a', '#ef5350', '#5c6bc0', '#ff9800'];

const SKINS = ['retro', 'neon', 'pastel', 'pixel'];

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
const skinSelect = document.getElementById('skin-select');

let theme = 'dark';
let skin = 'retro';
let gridColor, highlightColor;

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

function blockColor(colorIndex) {
  switch (skin) {
    case 'neon': return NEON_COLORS[colorIndex];
    case 'pastel': return PASTEL_COLORS[colorIndex];
    case 'pixel': return PIXEL_COLORS[colorIndex];
    default: return (theme === 'light' ? COLORS_LIGHT : COLORS)[colorIndex];
  }
}

function drawBlockRetro(context, px, py, s, color) {
  context.fillStyle = color;
  context.fillRect(px + 1, py + 1, s - 2, s - 2);
  context.fillStyle = highlightColor;
  context.fillRect(px + 1, py + 1, s - 2, 4);
}

function drawBlockNeon(context, px, py, s, color) {
  context.shadowColor = color;
  context.shadowBlur = 12;
  context.fillStyle = color + '55';
  context.fillRect(px + 3, py + 3, s - 6, s - 6);
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.strokeRect(px + 3, py + 3, s - 6, s - 6);
  context.shadowBlur = 0;
}

function drawBlockPastel(context, px, py, s, color) {
  const r = s * 0.3;
  context.fillStyle = color;
  context.beginPath();
  context.roundRect(px + 2, py + 2, s - 4, s - 4, r);
  context.fill();
  context.fillStyle = 'rgba(255, 255, 255, 0.45)';
  context.beginPath();
  context.roundRect(px + 5, py + 5, s - 10, (s - 10) / 3, r / 2);
  context.fill();
}

function drawBlockPixel(context, px, py, s, color) {
  const u = s / 6; // rejilla de 6×6 "píxeles"
  context.fillStyle = color;
  context.fillRect(px, py, s, s);
  // luz arriba/izquierda, sombra abajo/derecha
  context.fillStyle = 'rgba(255, 255, 255, 0.4)';
  context.fillRect(px, py, s, u);
  context.fillRect(px, py, u, s);
  context.fillStyle = 'rgba(0, 0, 0, 0.35)';
  context.fillRect(px, py + s - u, s, u);
  context.fillRect(px + s - u, py, u, s);
  // patrón de ajedrez interior
  context.fillStyle = 'rgba(0, 0, 0, 0.14)';
  for (let i = 1; i < 5; i++)
    for (let j = 1; j < 5; j++)
      if ((i + j) % 2 === 0) context.fillRect(px + i * u, py + j * u, u, u);
  context.fillStyle = 'rgba(255, 255, 255, 0.55)';
  context.fillRect(px + 2 * u, py + 2 * u, u, u);
  context.strokeStyle = 'rgba(0, 0, 0, 0.6)';
  context.lineWidth = 1;
  context.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1);
}

const BLOCK_DRAWERS = {
  retro: drawBlockRetro,
  neon: drawBlockNeon,
  pastel: drawBlockPastel,
  pixel: drawBlockPixel,
};

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  context.globalAlpha = alpha ?? 1;
  BLOCK_DRAWERS[skin](context, x * size, y * size, size, blockColor(colorIndex));
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

function applySkin(name) {
  skin = SKINS.includes(name) ? name : 'retro';
  document.documentElement.dataset.skin = skin;
  skinSelect.value = skin;
  try { localStorage.setItem('skin', skin); } catch (e) {}
  applyTheme(theme); // relee variables CSS y redibuja
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
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (e.code === 'KeyT') { toggleTheme(); return; }
  if (e.code === 'KeyS') { applySkin(SKINS[(SKINS.indexOf(skin) + 1) % SKINS.length]); return; }
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
themeBtn.addEventListener('click', () => {
  toggleTheme();
  themeBtn.blur(); // evita que Space/Enter vuelvan a activar el botón
});

skinSelect.addEventListener('change', () => {
  applySkin(skinSelect.value);
  skinSelect.blur(); // evita que las flechas/Space cambien la opción
});

let savedTheme = 'dark';
let savedSkin = 'retro';
try {
  savedTheme = localStorage.getItem('theme') || 'dark';
  savedSkin = localStorage.getItem('skin') || 'retro';
} catch (e) {}
applyTheme(savedTheme);
applySkin(savedSkin);
init();
