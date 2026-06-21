# Maichan
Replace yourself with ai on social media!

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
- Onboarding (beeper token, personality, chat)
- Better ui (make 3d scene look even better & make animations look smoother)
- improve LLM (improve prompts)
- More control (auto-send profile per chat)

## How to run
**Requirements**
- Beeper
- Nodejs
- At least 1 LLM api key

### **.env** (put in /server)
```bash
API_KEY=[hack-club api]
PORT=5001
BEEPER_ACCESS_TOKEN=[get from beeper settings]
BEEPER_BASE_URL=http://localhost:23373/v1
GEMINI_API_KEY=[smth]
NVIDIA_API_KEY=[nvidia nim]
# gcalendar (optional)
GOOGLE_CALENDAR_CLIENT_ID=[need to create]
GOOGLE_CALENDAR_CLIENT_SECRET=[need to create]
GOOGLE_CALENDAR_REDIRECT_URI=http://localhost:5001/api/calendar/callback
GOOGLE_CALENDAR_ID=primary
TZ=America/Toronto
```

### Installation
1. Clone this repo with `git clone <repo>`
```bash
cd maichan
cd server && npm install

# then
cd ../client && npm install
```

### Running
Terminal 1
```bash
cd server
node index.js
```
Terminal 2
```bash
cd client
npm run dev
```


note: currently only tested on mac + instagram/discord msgs