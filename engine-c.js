// engine-c.js
import { solve } from './solver-core.js';

export function solveCMode(board) {
  const candidates = generateRectangles(board);
  const conflicts = buildConflicts(candidates);

  return solve({
    candidates,
    conflicts,
    isValidPartial: (selected) => checkConnectivityPartial(candidates, selected),
    isValidFinal: (selected) =>
      checkNumbers(board, candidates, selected) &&
      checkConnectivityFull(candidates, selected)
  });
}

// === rectangle generation ===
function generateRectangles(board) {
  const H = board.length;
  const W = board[0].length;
  const rects = [];

  for (let r1 = 0; r1 < H; r1++) {
    for (let c1 = 0; c1 < W; c1++) {
      for (let r2 = r1; r2 < H; r2++) {
        for (let c2 = c1; c2 < W; c2++) {
          const cells = [];
          for (let r = r1; r <= r2; r++) {
            for (let c = c1; c <= c2; c++) {
              cells.push([r, c]);
            }
          }
          rects.push(cells);
        }
      }
    }
  }
  return rects;
}

// === conflicts ===
function buildConflicts(candidates) {
  const conflicts = [];

  for (let i = 0; i < candidates.length; i++) {
    conflicts[i] = new Set();
    for (let j = 0; j < candidates.length; j++) {
      if (i === j) continue;
      if (overlap(candidates[i], candidates[j])) {
        conflicts[i].add(j);
      }
    }
  }
  return conflicts;
}

function overlap(a, b) {
  const set = new Set(a.map(([r,c]) => r + ',' + c));
  for (const [r,c] of b) {
    if (set.has(r + ',' + c)) return true;
  }
  return false;
}

// === number constraint ===
function checkNumbers(board, candidates, selected) {
  const H = board.length;
  const W = board[0].length;

  const mineSet = new Set();
  for (const i of selected) {
    for (const [r,c] of candidates[i]) {
      mineSet.add(r + ',' + c);
    }
  }

  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      if (typeof board[r][c] === 'number') {
        let count = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = r + dr;
            const nc = c + dc;
            if (nr < 0 || nr >= H || nc < 0 || nc >= W) continue;
            if (mineSet.has(nr + ',' + nc)) count++;
          }
        }
        if (count !== board[r][c]) return false;
      }
    }
  }
  return true;
}

// === connectivity (diagonal) ===
function isDiagonalAdjacent(a, b) {
  for (const [r1,c1] of a) {
    for (const [r2,c2] of b) {
      if (Math.abs(r1 - r2) === 1 && Math.abs(c1 - c2) === 1) {
        return true;
      }
    }
  }
  return false;
}

function checkConnectivityPartial(candidates, selected) {
  if (selected.length <= 1) return true;

  const last = selected[selected.length - 1];
  for (let i = 0; i < selected.length - 1; i++) {
    if (isDiagonalAdjacent(candidates[last], candidates[selected[i]])) {
      return true;
    }
  }
  return false;
}

function checkConnectivityFull(candidates, selected) {
  if (selected.length === 0) return false;

  const visited = new Set();
  const stack = [selected[0]];
  visited.add(selected[0]);

  while (stack.length) {
    const cur = stack.pop();
    for (const nxt of selected) {
      if (!visited.has(nxt)) {
        if (isDiagonalAdjacent(candidates[cur], candidates[nxt])) {
          visited.add(nxt);
          stack.push(nxt);
        }
      }
    }
  }

  return visited.size === selected.length;
}
