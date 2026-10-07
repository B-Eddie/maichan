<video width="640" height="360" controls>

  <source src="https://user-cdn.hackclub-assets.com/019ee80d-3c3d-758a-afd0-690ef2caaf4f/screenrecording_06-20-2026_22-38-03_1.mp4" type="video/mp4">
  Your browser does not support the video tag.
</video>


[![npm](https://img.shields.io/npm/v/maichan)](https://www.npmjs.com/package/maichan)

# Maichan
Replace yourself with ai on social media!

**[Get Maichan / try the demo](https://www.npmjs.com/package/maichan)** — one package with the API and dashboard included.

```bash
npx maichan@latest
```

First run walks you through your Beeper token and AI API key, then opens the local dashboard.
No source download or development server is needed.

## The problem

There are way too many apps that cause social media addiction. If you are chronically online or want to just step away from a chat for a sec, this is for you!
Maichan watches selected Beeper chats and automatically replies to them in your voice so that you can focus on more important tasks.

## Features

- Beeper desktop integration: gets chats from beeper
- Personality: custom personality (global or can have different ones per chat)
- Drafts: put bot messages as a draft which needs confirmation before sending
- Smart actions: reacting to messages
- Google calendar: read events for context, creating/editing/deleting events
- 3D sim: each chat has a table and looks pretty cool
  -> Open in beeper: click a table to open in beeper
- Activity log: realtime stream of messages, drafts, etc
- LLM fallback - first tries Nvidia nim, then HC ai, then gemini
- Watching and responding to instagram reels
- Video messages: can watch videos with gemini

## Challenges

- Santizing messsages from LLMs: llm's r stupid and hard to work with
- Beeper integration: need to read beeper documentation to understand all the paths and limitations
- 3D ui: problems when integrating 3d scene and backend
- calendar guardrails: LLM loved spamming creating events, so there had to be a lot of checks

## Future

- More onboarding help for personality and chat selection
- Better ui (make 3d scene look even better & make animations look smoother)
- improve LLM (improve prompts)
- More control (auto-send profile per chat)

## Quick start

You need **Node.js 22.12 or newer**, **Beeper Desktop** with its local API enabled,
and an API key for **NVIDIA NIM**, **Hack Club AI**, or **Google Gemini**.
Maichan has only been tested on macOS with Instagram and Discord chats.

1. Open Beeper Desktop. Enable its local API in Settings and copy the access token.
2. Open a terminal and run:

   ```bash
   npx maichan@latest
   ```

3. Follow the prompts for your Beeper token, AI provider and API key. Secrets are hidden while typing.
   The default Beeper API URL is `http://localhost:23373/v1` and the dashboard port is `5001`.
4. Maichan opens `http://127.0.0.1:5001`. Choose which chats to watch, set your personality, and save.
   New installations use **draft mode**, so you review replies before sending them.

Keep Beeper and the terminal running. Press **Ctrl+C** in the terminal to stop Maichan.
Run `npx maichan@latest` again whenever you want to use it. Your settings are kept between runs and upgrades.
The dashboard runs locally; selected chat context is sent to the AI provider to generate replies.

### Install once (optional)

```bash
npm install --global maichan
maichan
```

### Commands

For an install with `npx`, replace `maichan` below with `npx maichan@latest`.

| Command | What it does |
| --- | --- |
| `maichan` or `maichan start` | Start the app; guide setup on first run and open the dashboard |
| `maichan setup` | Add or update your Beeper token and AI key; preserve chat settings |
| `maichan doctor` | Check configuration, dashboard files, and the Beeper connection |
| `maichan --no-open` | Start without opening your browser |
| `maichan --port 5002` | Use another dashboard port for this run |
| `maichan --data-dir /path/to/settings` | Use a separate settings directory |
| `maichan --help` | Show commands and options |
| `maichan --version` | Show the installed version |

### Troubleshooting

- **Cannot connect to Beeper:** open Beeper Desktop, enable its local API, and run `maichan doctor`.
  Check the URL and token with `maichan setup`.
- **Token rejected:** copy a fresh token from Beeper Settings and run `maichan setup`.
- **Port already in use:** stop your other Maichan instance or run `maichan --port 5002`.
- **No chats:** check the Beeper connection, then choose chats in the dashboard.
- **AI replies fail:** verify your provider's API key and available quota. `doctor` checks that an AI key
  exists; it does not send a request to the AI provider or validate the key.
- **Setup needs a terminal:** run the command directly in an interactive terminal rather than piping input.

### Settings and optional Google Calendar

Settings are stored in `~/.maichan/` by default:

- `.env` — Beeper token, API keys, and optional environment settings; readable only by your user on Unix.
- `config.json` — selected chats, personalities, draft mode, and other dashboard settings.
- `calendar-tokens.json` — created when you connect Google Calendar.

You can override the location with `--data-dir` or `MAICHAN_DATA_DIR`.
Environment variables override saved `.env` values. Restart Maichan after editing settings.
For automation or a noninteractive terminal, create the settings directory and `.env` yourself:

```dotenv
BEEPER_ACCESS_TOKEN=your_beeper_token
BEEPER_BASE_URL=http://localhost:23373/v1
NVIDIA_API_KEY=your_nvidia_key
PORT=5001
```

Use `API_KEY` for Hack Club AI or `GEMINI_API_KEY` for Gemini instead of `NVIDIA_API_KEY`.
If you configure multiple providers, Maichan keeps its existing fallback order:
NVIDIA NIM, Hack Club AI, then Gemini. Gemini is also used for video understanding.
On Unix, use `chmod 600 ~/.maichan/.env` after creating this file manually.

Google Calendar is optional. Add these values to `.env`, restart, and connect from the dashboard:

```dotenv
GOOGLE_CALENDAR_CLIENT_ID=your_client_id
GOOGLE_CALENDAR_CLIENT_SECRET=your_client_secret
GOOGLE_CALENDAR_REDIRECT_URI=http://localhost:5001/api/calendar/callback
GOOGLE_CALENDAR_ID=primary
TZ=America/Toronto
```

If you change the port, update the redirect URI and your Google OAuth configuration to match.
Existing source installations can keep their settings by running
`maichan --data-dir /absolute/path/to/maichan/server`, or copying their `.env`, `config.json`,
and optional `calendar-tokens.json` into `~/.maichan/` before starting.

## Development

These commands are for working on the source. Users only need the quick start above.

```bash
git clone https://github.com/B-Eddie/maichan.git
cd maichan
npm ci
npm run setup
npm run build
npm start
```

For hot reload, use `npm run dev` and open `http://localhost:5173`.
The development proxy expects the API on port `5001`.
Run `npm test` for CLI and startup checks, and `npm run verify:package` to install the tarball in an isolated directory and repeat those checks against the production package. The `client` and `server` directories are internal
parts of this app; they are no longer published as separate packages.

## Building the distributable package

```bash
npm ci
npm test
npm pack
```

`npm pack` builds the dashboard and produces `maichan-0.2.0.tgz`. The tarball includes the CLI,
API, built dashboard, and bundled 3D assets. Users do not need Vite, React build tools, or a source checkout.
Local credentials, chat settings, calendar tokens, and development dependencies are excluded.

To verify the tarball, install it in a separate directory and run its command:

```bash
npm install /absolute/path/to/maichan-0.2.0.tgz
npx --no-install maichan --help
npx --no-install maichan
```

For maintainers: publish the root package with `npm publish --access public` after reviewing the tarball.
The demo/download link should point to **https://www.npmjs.com/package/maichan** once published.
