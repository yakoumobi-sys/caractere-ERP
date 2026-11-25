// Analyse CSV simple (séparateur ; ou , détecté, guillemets gérés), en-têtes normalisés.
export function parseCsv(text: string): Record<string, string>[] {
  const clean = text.replace(/^﻿/, "");
  const first = clean.split(/\r?\n/)[0] || "";
  const sep = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  if (!rows.length) return [];
  const head = rows[0].map(normalizeHeader);
  return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] || "").trim()])));
}

const ALIASES: Record<string, string> = {
  nom: "name", "nom complet": "name", client: "name", telephone: "phone", "téléphone": "phone", tel: "phone", mobile: "phone", societe: "company", "société": "company",
  entreprise: "company", mail: "email", "e-mail": "email", ville: "commune", adresse: "address", reference: "ref", "référence": "ref", designation: "name", "désignation": "name",
  couleur: "color", taille: "size", quantite: "qty", "quantité": "qty", stock: "qty", seuil: "threshold", "prix": "sale_price", "prix de vente": "sale_price", cout: "cost", "coût": "cost",
  type: "kind", "refus marketing": "marketing_opt_out",
};
function normalizeHeader(h: string) {
  const k = h.trim().toLowerCase();
  return ALIASES[k] || k.replace(/\s+/g, "_");
}
