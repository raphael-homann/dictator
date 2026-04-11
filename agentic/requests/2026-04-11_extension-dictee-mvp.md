# 2026-04-11_extension-dictee-mvp

## Besoin

- Creer une extension Chrome MV3 de dictee vocale.
- Permettre le choix du moteur: natif navigateur ou OpenAI.
- Ajouter la selection utilisateur des champs puis memoriser les selecteurs par site.
- Fournir une configuration centralisee (sites/selecteurs, modele, micro, cle OpenAI).
- Ajouter une visualisation de la voix et un reglage de sensibilite.

## Roadmap

- [x] Initialiser le socle TypeScript + MV3 + build `dist/`.
- [x] Implementer popup, options, background, content scripts et stockage settings.
- [x] Implementer picker de champs + memorisation selecteurs par origin.
- [x] Injecter le bouton `Dictee` sur champs cibles avec etats visuels.
- [x] Implementer provider natif.
- [x] Implementer provider OpenAI Realtime + fallback natif.
- [x] Ajouter visualisation voix + reglage sensibilite + bouton tester.
- [x] Corriger les erreurs d'injection/content script en production MV3.
- [x] Documenter pour distribution GitHub + credits e-Frogg.

## Implementation

- Build TS + copie assets statiques, puis bundle IIFE du content script pour compatibilite Chrome content scripts.
- Manifest MV3 avec `storage`, `tabs`, `activeTab`, `scripting` et host permissions requises.
- Flux selection:
  - popup envoie `StartPicker`,
  - background active/injecte content script,
  - overlay selection sur la page,
  - sauvegarde selecteur via storage local.
- Flux dictee:
  - bouton `Dictee` injecte pres du champ,
  - start/stop,
  - transcription progressive dans le champ cible,
  - visualisation niveau micro.
- OpenAI:
  - session Realtime WebRTC,
  - usage estime cumule,
  - fallback natif en cas d'echec.
- Config:
  - modele/provider/langue/micro/cle OpenAI,
  - sensibilite micro reglable,
  - bouton `Tester` avec auto-reduction de sensibilite si saturation.
- Branding e-Frogg ajoute dans docs, config/popup et logs discrets.

## Validation

- Build: `npm run build` OK.
- Tests manuels:
  - popup + mode selection champs,
  - memorisation selecteurs et reinjection,
  - dictee native et OpenAI,
  - options + test sensibilite micro,
  - pages non supportees (message explicite).
- Risques restants:
  - variabilite Web Speech selon navigateur/langue,
  - variabilite API Realtime OpenAI selon modele/version,
  - necessite de verifier sur un panel de sites SPA supplementaire.
