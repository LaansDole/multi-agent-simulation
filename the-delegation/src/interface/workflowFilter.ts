/** Lowercase, drop a trailing .yaml/.yml, and treat runs of `_`, `-` and whitespace as one space. */
const normalize = (s: string): string =>
  s.trim().toLowerCase().replace(/\.ya?ml$/, '').replace(/[\s_-]+/g, ' ').trim();

/**
 * Workflow filenames matching `query`, in their original order: every query word
 * must occur in the normalized filename (subfolder paths included). Blank query keeps all.
 */
export function filterWorkflows(files: readonly string[], query: string): string[] {
  const words = normalize(query).split(' ').filter(Boolean);
  if (words.length === 0) return [...files];
  return files.filter((f) => {
    const name = normalize(f);
    return words.every((w) => name.includes(w));
  });
}
