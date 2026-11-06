/** Canonical form used only when matching aisle labels to stored category text. */
export function normalizeCategory(value: string): string {
  let key = value
    .normalize("NFKD")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "");

  // Treat common English plural forms as the same category label.
  if (key.endsWith("ies") && key.length > 4) key = `${key.slice(0, -3)}y`;
  else if (key.endsWith("s") && !key.endsWith("ss") && key.length > 3) key = key.slice(0, -1);

  // The mock catalog uses Produce for fruit and Bakery for baked goods.
  if (key === "produce") return "fruit";
  if (key === "bakery") return "baking";
  return key;
}
