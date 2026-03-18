// engine-c.js
import { solve } from './solver-core.js';

export function solveCMode(board) {
  const candidates = generateRectangles(board);
  const conflicts = buildConflicts(candidates);

  return solve({
    candidates,
    conflicts,
    isValidPartial: () => true,
    isValidFinal: (selected) => selected.length > 0
  });
}

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
