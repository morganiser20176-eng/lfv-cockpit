'use strict';

// Les deux environnements et leurs quatre destinations.
//
// Le site et le BO d'un même environnement partagent le même hôte : ils
// partagent donc aussi la même partition de session (cookies), exactement
// comme dans Chrome. Prod et recette, elles, ne partagent jamais rien.

const ORIGINES_PAR_DEFAUT = {
  prod: 'https://lesfousvolants.fr',
  recette: 'https://lesfousvolants-recette.lesfousvolants.fr',
};

/**
 * Pour les tests uniquement : LFV_COCKPIT_ORIGINS='{"prod":"http://127.0.0.1:8001",...}'
 * remplace les vraies adresses. Jamais utilisé dans un logiciel installé.
 */
function lireOrigines(env = process.env) {
  if (!env.LFV_COCKPIT_ORIGINS) return { ...ORIGINES_PAR_DEFAUT };
  const surcharge = JSON.parse(env.LFV_COCKPIT_ORIGINS);
  return { ...ORIGINES_PAR_DEFAUT, ...surcharge };
}

function construireEnvironnements(origines) {
  return {
    prod: {
      id: 'prod',
      libelle: 'Production',
      etiquette: 'PROD',
      origine: origines.prod,
      partition: 'persist:lfv-prod',
    },
    recette: {
      id: 'recette',
      libelle: 'Recette',
      etiquette: 'RECETTE',
      origine: origines.recette,
      partition: 'persist:lfv-recette',
    },
  };
}

function construireDestinations(environnements) {
  const { prod, recette } = environnements;
  return {
    'prod-site': { id: 'prod-site', env: 'prod', type: 'site', libelle: 'Site public', accueil: `${prod.origine}/`, raccourci: '1' },
    'prod-bo': { id: 'prod-bo', env: 'prod', type: 'bo', libelle: 'Back-office', accueil: `${prod.origine}/admin`, raccourci: '2' },
    'rec-site': { id: 'rec-site', env: 'recette', type: 'site', libelle: 'Site public', accueil: `${recette.origine}/`, raccourci: '3' },
    'rec-bo': { id: 'rec-bo', env: 'recette', type: 'bo', libelle: 'Back-office', accueil: `${recette.origine}/admin`, raccourci: '4' },
  };
}

/** Une adresse reste dans le logiciel seulement si elle appartient à l'environnement de la vue. */
function estDansEnvironnement(url, environnement) {
  try {
    return new URL(url).origin === new URL(environnement.origine).origin;
  } catch {
    return false;
  }
}

/** Seuls http et https partent vers le navigateur externe : jamais file:, javascript:, etc. */
function estOuvrableEnExterne(url) {
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

/** Une page du BO où l'on est en train de saisir : on ne la recharge jamais de force. */
function estPageDeSaisie(url) {
  try {
    const { pathname } = new URL(url);
    return /\/(create|edit)(\/|$)/.test(pathname);
  } catch {
    return false;
  }
}

/** Page de connexion du BO : la session de cet environnement est à rouvrir. */
function estPageDeConnexion(url) {
  try {
    return /^\/admin\/login(\/|$)/.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

/** Requête du BO qui peut avoir modifié du contenu (Livewire, formulaires). */
function estRequeteDeModification(methode, url, environnement) {
  if (methode === 'GET' || methode === 'HEAD' || methode === 'OPTIONS') return false;
  if (!estDansEnvironnement(url, environnement)) return false;
  const { pathname } = new URL(url);
  // Les cérémonies passkey ne modifient aucun contenu du site.
  if (pathname.startsWith('/admin/passkey/')) return false;
  return true;
}

/** Même chemin sur l'autre environnement (mode comparaison). */
function cheminRelatif(url) {
  const u = new URL(url);
  return `${u.pathname}${u.search}${u.hash}`;
}

module.exports = {
  ORIGINES_PAR_DEFAUT,
  lireOrigines,
  construireEnvironnements,
  construireDestinations,
  estDansEnvironnement,
  estOuvrableEnExterne,
  estPageDeSaisie,
  estPageDeConnexion,
  estRequeteDeModification,
  cheminRelatif,
};
