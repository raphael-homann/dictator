# 2026-04-13_fix-transcription-openai

## Besoin

- Corriger le mode OpenAI pour qu'il fasse de la transcription stricte (dictation) et pas une reponse de chat.
- Eviter toute insertion de texte genere par l'assistant dans le champ utilisateur.

## Roadmap

- [x] Analyser le provider OpenAI et les evenements transcriptions attendus.
- [x] Configurer la session Realtime en mode transcription.
- [x] Limiter l'insertion au flux `input_audio_transcription` uniquement.
- [x] Valider au build et test manuel.

## Implementation

- `src/content/providers/openai-provider.ts`
  - Correction schema `session.update` pour compatibilite API reelle:
    - suppression des champs rejects (`session.type`, `session.output_modalities`),
    - configuration via `input_audio_transcription` + `turn_detection`.
  - Turn detection force avec `create_response: false` et `interrupt_response: false` pour eviter les reponses assistant.
  - Insertion texte limitee aux evenements de transcription utilisateur:
    - `conversation.item.input_audio_transcription.delta`
    - `conversation.item.input_audio_transcription.completed`
  - Suppression du parsing `response.output_text*` / `response.audio_transcript*` et du fallback qui pouvait injecter du texte de reponse modele.
  - Tracking d'usage conserve via `response.done` (stats/debug), sans impacter le texte insere.

## Validation

- Build: `npm run build` OK.
- Verification manuelle recommandee:
  - mode `openai`, lancer `Tester dictee` dans Options,
  - verifier que le texte insere correspond uniquement a la voix dictee,
  - verifier qu'il n'y a plus de phrase de type "reponse assistant",
  - verifier que les tokens continuent de remonter dans le panneau debug.
