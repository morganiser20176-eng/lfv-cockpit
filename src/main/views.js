'use strict';

// Les vues web : une par destination (site / BO, prod / recette), plus deux
// pour le mode comparaison. Chaque vue affiche le VRAI site ou le VRAI BO :
// rien n'est copié en local, chaque enregistrement part directement sur
// l'environnement affiché.

const { EventEmitter } = require('node:events');
const { WebContentsView, Menu, clipboard, session, shell } = require('electron');
const {
  estDansEnvironnement,
  estOuvrableEnExterne,
  estPageDeSaisie,
  estPageDeConnexion,
  estRequeteDeModification,
  cheminRelatif,
} = require('./environments');

const PERMISSIONS_AUTORISEES = new Set(['fullscreen', 'clipboard-sanitized-write']);
const PAGE_DEPLOIEMENT = /^\/admin\/deploiement-production(\/|$)/;

/** L'agent utilisateur de Chrome, sans les mentions Electron / LFV Cockpit. */
function agentNavigateur(ua) {
  return ua.replace(/\s(Electron|lfv-cockpit|LFV Cockpit)\/\S+/gi, '');
}

class GestionnaireDeVues extends EventEmitter {
  constructor({ fenetre, environnements, destinations, reglages }) {
    super();
    this.fenetre = fenetre;
    this.environnements = environnements;
    this.destinations = {
      ...destinations,
      'cmp-prod': { id: 'cmp-prod', env: 'prod', type: 'site', libelle: 'Comparer · prod', accueil: `${environnements.prod.origine}/` },
      'cmp-rec': { id: 'cmp-rec', env: 'recette', type: 'site', libelle: 'Comparer · recette', accueil: `${environnements.recette.origine}/` },
    };
    this.reglages = reglages;
    this.vues = {};
    this.visibles = [];
    // Par environnement : le site a-t-il été potentiellement modifié depuis le BO ?
    this.sitePerime = { prod: false, recette: false };
    // Par environnement : une nouvelle version attend la fin d'une saisie dans le BO.
    this.rechargementEnAttente = { prod: false, recette: false };
    this.deploiementConfirmeJusqua = 0;
    this.synchroComparaison = { compte: 0, depuis: 0 };
    for (const env of Object.values(environnements)) this.preparerSession(env);
  }

  preparerSession(env) {
    const ses = session.fromPartition(env.partition);
    ses.setUserAgent(agentNavigateur(ses.getUserAgent()));
    ses.setPermissionRequestHandler((_wc, permission, rappel) => rappel(PERMISSIONS_AUTORISEES.has(permission)));
    ses.setPermissionCheckHandler((_wc, permission) => PERMISSIONS_AUTORISEES.has(permission));
    // Une requête de modification venue du BO => le site de cet environnement
    // sera rechargé la prochaine fois qu'on l'affiche.
    ses.webRequest.onCompleted((details) => {
      const bo = this.vues[env.id === 'prod' ? 'prod-bo' : 'rec-bo'];
      if (!bo || details.webContentsId !== bo.webContents.id) return;
      if (details.statusCode >= 400) return;
      if (!estRequeteDeModification(details.method, details.url, env)) return;
      this.sitePerime[env.id] = true;
    });
  }

  vue(id) {
    if (this.vues[id]) return this.vues[id];
    const dest = this.destinations[id];
    const env = this.environnements[dest.env];
    const vue = new WebContentsView({
      webPreferences: {
        partition: env.partition,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        spellcheck: true,
      },
    });
    vue.setBackgroundColor('#080c1a');
    if (typeof vue.setBorderRadius === 'function') vue.setBorderRadius(9);
    const wc = vue.webContents;

    // Liens vers un autre site (YouTube, Discord, FSHub...) : navigateur par défaut.
    wc.setWindowOpenHandler(({ url }) => {
      if (estDansEnvironnement(url, env)) wc.loadURL(url);
      else if (estOuvrableEnExterne(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
    wc.on('will-navigate', (evt) => {
      const url = evt.url;
      if (!estDansEnvironnement(url, env)) {
        evt.preventDefault();
        if (estOuvrableEnExterne(url)) shell.openExternal(url);
        return;
      }
      if (dest.type === 'bo' && this.reglages().confirmerDeploiementProduction && this.demandeConfirmationDeploiement(url)) {
        evt.preventDefault();
        this.emit('confirmer-deploiement', { destination: id, url });
      }
    });

    const signaler = () => this.emit('change', id);
    for (const nom of ['did-start-loading', 'did-stop-loading', 'did-navigate', 'did-navigate-in-page', 'page-title-updated']) {
      wc.on(nom, signaler);
    }
    wc.on('did-fail-load', (_e, code, description, url, principal) => {
      if (principal && code !== -3) this.emit('erreur-chargement', { destination: id, code, description, url });
    });
    if (id === 'cmp-prod' || id === 'cmp-rec') {
      const synchroniser = () => this.synchroniserComparaison(id);
      wc.on('did-navigate', synchroniser);
      wc.on('did-navigate-in-page', synchroniser);
    }
    wc.on('context-menu', (_e, params) => this.menuContextuel(wc, params));
    wc.on('before-input-event', (evt, input) => this.emit('touche', evt, input));

    this.vues[id] = vue;
    wc.loadURL(dest.accueil);
    return vue;
  }

  demandeConfirmationDeploiement(url) {
    try {
      return PAGE_DEPLOIEMENT.test(new URL(url).pathname) && Date.now() > this.deploiementConfirmeJusqua;
    } catch {
      return false;
    }
  }

  confirmerDeploiement(destination, url) {
    // Une confirmation vaut 10 minutes : pas de question à chaque clic.
    this.deploiementConfirmeJusqua = Date.now() + 10 * 60 * 1000;
    this.vue(destination).webContents.loadURL(url);
  }

  /** Affiche les vues demandées dans les zones mesurées par l'interface. */
  afficher(ids, zones) {
    for (const id of this.visibles) {
      if (!ids.includes(id) && this.vues[id]) this.fenetre.contentView.removeChildView(this.vues[id]);
    }
    ids.forEach((id, i) => {
      const vue = this.vue(id);
      if (!this.visibles.includes(id)) this.fenetre.contentView.addChildView(vue);
      if (zones && zones[i]) vue.setBounds(zones[i]);
      this.rafraichirSiPerime(id);
    });
    this.visibles = [...ids];
  }

  placer(zones) {
    this.visibles.forEach((id, i) => {
      if (zones[i] && this.vues[id]) this.vues[id].setBounds(zones[i]);
    });
  }

  rafraichirSiPerime(id) {
    const dest = this.destinations[id];
    if (dest.type !== 'site' || !this.sitePerime[dest.env] || !this.reglages().rechargerSiteApresEnregistrement) return;
    this.sitePerime[dest.env] = false;
    if (this.vues[id]) {
      this.vues[id].webContents.reload();
      this.emit('site-rafraichi', { destination: id });
    }
  }

  /** Nouvelle version en ligne : on recharge ce qui peut l'être sans rien perdre. */
  nouvelleVersion(envId) {
    const ids = Object.keys(this.vues).filter((id) => this.destinations[id].env === envId);
    for (const id of ids) {
      const wc = this.vues[id].webContents;
      const enSaisie = this.destinations[id].type === 'bo' && estPageDeSaisie(wc.getURL());
      if (enSaisie && this.reglages().jamaisRechargerPendantSaisie) {
        this.rechargementEnAttente[envId] = true;
      } else {
        wc.reload();
      }
    }
    this.emit('change', null);
  }

  rechargerMaintenant(envId) {
    this.rechargementEnAttente[envId] = false;
    for (const id of Object.keys(this.vues)) {
      if (this.destinations[id].env === envId) this.vues[id].webContents.reload();
    }
    this.emit('change', null);
  }

  naviguer(id, action) {
    const vue = this.vues[id];
    if (!vue) return;
    const wc = vue.webContents;
    if (action === 'reculer' && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
    else if (action === 'avancer' && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
    else if (action === 'recharger') {
      if (this.rechargementEnAttente[this.destinations[id].env]) this.rechargementEnAttente[this.destinations[id].env] = false;
      wc.reload();
    } else if (action === 'accueil') wc.loadURL(this.destinations[id].accueil);
  }

  comparerChemin(chemin) {
    const propre = `/${String(chemin || '').replace(/^\/+/, '')}`;
    this.vue('cmp-prod').webContents.loadURL(`${this.environnements.prod.origine}${propre}`);
    this.vue('cmp-rec').webContents.loadURL(`${this.environnements.recette.origine}${propre}`);
  }

  synchroniserComparaison(source) {
    const autre = source === 'cmp-prod' ? 'cmp-rec' : 'cmp-prod';
    const vueSource = this.vues[source];
    const vueAutre = this.vues[autre];
    if (!vueSource || !vueAutre) return;
    const chemin = cheminRelatif(vueSource.webContents.getURL());
    if (cheminRelatif(vueAutre.webContents.getURL() || this.destinations[autre].accueil) === chemin) return;
    // Garde-fou : deux sites qui se redirigent l'un l'autre ne doivent pas boucler.
    const maintenant = Date.now();
    if (maintenant - this.synchroComparaison.depuis > 3000) this.synchroComparaison = { compte: 0, depuis: maintenant };
    if (++this.synchroComparaison.compte > 4) return;
    const origine = this.environnements[this.destinations[autre].env].origine;
    vueAutre.webContents.loadURL(`${origine}${chemin}`);
  }

  effacerSession(envId) {
    const env = this.environnements[envId];
    for (const id of Object.keys(this.vues)) {
      if (this.destinations[id].env !== envId) continue;
      if (this.visibles.includes(id)) this.fenetre.contentView.removeChildView(this.vues[id]);
      this.vues[id].webContents.close();
      delete this.vues[id];
    }
    this.visibles = this.visibles.filter((id) => this.vues[id]);
    return session.fromPartition(env.partition).clearStorageData();
  }

  etat() {
    const etat = {};
    for (const [id, dest] of Object.entries(this.destinations)) {
      const vue = this.vues[id];
      if (!vue) {
        etat[id] = { ouverte: false, url: dest.accueil };
        continue;
      }
      const wc = vue.webContents;
      const url = wc.getURL() || dest.accueil;
      etat[id] = {
        ouverte: true,
        url,
        titre: wc.getTitle(),
        chargement: wc.isLoading(),
        peutReculer: wc.navigationHistory.canGoBack(),
        peutAvancer: wc.navigationHistory.canGoForward(),
        connexionRequise: dest.type === 'bo' && estPageDeConnexion(url),
      };
    }
    return { destinations: etat, rechargementEnAttente: { ...this.rechargementEnAttente } };
  }

  menuContextuel(wc, params) {
    const items = [];
    if (params.linkURL) {
      items.push({ label: 'Copier l’adresse du lien', click: () => clipboard.writeText(params.linkURL) });
      if (estOuvrableEnExterne(params.linkURL)) {
        items.push({ label: 'Ouvrir le lien dans le navigateur', click: () => shell.openExternal(params.linkURL) });
      }
      items.push({ type: 'separator' });
    }
    if (params.isEditable) {
      items.push({ label: 'Couper', role: 'cut', enabled: params.editFlags.canCut });
      items.push({ label: 'Copier', role: 'copy', enabled: params.editFlags.canCopy });
      items.push({ label: 'Coller', role: 'paste', enabled: params.editFlags.canPaste });
      items.push({ label: 'Tout sélectionner', role: 'selectAll' });
    } else if (params.selectionText) {
      items.push({ label: 'Copier', role: 'copy' });
    }
    if (items.length && items[items.length - 1].type !== 'separator') items.push({ type: 'separator' });
    items.push({ label: 'Recharger la page', click: () => wc.reload() });
    Menu.buildFromTemplate(items).popup({ window: this.fenetre });
  }
}

module.exports = { GestionnaireDeVues, agentNavigateur };
