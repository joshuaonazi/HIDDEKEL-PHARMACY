const SKIP = new Set(['and', 'of', 'the', '&']);

// "Hiddekel Pharmacy and Store" -> "HPS"
export function receiptPrefix(name = '') {
  const letters = name
    .split(/\s+/)
    .filter((w) => w && !SKIP.has(w.toLowerCase()))
    .map((w) => w[0].toUpperCase())
    .join('')
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 4);
  return letters || 'RCP';
}
