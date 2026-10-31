export type DiffPart = { text: string; type: "same" | "added" | "removed" };

/** Word-level LCS diff; captions are short, so O(n·m) is fine. */
export function diffWords(before: string, after: string): DiffPart[] {
  const a = before.split(/(\s+)/);
  const b = after.split(/(\s+)/);
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);

  const out: DiffPart[] = [];
  const push = (text: string, type: DiffPart["type"]) => {
    const last = out[out.length - 1];
    if (last && last.type === type) last.text += text;
    else out.push({ text, type });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push(a[i], "same");
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) push(a[i++], "removed");
    else push(b[j++], "added");
  }
  while (i < n) push(a[i++], "removed");
  while (j < m) push(b[j++], "added");
  return out;
}

/**
 * Makes a word diff readable: unchanged runs that are only spaces or one short word between two
 * edits are folded into the edit, so a rewritten phrase shows as one removed run then one added run
 * instead of alternating word by word.
 */
export function groupDiff(parts: DiffPart[]): DiffPart[] {
  const out: DiffPart[] = [];
  let removed = "";
  let added = "";
  const flush = () => {
    if (removed) out.push({ text: removed, type: "removed" });
    if (added) out.push({ text: added, type: "added" });
    removed = added = "";
  };
  parts.forEach((p, i) => {
    if (p.type === "removed") removed += p.text;
    else if (p.type === "added") added += p.text;
    else {
      const between = (removed || added) && i < parts.length - 1 && parts[i + 1].type !== "same";
      if (between && /^\s*\S{0,3}\s*$/.test(p.text)) {
        removed += p.text;
        added += p.text;
      } else {
        flush();
        out.push(p);
      }
    }
  });
  flush();
  return out;
}

/** Share of the new text that was kept from the old one, from 0 (all new) to 1 (unchanged). */
export function keptShare(parts: DiffPart[]) {
  const kept = parts.filter((p) => p.type === "same").reduce((n, p) => n + p.text.trim().length, 0);
  const total = parts.filter((p) => p.type !== "removed").reduce((n, p) => n + p.text.trim().length, 0);
  return total ? kept / total : 1;
}
