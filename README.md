# flitscript

Interne tool van Flits Digital voor geanimeerde captions op short-form video (TikTok, Reels, Shorts).
De video blijft op je eigen computer: transcriptie gaat via een kleine serverfunctie, renderen en exporteren gebeurt in de browser (WebCodecs + Mediabunny).

## Starten

```bash
npm install
cp .env.example .env.local   # vul ELEVENLABS_API_KEY in
npm run dev
```

Werkt alleen in Chrome desktop.

## Checks

```bash
npm run verify:quick   # typecheck + unit tests
```

Plan en keuzes: [PLAN.md](PLAN.md) en [DECISIONS.md](DECISIONS.md).

## Beheer (niet in de code)

De code laat alleen @flitsdigital.nl-adressen toe. Of dat waterdicht is, hangt af van deze instellingen.

**Supabase → Authentication:**
- **Confirm email** aan. Anders kan iemand vanuit de console `iemand@flitsdigital.nl` met een wachtwoord aanmaken zonder de mailbox te bezitten.
- **Allow new users to sign up** uit; nodig teamleden uit via Users → Invite. Laat je signups aan, zet dan de hook *Before User Created* op `public.hook_flits_only_signup` en test dat een Gmail-adres wordt geweigerd.
- **URL Configuration → Redirect URLs:** alleen het exacte productiedomein en `http://localhost:5173`. Gebruik geen wildcards zoals `*.vercel.app`, want daarmee kan iemand een inloglink naar zijn eigen site laten sturen.

**Uit dienst:** verwijder of blokkeer de gebruiker in Supabase. Een open browsersessie blijft anders werken, ook als de mailbox al weg is.

**Vercel:** zet in de Firewall een rate-limit-regel op `/api/*`, zodat een gelekte sessie geen ElevenLabs-kosten kan opdrijven. Zet `ANTHROPIC_API_KEY` pas als de AI-correctie terugkomt.
