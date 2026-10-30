'use strict';

// Réglages et journal du logiciel, dans un fichier JSON du dossier de
// l'utilisateur Windows. Rien de secret ici : les sessions (cookies) sont
// gardées par Chromium, chiffrées avec le compte Windows.

const fs = require('node:fs');
const path = require('node:path');

const REGLAGES_PAR_DEFAUT = {
  rechargerApresDeploiement: true,
  rechargerSiteApresEnregistrement: true,
  jamaisRechargerPendantSaisie: true,
  intervalleVerificationSecondes: 60,
  notificationsWindows: true,
  confirmerDeploiementProduction: true,
  miseAJourAutomatique: true,
};

const INTERVALLES_AUTORISES = [30, 60, 300];
const TAILLE_MAX_JOURNAL = 50;

function normaliserReglages(brut) {
  const r = { ...REGLAGES_PAR_DEFAUT };
  for (const cle of Object.keys(REGLAGES_PAR_DEFAUT)) {
    if (brut && typeof brut[cle] === typeof REGLAGES_PAR_DEFAUT[cle]) r[cle] = brut[cle];
  }
  if (!INTERVALLES_AUTORISES.includes(r.intervalleVerificationSecondes)) {
    r.intervalleVerificationSecondes = REGLAGES_PAR_DEFAUT.intervalleVerificationSecondes;
  }
  return r;
}

class Store {
  constructor(dossier) {
    this.fichier = path.join(dossier, 'lfv-cockpit.json');
    this.donnees = { reglages: { ...REGLAGES_PAR_DEFAUT }, versions: {}, journal: [], derniereVersionVue: null };
    try {
      const brut = JSON.parse(fs.readFileSync(this.fichier, 'utf8'));
      this.donnees = {
        reglages: normaliserReglages(brut.reglages),
        versions: brut.versions && typeof brut.versions === 'object' ? brut.versions : {},
        journal: Array.isArray(brut.journal) ? brut.journal.slice(0, TAILLE_MAX_JOURNAL) : [],
        derniereVersionVue: typeof brut.derniereVersionVue === 'string' ? brut.derniereVersionVue : null,
      };
    } catch {
      // Premier lancement ou fichier illisible : on repart des valeurs par défaut.
    }
  }

  get reglages() {
    return this.donnees.reglages;
  }

  modifierReglages(changements) {
    this.donnees.reglages = normaliserReglages({ ...this.donnees.reglages, ...changements });
    this.enregistrer();
    return this.donnees.reglages;
  }

  version(env) {
    return this.donnees.versions[env] || null;
  }

  memoriserVersion(env, version) {
    this.donnees.versions[env] = version;
    this.enregistrer();
  }

  get journal() {
    return this.donnees.journal;
  }

  /** Version du logiciel dont l'utilisateur a déjà vu les nouveautés. */
  get derniereVersionVue() {
    return this.donnees.derniereVersionVue;
  }

  marquerVersionVue(version) {
    this.donnees.derniereVersionVue = version;
    this.enregistrer();
  }

  ajouterAuJournal(entree) {
    const quand = new Date().toISOString();
    const complete = { id: `${quand}-${Math.random().toString(36).slice(2, 8)}`, quand, ...entree };
    this.donnees.journal.unshift(complete);
    this.donnees.journal.length = Math.min(this.donnees.journal.length, TAILLE_MAX_JOURNAL);
    this.enregistrer();
    return complete;
  }

  entree(id) {
    return this.donnees.journal.find((e) => e.id === id) || null;
  }

  /** Complète une entrée du journal (ex. : le détail d'une version arrivé après coup). */
  modifierEntree(id, changements) {
    const e = this.entree(id);
    if (!e) return null;
    Object.assign(e, changements);
    this.enregistrer();
    return e;
  }

  enregistrer() {
    // Écriture atomique : un fichier temporaire puis un renommage.
    fs.mkdirSync(path.dirname(this.fichier), { recursive: true });
    const tmp = `${this.fichier}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.donnees, null, 2));
    fs.renameSync(tmp, this.fichier);
  }
}

module.exports = { Store, REGLAGES_PAR_DEFAUT, INTERVALLES_AUTORISES, normaliserReglages };
