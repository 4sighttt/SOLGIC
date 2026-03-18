export function solve({ candidates, conflicts, isValidPartial, isValidFinal }) {
  const N = candidates.length;
  const solution = [];
  const used = new Array(N).fill(false);

  function backtrack(start) {
    if (!isValidPartial(solution)) return false;
    if (isValidFinal(solution)) return true;

    for (let i = start; i < N; i++) {
      if (used[i]) continue;

      let conflict = false;
      for (const j of solution) {
        if (conflicts[i]?.has(j) || conflicts[j]?.has(i)) {
          conflict = true;
          break;
        }
      }
      if (conflict) continue;

      used[i] = true;
      solution.push(i);

      if (backtrack(i + 1)) return true;

      solution.pop();
      used[i] = false;
    }
    return false;
  }

  const success = backtrack(0);
  return success ? solution.slice() : null;
}
