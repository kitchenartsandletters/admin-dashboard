// poNumber.ts — how a PO number is written on documents.
//
// Mirrors app/services/po_number.py in supply-chain-service. The backend owns
// what the PDF *page* says; this owns the download filename, because the
// filename is set client-side — _downloadBlob assigns `a.download`, which
// overrides any Content-Disposition the server sends.
//
// Keep the two in step. If the rule changes, change it in both.
//
// The bug this fixes: the filename was built as `KAL-${po_number}`, against a
// number that already read `KAL-10126`, producing `KAL-KAL-10126.pdf`.
//
// Formats in play:
//   KAL-10126          111 existing POs
//   PO-20260717-4F47    42 existing POs, older ad-hoc numbering
//   10127               new POs, once the generator drops the prefix
//
// Only the first and third are reformatted. `PO-` numbers keep exactly the
// filename they produce today — they are historical, they never reach PRH, and
// those files may already be sitting in someone's downloads folder.

const KAL_NUMBERED = /^KAL-(\d+)$/i
const BARE_NUMBER = /^\d+$/

/** The numeric part, when this is a number we reformat. Null means leave alone. */
function digitsOrNull(poNumber: string): string | null {
  if (!poNumber) return null
  const s = String(poNumber).trim()
  const m = KAL_NUMBERED.exec(s)
  if (m) return m[1]
  if (BARE_NUMBER.test(s)) return s
  return null
}

/**
 * Download filename: `KAL 10126.pdf` — one KAL, a space instead of a dash.
 *
 * The prefix earns its place here, unlike on the page itself (which already
 * says KITCHEN ARTS & LETTERS across the top): the file leaves our system and
 * lands in a folder alongside other suppliers' documents, where "whose PO is
 * this" is exactly what a filename should answer.
 */
export function poPdfFilename(poNumber: string): string {
  const digits = digitsOrNull(poNumber)
  return digits ? `KAL ${digits}.pdf` : `KAL-${poNumber}.pdf`
}
