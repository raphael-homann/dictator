# Plan d'execution — Extension Chrome Dictee (TypeScript)

## Objectif
Construire une extension Chrome MV3 qui permet d'ajouter un bouton de dictee sur des champs d'un site,
de memoriser les selecteurs par site, et de dicter via moteur natif ou OpenAI.

## Progression globale
- [x] Rediger le plan d'action initial
- [x] Implementer l'extension et suivre la progression en continu
- [ ] Valider le fonctionnement sur plusieurs sites

---

## Phase 1 — Socle extension MV3
- [x] Creer la structure TypeScript (src/public/scripts)
- [x] Definir manifest + permissions
- [x] Mettre en place background + messages principaux
- [x] Mettre en place stockage local versionne

## Phase 2 — Configuration (Options)
- [x] Ecran options (provider, modele, micro, cle OpenAI)
- [x] Liste des sites/selecteurs (edition/suppression)
- [x] Detection des microphones disponibles

## Phase 3 — Selection de champ
- [x] Popup avec action `Ajouter une dictee`
- [x] Overlay de selection sur la page
- [x] Generation selecteur robuste + sauvegarde par site

## Phase 4 — Injection du bouton Dictee
- [x] Injection sur champs cibles
- [x] Gestion des pages dynamiques (MutationObserver)
- [x] Etats visuels (idle/listening/error)

## Phase 5 — Moteur natif
- [x] Start/stop au clic
- [x] Transcription en direct (interim/final)
- [x] Ecriture progressive dans le champ

## Phase 6 — Moteur OpenAI (cle locale)
- [x] Session Realtime en direct depuis l'extension
- [x] Transcription continue vers le champ actif
- [x] Gestion erreurs/timeouts + fallback

## Phase 7 — Visualisation voix
- [x] Niveau audio (barre VU)
- [x] Synchronisation avec l'etat de dictee

## Phase 8 — Usage / quota OpenAI
- [x] Afficher usage estime/session
- [x] Indiquer limites de la mesure

## Phase 9 — QA manuelle
- [ ] Verifier sur input, textarea, contenteditable
- [ ] Verifier pages dynamiques (SPA)
- [ ] Verifier permissions micro et erreurs

## Journal de progression
- [x] Plan initialise
- [x] Build TypeScript initialise
- [x] Picker + injection operationnels
- [x] Dictation native operationnelle
- [x] Dictation OpenAI operationnelle (a valider en conditions reelles)
- [x] Fallback natif ajoute si echec OpenAI
- [x] README + procedure de chargement unpacked
- [x] Correctif chemins scripts popup/options (chargement extension)
- [x] Correctif imports ESM `.js` pour charger le service worker MV3
- [x] Correctif popup sur pages non supportees + auto-injection content script
- [x] Message direct de compatibilite visible dans le popup
- [x] Correctif robustesse activation picker (retry + detail erreur + hint permissions)
- [x] Correctif race condition: listener message enregistre avant boot complet du content script
- [x] Correctif majeur: bridge content script classique + import dynamique du module TS
- [x] Correctif definitif: bundle IIFE du content script (plus d'imports ESM en execution directe)
- [x] Correctif UX dictation: warnings non bloquants + visualisation active meme sans niveau micro
- [x] Amelioration visualisation voix: analyseur audio plus sensible + rendu meter lie au niveau reel
- [x] Ajout reglage sensibilite + bouton Tester avec auto-reduction si saturation
- [x] README distribution GitHub (fonctionnement + installation + depannage)
- [x] AGENTS.md projet + mini harnais agentique (`agentic/requests`)
- [x] Credits e-Frogg ajoutes en config, popup, logs et docs
- [x] Correctif visualisation en page: fallback base transcription si niveau micro indisponible
- [x] Insertion dictee a la position du curseur (prefix/suffix) + barre plus reactive
