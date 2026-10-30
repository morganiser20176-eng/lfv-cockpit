'use strict';

// Interface de LFV Cockpit. Tout le contenu venant des sites (titres,
// adresses) est inséré en textContent, jamais en HTML.

const IMAGES = {
  'prod-site': 'assets/images/hero-calvi-960.webp',
  'prod-bo': 'assets/images/hero-voltige-960.webp',
  'rec-site': 'assets/images/hero-tdm-960.webp',
  'rec-bo': 'assets/images/hero-mig-960.webp',
};
const ORDRE = ['prod-site', 'prod-bo', 'rec-site', 'rec-bo'];
const MAJ_RECENTE_MS = 15 * 60 * 1000;

let etat = null;
let affichage = 'accueil';
let confirmationAffichee = false;
let changelog = [];
// Entrée du journal affichée dans l'écran « Détail d'une mise à jour ».
let detailId = null;

const $ = (sel) => document.querySelector(sel);

function h(tag, props = {}, ...enfants) {
  const el = document.createElement(tag);
  for (const [cle, valeur] of Object.entries(props)) {
    if (valeur === undefined || valeur === null || valeur === false) continue;
    if (cle === 'class') el.className = valeur;
    else if (cle === 'texte') el.textContent = valeur;
    else if (cle.startsWith('on')) el.addEventListener(cle.slice(2), valeur);
    else el.setAttribute(cle, valeur === true ? '' : valeur);
  }
  for (const enfant of enfants.flat(Infinity)) {
    if (enfant === null || enfant === undefined || enfant === false) continue;
    el.append(enfant instanceof Node ? enfant : document.createTextNode(String(enfant)));
  }
  return el;
}

// ---------------------------------------------------------------------------
// Lecture de l'état
// ---------------------------------------------------------------------------

function heure(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const auj = new Date();
  const hm = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === auj.toDateString()) return hm;
  return `${d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} ${hm}`;
}

function ilYa(iso) {
  if (!iso) return 'jamais';
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `il y a ${s} s`;
  const m = Math.round(s / 60);
  return m < 60 ? `il y a ${m} min` : `il y a ${Math.round(m / 60)} h`;
}

function derniereMaj(env) {
  return etat.journal.find((e) => e.env === env && /^Nouvelle version/.test(e.evenement)) || null;
}

function statut(id) {
  const dest = etat.destinations[id];
  const g = etat.guetteur[dest.env];
  if (dest.type === 'bo') {
    const v = etat.vues.destinations[id];
    if (g && g.joignable === false) return { texte: 'Injoignable', code: 'erreur' };
    if (!v || !v.ouverte) return { texte: 'Pas encore ouvert', code: null };
    if (v.connexionRequise) return { texte: 'Passkey requise', code: 'attention' };
    return { texte: 'Connecté', code: 'ok' };
  }
  if (!g || g.joignable === null) return { texte: 'Vérification…', code: null };
  if (g.joignable === false) return { texte: 'Injoignable', code: 'erreur' };
  const maj = derniereMaj(dest.env);
  if (maj && Date.now() - new Date(maj.quand).getTime() < MAJ_RECENTE_MS) return { texte: `Mis à jour à ${heure(maj.quand)}`, code: 'maj' };
  return { texte: 'En ligne', code: 'ok' };
}

function versionCourte(env) {
  const v = etat.guetteur[env] && etat.guetteur[env].version;
  if (!v) return 'inconnue';
  return `${v.sha.slice(0, 7)}${v.deployeLe ? ` · ${heure(v.deployeLe)}` : ''}`;
}

function ligneVersion(env) {
  return `Version ${versionCourte(env)}`;
}

function point(code) {
  return h('span', { class: 'point', 'data-code': code || 'aucun' });
}

// ---------------------------------------------------------------------------
// Rendu
// ---------------------------------------------------------------------------

function rendre() {
  if (!etat) return;
  rendreRail();
  rendreAccueil();
  rendreDestination();
  rendreComparer();
  rendreReglages();
  rendreConfirmation();
  rendreMiseAJour();
  rendreNouveautes();
  rendreDetail();
  rendreEtat();
}

function rendreRail() {
  document.querySelectorAll('[data-aller]').forEach((b) => {
    if (b.dataset.aller === affichage) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  document.querySelectorAll('[data-pastille]').forEach((p) => {
    const s = statut(p.dataset.pastille);
    if (s.code) p.dataset.etat = s.code;
    else delete p.dataset.etat;
    p.title = s.texte;
  });
  const fil = { accueil: 'Accueil', comparer: 'Comparer prod / recette', reglages: 'Réglages', nouveautes: 'Nouveautés', detail: 'Détail d’une mise à jour' }[affichage];
  if (fil) $('#fil').textContent = fil;
  else {
    const dest = etat.destinations[affichage];
    $('#fil').textContent = `${etat.environnements[dest.env].libelle} · ${dest.libelle}`;
  }
}

function rendreAccueil() {
  const n = etat.reglages.intervalleVerificationSecondes;
  const rythme = n === 60 ? 'CHAQUE MINUTE' : n > 60 ? `TOUTES LES ${n / 60} MIN` : `TOUTES LES ${n} S`;
  $('#hero-veille').textContent = `SURVEILLANCE ACTIVE · VÉRIFICATION ${rythme}`;

  const g = etat.guetteur;
  const phrases = [];
  if (g.prod.joignable === null || g.recette.joignable === null) phrases.push('Vérification de la prod et de la recette…');
  else if (g.prod.joignable && g.recette.joignable) phrases.push('Les deux sites sont en ligne.');
  else if (!g.prod.joignable && !g.recette.joignable) phrases.push('Ni la prod ni la recette ne répondent : vérifiez votre connexion internet.');
  else phrases.push(g.prod.joignable ? 'La recette ne répond pas.' : 'La prod ne répond pas !');
  for (const env of ['prod', 'recette']) {
    const maj = derniereMaj(env);
    if (maj && Date.now() - new Date(maj.quand).getTime() < 12 * 3600 * 1000) {
      const resume = resumeDetail(maj.detail);
      phrases.push(`${env === 'prod' ? 'La prod' : 'La recette'} a reçu une nouvelle version à ${heure(maj.quand)}${resume ? ` : ${resume}` : ''}. Ses pages ont été rechargées.`);
    }
  }
  for (const id of ['prod-bo', 'rec-bo']) {
    if (statut(id).code === 'attention') phrases.push(`Le BO ${id === 'prod-bo' ? 'prod' : 'recette'} attend votre passkey.`);
  }
  $('#hero-texte').textContent = phrases.join(' ');

  const tuiles = ORDRE.map((id) => {
    const dest = etat.destinations[id];
    const env = etat.environnements[dest.env];
    const s = statut(id);
    return h('button', { class: 'tuile', onclick: () => aller(id) },
      h('img', { class: 'tuile__image', src: IMAGES[id], alt: '' }),
      h('span', { class: 'tuile__corps' },
        h('span', { class: `puce puce--${dest.env}`, texte: env.etiquette }),
        h('span', { class: 'tuile__titre', texte: dest.libelle }),
        h('span', { class: 'tuile__url', texte: dest.accueil.replace(/^https?:\/\//, '') }),
        h('span', { class: 'tuile__etat' }, point(s.code), s.texte),
        h('span', { class: 'tuile__version', texte: ligneVersion(dest.env) })));
  });
  $('#tuiles').replaceChildren(...tuiles);

  const lignes = etat.journal.slice(0, 8).map((e) => {
    const libelleEnv = e.env === 'prod' ? 'PROD' : e.env === 'recette' ? 'RECETTE' : 'LOGICIEL';
    const code = /recharg|prêt/i.test(e.statut) ? 'live' : /passkey/i.test(e.statut) ? 'attention' : '';
    const resume = resumeDetail(e.detail);
    return h('tr', {},
      h('td', { texte: heure(e.quand) }),
      h('td', { 'data-env': e.env, texte: libelleEnv }),
      h('td', {}, e.evenement, resume ? h('span', { class: 'panneau__resume', texte: resume }) : null),
      h('td', { 'data-statut': code || null, texte: e.statut }),
      h('td', {}, e.sha ? h('button', { class: 'panneau__detail', onclick: () => voirDetail(e.id), texte: 'DÉTAIL ›' }) : null));
  });
  $('#journal').replaceChildren(...lignes);
  $('#journal-vide').hidden = lignes.length > 0;
  const verifs = [g.prod.verifieLe, g.recette.verifieLe].filter(Boolean).sort();
  $('#panneau-verif').textContent = verifs.length ? `Dernière vérification ${new Date(verifs[verifs.length - 1]).toLocaleTimeString('fr-FR')}` : '';
}

function rendreDestination() {
  const dest = etat.destinations[affichage];
  if (!dest) return;
  const env = etat.environnements[dest.env];
  const v = etat.vues.destinations[affichage] || {};
  const puce = $('#adresse-puce');
  puce.textContent = env.etiquette;
  puce.className = `puce puce--${dest.env}`;
  $('#adresse-url').textContent = v.url || dest.accueil;
  $('#adresse-charge').hidden = !v.chargement;
  document.querySelector('[data-nav="reculer"]').disabled = !v.peutReculer;
  document.querySelector('[data-nav="avancer"]').disabled = !v.peutAvancer;

  const bandeau = $('#bandeau');
  bandeau.dataset.env = dest.env;
  $('#bandeau-titre').textContent = env.libelle.toUpperCase();
  $('#bandeau-texte').textContent = dest.env === 'prod'
    ? (dest.type === 'bo' ? 'Ce que vous enregistrez ici est publié sur le vrai site.' : 'Le site que voient vos visiteurs.')
    : 'Environnement de test, base de données séparée.';

  $('#attente').hidden = !(dest.type === 'bo' && etat.vues.rechargementEnAttente[dest.env]);

  const avis = etat.avis;
  const avisVisible = avis && (avis.destination === affichage || (!avis.destination && avis.env === dest.env));
  $('#avis').hidden = !avisVisible;
  if (avisVisible) {
    $('#avis').dataset.ton = avis.ton;
    $('#avis-texte').textContent = avis.resume ? `${avis.texte} ${avis.resume}.` : avis.texte;
  }
  $('#avis-detail').hidden = !(avisVisible && avis.entreeId);
}

function rendreComparer() {
  const v = etat.vues.destinations;
  $('#cmp-url-prod').textContent = (v['cmp-prod'] && v['cmp-prod'].url) || '';
  $('#cmp-url-rec').textContent = (v['cmp-rec'] && v['cmp-rec'].url) || '';
}

function rendreReglages() {
  const r = etat.reglages;
  document.querySelectorAll('[data-reglage]').forEach((c) => { c.checked = Boolean(r[c.dataset.reglage]); });
  $('#r-intervalle').value = String(r.intervalleVerificationSecondes);
  $('#trajet-prod').textContent = etat.environnements.prod.origine.replace(/^https?:\/\//, '');
  $('#trajet-recette').textContent = etat.environnements.recette.origine.replace(/^https?:\/\//, '');

  const cartes = [['prod', 'prod-bo'], ['recette', 'rec-bo']].map(([envId, boId]) => {
    const env = etat.environnements[envId];
    const s = statut(boId);
    return h('section', { class: `carte carte--${envId}` },
      h('h2', { class: 'carte__titre' }, h('span', { class: `puce puce--${envId}`, texte: env.etiquette }), env.libelle),
      h('dl', {},
        h('dt', { texte: 'Back-office' }), h('dd', { class: 'mono', texte: `${env.origine.replace(/^https?:\/\//, '')}/admin` }),
        h('dt', { texte: 'Session' }), h('dd', {}, point(s.code), s.texte),
        h('dt', { texte: 'Version' }), h('dd', { class: 'mono', texte: versionCourte(envId) })),
      h('div', { class: 'carte__actions' },
        h('button', { class: 'bouton bouton--or', onclick: () => aller(boId), texte: 'Ouvrir le BO' }),
        h('button', {
          class: 'bouton bouton--danger',
          texte: 'Effacer la session de ce PC',
          onclick: async () => {
            if (!window.confirm(`Effacer la session ${env.libelle.toLowerCase()} de ce PC ? Il faudra vous reconnecter avec votre passkey.`)) return;
            await window.cockpit.effacerSession(envId);
          },
        })));
  });
  $('#sessions').replaceChildren(...cartes);
}

function rendreConfirmation() {
  const doit = Boolean(etat.confirmation);
  if (doit === confirmationAffichee) return;
  confirmationAffichee = doit;
  montrerEcran();
}

// ---------------------------------------------------------------------------
// Mise à jour du logiciel et nouveautés
// ---------------------------------------------------------------------------

function texteEtatMiseAJour(maj) {
  switch (maj.statut) {
    case 'inactif': return 'Désactivée (logiciel lancé en mode développement)';
    case 'attente': return 'Pas encore vérifiée';
    case 'verification': return 'Recherche en cours…';
    case 'a-jour': return `À jour, vérifié ${ilYa(maj.verifieLe)}`;
    case 'telechargement': return `Version ${maj.version} en téléchargement (${maj.pourcent || 0} %)`;
    case 'pret': return `Version ${maj.version} prête : redémarrez pour l’installer`;
    case 'erreur': return maj.message;
    default: return '—';
  }
}

function dateLongue(iso) {
  if (!iso) return '';
  const [a, m, j] = iso.split('-').map(Number);
  return new Date(a, m - 1, j).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function rendreMiseAJour() {
  const maj = etat.miseAJour;
  const pret = maj.statut === 'pret';
  $('#maj').hidden = !pret;
  if (pret) {
    $('#maj-titre').textContent = `LFV Cockpit ${maj.version} est prêt`;
    $('#maj-resume').textContent = maj.notes && maj.notes.length
      ? maj.notes.filter((n) => n.startsWith('• ')).slice(0, 2).map((n) => n.slice(2)).join(' · ')
      : 'Redémarrez pour installer la nouvelle version et découvrir ses nouveautés.';
  }
  $('#badge-nouveautes').hidden = !(etat.nouveautesAMontrer || pret);
  $('#logiciel-version').textContent = etat.version;
  $('#logiciel-etat').textContent = texteEtatMiseAJour(maj);
  $('#logiciel-verifier').disabled = maj.statut === 'inactif' || maj.statut === 'verification' || maj.statut === 'telechargement';
}

function rendreNouveautes() {
  const maj = etat.miseAJour;
  $('#nouveautes-sous').textContent = `Version installée : ${etat.version}`;

  const prochaine = maj.statut === 'pret' || maj.statut === 'telechargement';
  $('#prochaine').hidden = !prochaine;
  if (prochaine) {
    $('#prochaine-numero').textContent = `Version ${maj.version}`;
    $('#prochaine').querySelector('.etiquette').textContent = maj.statut === 'pret' ? 'PRÊTE À INSTALLER' : `TÉLÉCHARGEMENT ${maj.pourcent || 0} %`;
    // Les lignes « • … » sont des nouveautés, les autres des titres de rubrique.
    const notes = maj.notes && maj.notes.length ? maj.notes : ['• Les détails s’afficheront après l’installation.'];
    $('#prochaine-notes').replaceChildren(...notes.map((n) => (n.startsWith('• ')
      ? h('li', { texte: n.slice(2) })
      : h('li', { class: 'version__rubrique', texte: n }))));
    $('#prochaine-installer').hidden = maj.statut !== 'pret';
  }

  const cartes = changelog.map((v) => {
    const installee = v.version === etat.version;
    return h('section', { class: `version${installee ? ' version--installee' : ''}` },
      h('div', { class: 'version__entete' },
        h('span', { class: 'version__numero', texte: `Version ${v.version}` }),
        v.date ? h('span', { class: 'version__date', texte: dateLongue(v.date) }) : null,
        installee ? h('span', { class: 'etiquette', texte: 'INSTALLÉE' }) : null),
      v.sections.map((section) => [
        h('h3', { class: 'version__rubrique', texte: section.titre }),
        h('ul', { class: 'version__liste' }, section.elements.map((e) => h('li', { texte: e }))),
      ]));
  });
  $('#versions').replaceChildren(...cartes);
}

// ---------------------------------------------------------------------------
// Détail d'une mise à jour du site
// ---------------------------------------------------------------------------

function resumeDetail(detail) {
  if (!detail || detail.statut !== 'ok' || !detail.changements || detail.changements.length === 0) return null;
  const [premier, ...reste] = detail.changements;
  return reste.length ? `${premier.titre} (+${reste.length})` : premier.titre;
}

function dateHeure(iso) {
  const d = new Date(iso);
  return `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
}

const MESSAGES_DETAIL = {
  chargement: () => 'Lecture du détail dans le BO…',
  connexion: (env) => `Le détail est protégé par votre passkey : connectez-vous au BO ${env.libelle.toLowerCase()} pour le voir. Il s’affichera tout seul ici.`,
  interdit: () => 'Votre compte BO n’a pas le droit « Déploiement » nécessaire pour voir ce détail.',
  erreur: () => 'Le détail n’a pas pu être lu. Le site ne le publie peut-être pas encore : réessayez plus tard.',
  perime: () => 'Une version plus récente a été déployée depuis : le BO ne décrit que la version en ligne.',
  ancien: () => 'Cette mise à jour a été détectée avant que LFV Cockpit sache en lire le détail.',
};

function rendreDetail() {
  if (affichage !== 'detail') return;
  const entree = etat.journal.find((e) => e.id === detailId);
  if (!entree) {
    $('#detail-titre').textContent = 'Mise à jour introuvable';
    $('#changements').replaceChildren();
    return;
  }
  const env = etat.environnements[entree.env];
  const puce = $('#detail-puce');
  puce.textContent = env.etiquette;
  puce.className = `puce puce--${entree.env}`;
  $('#detail-titre').textContent = `Nouvelle version ${entree.sha.slice(0, 7)}`;
  $('#detail-sous').textContent = `${dateHeure(entree.quand)}${entree.precedente ? ` · remplace la version ${entree.precedente.slice(0, 7)}` : ''}`;

  const detail = entree.detail || { statut: 'ancien' };
  const message = detail.statut === 'ok'
    ? (detail.changements && detail.changements.length ? null : (detail.indisponible || 'Aucun changement décrit pour cette version.'))
    : MESSAGES_DETAIL[detail.statut](env);
  $('#detail-etat').hidden = !message;
  $('#detail-etat-texte').textContent = message || '';
  $('#detail-ouvrir-bo').hidden = detail.statut !== 'connexion';
  $('#detail-reessayer').hidden = !['connexion', 'erreur'].includes(detail.statut);

  const lieu = (chemin) => (/^\/admin(\/|$|\?)/.test(chemin) ? `BO ${env.etiquette.toLowerCase()}` : `Site ${env.etiquette.toLowerCase()}`);
  const cartes = (detail.statut === 'ok' && detail.changements ? detail.changements : []).map((c) => h('article', { class: 'changement' },
    h('div', { class: 'changement__entete' },
      c.pr ? h('span', { class: 'etiquette', texte: `#${c.pr}` }) : null,
      h('h2', { class: 'changement__titre', texte: c.titre })),
    c.resume ? h('p', { class: 'changement__resume', texte: c.resume }) : null,
    c.lignes.length ? h('ul', { class: 'version__liste' }, c.lignes.map((l) => h('li', { texte: l }))) : null,
    c.liens.length ? h('div', { class: 'changement__liens' },
      c.liens.map((chemin) => h('button', { class: 'lien-page', onclick: () => ouvrirChemin(entree.env, chemin) },
        h('span', { class: 'lien-page__lieu', texte: lieu(chemin) }),
        h('span', { class: 'mono', texte: chemin }),
        '→')),
      c.liensDeduits ? h('small', { texte: 'Pages déduites des fichiers modifiés par ce changement.' }) : null) : null));
  $('#changements').replaceChildren(...cartes);

  const autres = detail.statut === 'ok' && detail.autres ? detail.autres : [];
  $('#autres').hidden = autres.length === 0;
  $('#autres-liste').replaceChildren(...autres.map((a) => h('li', { texte: a })));
}

function rendreEtat() {
  const g = etat.guetteur;
  const court = (env) => (g[env].version ? g[env].version.sha.slice(0, 7) : '—');
  const verifs = [g.prod.verifieLe, g.recette.verifieLe].filter(Boolean).sort();
  $('#etat-versions').textContent = `Prod ${court('prod')} · recette ${court('recette')} · vérifié ${ilYa(verifs[verifs.length - 1])}`;
  const maj = etat.miseAJour;
  const suffixe = maj.statut === 'pret' ? ` · ${maj.version} prête` : maj.statut === 'a-jour' ? ' · à jour' : '';
  $('#etat-appli').textContent = `LFV Cockpit ${etat.version}${suffixe}`;
}

// ---------------------------------------------------------------------------
// Navigation et zones des vues web
// ---------------------------------------------------------------------------

function zone(sel) {
  const r = $(sel).getBoundingClientRect();
  return { x: Math.round(r.left) + 1, y: Math.round(r.top) + 1, width: Math.max(0, Math.round(r.width) - 2), height: Math.max(0, Math.round(r.height) - 2) };
}

function zonesPour(cible) {
  if (etat && etat.destinations[cible]) return [zone('#zone-principale')];
  if (cible === 'comparer') return [zone('#zone-gauche'), zone('#zone-droite')];
  return null;
}

function montrerEcran() {
  const estDest = Boolean(etat && etat.destinations[affichage]);
  $('#ecran-confirmation').hidden = !confirmationAffichee;
  $('#ecran-accueil').hidden = confirmationAffichee || affichage !== 'accueil';
  $('#ecran-reglages').hidden = confirmationAffichee || affichage !== 'reglages';
  $('#ecran-comparer').hidden = confirmationAffichee || affichage !== 'comparer';
  $('#ecran-destination').hidden = confirmationAffichee || !estDest;
  $('#ecran-nouveautes').hidden = confirmationAffichee || affichage !== 'nouveautes';
  $('#ecran-detail').hidden = confirmationAffichee || affichage !== 'detail';
}

function apresMiseEnPage(fn) {
  requestAnimationFrame(() => requestAnimationFrame(fn));
}

function aller(cible) {
  affichage = cible;
  if (cible === 'nouveautes' && etat && etat.nouveautesAMontrer) window.cockpit.nouveautesVues();
  confirmationAffichee = false;
  montrerEcran();
  rendre();
  return new Promise((fini) => apresMiseEnPage(() => window.cockpit.afficher(cible, zonesPour(cible)).then(fini)));
}

function voirDetail(id) {
  detailId = id;
  aller('detail');
}

/** Bouton « Où voir » : la bonne vue (site ou BO) de l'environnement, à la bonne page. */
async function ouvrirChemin(env, chemin) {
  const bo = /^\/admin(\/|$|\?)/.test(chemin);
  const destination = env === 'prod' ? (bo ? 'prod-bo' : 'prod-site') : (bo ? 'rec-bo' : 'rec-site');
  await aller(destination);
  await window.cockpit.ouvrirChemin(env, chemin);
}

function envoyerZones() {
  if (confirmationAffichee) return;
  const zones = zonesPour(affichage);
  if (zones) window.cockpit.zones(zones);
}

async function repondreDeploiement(confirme) {
  confirmationAffichee = false;
  montrerEcran();
  apresMiseEnPage(() => window.cockpit.deploiement(confirme, zonesPour(affichage)));
}

function brancher() {
  document.querySelectorAll('[data-aller]').forEach((b) => b.addEventListener('click', () => aller(b.dataset.aller)));
  document.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => window.cockpit.naviguer(b.dataset.nav)));

  $('#copier-url').addEventListener('click', async () => {
    await window.cockpit.copierUrl();
    const b = $('#copier-url');
    b.textContent = 'Lien copié';
    setTimeout(() => { b.textContent = 'Copier le lien'; }, 1500);
  });
  $('#ouvrir-externe').addEventListener('click', () => window.cockpit.ouvrirExterne());
  $('#recharger-maintenant').addEventListener('click', () => {
    const dest = etat.destinations[affichage];
    if (dest) window.cockpit.rechargerMaintenant(dest.env);
  });
  $('#avis-fermer').addEventListener('click', () => window.cockpit.fermerAvis());
  $('#avis-detail').addEventListener('click', () => etat.avis && etat.avis.entreeId && voirDetail(etat.avis.entreeId));
  $('#detail-retour').addEventListener('click', () => aller('accueil'));
  $('#detail-reessayer').addEventListener('click', () => detailId && window.cockpit.reessayerDetail(detailId));
  $('#detail-ouvrir-bo').addEventListener('click', () => {
    const entree = etat.journal.find((e) => e.id === detailId);
    if (entree) aller(entree.env === 'prod' ? 'prod-bo' : 'rec-bo');
  });
  $('#form-comparer').addEventListener('submit', (e) => {
    e.preventDefault();
    window.cockpit.comparerChemin($('#chemin').value);
  });
  $('#deploiement-ok').addEventListener('click', () => repondreDeploiement(true));
  $('#deploiement-annuler').addEventListener('click', () => repondreDeploiement(false));

  document.querySelectorAll('[data-reglage]').forEach((c) => c.addEventListener('change', () => {
    window.cockpit.reglages({ [c.dataset.reglage]: c.checked });
  }));
  $('#r-intervalle').addEventListener('change', (e) => window.cockpit.reglages({ intervalleVerificationSecondes: Number(e.target.value) }));
  $('#verifier-maintenant').addEventListener('click', () => window.cockpit.verifierMaintenant());
  $('#logiciel-verifier').addEventListener('click', () => window.cockpit.majVerifier());
  $('#maj-voir').addEventListener('click', () => aller('nouveautes'));
  $('#maj-installer').addEventListener('click', () => window.cockpit.majInstaller());
  $('#prochaine-installer').addEventListener('click', () => window.cockpit.majInstaller());

  const observateur = new ResizeObserver(() => envoyerZones());
  ['#zone-principale', '#zone-gauche', '#zone-droite'].forEach((s) => observateur.observe($(s)));
  window.addEventListener('resize', envoyerZones);

  window.cockpit.surEtat((nouveau) => {
    etat = nouveau;
    rendre();
    apresMiseEnPage(envoyerZones);
  });
  window.cockpit.surAller((cible) => aller(cible));
  setInterval(() => etat && rendreEtat(), 5000);
}

(async function lancer() {
  brancher();
  etat = await window.cockpit.etat();
  changelog = await window.cockpit.changelog();
  // Première ouverture d'une nouvelle version : on montre d'abord ses nouveautés.
  aller(etat.nouveautesAMontrer ? 'nouveautes' : 'accueil');
})();
