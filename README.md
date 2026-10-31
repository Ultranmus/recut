# Recut

Turn one long podcast or video into a week of short clips. Recut transcribes your episode, picks the 5–8 moments worth sharing, and writes a caption for Instagram Reels, LinkedIn, X and YouTube Shorts. You brief it by voice, like you'd brief a video editor.

**Live demo:** [recut.ashvattech.com](https://recut.ashvattech.com)

## What it does

- **Finds the moments.** Groq Whisper transcribes with word-level timestamps, then an LLM ranks self-contained clips. Each one shows its start/end time, a hook line, and why it was picked.
- **Previews without cutting.** Clips play straight from the original file between their timestamps. An optional 9:16 view adds animated captions and can export a vertical video in the browser.
- **Writes per-platform captions.** Each platform gets its own length and tone, and every caption is editable.
- **Talk to your studio.** Press `/`, hold `fn` and dictate a brief with [Wispr Flow](https://wisprflow.ai) (or use the built-in mic). Filler words, digressions and self-corrections ("LinkedIn, no wait, X") are handled, and it shows what it understood: topic, platform, tone and brand rules, plus what it corrected, set aside and ignored.
- **Brand Memory.** Rules like "no emojis" are saved, including rules learned from your own caption edits. New captions must follow them, and any change a rule makes is shown as a before/after.
- **Weekly calendar.** Say "post the Gateway clip on Tuesday" and it appears on Tuesday. Each post has an **Add to Google Calendar** link pre-filled with the captions to publish, and **Export week (.ics)** imports into Google, Apple or Outlook calendars with a reminder before each post.
- **Performance feedback.** Say "it got 40,000 views" or "it flopped". The result is saved as a learning and used to rank clips here and in future uploads.

## Demo mode

The home screen has a **Try the demo episode** option that works with no API key. It's NASA's *Houston We Have a Podcast*, episode 100 ("Apollo 11 to Now", 19 minutes). The transcript and clips were generated once with the same pipeline and are committed in `src/data/`. The audio is in `public/demo/`.

Uploading your own file, and the voice brief features, need a Groq key (see below).

## Get a free Groq key

1. Sign up at [console.groq.com](https://console.groq.com).
2. Open [API Keys](https://console.groq.com/keys) and click **Create API Key**.
3. Copy the key (it starts with `gsk_`).

The free tier is enough to run everything. On free-tier rate limits the app automatically falls back across Groq models.

## Run locally

Requires Node.js 20.9 or later.

```bash
git clone https://github.com/Ultranmus/recut.git
cd recut
npm install
cp .env.example .env.local   # then paste your key after GROQ_API_KEY=
npm run dev
```

Open http://localhost:3000.

## How API keys are handled

There are two ways to supply a key:

- **Server key** (`GROQ_API_KEY` in `.env.local`, or in your Vercel project's environment variables). It's used only inside API routes, never sent to the browser, and never logged. Prompts are built on the server, so the routes can't be used as an open LLM proxy.
- **Your own key**, pasted in the app's **Settings**. It's stored only in your browser's local storage and sent straight from your browser to `api.groq.com`, never to this app's server. It takes priority over the server key.

The server key is shared by everyone using a deployment, so each visitor gets a fair-use limit per 10 minutes (60 audio chunks, 8 analyses, 60 studio requests). Past that, the app asks them to add their own free key. The counts are kept per function instance, so treat this as a guard rather than a hard cap; add a [Vercel Firewall](https://vercel.com/docs/vercel-firewall) rate-limit rule on `/api/*` if you need one.

Uploads are decoded in the browser and sent to Whisper in chunks of about 2 minutes, so large files stay under Vercel's request size limit. Projects, Brand Memory, the calendar and learnings live in your browser (IndexedDB and localStorage).

## Deploy your own

Import the repo on [Vercel](https://vercel.com/new) and add `GROQ_API_KEY` as an environment variable. Nothing else is required.

Optionally set `NEXT_PUBLIC_SITE_URL` (e.g. `https://recut.ashvattech.com`) so link previews and the sitemap use your preferred domain; otherwise the project's production domain is used.

**Google Calendar sync (optional).** To turn on "Connect Google Calendar", create an OAuth client in Google Cloud: enable the Google Calendar API, set up the consent screen (add yourself as a test user), then create a *Web application* client whose authorized JavaScript origins include your site URL. Set `NEXT_PUBLIC_GOOGLE_CLIENT_ID` to its client ID. Sign-in happens in the browser with Google Identity Services, so no client secret is needed and the access token never reaches the server.

Recut is installable as an app (PWA). A small service worker keeps the app shell and pages you've opened available offline; uploads and AI features need a connection.

## Tech

Next.js 16 (App Router), React 19, Tailwind CSS 4, Groq (`whisper-large-v3-turbo`, `openai/gpt-oss-120b` with Qwen and gpt-oss-20b fallbacks). No database.

## Credits

Demo audio and artwork: *Houston We Have a Podcast*, courtesy of NASA. Recut is not affiliated with or endorsed by NASA.

## License

[MIT](LICENSE)
