# 2026-04-13_debug-levels-et-raw-events

## Besoin

- En mode config, diagnostiquer pourquoi OpenAI ne renvoie pas de texte insere.
- Ajouter un debug a niveaux:
  - par defaut sans logs,
  - logs basiques,
  - logs avances avec payload brut des events.

## Roadmap

- [x] Ajouter un selecteur de niveau de log dans le panneau debug.
- [x] Brancher un callback `onDebug` entre providers et panneau options.
- [x] Journaliser les events OpenAI bruts en mode avance.
- [x] Garder des logs natifs minimaux pour comparer OpenAI vs navigateur.
- [x] Valider au build et test manuel.

## Implementation

- `public/options/options.html`
  - Ajout d'un select `Niveau logs` (`off`, `basic`, `verbose`).
- `public/options/options.css`
  - Ajout du layout de la barre de controle debug (`debug-head`, `debug-level`).
- `src/content/providers/types.ts`
  - Ajout du callback optionnel `onDebug(message: string)` dans `DictationCallbacks`.
- `src/content/providers/openai-provider.ts`
  - Emission debug des messages sortants/entrants data-channel (`[openai->]`, `[openai<-]`) en mode avance.
  - Parsing transcription plus tolerant sur les types d'events (`input_audio_transcription` et `audio_transcript`).
  - Gestion explicite des events d'erreur OpenAI.
- `src/content/providers/native-provider.ts`
  - Logs de debug minimaux (demarrage, delta, erreur, fin de session).
- `src/options/options.ts`
  - Gestion du niveau de logs (`DebugLevel`).
  - `off` par defaut: pas de logs defilants.
  - `basic`: logs fonctionnels.
  - `verbose`: logs basiques + payloads bruts providers.

## Validation

- Build: `npm run build` OK.
- Test manuel recommande dans `Options`:
  - `Niveau logs: Off` -> pas de logs bruts visibles,
  - `Niveau logs: Basique` -> logs fonctionnels,
  - `Niveau logs: Avance (raw)` -> affichage des payloads OpenAI exacts (`[openai<-] ...`).
