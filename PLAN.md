# Implementatieplan Flitscript

Status: optie A. Fase 1–5 klaar (AI-correctie gebouwd maar uitgeschakeld). Open: HDR- en VFR-test met iPhone-bestanden, fase 6 (opslag + login), fase 7 (deploy).

## 0. Bevindingen Toolcraft

Toolcraft is geïnstalleerd en `AGENTS.md`, `workflow.md` en alle `docs/toolcraft/core/*` zijn gelezen. Daarna de runtime-code van de video-export zelf gecontroleerd (`src/toolcraft/runtime/export/*`).

### Ingebouwde video-export versus onze eisen

| Eis | Toolcraft-export | Voldoet |
| --- | --- | --- |
| Resolutie gelijk aan bron | `Current` = canvasgrootte (2160×3840 kan); `4K` past binnen 3840×2160, dus portret wordt 1214×2160 | deels |
| Framerate gelijk aan bron, VFR | vast schema van 30 fps vanaf de timelineduur; bron-timestamps worden niet gebruikt | nee |
| Bitrate ≥ bron | vaste formule, **max 12 Mbps** (iPhone 4K is ±40–60 Mbps) | nee |
| H.264 / HEVC | H.264, VP9, VP8. Geen HEVC | deels |
| Audio passthrough | **geen audiospoor** | nee |
| Frame-exact decoderen van de bron | geen videodecoder; de renderer krijgt alleen een tijdstip | nee |
| Bestandsgrootte | **harde limiet van 96 MB**, volledig in het geheugen (60 s 4K faalt) | nee |
| HDR | niet aanwezig | nee |
| Worker, voortgang, annuleren | voortgang en annuleren ja, geen worker | deels |

### Een eigen exportpad blokkeert Toolcraft zelf

- `scripts/toolcraft-product-export-boundary.mjs` keurt in productcode **elke `mediabunny`-import** af, net als `VideoEncoder`, `MediaRecorder`, `toBlob` en `showSaveFilePicker`. Dat raakt ook fase 1 (metadata lezen) en fase 2 (audio extraheren), niet alleen de export.
- `src/toolcraft` is een ondertekende kopie die we niet mogen aanpassen. `npm run test` faalt als die verandert.

### Andere wrijving

- Er is geen video-assettype. `fileDrop` kopieert uploads naar IndexedDB, dus een 4K-bestand van 1 GB staat dan nog een keer in de browseropslag. Dat botst met local-first plus de File System Access API.
- Layout: de timeline staat altijd **bovenaan**. Het rechterpaneel is een paneel met parameters. Een captionlijst met tekst die je direct bewerkt en blokken die je in de timeline sleept, zijn custom UI die het contract afraadt. Elk zichtbaar onderdeel heeft verder eigen acceptatie- en performance-dekking nodig, met beveiligde bewijsbestanden (*receipts*).
- `npm run verify:quick` bestaat niet. Wel beschikbaar: `test`, `ai:check`, `typecheck`, `test:feature` en `verify:delivery`.

Toolcraft is gebouwd voor generatieve tools met parameters (shader, beeld of 3D plus schuifjes en een export van 30 fps). Een video-editor die het bronbestand frame-exact verwerkt, valt daarbuiten.

## Keuze (jouw akkoord nodig)

- **A (aanbevolen): dezelfde stack zonder de Toolcraft-runtime.** We gebruiken Vite, React, TypeScript strict, TanStack Router en Tailwind. Dat is precies wat Toolcraft onder de motorkap gebruikt. Mediabunny gebruiken we direct. Undo/redo krijgt een eigen kleine command-stack. De UI-primitieven van Toolcraft (MIT) mogen we hergebruiken voor de look. We verliezen de Toolcraft-panels en de acceptatie-harness. Die passen toch niet bij deze editor.
- **B: Toolcraft forken.** We zetten de boundary- en integriteitschecks uit en bouwen er video in. Dat kan, maar dan werken we permanent tegen het framework in en kunnen we niet meer upgraden.
- **C: Toolcraft strikt volgen.** Dat haalt de export-eisen niet. Niet aan te raden.

De fases hieronder gaan uit van **A**.

## Fases

Doel-browser: **Chrome desktop** (WebCodecs met HEVC-decode op macOS, File System Access API). Safari en Firefox worden niet ondersteund.

### Fase 1 — Fundament
- Project opschonen naar A: Vite + React + TS strict + TanStack Router + Tailwind + Vitest. Script `verify:quick` = typecheck + unit tests.
- `probe(file)` met Mediabunny (`Input` + `BlobSource`): resolutie, rotatie, codec, fps (gemiddeld + VFR-detectie via packet stats), gemiddelde bitrate, duur, kleurruimte. HDR = transfer `hlg` of `pq`.
- Preview: `<video>` voor afspelen (hardwarematig, met audio). Daarboven een canvas voor de captions, gesynchroniseerd via `requestVideoFrameCallback` (`mediaTime`).
- UI: video slepen, metadatablok, preview, play/pause, frame stappen.
- Test met echte bestanden (zie open punten).

### Fase 2 — Transcriptie
- Audio extraheren in een worker: mono, 16 kHz, Opus/AAC van ±32–48 kbps. Dat is minder dan 1 MB per minuut, ruim binnen de bodylimiet van Vercel (4,5 MB).
- `/api/transcribe` (Vercel Function, Node) roept ElevenLabs aan: `scribe_v2`, `language_code: nl`, `timestamps_granularity: word`, `keyterms` = glossary. De sleutel staat in `ELEVENLABS_API_KEY`. Exacte parameternamen controleer ik bij de bouw tegen de actuele docs.
- `TranscriptionProvider`-interface; output wordt omgezet naar `Word[]`.
- Woordenlijst met klik-om-te-springen.

### Fase 3 — Captions
- `segmentWords(words, preset)`: deterministisch knippen op leestekens, pauzes > 250 ms, max woorden/tekens/regels, geen los woord van één letter. Met unit tests.
- `/api/refine` met Claude (standaard `claude-sonnet-5-5`, configureerbaar). Alleen tekst per woordindex plus accentwoorden per groep. Validatie met Zod; bij ongeldige output terugvallen op het origineel.
- `renderCaptions(ctx, time, project, outputSize)`: puur en deterministisch. Layout wordt per groep gecachet. Vijf animaties als pure functies (Pop, Woord voor woord, Karaoke, Bounce, Slide-up) en drie startpresets.
- Fonts Poppins ExtraBold en Manrope Bold lokaal als woff2 (OFL), geladen via FontFace.
- Safe-zone-overlay.
- Unit test voor elke functie die tijd naar beeld omzet.

### Fase 4 — Export
- In een worker: Mediabunny decodeert frame voor frame (`VideoSampleSink`, timestamps blijven behouden). Elk frame plus `renderCaptions` gaat op een OffscreenCanvas op uitvoerresolutie. Het encoderen gebruikt **dezelfde timestamp en duur als het bronframe**, zodat VFR en sync behouden blijven.
- Audio: packets ongewijzigd kopiëren (passthrough, geen nieuwe encodering).
- Output via `StreamTarget` direct naar een bestand dat je kiest met `showSaveFilePicker`. De export streamt naar schijf, dus geen limiet van 96 MB en geen crash door geheugen (4K, 90 s ≈ 500 MB).
- Bitrate = max(bronbitrate, ondergrens). Keuze H.264/HEVC via `canEncodeVideo`.
- HDR: eerst testen wat Chrome doet met HLG-frames op canvas. Als het beeld uitgewassen of te fel wordt, volgt een eigen tone-map-stap (HLG/PQ naar SDR BT.709). HDR behouden (10-bit HEVC) alleen als de test laat zien dat Chrome het betrouwbaar kan. De keuze komt in `DECISIONS.md`.
- Voortgang, resterende tijd, annuleren, `VideoFrame.close()`.
- `.srt` en `.vtt`.
- Rapport: bitrate, resolutie, fps en duur van in- en output (ffprobe) voor de 3 testbestanden.
- MediaRecorder-fallback bouw ik niet: Chrome heeft altijd WebCodecs. Ontbreekt het toch, dan volgt een duidelijke foutmelding.

### Fase 5 — Editor
- Links: captiongroepen, tekst direct bewerkbaar, accentwoord aan/uit. Midden: preview. Rechts: stijlpaneel. Onder: timeline met slepen van randen, splitsen en samenvoegen.
- Sneltoetsen: spatie, pijltjes, `S`.
- Undo/redo: command-stack op de project-JSON (die is klein).

### Fase 6 — Opslag en presets
- Supabase: tabellen `clients`, `projects`, `presets`, `glossaries`. Row level security per gebruiker of team.
- Login via Supabase Auth, alleen ons e-maildomein.
- Projecten heropenen met fingerprint-check (naam + grootte + duur + SHA-256 van de eerste 4 MB). Het bestandshandle (File System Access API) wordt bewaard in IndexedDB.
- Toegang tot het bronbestand loopt via één functie, zodat Cloudflare R2 later kan worden ingeplugd.
- `/api/*` controleert de Supabase-JWT, zodat niemand anders onze API-tegoeden kan gebruiken.

### Fase 7 — Deploy
- Vercel, met env vars `ELEVENLABS_API_KEY`, `ANTHROPIC_API_KEY` en `SUPABASE_*`.

## Open punten
1. Keuze A, B of C.
2. Testbestanden: een 4K iPhone HDR-bestand, een 1080p SDR-bestand en een bestand met variabele framerate. Zet ze in `fixtures/`; die map komt niet in git.
3. E-maildomein voor de login.
4. API-sleutels voor ElevenLabs en Anthropic (in `.env.local`, niet in de chat). Een Supabase-project: de Supabase-MCP kon nu niet verbinden.
5. Is alleen Chrome desktop akkoord?
