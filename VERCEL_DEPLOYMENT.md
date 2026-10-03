# Déploiement sur Vercel

## Vue d'ensemble

Cette application Expo est déployable sur **Vercel** avec une architecture sécurisée :

- **Frontend web** : build statique Expo exporté en HTML/CSS/JS (sans secret relay)
- **API proxy** : fonctions Vercel à `/api/relay/*` qui valident le mot de passe et transmettent au relay backend
- **Authentification web** : mot de passe stocké en localStorage, validé côté serveur en SHA256 timing-safe

## Prérequis

1. **GitHub** : le repo est déjà à `https://github.com/jinshiagencys-byte/uuptime-kuma-mobile`
2. **Compte Vercel** : créé/connecté à GitHub (offert)
3. **Relay backend** : URL + secret du serveur relay (ex: `https://railway-production-d365.up.railway.app`)
4. **Mot de passe web** : un secret que tu veux utiliser pour accéder au PWA

## Étapes de déploiement

### 1. Connecter le repo à Vercel

1. Va sur https://vercel.com
2. Clique sur **Add New…** → **Project**
3. Sélectionne ton repo `uuptime-kuma-mobile`
4. Clique **Import**

### 2. Configurer le build

Vercel devrait auto-détecter, mais **confirme** :

| Champ | Valeur |
|-------|--------|
| **Build Command** | `npx expo export --platform web` |
| **Output Directory** | `dist` |
| **Install Command** | `npm install` |
| **Node.js Version** | `18.x` ou `20.x` au minimum |

### 3. Ajouter les variables d'environnement

Clique sur **Environment Variables** et ajoute :

| Clé | Valeur | Note |
|-----|--------|------|
| **APP_PASSWORD** | Ton mot de passe web (ex: `monMotDePasse123`) | Le mot de passe que les utilisateurs web entrent. Can be any complex string. |
| **RELAY_URL** | URL du serveur relay (ex: `https://railway-production-d365.up.railway.app`) | URL complète du serveur relay backend |
| **RELAY_SECRET** | Secret du serveur relay | Le secret pour la communication Vercel → relay backend |

**Important** :
- `APP_PASSWORD` sera utilisé par le proxy Vercel pour valider les requêtes web
- `RELAY_URL` et `RELAY_SECRET` restent **secrets côté serveur** et ne sont jamais exposés au client web
- Ne mets **JAMAIS** de secret en `EXPO_PUBLIC_*` sinon ils apparaîtraient dans le bundle web

### 4. Déployer

Clique sur **Deploy**.

Vercel va :
1. Cloner ton repo
2. Installer les dépendances
3. Faire `npx expo export --platform web`
4. Publier le site static + les API routes

Temps estimé : **2-5 minutes**

## URLs après déploiement

Une fois déployé, Vercel te donne des URLs :

- **Site web** : `https://[votre-projet].vercel.app`
- **API relay** : `https://[votre-projet].vercel.app/api/relay/*`

## Utilisation du PWA web

1. Ouvre le site : `https://[votre-projet].vercel.app`
2. Tu vois l'écran de login
3. Entre le mot de passe que tu as défini dans `APP_PASSWORD`
4. Le PWA se sauvegarde dans le cache du navigateur
5. Sur iPhone : tu peux l'ajouter à l'écran d'accueil (Share → "Add to Home Screen")

## Architecture de sécurité

```
┌─ Web Browser ────────────────────────────────────┐
│  App en SPA                                       │
│  - localStorage('app_password') stocké            │
│  - Requête GET /api/relay/monitors               │
│    avec header x-app-password                    │
└──────────────┬──────────────────────────────────┘
               │
               ↓
┌─ Vercel Edge Function /api/relay ────────────────┐
│  - Lit x-app-password du header                  │
│  - Hash SHA256 + timing-safe compare             │
│  - Compare avec APP_PASSWORD côté serveur        │
│  - Si OK: transfère au relay backend avec secret │
│  - Si pas OK: retourne 401 Unauthorized          │
│  - localStorage supprimé sur 401                 │
└──────────────┬──────────────────────────────────┘
               │
               ↓
┌─ Votre Relay Backend ─────────────────────────────┐
│  - Reçoit requête avec x-relay-secret             │
│  - Retourne les monitors, historique, etc.       │
└────────────────────────────────────────────────────┘
```

### Points clés de sécurité

1. **Pas de secret relay dans le web bundle**
   - Les variables `RELAY_URL` et `RELAY_SECRET` ne sont pas `EXPO_PUBLIC_*`
   - Elles ne peuvent pas être lues par le navigateur
   - Elles existent **uniquement** dans l'environnement Vercel

2. **Validation timing-safe du mot de passe**
   - Le proxy compare `SHA256(password_utilisateur)` avec `SHA256(APP_PASSWORD)`
   - Utilise `crypto.timingSafeEqual()` pour éviter les timing attacks

3. **Isolation du relay secret**
   - Seule la fonction Vercel peut utiliser `RELAY_SECRET`
   - Le client web ne le voit jamais

## Dépannage

### Le site retourne 500 "Server misconfigured"

**Cause** : les variables d'env `RELAY_URL` ou `RELAY_SECRET` ne sont pas définies.

**Solution** :
1. Va dans Project Settings → Environment Variables
2. Vérifie que `RELAY_URL` et `RELAY_SECRET` existent
3. Redéploie (Project → Deployments → dernière version → Redeploy)

### Login échoue sans raison (401)

**Cause** : le mot de passe entré ne correspond pas à `APP_PASSWORD`.

**Solution** :
1. Vérifie que tu as bien saisi `APP_PASSWORD` dans les env vars Vercel
2. Redéploie pour que les variables soient chargées
3. Réessaye sur le site

### Les requêtes vont au relay direct au lieu du proxy

**Cause** : tu utilises une ancienne version du bundle qui avait l'URL relay en hardcoded.

**Solution** :
1. Force un rebuild : va dans Deployment et clique Redeploy
2. Vide le cache du navigateur (F12 → Application → Clear Storage)

## Fichiers clés du déploiement

- `vercel.json` : config de déploiement Vercel
- `.vercelignore` : exclut `.env` lors du déploiement
- `api/relay/[...path].ts` : la fonction serverless qui valide et proxy les appels
- `dist/` : généré à la compilation, contient le site web static
- `.env` : **JAMAIS** committé, tu le gardes local ou dans GitHub Secrets pour le CI

## Mise à jour du code

Une fois déployé, si tu veux pousser une mise à jour :

1. Fais les changements localement
2. Commit et push vers GitHub
3. Vercel voit le push automatiquement et redéploie

Pas besoin de faire quoi que ce soit manuellement après le premier déploiement.

## Coûts

**Vercel Free** te donne :

- 100 GB bandwidth/mo
- 100 deployments/mo
- Serverless functions : 100 hours/mo
- (Cf. https://vercel.com/pricing)

Pour un petit PWA perso, c'est **généralement suffisant**. Si tu montes fort en trafic, tu peux passer en plan payant.

---

**C'est tout !** Une fois déployé, ton PWA est accessible et sécurisé. 🚀
