'use strict';

// Lecture de CHANGELOG.md (la source unique des nouveautés) et comparaison
// de numéros de version (MAJEUR.MINEUR.CORRECTIF).

const ENTETE_VERSION = /^##\s+\[(\d+\.\d+\.\d+)\]\s*(?:[–—-]\s*(\d{4}-\d{2}-\d{2}))?\s*$/;
const ENTETE_SECTION = /^###\s+(.+?)\s*$/;
const ELEMENT = /^\s*[-*]\s+(.+?)\s*$/;

/** Texte brut : on retire la mise en forme Markdown (gras, code, liens). */
function texteBrut(markdown) {
  return markdown
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
}

/** @returns {{version: string, date: string|null, sections: {titre: string, elements: string[]}[]}[]} */
function lireChangelog(markdown) {
  const versions = [];
  let version = null;
  let section = null;
  for (const ligne of String(markdown).split(/\r?\n/)) {
    const v = ligne.match(ENTETE_VERSION);
    if (v) {
      version = { version: v[1], date: v[2] || null, sections: [] };
      versions.push(version);
      section = null;
      continue;
    }
    if (/^##\s/.test(ligne)) {
      version = null;
      section = null;
      continue;
    }
    if (!version) continue;
    const s = ligne.match(ENTETE_SECTION);
    if (s) {
      section = { titre: texteBrut(s[1]), elements: [] };
      version.sections.push(section);
      continue;
    }
    const e = ligne.match(ELEMENT);
    if (e && section) section.elements.push(texteBrut(e[1]));
  }
  return versions.filter((v) => v.sections.some((s) => s.elements.length > 0));
}

/** Le texte Markdown d'une version, tel quel (notes de version GitHub). */
function sectionMarkdown(markdown, version) {
  const lignes = String(markdown).split(/\r?\n/);
  const debut = lignes.findIndex((l) => (l.match(ENTETE_VERSION) || [])[1] === version);
  if (debut === -1) return null;
  const fin = lignes.findIndex((l, i) => i > debut && /^##\s/.test(l));
  return lignes.slice(debut + 1, fin === -1 ? undefined : fin).join('\n').trim();
}

function decouper(version) {
  const m = String(version).match(/^v?(\d+)\.(\d+)\.(\d+)/);
  return m ? m.slice(1).map(Number) : null;
}

/** < 0 si a est plus ancienne que b, 0 si égales, > 0 si plus récente. */
function comparerVersions(a, b) {
  const x = decouper(a);
  const y = decouper(b);
  if (!x || !y) throw new Error(`Numéro de version invalide : ${!x ? a : b}`);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

/**
 * Notes d'une version reçues de GitHub (HTML, texte ou liste) -> lignes de
 * texte brut. Jamais de HTML affiché tel quel dans le logiciel.
 */
function notesEnTexte(notes) {
  if (!notes) return [];
  if (Array.isArray(notes)) return notes.flatMap((n) => notesEnTexte(n && (n.note || n)));
  const texte = String(notes)
    .replace(/<\s*li[^>]*>/gi, '\n• ')
    .replace(/<\s*(br|\/p|\/h\d|\/li|\/ul)[^>]*>/gi, '\n')
    .replace(/<\s*h\d[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
  return texteBrut(texte)
    .split('\n')
    .map((l) => l.replace(/^\s*[-*]\s+/, '• ').replace(/^#+\s*/, '').trim())
    .filter(Boolean);
}

module.exports = { lireChangelog, sectionMarkdown, comparerVersions, notesEnTexte, texteBrut };
