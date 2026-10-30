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
  for (const enfant of enfants.flat()) {
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
  const fil = { accueil: 'Accueil', comparer: 'Comparer prod / recette', reglages: 'Réglages' }[affichage];
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
      phrases.push(`${env === 'prod' ? 'La prod' : 'La recette'} a reçu une nouvelle version à ${heure(maj.quand)}, ses pages ont été rechargées.`);
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
    const code = /recharg/i.test(e.statut) ? 'live' : /passkey/i.test(e.statut) ? 'attention' : '';
    return h('tr', {},
      h('td', { texte: heure(e.quand) }),
      h('td', { 'data-env': e.env, texte: libelleEnv }),
      h('td', { texte: e.evenement }),
      h('td', { 'data-statut': code || null, texte: e.statut }));
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
    $('#avis-texte').textContent = avis.texte;
  }
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

function rendreEtat() {
  const g = etat.guetteur;
  const court = (env) => (g[env].version ? g[env].version.sha.slice(0, 7) : '—');
  const verifs = [g.prod.verifieLe, g.recette.verifieLe].filter(Boolean).sort();
  $('#etat-versions').textContent = `Prod ${court('prod')} · recette ${court('recette')} · vérifié ${ilYa(verifs[verifs.length - 1])}`;
  $('#etat-appli').textContent = `LFV Cockpit ${etat.version}`;
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
}

function apresMiseEnPage(fn) {
  requestAnimationFrame(() => requestAnimationFrame(fn));
}

function aller(cible) {
  affichage = cible;
  confirmationAffichee = false;
  montrerEcran();
  rendre();
  apresMiseEnPage(() => window.cockpit.afficher(cible, zonesPour(cible)));
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
  aller('accueil');
})();
