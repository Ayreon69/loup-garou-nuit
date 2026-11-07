# Loup-Garou pour une Nuit

**Une seule nuit, un débat, un vote. Démasque un Loup-Garou… mais méfie-toi : cette nuit, les cartes changent de main, et ton rôle avec.**

👉 **Jouer : (lien à venir)** (la première ouverture peut prendre jusqu'à une minute, le temps que le serveur gratuit se réveille)

Jeu de rôles caché et de déduction, à jouer entre amis depuis un navigateur, sur téléphone ou ordinateur, sans compte ni installation : autour d'une vraie table ou en visio.
D'après *Loup-Garou pour une Nuit* (*One Night Ultimate Werewolf*), le jeu de Ted Alspach et Akihisa Okui. Création de fans, non officielle, avec ses propres visuels.

## Jamais joué ? Le tutoriel

Le jeu est simple à jouer et dur à expliquer : on ne comprend vraiment qu'après une partie. L'accueil propose donc **« Jamais joué ? Apprends en 2 minutes »** : une petite partie guidée, à 4, où l'on joue vraiment pendant que l'appli explique.

- Tu reçois le Voleur, tu regardes ta carte en la gardant appuyée, puis la nuit tombe : le narrateur appelle les rôles un par un ;
- à ton tour, tu voles la carte de Léo… qui était un Loup-Garou. Te voilà dans la meute, et Léo ne le sait pas ;
- au matin, chacun annonce son rôle ; toi, tu choisis : dire la vérité, mentir, ou accuser ;
- vote, dévoilement, puis la nuit rejouée pas à pas, et trois leçons à retenir.

Le salon et les règles proposent aussi ce tutoriel, et chaque étape d'une vraie partie peut afficher un conseil pour débutants (réglable).

## Règles en bref

- De **3 à 10 joueurs**. Chacun reçoit **une carte rôle** et la regarde en secret ; **trois cartes restent au centre**, face cachée.
- **La nuit**, tout le monde ferme les yeux. L'appli appelle les rôles un par un, dans l'ordre de leur numéro :
  Doppelgänger, Loups-Garous, Sbire, Francs-Maçons, Voyante, Voleur, Noiseuse, Soûlard, Insomniaque. Chacun agit sur son téléphone, sans que les autres le voient.
- **Le piège** : le Voleur, la Noiseuse et le Soûlard échangent des cartes. **Au matin, c'est la carte devant toi qui compte**, même si tu ne l'as pas revue. On peut donc changer d'équipe sans le savoir.
- **Le jour**, on débat : qui est quoi, qui a vu quoi, qui ment. Les Loups-Garous mentent, bien sûr.
- **Le vote** : chacun désigne un joueur en secret, puis tout est révélé d'un coup. Le plus de voix meurt ; à égalité, tous les ex æquo. Si chacun a reçu exactement une voix, personne ne meurt. Le Chasseur qui meurt emporte celui qu'il a désigné.
- **Qui gagne** : le village si au moins un Loup-Garou meurt ; la meute si aucun ne meurt. S'il n'y a aucun Loup-Garou parmi les joueurs (tous au centre), le village gagne si personne du village ne meurt. Le Tanneur gagne seul s'il meurt ; le Sbire gagne avec la meute.

Les rôles : Loup-Garou, Sbire, Franc-Maçon, Voyante, Voleur, Noiseuse, Soûlard, Insomniaque, Chasseur, Tanneur, Villageois et Doppelgänger, chacun avec sa fiche (pouvoir, but, conseil) consultable à tout moment.

Sont des choix de ce jeu :

- **Dix compositions toutes prêtes**, de « Première nuit » (les rôles de base, de 3 à 10 joueurs) au « Double » (avec le Doppelgänger, de 8 à 10), plus « Au hasard » et « Sur mesure », carte par carte, dans les limites de la boîte.
- **Le débat se fait à voix haute** par défaut, autour de la table ou en visio : l'appli garde les cartes, les secrets et les votes. Un mode **écrit** ajoute un fil de discussion, pour jouer sans se parler.
- **Les annonces** : un bouton « Annoncer » compose en quelques touches une déclaration claire (« Je suis Voyante. J'ai vu la carte de Léo : Loup-Garou. »), affichée pour toute la table. Rien n'oblige à dire vrai.
- **La durée du débat** se règle : 3, 5 (par défaut) ou 10 minutes, ou sans limite. Tout le monde peut se dire « prêt à voter » pour abréger, et l'hôte peut lancer le vote.
- **La nuit « posée »** laisse 18 secondes à chaque rôle (pour une première partie), la nuit « normale » 12. **Tous les rôles en jeu sont appelés, même s'ils sont au centre**, pour que personne ne devine ce qui y dort. Ceux qui dorment peuvent toucher des cartes au hasard : de loin, personne ne devine qui agit.
- **Un narrateur à voix réelle** annonce chaque réveil, par défaut sur le téléphone de l'hôte, comme le meneur qui parle à toute la table. C'est la voix « Guillaume » de la bibliothèque [ElevenLabs](https://elevenlabs.io), modèle `eleven_v4`. Les 23 répliques sont enregistrées une fois pour toutes en MP3 (`client/public/voix/`, script `scripts/voix.ts`), avec les crédits gratuits du mois : le jeu en ligne ne fait que les lire. Si un fichier manque, la synthèse vocale du téléphone prend le relais.
- **Rien ne remplace la mémoire** : au matin, ce qu'on a vu la nuit n'est plus affiché. À la fin, tout est dévoilé.
- **Un joueur absent plus de 20 secondes est remplacé par le pilote automatique** jusqu'à son retour.

## Les bots

Ils ne savent que ce qu'un joueur saurait : leur carte de départ, ce qu'ils ont vu ou fait la nuit, les rôles en jeu et les annonces des autres.

- La nuit, ils agissent comme un joueur, au hasard comme tout le monde : la Voyante regarde une carte, le Voleur vole, la Noiseuse échange… après un temps de réflexion, comme une main ;
- au matin, ils **annoncent** leur rôle et ce qu'ils ont vu. Le village dit la vérité ; **la meute ment** : elle écoute d'abord les autres, puis revendique un rôle crédible, de préférence une carte vue au centre que personne n'a. Le Tanneur, lui, cherche à paraître suspect ;
- ils tiennent compte des échanges annoncés (« ta carte a peut-être changé »), repèrent les contradictions (deux Voyantes, une annonce qui ne colle pas avec ce qu'ils ont vu) et votent en conséquence. S'ils pensent que les Loups-Garous sont tous au centre, ils proposent de voter chacun pour son voisin ;
- les « novices » réfléchissent peu et oublient ; les « habiles » croisent les annonces ; les « retors » mentent avec plus d'audace.

Sur 300 parties par ligne (`npx tsx test/sim.ts 300 5 premiere`), où gagne le village :

| Table | Vote au hasard | Bots novices | Bots habiles | Bots retors |
|---|---|---|---|---|
| Première nuit, 5 joueurs | 33 % | 38 % | 58 % | 52 % |
| Le Tanneur, 7 joueurs | 37 % | 38 % | 51 % | 44 % |
| Le Double, 9 joueurs | 34 % | 36 % | 46 % | 44 % |

Avec le Tanneur à 7, il gagne 13 % des parties au hasard, et de 22 à 27 % entre bots. Les bots habiles trouvent un Loup-Garou 63 % du temps à 5 (36 % au hasard). C'est entre humains que le jeu prend tout son sel : les regards, les hésitations et les mensonges à voix haute.

## Fonctionnalités

- Tables privées avec code à 4 lettres, lien d'invitation, partage natif et QR code
- Partie contre 2 à 9 bots en un clic ; tutoriel guidé de 2 minutes
- La carte se regarde en la gardant appuyée, et se cache dès qu'on la lâche
- La nuit : un narrateur, l'ordre des réveils, une barre de temps, et un geste par action : ce qu'on peut toucher s'illumine. La carte volée ou échangée part d'un joueur à l'autre sous les yeux de celui qui agit
- Le jour : la table et les annonces de chacun, un pense-bête des rôles en jeu (avec l'ordre de réveil), réactions, et le fil écrit en mode écrit
- Le vote : on désigne d'un geste, on peut changer d'avis jusqu'au bout ; roulement de tambour, puis tous les votes et toutes les cartes se retournent
- Fin de partie : le verdict et sa raison (« Pourquoi ce résultat ? »), les annonces démasquées (rôle annoncé contre rôle reçu), et **la nuit rejouée pas à pas**, échange par échange ; victoires de la soirée, revanche en un clic
- Règles et fiches des rôles consultables en jeu
- Reprise automatique après une coupure, pilote automatique, spectateurs
- Sons synthétisés (hibou, gong, cloche de l'aube, tambour), vibrations, animations réduites si le système le demande

## Développement

```bash
npm install
npm run dev:server   # serveur temps réel sur http://localhost:3270
npm run dev:client   # interface sur http://localhost:5206
npm test             # compositions, nuit, échanges, annonces, vote, victoire, bots
npm run build && npm run e2e   # parties complètes avec de vrais clients, et chasse aux fuites d'information
npx tsx test/sim.ts 300 5 premiere   # force des bots : 300 parties à 5
```

`LN_FAST=1` accélère les bots et les chronos (tests locaux uniquement).

Les voix du narrateur : `npx -y @elevenlabs/cli@latest onboard init` pose une clé ElevenLabs dans `.env.local` (ignoré par git), puis `npx tsx --env-file=.env.local scripts/voix.ts tout <voice_id>` régénère les répliques (voir l'en-tête du script). Le script refuse de générer en dehors des crédits gratuits du mois. La clé ne sert qu'à la génération ; elle n'est jamais dans le jeu ni dans le dépôt.

## Architecture

- `shared/` : contrat client/serveur, rôles, compositions, ordre de la nuit, textes des annonces, résolution du vote
- `server/` : Express + Socket.IO, moteur de partie (`game.ts`), bots (`bots.ts`), table et minuteries (`room.ts`). Le serveur fait autorité : chacun ne reçoit que sa vue. La nuit, un geste n'est renvoyé qu'à son auteur, et chaque étape dure le même temps, que le rôle soit chez un joueur ou au centre
- `client/` : React + Vite + Framer Motion. Les cartes sont dans `components/Card.tsx`, le tutoriel dans `components/Tutorial.tsx`, la nuit rejouée dans `components/Replay.tsx`, la partie dans `screens/Table.tsx` et le dévoilement dans `screens/Final.tsx`
- Déploiement : un seul service Node (`npm ci && npm run build`, puis `npm start`)
