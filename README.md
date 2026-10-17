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
