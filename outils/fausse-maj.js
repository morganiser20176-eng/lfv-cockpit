'use strict';

// Fausse mise à jour, pour voir le bandeau et l'écran « Nouveautés » en
// développement : LFV_COCKPIT_FAUSSE_MAJ=1 npm start
// Jamais utilisée par le logiciel installé (ce dossier n'est pas embarqué).

const { EventEmitter } = require('node:events');

class FausseMiseAJour extends EventEmitter {
  async checkForUpdates() {
    const info = {
      version: '9.9.9',
      releaseNotes: '<h3>Nouveautés</h3><ul><li><strong>Exemple</strong> : une nouveauté de démonstration.</li><li>Une deuxième nouveauté.</li></ul>',
    };
    this.emit('checking-for-update');
    setTimeout(() => this.emit('update-available', info), 400);
    setTimeout(() => this.emit('download-progress', { percent: 57 }), 800);
    setTimeout(() => this.emit('update-downloaded', info), 1400);
  }

  quitAndInstall() {
    console.log('[fausse mise à jour] le logiciel redémarrerait ici pour installer la version 9.9.9');
  }
}

module.exports = { FausseMiseAJour };
