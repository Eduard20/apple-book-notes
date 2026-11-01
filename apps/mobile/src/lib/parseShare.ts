/**
 * Parse text that Apple Books puts on the share sheet / clipboard.
 *
 * Apple doesn't document this format, and it varies by iOS version and language. Typical shape:
 *
 *   “Highlighted text…”
 *
 *   Excerpt From
 *   Book Title
 *   Author Name
 *   https://books.apple.com/…
 *   This material may be protected by copyright.
 *
 * Several of those blocks can come back to back. Anything we can't recognize becomes a single
 * highlight, and the preview screen lets the user fix the book before saving.
 */

export interface ParsedShare {
  bookTitle: string;
  author: string;
  items: { text: string }[];
  recognized: boolean; // false = fell back to "whole text is one highlight"
}

// "Excerpt From" in a few likely UI languages.
// (No \b: it only understands Latin letters, so it never matches after Cyrillic.)
const EXCERPT_MARKERS = [/^excerpt from(?=\s|$)/i, /^отрывок из(?=\s|$)/i, /^фрагмент из(?=\s|$)/i, /^выдержка из(?=\s|$)/i];
const BOILERPLATE = [
  /protected by copyright/i,
  /защищ[её]н[ао]? авторским правом/i,
  /^https?:\/\/\S+$/i,
  /^(?:this material|данный материал)/i,
];

const isMarker = (l: string) => EXCERPT_MARKERS.some((r) => r.test(l.trim()));
const isBoilerplate = (l: string) => BOILERPLATE.some((r) => r.test(l.trim()));

function unquote(s: string) {
  return s
    .trim()
    .replace(/^["“”«„]+/, "")
    .replace(/["“”»]+$/, "")
    .trim();
}

export function parseShare(raw: string): ParsedShare {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  const items: { text: string }[] = [];
  let bookTitle = "";
  let author = "";
  let buf: string[] = [];
  let recognized = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isMarker(line)) {
      recognized = true;
      const text = unquote(buf.join("\n"));
      if (text) items.push({ text });
      buf = [];
      // Title + author are the next non-empty, non-boilerplate lines. ("Excerpt From Title" on one line also happens.)
      const sameLine = line.trim().replace(EXCERPT_MARKERS.find((r) => r.test(line.trim()))!, "").trim();
      const meta: string[] = sameLine ? [sameLine] : [];
      let j = i + 1;
      while (j < lines.length && meta.length < 2) {
        const l = lines[j].trim();
        if (l && !isBoilerplate(l)) {
          // Stop if the next highlight starts (quoted text) before we found an author.
          if (meta.length === 1 && /^["“«]/.test(l)) break;
          meta.push(l);
        }
        j++;
      }
      if (!bookTitle && meta[0]) bookTitle = meta[0];
      if (!author && meta[1]) author = meta[1];
      // Skip the metadata + trailing boilerplate.
      while (j < lines.length && (!lines[j].trim() || isBoilerplate(lines[j]))) j++;
      i = j - 1;
      continue;
    }
    if (isBoilerplate(line)) continue;
    buf.push(line);
  }

  const rest = unquote(buf.join("\n"));
  if (rest) {
    if (recognized) items.push({ text: rest });
    else {
      // No markers: split on separate quoted passages if there are several, else keep as one.
      const quoted = [...raw.matchAll(/[“«"]([^”»"]{3,})[”»"]/g)].map((m) => m[1].trim());
      if (quoted.length > 1) quoted.forEach((text) => items.push({ text }));
      else items.push({ text: rest });
    }
  }

  return { bookTitle: bookTitle.replace(/^["“«]|["”»]$/g, "").trim(), author, items, recognized };
}
