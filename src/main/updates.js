'use strict';

// Le guetteur de déploiements.
//
// À chaque déploiement, la prod et la recette publient /version.json
// ({"sha": "...", "deployed_at": "..."}) - voir deploy-recette.yml et
// deploy-production-execute.yml dans le dépôt du site. On le relit à
// intervalle régulier : un sha différent = une nouvelle version en ligne.

const { EventEmitter } = require('node:events');

function lireVersion(json) {
  if (!json || typeof json.sha !== 'string' || !/^[0-9a-f]{7,40}$/i.test(json.sha)) return null;
  return {
    sha: json.sha.toLowerCase(),
    deployeLe: typeof json.deployed_at === 'string' ? json.deployed_at : null,
  };
}

/** 'premiere' (rien de connu), 'identique' ou 'nouvelle'. */
function comparerVersions(connue, lue) {
  if (!connue) return 'premiere';
  return connue.sha === lue.sha ? 'identique' : 'nouvelle';
}

class GuetteurDeVersions extends EventEmitter {
  /**
   * @param {object} options
   * @param {Record<string, {id: string, origine: string}>} options.environnements
   * @param {(url: string) => Promise<any>} options.lireJson  renvoie le JSON ou lève une erreur
   * @param {(env: string) => object|null} options.versionConnue
   */
  constructor({ environnements, lireJson, versionConnue }) {
    super();
    this.environnements = environnements;
    this.lireJson = lireJson;
    this.versionConnue = versionConnue;
    this.etat = {};
    this.minuteur = null;
    for (const id of Object.keys(environnements)) {
      this.etat[id] = { joignable: null, version: versionConnue(id), verifieLe: null };
    }
  }

  demarrer(intervalleSecondes) {
    this.arreter();
    this.verifierTout();
    this.minuteur = setInterval(() => this.verifierTout(), intervalleSecondes * 1000);
  }

  arreter() {
    if (this.minuteur) clearInterval(this.minuteur);
    this.minuteur = null;
  }

  async verifierTout() {
    await Promise.all(Object.keys(this.environnements).map((id) => this.verifier(id)));
  }

  async verifier(id) {
    const env = this.environnements[id];
    const etat = this.etat[id];
    try {
      const lue = lireVersion(await this.lireJson(`${env.origine}/version.json?cockpit=${Date.now()}`));
      if (!lue) throw new Error('version.json illisible');
      const verdict = comparerVersions(etat.version, lue);
      const precedente = etat.version;
      Object.assign(etat, { joignable: true, version: lue, verifieLe: new Date().toISOString() });
      if (verdict !== 'identique') this.emit('version', { env: id, version: lue, precedente, verdict });
    } catch (erreur) {
      const etaitJoignable = etat.joignable;
      Object.assign(etat, { joignable: false, verifieLe: new Date().toISOString() });
      if (etaitJoignable !== false) this.emit('injoignable', { env: id, erreur: String(erreur.message || erreur) });
    }
    this.emit('etat', this.etat);
  }
}

module.exports = { GuetteurDeVersions, lireVersion, comparerVersions };
