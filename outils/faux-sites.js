'use strict';

// Deux FAUX sites (prod et recette) pour essayer LFV Cockpit sans toucher
// aux vrais. Lancement :
//
//   node outils/faux-sites.js
//   LFV_COCKPIT_ORIGINS='{"prod":"http://127.0.0.1:8101","recette":"http://127.0.0.1:8102"}' npm start
//
// Simuler un déploiement : ouvrir http://127.0.0.1:8102/__deployer
// La « passkey » de ces faux sites est un simple bouton : rien de réel.

const http = require('node:http');
const crypto = require('node:crypto');

function page(titre, env, corps) {
  const couleur = env === 'prod' ? '#ff8a70' : '#9db3e6';
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${titre}</title>
<style>body{margin:0;font-family:Arial,sans-serif;background:#080c1a;color:#ede7d6}
header{display:flex;gap:18px;align-items:center;padding:14px 24px;background:#0d1428;border-bottom:2px solid ${couleur}}
header b{color:#e0a61c;letter-spacing:.1em}a{color:#e0a61c}main{padding:28px 24px;line-height:1.6}
.etiquette{color:${couleur};font-weight:bold}button{padding:10px 16px;border-radius:8px;border:0;background:#e0a61c;font-weight:bold;cursor:pointer}
input,textarea{display:block;margin:6px 0 14px;padding:8px;width:320px;background:#16213a;color:#ede7d6;border:1px solid #2c3140;border-radius:6px}</style>
</head><body><header><b>LES FOUS VOLANTS</b><span class="etiquette">FAUX SITE ${env.toUpperCase()}</span>
<a href="/">Accueil</a><a href="/tours">Tours</a><a href="/admin">BO</a><a href="https://www.youtube.com/">YouTube</a></header><main>${corps}</main></body></html>`;
}

function demarrer(env, port) {
  let sha = crypto.randomBytes(20).toString('hex');
  let deployeLe = new Date().toISOString();

  http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const connecte = /(?:^|;\s*)connecte=1/.test(req.headers.cookie || '');
    const html = (code, contenu, entetes = {}) => {
      res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8', ...entetes });
      res.end(contenu);
    };

    if (url.pathname === '/version.json') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ sha, deployed_at: deployeLe }));
    }
    if (url.pathname === '/__deployer') {
      sha = crypto.randomBytes(20).toString('hex');
      deployeLe = new Date().toISOString();
      return html(200, page('Déployé', env, `<p>Nouvelle version ${sha.slice(0, 7)} « déployée ».</p>`));
    }
    if (url.pathname === '/') {
      return html(200, page(`Accueil ${env}`, env, `<h1>Faux site ${env}</h1><p>Version en ligne : <code>${sha.slice(0, 7)}</code></p><p><a href="/tours">Voir les tours</a></p>`));
    }
    if (url.pathname === '/tours') {
      return html(200, page(`Tours ${env}`, env, '<h1>Tours</h1><p>Page de test.</p>'));
    }
    if (url.pathname === '/admin/login') {
      return html(200, page('Connexion BO', env, `<h1>Connexion au back-office</h1>
<form method="post" action="/admin/passkey/assertion/verify"><button>Se connecter avec une passkey (simulé)</button></form>`));
    }
    if (url.pathname === '/admin/passkey/assertion/verify' && req.method === 'POST') {
      return html(302, '', { Location: '/admin', 'Set-Cookie': 'connecte=1; Path=/; HttpOnly; SameSite=Lax' });
    }
    if (url.pathname.startsWith('/admin')) {
      if (!connecte) return html(302, '', { Location: '/admin/login' });
      if (url.pathname === '/admin/tours/1/edit') {
        return html(200, page('Modifier un tour', env, `<h1>Modifier le tour</h1><label>Titre<input value="Tour de Corse"></label>
<button onclick="fetch('/livewire/update',{method:'POST'}).then(()=>this.textContent='Enregistré')">Enregistrer</button>`));
      }
      if (url.pathname === '/admin/deploiement-production') {
        return html(200, page('Déploiement production', env, '<h1>Déploiement production</h1><p>Faux écran de déploiement.</p>'));
      }
      return html(200, page('Tableau de bord', env, `<h1>Tableau de bord (faux BO ${env})</h1>
<p><a href="/admin/tours/1/edit">Modifier un tour</a></p><p><a href="/admin/deploiement-production">Déploiement production</a></p>`));
    }
    if (url.pathname === '/livewire/update' && req.method === 'POST') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end('{}');
    }
    html(404, page('Introuvable', env, '<h1>404</h1>'));
  }).listen(port, '127.0.0.1', () => console.log(`Faux site ${env} : http://127.0.0.1:${port}`));
}

demarrer('prod', Number(process.env.PORT_PROD || 8101));
demarrer('recette', Number(process.env.PORT_RECETTE || 8102));
