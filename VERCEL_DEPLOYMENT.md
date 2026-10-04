# Déploiement sur Vercel

## Vue d'ensemble

Cette application Expo est déployable sur **Vercel** avec une architecture sécurisée :

- **Frontend web** : build statique Expo exporté en HTML/CSS/JS (sans secret relay)
- **API proxy** : fonction Vercel à `/api/relay/*` qui relaie les appels autorisés vers le relay backend
- **Pas de mot de passe** : l'app s'ouvre directement sur l'accueil, aucune authentification web

> **Pourquoi pas de mot de passe ?** Un écran de login devant le PWA est un frein
> (faut le ressaisir, gestion du cache, nettoyage du localStorage à chaque
> changement). Le secret `RELAY_SECRET` reste de toute façon côté serveur.
> Si un jour tu veux restreindre l'accès **sans** toucher à l'app, voir
> [Sécuriser le site sans mot de passe](#sécuriser-le-site-sans-mot-de-passe).

## Prérequis

1. **GitHub** : le repo est déjà à `https://github.com/jinshiagencys-byte/uuptime-kuma-mobile`
2. **Compte Vercel** : créé/connecté à GitHub (offert)
3. **Relay backend** : URL + secret du serveur relay (ex: `https://railway-production-d365.up.railway.app`)

Aucune autre variable n'est nécessaire : **pas de `APP_PASSWORD`**.

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
| **RELAY_URL** | URL du serveur relay (ex: `https://railway-production-d365.up.railway.app`) | URL complète du serveur relay backend |
| **RELAY_SECRET** | Secret du serveur relay | Le secret pour la communication Vercel → relay backend |

**Important** :
- Seules ces **2 variables** sont nécessaires. `APP_PASSWORD` n'existe plus.
- `RELAY_URL` et `RELAY_SECRET` restent **secrets côté serveur** et ne sont jamais exposés au client web
- Ne mets **JAMAIS** de secret en `EXPO_PUBLIC_*` sinon ils apparaîtraient dans le bundle web
- Le proxy ne demande aucun mot de passe : le site est accessible à quiconque a l'URL (voir [Sécuriser le site sans mot de passe](#sécuriser-le-site-sans-mot-de-passe))

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
2. L'app s'ouvre directement sur l'accueil : **aucun mot de passe demandé**
3. Le PWA se sauvegarde dans le cache du navigateur
4. Sur iPhone : tu peux l'ajouter à l'écran d'accueil (Share → "Add to Home Screen")

## Architecture de sécurité

```
┌─ Web Browser ────────────────────────────────────┐
│  App en SPA (Expo export)                        │
│  - Aucune authentification, aucun mot de passe   │
│  - Requête GET /api/relay/monitors               │
└──────────────┬──────────────────────────────────┘
               │
               ↓
┌─ Vercel Function /api/relay/[...path] ───────────┐
│  - Whitelist stricte des méthodes et des chemins │
│  - Route l'appel avec le header x-relay-secret   │
│  - Ajoute le secret côté serveur                │
└──────────────┬──────────────────────────────────┘
               │
               ↓
┌─ Votre Relay Backend ─────────────────────────────┐
│  - Reçoit requête avec x-relay-secret             │
│  - Retourne les monitors, historique, etc.       │
└────────────────────────────────────────────────────┘
```

### Sécuriser le site sans mot de passe

Le secret du relay n'est **jamais** exposé (il reste dans les variables
serveur), mais l'URL du site est publique. Si tu veux limiter qui peut y
accéder **sans** ajouter d'écran de login dans l'app, utilise les réglages
Vercel — ça ne modifie pas le code :

| Besoin | Réglage Vercel |
|--------|----------------|
| moi seul / mon équipe | **Settings → Deployment Protection**, ou **Settings → Access → Vercel Authentication** (SSO Vercel) |
| accès depuis mon domicile seulement | **Settings → Firewall** : autoriser uniquement tes IP sur `/api/relay/*` |
| partage avec un lien | laisser public (état actuel) |

Ces protections sont **au niveau du edge** : elles s'appliquent à tout le site
y compris `/api/relay/*`, et ne demandent rien à l'utilisateur.

### Points clés de sécurité

1. **Pas de secret relay dans le web bundle**
   - Les variables `RELAY_URL` et `RELAY_SECRET` ne sont pas `EXPO_PUBLIC_*`
   - Elles ne peuvent pas être lues par le navigateur
   - Elles existent **uniquement** dans l'environnement Vercel

2. **Isolation du relay secret**
   - Seule la fonction Vercel peut utiliser `RELAY_SECRET`
   - Le client web ne le voit jamais

3. **Whitelist des routes**
   - `api/relay/[...path].ts` n'accepte que des méthodes et chemins listés explicitement
   - Tout le reste est rejeté en `403` / `405` avant d'atteindre le relay
   - Le proxy ne sert que de relais : il ne refait aucun calcul métier

4. **Le site est public** (comportement voulu ici)
   - Pas de mot de passe ni d'écran de login dans l'app
   - `RELAY_URL` reste masqué, donc le relay n'est pas accessible directement depuis le navigateur
   - Si tu veux verrouiller l'accès, passe par Vercel (voir section ci-dessus), ça ne modifie pas le code de l'app

## Dépannage

### Le site retourne 500 "Server misconfigured"

**Cause** : les variables d'env `RELAY_URL` ou `RELAY_SECRET` ne sont pas définies.

**Solution** :
1. Va dans Project Settings → Environment Variables
2. Vérifie que `RELAY_URL` et `RELAY_SECRET` existent
3. Redéploie (Project → Deployments → dernière version → Redeploy)

### Le site affiche une erreur 403 "Path not allowed"

**Cause** : l'URL appelée par l'app web n'est pas dans la whitelist du proxy
(`api/relay/[...path].ts`), ou utilise une méthode non autorisée.

**Solution** :
1. Regarde le champ `path` renvoyé dans la réponse 403 : il montre le chemin
   exact que le proxy a reçu
2. Ajoute la route au format attendu dans `ROUTES` (voir `api/relay/[...path].ts`)
3. Redéploie

### Le site affiche 405 "Method not allowed"

**Cause** : la whitelist ne contient que `GET` (lecture seule). Les actions de
l'app (pause, resume, suppression, création, découverte) utilisent `POST` et
`DELETE`.

**Solution** : autorise ces méthodes/routes dans `ROUTES`, puis vérifie aussi
que le proxy transmet bien le `body` pour les `POST`.

### Les actions marchent sur mobile mais pas sur le web

**Cause** : sur mobile, l'app appelle `RELAY_URL` directement. Sur web, elle
passe par `/api/relay/*`, qui filtre méthodes et chemins.

**Solution** : compare la liste des routes utilisées par l'app
(`src/api/relayClient.ts`) avec la whitelist du proxy, et aligne les deux.

### Les requêtes vont au relay direct au lieu du proxy

**Cause** : tu utilises une ancienne version du bundle qui avait l'URL relay en hardcoded.

**Solution** :
1. Force un rebuild : va dans Deployment et clique Redeploy
2. Vide le cache du navigateur (F12 → Application → Clear Storage)

## Fichiers clés du déploiement

- `vercel.json` : config de déploiement Vercel
- `.vercelignore` : exclut `.env` lors du déploiement
- `api/relay/[...path].ts` : la fonction serverless qui filtre (méthodes + chemins) et relaie les appels
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
