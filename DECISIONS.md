# Decisions

## 2026-10-16 — Geen Toolcraft-runtime (optie A, akkoord gebruiker)
De video-export van Toolcraft draait op een vaste 30 fps met maximaal 12 Mbps. Er is geen audio en geen HEVC, en de limiet is 96 MB in het geheugen. Toolcraft verbiedt `mediabunny`/`VideoEncoder` in productcode en de runtime is ondertekend. Daarom gebruiken we dezelfde stack zonder Toolcraft: Vite, React 19, TS strict, TanStack Router, Tailwind 4 en Vitest, met Mediabunny direct. De scaffold is volledig verwijderd.

## 2026-10-16 — Doel-browser: alleen Chrome desktop
Akkoord gebruiker. We gebruiken WebCodecs (incl. HEVC-decode), File System Access API en `requestVideoFrameCallback` zonder fallbacks.

## 2026-10-16 — Preview via `<video>`, export via decoder
De preview speelt af via een `<video>`-element: hardwarematig, met audio, ook PCM in .mov. De tijd van het getoonde frame komt uit `requestVideoFrameCallback` (`mediaTime`), met `seeked` als fallback. In fase 4 decodeert de export zelf frame voor frame; de preview hoeft dus niet frame-exact te zijn. Captions komen in fase 3 op een canvas over de video.

## 2026-10-16 — Metadata
`probe()` leest alleen de sample-tabel (`metadataOnly`) en niet de framedata. Dat blijft ook bij 4K snel. VFR = een frame-interval wijkt meer dan 10% af van de mediaan. Bitrate = gemiddelde videobitrate uit de packet stats. Totaal = bestandsgrootte / duur.

## 2026-10-16 — Kwaliteitscheck
`npm run verify:quick` = `tsc --noEmit` + `vitest run`. Geen eslint: TS strict met `noUnused*` dekt het belangrijkste.

## 2026-10-16 — Transcriptie (fase 2)
- Audio gaat als mono Opus 32 kbps in WebM naar de server. Mediabunny pakt de audio uit, op de main thread: 29 s duurt 0,2 s. Dat levert ±260 KB per minuut op, dus ±15 minuten passen binnen de bodylimiet van Vercel (4,5 MB).
- De Conversion zet de audio op tijdstip 0; de `firstTimestamp` van het audiospoor komt weer bij de woordtijden op.
- `/api/transcribe` is een Vercel Function met de Web-signatuur (`export function POST(request)`). Lokaal draait dezelfde handler via een kleine Vite-middleware (`vite.config.ts`). Zo is er geen `vercel dev`/`vercel link` nodig.
- Provider-interface in `server/transcription.ts`, ElevenLabs-implementatie in `server/elevenlabs.ts`. Instellingen: `scribe_v2`, `language_code=nl`, woordtijden, `diarize=true` (spreker per woord), `tag_audio_events=false` (geen "(gelach)" in captions). Het antwoord wordt met Zod gevalideerd.
- Keyterms worden opgeschoond volgens de ElevenLabs-regels en gaan mee als herhaalde `keyterms`-velden; ElevenLabs accepteert dat (getest). Let op: keyterms kosten 20% extra.
- Confidence = `exp(logprob)`. Woorden onder 50% krijgen in de lijst een rode stippellijn.
- De glossary is nog een tekstveld in de sessie; opslaan per klant komt in fase 6.
- De API heeft nog geen login-check. Niet deployen vóór fase 6.

## 2026-10-16 — Captions (fase 3, zonder Claude)
- `segmentWords` is deterministisch en breekt:
  - na leestekens (`. ! ? , ; : …`);
  - bij pauzes > 250 ms;
  - op het maximum aantal woorden per blok;
  - op het tekenbudget (max tekens per regel × max regels).
- Een los woord van één letter gaat naar het volgende blok, of het vorige als het laatste blok is. Het blok mag daardoor één woord boven het maximum komen.
- Een blok blijft tot 0,5 s na het laatste woord in beeld, maar nooit over het volgende blok heen.
- Accentwoord = tijdelijk het langste woord per blok (`pickAccent`). Zodra `/api/refine` er is, kiest Claude.
- De blokken worden nu nog afgeleid uit woorden + preset (`useMemo`). In fase 5 worden ze echte state; een presetwissel mag dan geen handmatige edits weggooien.
- Maten zijn relatief: de lettergrootte ten opzichte van de videohoogte, stroke/schaduw/beweging ten opzichte van de lettergrootte. Preview en 4K-export geven daardoor hetzelfde beeld (test in `layout.test.ts`).
- De tekst blijft binnen de middelste 70% van de breedte. De lettergrootte is altijd precies wat je instelt (op verzoek gebruiker): past een blok niet, dan komt er een regel bij in plaats van kleinere letters. Een woord dat breder is dan 70% steekt daar buiten, gecentreerd.
- Layout wordt per blok gecachet (WeakMap op het blok-object, sleutel = tekst + stijl + uitvoermaat).
- Een stroke wordt met dubbele breedte vóór de vulling getekend, zodat alleen de buitenkant zichtbaar is.
- Animaties zijn pure functies `group(t, g)` en `word(t, w, g)`. Karaoke en Bounce houden een woord actief tot het volgende woord begint (geen flikkering in gaatjes).
- Fonts: `@fontsource` woff2 (Poppins 800, Manrope 700, latin-subset, bevat ë/é), zelf gehost en geladen via de FontFace API. Captions verschijnen pas als de fonts geladen zijn; anders bevat de cache verkeerde metingen.
- Preview-overlay: canvas op DPR-resolutie. Het kader komt uit CSS-container-units (`min(100cqw, ar × 100cqh)`) en valt daardoor precies op het beeld. Tekenen gebeurt in `requestVideoFrameCallback` met de `mediaTime` van het getoonde frame.
- Safe zone: onderste 20% en rechter 15% (alleen preview, niet in de export).
- Clean heeft in de brief geen accentkleur; accenten zijn daar dus wit.

## 2026-10-16 — Editor (fase 5, vóór export op verzoek gebruiker)
- Volgorde omgedraaid: eerst de editor, dan de export (akkoord gebruiker).
- Blokken zijn nu echte state. Alle wijzigingen lopen als `Command` door de pure `apply()` (`src/project/commands.ts`): transcriberen, stijl, tekst, accent, timing, splitsen, samenvoegen, verwijderen.
- Undo/redo via snapshots (`src/project/history.ts`, max 200 stappen). Een sleep- of schuifgebaar wordt één undo-stap zolang de wijzigingen minder dan 1 s uit elkaar liggen.
- Tekst bewerken:
  - Evenveel woorden: de timing per woord blijft staan en de zekerheid wordt 100%.
  - Ander aantal woorden: de nieuwe woorden worden over de oorspronkelijke tijdspanne van het blok verdeeld, naar lengte. Een handmatige wijziging, dus geen AI die tijden verzint.
  - Lege tekst verwijdert het blok.
- Splitsen (S) gebeurt op de afspeelpositie, op de woordgrens dichtst bij de playhead. Elk deel houdt minstens één woord.
- Blokranden slepen: blokken overlappen nooit en duren minstens 0,1 s.
- Een stijlwijziging knipt alleen opnieuw als max woorden/tekens/regels verandert. Daarbij blijven de gekozen accenten staan en komen verwijderde blokken niet terug; handmatige timing gaat verloren (undo kan).
- 14 presets.
- 16 ingebouwde fonts, zelf gehost via @fontsource, latin-subset. Een font laadt pas als hij gekozen wordt; captions renderen pas als het font geladen is.
- Eigen fonts uploaden kan (.ttf/.otf/.woff/.woff2) en ze worden gevalideerd via `FontFace.load()`. Ze staan voorlopig alleen in het geheugen, net als eigen presets; fase 6 slaat beide per klant op.
- Kleuren zijn `#RRGGBB(AA)`. Het kleurveld bewerkt RGB, een aparte schuif de dekking.
- Animatie "Geen" toegevoegd (voor het ondertitel-preset).
- Shortcuts in de Editor: spatie, ←/→, S, ⌘Z, ⌘⇧Z/⌘Y. Ze zijn uitgeschakeld tijdens typen.

## 2026-10-16 — Animatie "Woord voor woord pop" (verzoek gebruiker)
Elk woord popt op zijn eigen starttijd in, van schaal 0,8 naar 1 met een lichte overshoot (zelfde curve als Pop).

## 2026-10-16 — Export (fase 4)
- Gebouwd op Mediabunny `Conversion` met `video.process`:
  - Elk gedecodeerd frame wordt op een OffscreenCanvas getekend en `renderCaptions` gaat erop, op uitvoerresolutie.
  - Het frame behoudt de timestamp en duur van het bronframe (geen `frameRate`-optie), dus VFR blijft intact.
  - Mediabunny sluit de frames zelf en kopieert het canvas direct naar een nieuw `VideoFrame`, dus één canvas wordt hergebruikt.
- Rotatie: met `process` bakt Mediabunny de rotatie in het beeld, zodat het canvas altijd in weergave-oriëntatie staat.
- Audio wordt niet opnieuw geëncodeerd: de packets gaan ongewijzigd mee (getest: SHA-256 van de audio is identiek).
  - Container is MP4, behalve bij PCM-audio: dan MOV. MP4 kan PCM alleen via ISO 23003-5, en dat spelen veel apps niet af.
- Bitrate: de gekozen bitrate × 30/fps. Conversion geeft de framerate niet aan de encoder door (dat zou VFR resamplen), en Chrome regelt dan alsof het 30 fps is.
  - Gemeten vóór de fix: uitvoer = doel × fps/30.
  - Na de fix: 11,86 → 11,90 Mbps.
- Draait in een Web Worker. De worker laadt dezelfde fonts zelf (`self.fonts`).
- Schrijft via `showSaveFilePicker` + `StreamTarget` direct naar schijf, dus geen geheugenlimiet.
- Annuleren: `conversion.cancel()` en `writable.abort()`, zodat er niets gecommit wordt. Het lege bestand dat de picker al heeft gemaakt, wordt verwijderd.
- Een MediaRecorder-fallback is niet gebouwd: de tool is alleen voor Chrome desktop en Chrome heeft altijd WebCodecs.
- HDR: de export wordt SDR (BT.709) via het 2D-canvas. Dat is nog niet getest met een echt iPhone HDR-bestand.
- `.srt`/`.vtt` gebruiken de tekst zoals getypt, niet de hoofdletters van de stijl.

## 2026-10-16 — AI-correctie (`/api/refine`)
- Model `claude-opus-5-5` (standaard volgens de Claude API-richtlijnen), effort `medium`, adaptive thinking.
- Structured output via `betaZodOutputFormat`.
- Server-side `fallbacks: "default"`: weigert Claude, dan neemt een ander model het automatisch over.
- Claude krijgt alleen tekst met index plus de blokken en de glossary, en geeft index-gebaseerde wijzigingen terug. `validateRefinement` maakt daar ID-gebaseerde wijzigingen van. Ongeldige items vallen weg:
  - correcties die een woord zouden splitsen;
  - samenvoegingen over een blokgrens of die niet aaneensluiten;
  - indexen die niet bestaan.
  Is het hele antwoord ongeldig, dan verandert er niets.
- Samenvoegen ("truck vraag" → "truckvraag") mag alleen als Claude het expliciet meldt. Het nieuwe woord loopt van de start van het eerste tot het einde van het laatste woord, dus er worden geen tijden verzonnen. Splitsen kan niet; dat meldt Claude als notitie.
- Draait automatisch na het transcriberen, als eigen undo-stap. Mislukt het, dan blijft het transcript gewoon staan en verschijnt er een melding.
- Accentwoorden: Claude kiest ze (1–2 per blok). De regel "langste woord" blijft de fallback.

## 2026-10-16 — UI-redesign (verzoek gebruiker: "zoals Descript / Veed")
- Gebaseerd op VEED en Descript via Mobbin. Licht thema, Inter als UI-font, Flits-geel als accent, donkere primaire knoppen.
- Opbouw:
  - Iconenbalk links: Ondertitels / Stijl / Bron.
  - Paneel van 360 px; de panelen blijven gemount, zodat een lopende transcriptie niet verloren gaat bij wisselen.
  - Topbalk met bestandsnaam, undo/redo, Exporteren.
  - Preview op een lichte achtergrond.
  - Tijdlijn over de volle breedte.
- Tijdlijn: afspeelknoppen in het midden, filmstrip (thumbnails via Mediabunny CanvasSink), captionblokken en waveform (piekwaarden via AudioSampleSink).
- Stijlpaneel: presettegels, daarna de tabs Tekst / Effect / Animatie met kaarten en schakelaars.
- Klik je een blok aan, dan springt de playhead naar start + 0,2 s (max halve bloklengte), zodat de caption na de intro-animatie zichtbaar is.
- Iconen: `lucide-react`.

## 2026-10-16 — AI-correctie uitgeschakeld (verzoek gebruiker)
Na het transcriberen roept de UI Claude niet meer aan; er is geen AI-knop meer. De accentwoorden komen weer uit de regel "langste woord per blok"; je zet ze zelf bij in de captionlijst.
De code staat nog klaar maar wordt niet gebruikt: `api/refine.ts`, `server/refine.ts` (met tests), het `refined`-command en `src/transcription/refine.ts`. Terugzetten: in `CaptionsPanel` na `transcribed` `requestRefinement` aanroepen en `refined` dispatchen, plus `ANTHROPIC_API_KEY` instellen. Er is geen git-historie, dus deze code is bewust niet verwijderd.

## 2026-10-16 — Contextmenu en video vervangen
- shadcn/ui geïnitialiseerd: style `radix-nova`, Radix, alias `@/`. Alleen `context-menu` toegevoegd.
- De Geist-font van init teruggedraaid; Inter blijft. Het shadcn-pakket staat in devDependencies: de app gebruikt er alleen `shadcn/tailwind.css` uit, en zo valt de `braces`-melding buiten de build.
- `--primary` is donker en `--ring` Flits-geel, zodat shadcn-componenten in de huisstijl passen.
- Rechtermuisknop op preview en tijdlijn opent hetzelfde menu (`EditorMenu`):
  - afspelen;
  - splitsen;
  - samenvoegen;
  - caption verwijderen;
  - video vervangen;
  - nieuwe video;
  - exporteren.
  Rechtsklik op een blok selecteert dat blok eerst.
- **Video vervangen** laadt een ander bestand onder de bestaande captions, stijl en undo-historie (bijv. een ingekleurde export van dezelfde take). Is de nieuwe video korter dan de captions, dan volgt een waarschuwing.
- **Nieuwe video** begint opnieuw.
- Sneltoetsen: ⌫/Delete verwijdert de geselecteerde caption, ⌘E opent het exportvenster.

## 2026-10-16 — Caption toevoegen, slepen/stylen op de video, accentblok, accentinstellingen, uitfaden, zoeken en opvulwoorden
- **Contextmenu** houdt 12 px afstand van de schermranden (`collisionPadding`).
- **Caption toevoegen** (`addGroup`): alleen tussen captions in, standaard 1,5 s, nooit over het volgende blok of het einde van de video. De placeholder is "Nieuwe caption", direct geselecteerd. De woordenlijst wordt op tijd gesorteerd, omdat woorden van verwijderde blokken bewaard blijven.
- **Op de video**:
  - Klik selecteert, slepen verplaatst; horizontaal snapt hij op het midden.
  - Een werkbalk boven de geselecteerde caption (portal, zodat hij buiten een staand videoframe mag uitsteken) heeft:
    - scope "Alle captions / Alleen deze";
    - grootte;
    - tekst- en accentkleur;
    - een wis-knop voor de eigen stijl van dat blok.
  - "Alleen deze" schrijft naar `group.override.style`; "Alle" past de projectstijl aan. Positie is nu `positionX`/`positionY` in de stijl; de aparte `override.positionY` is weg.
- **Accentstijl**: gekleurde tekst, of `accentBox` (afgerond blok in de accentkleur, eigen tekstkleur, geen rand). Werkt ook met Karaoke.
- Twee nieuwe presets: Highlight (karaoke-blok) en Highlight Paars (woord-pop).
- **Accentinstellingen**:
  - `accentRate` (0–1) bepaalt welk deel van de blokken automatisch een accent krijgt. De blokken met het langste woord gaan voor; 0 betekent alleen handmatig.
  - Het percentage wijzigen kiest opnieuw voor alle blokken (undo kan).
  - Splitsen of tekst bewerken voegt nooit een accent toe aan een blok dat er geen had.
  - Een knop wist alle accenten.
- **Uitfaden** (`fadeOut`, standaard aan): een caption vervaagt in zijn laatste 0,25 s (max ⅓ van het blok), alleen als er stilte of het einde volgt. Na het transcriberen worden blokken afgekapt op de videolengte, zodat de laatste fade echt afloopt.
- **Opvulwoorden** (eh, ehm, uhm, hm…) worden met één klik uit de woorden en blokken gehaald; lege blokken verdwijnen. Alleen uit de captions, niet uit de video.
- **Zoeken en vervangen** werkt per heel woord: hoofdletters maken niet uit en leestekens blijven staan. Treffers worden gemarkeerd in de lijst. Eén undo-stap.

## 2026-10-16 — Fix: geannuleerde export liet een half bestand achter
- Oorzaak: Mediabunny sluit zijn stream zowel bij afronden als bij annuleren, en voor een `FileSystemWritableFileStream` betekent sluiten "opslaan". Een `abort()` vooraf werkte niet, omdat Mediabunny de stream vergrendeld houdt.
- Oplossing: `fileSink` in de worker zit tussen Mediabunny en het bestand. Bij sluiten slaat hij alleen op als de output niet geannuleerd is; anders wordt het bestand weggegooid.
- Het exportvenster verwijdert het bestand bovendien bij elke export die niet afrondt.
- Getest: annuleren op 37% laat 0 bytes achter; een normale export blijft 52,3 MB, met alle 1473 frames en de PCM-audio intact.
- Audio-controle op de echte exports van de gebruiker (`Timeline 1-captions.mov`, `Timeline 1-caption2323s.mov`): de PCM-data is byte voor byte gelijk aan de bron (zelfde MD5), net als de audio- en videotijdstempels. Wat niet wordt meegekopieerd: het timecode-spoor (01:00:00:00) uit DaVinci Resolve.

## 2026-10-17 — Opslag en login (fase 6)
- Supabase-project `zpdpuhwoitzmsswkqdcl`. De Supabase-connector heeft geen toegang tot dat account; het schema staat daarom als migratie in `supabase/migrations/20261017000000_init.sql` en moet in de SQL-editor worden gedraaid.
- Tabellen:
  - `clients` (naam en glossary);
  - `presets` (stijl-JSON, per klant of algemeen);
  - `projects` (fingerprint, video-meta, caption-data als JSON);
  - `fonts` (verwijzing naar een private storage-bucket `fonts`).
  Geen video in Supabase.
- Toegang: één RLS-policy per tabel. Iedereen die is ingelogd met @flitsdigital.nl mag alles; ieder ander ziet niets (`public.is_flits()` op het e-mailadres in de JWT). Als intern tool werkt het team samen aan alles.
- Login: magic link via Supabase Auth, geen wachtwoord. De app weigert andere domeinen al vóór het versturen. Optioneel weigert hook `hook_flits_only_signup` ook het aanmaken van accounts (aanzetten in Authentication → Hooks).
- `/api/transcribe` en `/api/refine` controleren de Supabase-sessie (`auth.getUser`) en het domein. Zonder geldige sessie volgt 401.
- Projecten heropenen:
  - Het bronbestand wordt herkend aan naam, grootte, duur en de SHA-256 van de eerste 4 MB.
  - De `FileSystemFileHandle` wordt per project in IndexedDB bewaard, zodat heropenen één toestemmingsklik is.
  - Mismatch: waarschuwing met de reden; doorgaan werkt de fingerprint bij.
  - Bestand weg of geen toegang: een banner met een eigen "Bestand kiezen"-knop. De bestandskiezer heeft de klik-activatie nodig, dus niets traags vóór de picker.
- Autosave 0,8 s na de laatste wijziging, met de status in de topbalk. Bij teruggaan wordt eerst opgeslagen; met onopgeslagen wijzigingen waarschuwt de browser bij sluiten.
- Per klant: presets (stijl-id `custom-<uuid>`), geüploade fonts (bij openen gedownload en geregistreerd) en de glossary (opgeslagen bij verlaten van het veld).
- Gekozen klant op het projectscherm wordt lokaal onthouden (localStorage, alleen gemak).
- "Nieuwe video" in het contextmenu gaat nu terug naar het projectscherm.

## 2026-10-17 — Eigen kleurkiezer
- Het native `<input type="color">` opende in Chrome los van het veld (onderin het scherm) en werkte onhandig.
- Vervangen door `ColorPicker`: een shadcn-popover naast het veld met `react-colorful` (±3 KB, geen dependencies). Erin:
  - kleurvlak en kleurtoon;
  - 10 snelle kleuren (Flits-kleuren en preset-accenten);
  - hex-invoer;
  - pipet (Chrome EyeDropper, ook om een kleur uit de video te pakken).
- Voor schaduw en achtergrond zit de dekking (#RRGGBBAA) in de kiezer zelf; de aparte dekkingsschuif is weg. Een snelle kleur behoudt de dekking.
- Dezelfde kiezer zit in het stijlpaneel en, als ronde knop, in de werkbalk op de video.

## 2026-10-17 — Blokrand slepen neemt de woorden mee
Eerder veranderde het slepen van een blokrand alleen de bloktijd; de woorden hielden hun oude tijden. Per-woord-animaties (woord voor woord, karaoke, woord-pop) toonden de tekst daardoor pas op het oude moment. Nu verdeelt `setGroupTiming` de woorden van het blok lineair over de nieuwe start en het nieuwe einde. Dit is een expliciete handmatige wijziging, dus het valt niet onder "geen tijden verzinnen" (dat geldt voor de AI).

## 2026-10-20 — Captiontekst past live aan
Elke toetsaanslag in het tekstveld gaat direct als `editGroupText` door, met gesture-key `text:<blok>`: een reeks typen is één undo-stap. Zolang het veld focus heeft houdt het een eigen waarde, zodat hergroeperen van woorden of spaties de cursor niet verspringt. Een tussentijds leeg veld (alles selecteren, dan typen) wordt overgeslagen; een leeg veld bij verlaten verwijdert het blok, zoals voorheen.

## 2026-10-20 — Architectuuropschoning
- **Regels van de captiondata op één plek** (`project/model.ts` `normalize`). Elk command en elk geladen project gaat erdoorheen:
  - elk blok heeft minstens één woord;
  - een woord hoort bij hooguit één blok;
  - accenten zijn woorden van het eigen blok;
  - blokken overlappen niet;
  - `words` bevat alleen woorden die in een blok staan, gesorteerd op tijd.

  Woorden van een verwijderd blok verdwijnen dus mee. Een property-test (`model.test.ts`) voert willekeurige reeksen commands uit en controleert na elke stap de regels.
- **Blokken krijgen bij opnieuw indelen of transcriberen ids die op dat moment niet in gebruik zijn.** Ids zijn "hoogste + 1", dus het id van een verwijderd blok kan terugkomen. Daarom wist de editor een selectie zodra die naar een blok wijst dat niet meer bestaat. Eigen stijl per blok blijft bij opnieuw indelen behouden.
- **Stijl per blok slaat alleen de gewijzigde velden op, ook binnen `font`.** Een blok dat alleen groter is, volgt dus het lettertype van het project. Preview en export laden alle fonts die in gebruik zijn (`usedFonts`), ook die van uitzonderingen per blok.
- **Een video koppelen aan een project** (nieuw, heropenen, vervangen) loopt via `project/source-video.ts`.
- **Autosave** staat los van React (`project/autosave.ts`). Opslagen gebeuren één voor één en op volgorde.
- **Export:** `startExport` is eigenaar van het doelbestand. Na annuleren, een fout of een crash bestaat er óf een compleet bestand óf niets, ook als een font niet laadt.
- **Draadformaten** (`RefineInput`, `Refinement`) staan in `project/types.ts`. De server importeert ze van de client, nooit andersom. De refine-keten blijft staan voor later (Claude staat nog uit).

## 2026-10-20 — Fixes na de codereview
- Terug naar projecten gaat alleen als de laatste wijzigingen echt zijn opgeslagen; anders blijf je in de editor met de opslagfout in beeld.
- Een project met een eigen font van de klant laadt opnieuw zodra de fonts van de klant binnen zijn. Eerder bleven de captions weg tot je de stijl aanpaste.
- Exporteren naar het bronbestand wordt geweigerd. Zonder bewaarde handle (een gesleept bestand) geldt dezelfde bestandsnaam als bron.
- De export rekent vanaf `VideoMeta.startTime`, de eerste tijdstempel van het primaire video- en audiospoor, net als de Conversion. Ook de `.srt`/`.vtt` bij de export schuiven daarnaar.
- Exportafmetingen worden even gemaakt, want 4:2:0-encoders weigeren oneven formaten.
- Sneltoetsen staan uit terwijl het exportvenster open is en wanneer een invoerveld focus heeft, ook een schuifregelaar.
- Transcriptie gebruikt 16 kbps Opus en weigert video's langer dan 30 minuten vóór het uitpakken. De serverlimiet van 4 MB blijft.
- "mm" telt niet meer als opvulwoord, want het is ook een maateenheid.
- Een los woord van één letter gaat na een zinseinde of een pauze naar het vorige blok, niet naar de volgende zin.
- Foutmeldingen van de spraakdienst gaan alleen naar de serverlog.
- De refine-keten (Claude) blijft staan, zoals eerder besloten.
