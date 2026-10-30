'use strict';

// Détail d'une version déployée : quelles PR, ce qu'elles changent et où le
// voir. Servi par le BO (GET /admin/cockpit/version), derrière la connexion
// passkey : on le lit avec la session de l'environnement, jamais sans.
// Tout ce qui vient du site est revalidé ici : textes bornés, liens limités
// à des chemins relatifs du même environnement.

const CHEMIN = /^\/(?!\/)[A-Za-z0-9\-._~/%?=&#+]*$/;

function texte(valeur, max) {
  if (typeof valeur !== 'string') return null;
  const propre = valeur.replace(/\s+/g, ' ').trim();
  if (!propre) return null;
  return propre.length > max ? `${propre.slice(0, max - 1)}…` : propre;
}

function chemins(liste) {
  if (!Array.isArray(liste)) return [];
  return [...new Set(liste.filter((c) => typeof c === 'string' && c.length <= 200 && CHEMIN.test(c)))].slice(0, 4);
}

/** Réponse du BO -> détail sûr, ou null si elle est inexploitable. */
function lireDetail(json) {
  if (!json || typeof json !== 'object') return null;
  const sha = typeof json.sha === 'string' && /^[0-9a-f]{7,40}$/i.test(json.sha) ? json.sha.toLowerCase() : null;
  if (!sha) return null;
  const changements = Array.isArray(json.changements)
    ? json.changements.slice(0, 40).map((c) => ({
      pr: Number.isInteger(c && c.pr) && c.pr > 0 ? c.pr : null,
      titre: texte(c && c.titre, 200) || 'Changement sans titre',
      resume: texte(c && c.resume, 320),
      lignes: Array.isArray(c && c.lignes) ? c.lignes.map((l) => texte(l, 320)).filter(Boolean).slice(0, 8) : [],
      liens: chemins(c && c.liens),
      liensDeduits: Boolean(c && c.liens_deduits),
    }))
    : null;
  return {
    sha,
    precedente: typeof json.precedente === 'string' && /^[0-9a-f]{7,40}$/i.test(json.precedente) ? json.precedente.toLowerCase() : null,
    changements,
    autres: Array.isArray(json.autres) ? json.autres.map((a) => texte(a, 160)).filter(Boolean).slice(0, 10) : [],
    indisponible: texte(json.indisponible, 200),
  };
}

/** Une ligne de résumé : « Radar : carte au choix (+2) ». */
function resumeDetail(detail) {
  if (!detail || !detail.changements || detail.changements.length === 0) return null;
  const [premier, ...reste] = detail.changements;
  return reste.length ? `${premier.titre} (+${reste.length})` : premier.titre;
}

/**
 * Lit le détail de la version en ligne avec la session (cookies) de
 * l'environnement. Statuts : 'ok', 'connexion' (session BO à rouvrir),
 * 'interdit' (droit manquant), 'erreur'.
 */
async function chargerDetail(fetchSession, origine) {
  try {
    const reponse = await fetchSession(`${origine}/admin/cockpit/version`, {
      headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      redirect: 'manual',
      credentials: 'include',
      cache: 'no-store',
    });
    if (reponse.status === 401 || reponse.status === 419 || (reponse.status >= 300 && reponse.status < 400)) return { statut: 'connexion' };
    if (reponse.status === 403) return { statut: 'interdit' };
    if (!reponse.ok) return { statut: 'erreur' };
    const detail = lireDetail(await reponse.json());
    return detail ? { statut: 'ok', detail } : { statut: 'erreur' };
  } catch {
    return { statut: 'erreur' };
  }
}

module.exports = { lireDetail, resumeDetail, chargerDetail, CHEMIN };
