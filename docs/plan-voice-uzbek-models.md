# Uzbek speech services for the voice orb — what they cost (read 26 Nov 2026)

A reference for the day the operator decides whether «Yordamchi»'s ears and
voice stay on Gemini. Their ruling of 2026-11-26: «we'll test Gemini first.
If it fails then we'll analyze Uzbek models». The orb's own record is
`docs/assistant-and-ai.md` «The voice orb».

**What this compares.** ONE voice exchange = 8 seconds of a question turned
into text + a 200-character answer (about 10 seconds) spoken back. These
services replace only the EARS (speech → text) and the VOICE (text → speech);
the model that works out the answer costs what it costs either way.

**How it was gathered.** Published price pages and API docs, read on
26 Nov 2026 by a research agent; no account was opened anywhere, so nothing
behind a login was seen and **no service's Uzbek was listened to or timed**.
UZS → USD at the Central Bank of Uzbekistan's official rate of that day:
1 USD = 11,987.89 UZS (`cbu.uz/en/arkhiv-kursov-valyut/json/USD/`). Every
accuracy or latency figure below is the vendor's own claim.

## Prices as published

| Provider | Speech → text | Text → speech | Free / minimum | Access | Says where data is kept |
|---|---|---|---|---|---|
| **Gemini API** (today's) | `gemini-3.8-flash` input $0.75 per 1M tokens, 32 tokens per second of audio → $0.0014/min | `gemini-3.8-flash-lite-tts` $6.00 per 1M audio tokens (25 tokens/s) → about $0.0075 per 1,000 chars; `flash-tts` $9.00 | free tier exists | self-serve key, REST | no |
| **NeuronAI** (neuronai.uz) | 1 UZS/s = 60 UZS/min → $0.0050/min, billed per second | 0.3 UZS/char → $0.0250 per 1,000 | top-up from 10,000 UZS; bonus 5–20 % | self-serve key, REST, SDKs | no |
| **UzbekVoiceAI** (uzbekvoice.ai) | 450 UZS/min → $0.0375/min (rounding for short clips not stated) | 500 UZS per 1,000 chars → $0.0417 | 10,000 UZS on registration; 3 parallel requests | self-serve key, REST; no streaming endpoint in the docs | no |
| **Muxlisa AI** (muxlisa.uz, Uzinfocom) | 350 UZS/min → $0.0292/min, billed per second | 650 UZS per 1,000 chars → $0.0542 | 14 minutes of recognition free; no contract needed | self-registration; developer docs behind a login | no (terms and privacy pages are placeholders) |
| **Aisha AI** (aisha.group / VoiceLab) | 425 UZS/min → $0.0355/min (rounding not stated) | 1 UZS/char → $0.0834 per 1,000 | free trial, size not stated | self-serve key; REST, WebSocket and gRPC streaming for both | no |
| **Kotib AI** (kotib.ai) | 1–60 s flat 300 UZS → $0.0250 a request | 8 UZS/char → $0.667 per 1,000 (an outlier — confirm with them) | none stated | key issued to a company on request | **yes — «Data is stored in Uzbekistan»** |
| **Yandex SpeechKit** | $0.00133 per 15 s, rounded up → $0.0053/min | v1 $11 per 1M chars → $0.0110 per 1,000; v3 $0.00133 per 250 chars | not checked | cloud account; Uzbek `uz-UZ`, voices nigora / zamira / yulduz | no |
| **ElevenLabs** | Scribe $0.20/hour → $0.0033/min | Uzbek on v4 Turbo $0.04, v4 / v3 $0.08 per 1,000 | free plan works with the API | self-serve key | no |
| **Azure Speech** | real-time $1/hour → $0.0167/min | neural $15 per 1M chars → $0.0150 per 1,000 | free tier: 5 h + 0.5M chars a month | Azure subscription; voices uz-UZ-MadinaNeural / SardorNeural | region the customer picks |
| **Google Cloud STT** (Chirp) | $0.016/min | no Uzbek voice found | — | GCP project; `uz-UZ` in `us` / `eu` only | us / eu |

**Gemini's prices DOUBLE on 1 January 2027** (input $1.50, TTS $12 / $18 per
1M) — stated on its pricing page.

## One exchange, and a month of them

Each row uses the provider's own billing rule.

| Ears + voice | One exchange | 1,000 a month | 5,000 | 20,000 |
|---|---|---|---|---|
| **Gemini (today's: Flash + flash-lite TTS), to 31 Dec 2026** | $0.0017 | $1.69 | $8.46 | $33.84 |
| The same from 1 Jan 2027 | $0.0034 | $3.38 | $16.92 | $67.68 |
| Yandex (v3 voice) | $0.0027 | $2.67 | $13.33 | $53.31 |
| Azure | $0.0052 | $5.22 | $26.11 | $104.44 |
| **NeuronAI** | 68 UZS = $0.0057 | $5.67 | $28.36 | $113.45 |
| ElevenLabs (Scribe + v4 Turbo) | $0.0084 | $8.44 | $42.22 | $168.89 |
| **UzbekVoiceAI** (if recognition is billed per second) | 160 UZS = $0.0133 | $13.35 | $66.73 | $266.94 |
| **Muxlisa** | 177 UZS = $0.0147 | $14.74 | $73.69 | $294.74 |
| **Aisha** (if recognition is billed per second) | 257 UZS = $0.0214 | $21.41 | $107.05 | $428.21 |
| **Kotib** | 1,900 UZS = $0.158 | $158.49 | $792.47 | $3,169.86 |

- UzbekVoiceAI and Aisha do not say how a short clip is rounded. Rounded up to
  a whole minute they cost $0.046 and $0.052 an exchange — three times the
  figure above.
- A mix is possible, since the ears and the voice are separate rows on
  «AI kalitlari»: Gemini listening + NeuronAI speaking is $0.0052, + UzbekVoice
  $0.0085, + Muxlisa $0.0110.
- The Gemini figure counts audio tokens only; the text around them adds a few
  hundredths of a cent.

## What the prices do not say

- **Which one sounds right in Uzbek.** Nobody's voice or recognition was heard.
  Vendor claims only: Muxlisa «WER 11.39 % call-centre» (April 2026), Kotib
  «25.0 % vs 27.3 % for Gemini 3.1 Pro», UzbekVoiceAI «600 ms minimal response
  time», ElevenLabs places Uzbek in its 10–20 % error band.
- **Where the data goes.** Only Kotib states it stays in Uzbekistan; the rest
  do not say on a public page. For Article 27-1 that is the first question to
  put to any of them in writing.
- **Limits for a short clip.** Aisha speaks 1,000 characters a request, Kotib
  5,000, Yandex v3 250. The orb records a 16 kHz WAV: Kotib, Aisha and
  NeuronAI list WAV; Muxlisa and UzbekVoiceAI do not publish their formats;
  Yandex's short-audio door takes raw LPCM or OggOpus (a WAV minus its
  header).
- **Streaming.** Aisha documents it for both directions; UzbekVoiceAI shows a
  demo but no endpoint; the others do not mention it.

## If Gemini falls short — the order to try

1. **NeuronAI** — the cheapest local service by a factor of two, self-serve,
   and its API takes the orb's audio as it is.
2. **UzbekVoiceAI** and **Muxlisa** — the two with the longest record in Uzbek
   speech; ask each how a clip under a minute is billed.
3. **Kotib** — the only one that states in-country storage; its voice price
   needs confirming before it is counted.

Building any of them in is a provider adapter beside `assistant_gemini`
(`transcribe` and `speak`) and letting the «voice» / «speech» rows name it —
both are Gemini-only today (`ai_features.FEATURES`).

## Sources (all read 26 Nov 2026)

- Gemini: `aistudio.google.com/docs/pricing` · `/docs/audio` · `/docs/speech-generation`
- NeuronAI: `neuronai.uz/uz/pricing/` · `docs.neuronai.uz/uz/api`
- UzbekVoiceAI: `uzbekvoice.ai/en-US/pricing` · `/developers/api/stt` · `/developers/api/tts`
- Muxlisa: `muxlisa.uz/en` · `uzinfocom.uz/en/news/522`
- Aisha: `aisha.group/en/pricing` · `/en/api-documentation/text-to-speech` · `/speech-to-text`
- Kotib: `developer.kotib.ai/docs/prices/` · `/docs/stt/` · `/docs/tts/` · `kotib.ai`
- Yandex: `aistudio.yandex.ru/docs/en/speechkit/pricing` · `/stt/models` · `/tts/voices`
- ElevenLabs: `elevenlabs.io/pricing/api` · `/docs/overview/models`
- Azure: `azure.microsoft.com/en-us/pricing/details/speech/`
- Google Cloud: `cloud.google.com/speech-to-text/pricing`
