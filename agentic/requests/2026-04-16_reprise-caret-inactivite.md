# 2026-04-16_reprise-caret-inactivite

## Besoin

- Corriger la reprise de dictee pour eviter les collisions avec la frappe clavier (espace manquant, reprise au mauvais endroit, retours ligne perdus).
- Rendre la dictation native moins agressive sur l'arret auto (delai trop court actuellement).
- Ajouter une barre de progression d'inactivite et exposer un delai configurable dans la configuration.

## Roadmap

- [x] Rendre l'insertion de transcription plus robuste quand le contenu change pendant la session.
- [x] Rafraichir l'ancre de dictation a chaque modification externe (clavier utilisateur) pour reprendre au bon curseur.
- [x] Ajouter un delai d'inactivite configurable (settings + UI options).
- [x] Afficher une barre de progression de l'inactivite sur le bouton de dictee.
- [x] Valider au build.

## Implementation

- `src/content/content-script.ts`
  - Remplacement de la reinjection complete du texte par une insertion incrementale (delta) au curseur, pour se rapprocher d'une saisie clavier et eviter d'ecraser la mise en forme existante.
  - Rafraichissement de l'ancre (`prefix/suffix`) a chaque `input` utilisateur pendant la session pour reprendre exactement a la position courante du curseur.
  - Ajout d'une gestion d'espace automatique avant le texte dicte quand necessaire (evite les collages de mots).
  - Remplacement du timeout fixe (7s) par une valeur settings configurable + barre de progression d'inactivite sur le bouton flottant.
  - Barre d'inactivite masquee hors session de dictee.
  - Barre d'inactivite rendue plus discrete (fine, pleine largeur) et placee sous les controles.
  - Remplacement de l'apercu inline (qui agrandissait le widget) par une preview optionnelle dans un panneau separe sous le widget, ouverte via un bouton `...`.
  - Preview simplifiee sans scrollbar interne (affiche en pratique la fin de la phrase pour garder les derniers mots visibles).
  - Deplacement de l'info modele hors barre flottante (barre allegee) vers le panneau debug optionnel (`...`) avec ligne `Modele actif`.
  - Affichage explicite du fallback dans cette ligne (`fallback:<modele-openai>->native`) quand OpenAI echoue au demarrage.
  - Simplification de la session: suppression de la logique d'ancre/snapshot complexe au profit d'un flux incremental unique.
- `src/content/services/transcript-stream.ts`
  - Nouveau service dedie (`TranscriptStream`) pour gerer le state de transcription et calculer un `delta` append-only plus robuste.
  - Contrat simple: `ingest({ committed, interim }) -> { delta, preview, committedSnapshot }`.
  - Affichage d'un message d'erreur detaille directement dans le widget lors d'un echec provider.
- `src/content/dom.ts`
  - Ajout d'un helper d'insertion au curseur pour `input/textarea/contenteditable` avec repositionnement explicite du curseur apres insertion.
- `src/content/providers/native-provider.ts`
  - Ajout d'une reprise automatique de la reconnaissance native apres `onend` inattendu (au lieu de stopper la session), avec arret propre quand l'utilisateur demande `Stop`.
  - Ajout d'un flush periodique de l'interim toutes les ~1.5s pour limiter les pertes lors des pauses/coupures, sans re-ecrire `committed` (reduction des repetitions).
  - Messages d'erreurs enrichis (code + explication utilisateur).
  - Anti-bruit de flush: meme interim non re-emis plusieurs fois de suite.
  - Flush interim accelere (~800ms) pour limiter les pertes en cas d'erreur/coupure.
  - Flush explicite de l'interim avant emission d'erreur provider (reduction des pertes de texte a la rupture).
  - Promotion du buffer interim en `committed` au moment du flush (timer/stop/erreur) pour ne pas perdre le texte deja entendu.
  - En mode natif, l'erreur `network` est desormais traitee comme non bloquante (session maintenue, pas de passage en erreur UI).
- `src/content/providers/openai-provider.ts`
  - Avant `onError`, promotion `committed+interim` puis emission `onTranscript(..., "")` pour persister le texte visible dans le debug.
- `src/shared/types.ts`
  - Nouveau setting `inactivityTimeoutMs` avec valeur par defaut `15000`.
- `public/options/options.html`
  - Nouveau slider `Delai d'inactivite avant arret auto` (5 a 60 secondes).
  - Ajout d'un indicateur `Modele actif` dans le bloc debug test dictee.
- `src/options/options.ts`
  - Lecture/ecriture du nouveau setting `inactivityTimeoutMs`.
  - Affichage live de la valeur du delai dans l'UI options.
  - Gestion non bloquante des erreurs reseau transitoires pendant le test dictee.
  - Affichage explicite du modele actif (OpenAI selectionne ou `native/webspeech`) dans la barre debug.
  - Sauvegarde auto (debounce) lors des changements provider/modele/cle OpenAI pour application immediate sans bouton `Enregistrer`.
- `README.md`
  - Documentation de l'option de delai d'inactivite configurable et de la barre de progression.

## Validation

- Build: `npm run build` OK.
- Tests manuels recommandes:
  - Dicter, taper au clavier (dont `Entree`) puis continuer a dicter dans un `textarea`.
  - Verifier que les retours a la ligne restent en place pendant la session.
  - Verifier que le curseur reste bien a la fin du texte insere apres chaque reprise.
  - Verifier qu'un `onend` natif ponctuel ne coupe plus la session (reprise auto).
  - Verifier que du texte est regulierement valide meme en parlant avec pauses courtes (~1-2s).
  - Verifier le rendu de la barre d'inactivite (sous le bouton, fine, pleine largeur) et l'apercu live sur 2 lignes.
  - Ajuster le slider d'inactivite (5s puis 60s) et controler la barre de progression.
- Risques restants:
  - Les editeurs `contenteditable` tres custom peuvent encore avoir des comportements specifiques selon le site.
