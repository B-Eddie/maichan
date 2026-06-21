const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

const TOKEN_PATH = path.join(__dirname, "calendar-tokens.json"); // calendar token exist here if user authorized
const SCOPES = ["https://www.googleapis.com/auth/calendar"];
const TIMEZONE = process.env.TZ || "America/Toronto";

// format date
function formatPartsInTimezone(date, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .formatToParts(date)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

function getTodayIsoDate() {
  return formatPartsInTimezone(new Date(), TIMEZONE).slice(0, 10);
}

function getTomorrowIsoDate() {
  const [y, m, d] = getTodayIsoDate().split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d + 1, 12, 0, 0);
  return formatPartsInTimezone(new Date(utc), TIMEZONE).slice(0, 10);
}

// always interpret dates as in TIMEZONE
function toWallClockDateTime(value) {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();

  // Naive local datetime: treat as already in TIMEZONE
  const naive = trimmed.match(
    /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?(?:\.\d+)?$/,
  );
  if (naive) {
    const sec = naive[3] || "00";
    return `${naive[1]}T${naive[2]}:${sec}`;
  }

  // Date only
  const dateOnly = trimmed.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (dateOnly) return `${dateOnly[1]}T09:00:00`;

  // parse timezone offset; convert to TIMEZONE
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return formatPartsInTimezone(parsed, TIMEZONE);
}

function loadTokens() {
  if (!fs.existsSync(TOKEN_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
  } catch {
    return null;
  }
}

function saveTokens(tokens) {
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
}

function getOAuthClient() {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Missing Google Calendar OAuth env vars");
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function isConfigured() {
  return !!(
    process.env.GOOGLE_CALENDAR_CLIENT_ID &&
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET &&
    process.env.GOOGLE_CALENDAR_REDIRECT_URI
  );
}

function isConnected() {
  const tokens = loadTokens();
  return !!(tokens?.refresh_token || tokens?.access_token);
}

function getAuthUrl() {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });
}

async function handleOAuthCallback(code) {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    const existing = loadTokens();
    if (existing?.refresh_token) {
      tokens.refresh_token = existing.refresh_token;
    }
  }
  saveTokens(tokens);
  return tokens;
}

async function getAuthedClient() {
  const tokens = loadTokens();
  if (!tokens) throw new Error("Calendar not connected");

  const client = getOAuthClient();
  client.setCredentials(tokens);

  client.on("tokens", (newTokens) => {
    saveTokens({ ...tokens, ...newTokens });
  });

  return client;
}

async function getCalendarApi() {
  const auth = await getAuthedClient();
  return google.calendar({ version: "v3", auth });
}

function getCalendarId() {
  return process.env.GOOGLE_CALENDAR_ID || "primary";
}

function formatEventTime(eventTime) {
  if (!eventTime) return "";
  if (eventTime.date) {
    const d = new Date(`${eventTime.date}T12:00:00`);
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: TIMEZONE,
    });
  }
  const start = new Date(eventTime.dateTime);
  return start.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: eventTime.timeZone || TIMEZONE,
  });
}

function formatEventRange(event) {
  const start = formatEventTime(event.start);
  const end = event.end?.dateTime
    ? new Date(event.end.dateTime).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: event.end.timeZone || TIMEZONE,
      })
    : null;
  if (end && event.start?.dateTime) return `${start} - ${end}`;
  return start;
}

// give ai upcoming events
async function listUpcomingEvents({ days = 7, maxResults = 25 } = {}) {
  const calendar = await getCalendarApi();
  const timeMin = new Date();
  const timeMax = new Date();
  timeMax.setDate(timeMax.getDate() + days);

  const { data } = await calendar.events.list({
    calendarId: getCalendarId(),
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults,
  });

  return data.items || [];
}

function formatEventsForPrompt(events) {
  if (!events.length) return "(No upcoming events)";

  return events
    .map((event) => {
      const when = formatEventRange(event);
      const title = event.summary || "(untitled)";
      return `- id:${event.id} | ${when} | ${title}`;
    })
    .join("\n");
}

async function getCalendarContext({ days = 7 } = {}) {
  if (!isConnected()) return null;
  try {
    const events = await listUpcomingEvents({ days });
    return formatEventsForPrompt(events);
  } catch {
    return null;
  }
}

function getDateContext() {
  const now = new Date();
  const formatted = now.toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: TIMEZONE,
  });
  const today = getTodayIsoDate();
  const tomorrow = getTomorrowIsoDate();
  return `Today's date and time: ${formatted} (${TIMEZONE}). Today (ISO): ${today}. Tomorrow (ISO): ${tomorrow}. When interpreting "today", "tomorrow", or weekday names, use these dates exactly.`;
}

function buildCalendarInstructions(calendarContext, autoWrite) {
  if (!calendarContext) return "";

  let instructions = `\n\nYour Google Calendar (next 7 days, ${TIMEZONE}):\n${calendarContext}`;

  if (autoWrite) {
    const tomorrow = getTomorrowIsoDate();
    instructions += `

Calendar actions (hidden from the user - put each on its own line):
- Create event: CALENDAR:CREATE {"summary":"Title","start":"${tomorrow}T15:00:00","end":"${tomorrow}T16:00:00","description":"optional","location":"optional"}
- Delete event: CALENDAR:DELETE {"eventId":"event-id-from-list-above"}

CRITICAL — ask before you create:
- NEVER use CALENDAR:CREATE if the conversation only mentions a day or vague plan without a specific clock time.
- Vague plans like "wanna get food tomorrow", "let's hang out tmrw", or "food tomorrow?" require you to ASK what time works first. Do NOT pick a random time and do NOT emit CALENDAR: lines.
- Only CREATE after a specific time is stated or confirmed: e.g. "7pm", "at noon", "3:30", "yeah 6 works" (when 6 was already proposed).
- If the latest message has no specific time, reply by asking when — and include zero CALENDAR: lines.

Rules:
- ALL datetimes are wall-clock times in ${TIMEZONE}. Do NOT add Z or +00:00 offsets.
- "Tomorrow" is always ${tomorrow}. Use that exact date in start/end once a time is agreed.
- Use 24-hour format: YYYY-MM-DDTHH:mm:ss (e.g. ${tomorrow}T19:00:00).
- Put CALENDAR: lines at the very beginning of your reply, before your visible message to the user.
- CALENDAR JSON must be on a single line (no line breaks inside the JSON).
- Only DELETE when the user explicitly asks to cancel/remove an event.
- Mention created or cancelled events naturally in your visible reply.`;
  } else {
    instructions += `

You can see the calendar but cannot modify it. Suggest times based on free slots; do not use CALENDAR: lines.`;
  }

  return instructions;
}

// remove md code
function stripMarkdownFences(text) {
  return text.replace(/```[a-z]*\n?/gi, "").replace(/```/g, "");
}

function isEventPayload(obj) {
  return (
    obj &&
    typeof obj === "object" &&
    typeof obj.summary === "string" &&
    obj.summary.trim() &&
    obj.start &&
    obj.end
  );
}

/** Bare {"summary":"...","start":"...","end":"..."} blocks without CALENDAR: prefix */
function extractBareEventJson(text) {
  const cleaned = stripMarkdownFences(text);
  const results = [];
  let i = 0;

  while (i < cleaned.length) {
    const idx = cleaned.indexOf("{", i);
    if (idx === -1) break;

    const before = cleaned.slice(Math.max(0, idx - 24), idx);
    if (/CALENDAR:(CREATE|DELETE)\s*$/.test(before)) {
      i = idx + 1;
      continue;
    }

    let depth = 0;
    let pos = idx;
    for (; pos < cleaned.length; pos += 1) {
      const ch = cleaned[pos];
      if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          const jsonStr = cleaned.slice(idx, pos + 1);
          try {
            const payload = JSON.parse(jsonStr);
            if (isEventPayload(payload)) {
              results.push({ action: "CREATE", payload, raw: jsonStr });
            }
          } catch {
            // not valid JSON
          }
          i = pos + 1;
          break;
        }
      }
    }

    if (depth !== 0) i = idx + 1;
  }

  return results;
}

function extractAllCalendarActions(text) {
  const prefixed = extractCalendarActions(text);
  const bare = extractBareEventJson(text);
  return [...prefixed, ...bare];
}

function stripCalendarActionsFromText(text) {
  let out = stripMarkdownFences(text);
  for (const { raw } of extractAllCalendarActions(out)) {
    out = out.replace(raw, "");
  }
  return out.replace(/^CALENDAR:(CREATE|DELETE)\s+\{.*\}\s*$/gm, "").trim();
}

function extractCalendarActions(text) {
  const cleaned = stripMarkdownFences(text);
  const actions = [];
  let i = 0;

  while (i < cleaned.length) {
    const idx = cleaned.indexOf("CALENDAR:", i);
    if (idx === -1) break;

    // text contains "CREATE"/"DELETE"
    const slice = cleaned.slice(idx);
    const header = slice.match(/^CALENDAR:(CREATE|DELETE)\s*/);
    if (!header) {
      i = idx + 9;
      continue;
    }

    const action = header[1];
    let pos = idx + header[0].length;
    while (pos < cleaned.length && /\s/.test(cleaned[pos])) pos += 1;

    if (cleaned[pos] !== "{") {
      i = idx + 1;
      continue;
    }

    // tracking { to find the matching closing bracket
    let depth = 0;
    const start = pos;
    for (; pos < cleaned.length; pos += 1) {
      const ch = cleaned[pos];
      if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          const jsonStr = cleaned.slice(start, pos + 1);
          const raw = cleaned.slice(idx, pos + 1);
          try {
            actions.push({ action, payload: JSON.parse(jsonStr), raw });
          } catch {
            // skip cooked JSON
          }
          i = pos + 1;
          break;
        }
      }
    }

    if (depth !== 0) i = idx + 1;
  }

  return actions;
}

function validateCreatePayload(payload) {
  const summary = payload?.summary?.trim();
  const startStr = toWallClockDateTime(payload?.start);
  const endStr = toWallClockDateTime(payload?.end);

  if (!summary) throw new Error("Event summary is required");
  if (!startStr || !endStr) throw new Error("Invalid start or end time");
  if (endStr <= startStr) throw new Error("End time must be after start time");

  const today = getTodayIsoDate();
  const [y, m, d] = today.split("-").map(Number);
  const yesterday = formatPartsInTimezone(
    new Date(Date.UTC(y, m - 1, d - 1, 12)),
    TIMEZONE,
  ).slice(0, 10);

  // Don't allow events in the past
  if (startStr.slice(0, 10) < yesterday) {
    throw new Error("Cannot create events in the past");
  }

  if (startStr.slice(0, 10) === endStr.slice(0, 10)) {
    const toMins = (s) =>
      parseInt(s.slice(11, 13), 10) * 60 + parseInt(s.slice(14, 16), 10);

    // don't create event > 1 day
    if (toMins(endStr) - toMins(startStr) > 24 * 60) {
      throw new Error("Event duration exceeds 24 hours");
    }
  }

  return {
    summary,
    startStr,
    endStr,
    description: payload.description?.trim(),
    location: payload.location?.trim(),
  };
}

// create teh event
async function createEvent(payload) {
  const validated = validateCreatePayload(payload);
  const calendar = await getCalendarApi();

  const requestBody = {
    summary: validated.summary,
    start: { dateTime: validated.startStr, timeZone: TIMEZONE },
    end: { dateTime: validated.endStr, timeZone: TIMEZONE },
  };
  if (validated.description) requestBody.description = validated.description;
  if (validated.location) requestBody.location = validated.location;

  const { data } = await calendar.events.insert({
    calendarId: getCalendarId(),
    requestBody,
  });

  return data;
}

async function deleteEvent(eventId) {
  if (!eventId?.trim()) throw new Error("eventId is required");
  const calendar = await getCalendarApi();
  await calendar.events.delete({
    calendarId: getCalendarId(),
    eventId: eventId.trim(),
  });
}

// when recent conversation includes a specific time
function shouldAllowCalendarCreate(conversationContext) {
  if (!conversationContext?.trim()) return false;
  const t = conversationContext.toLowerCase();

  if (/\b([01]?\d|2[0-3]):[0-5]\d\b/.test(t)) return true;
  if (
    /\b(1[0-2]|[1-9])\s*(:\d{2})?\s*(am|pm|a\.?\s*m\.?|p\.?\s*m\.?)\b/.test(t)
  )
    return true;
  if (
    /\b(at|around|about)\s+(1[0-2]|[1-9])\b(?!\s*(minutes|mins|hours|hrs|days|weeks))/i.test(
      conversationContext,
    )
  ) {
    return true;
  }
  if (/\b(noon|midnight|midday)\b/.test(t)) return true;

  return false;
}

// get calendar actions and execute them, then remove from text
async function processCalendarActions(
  replyText,
  { autoWrite = true, conversationContext = "" } = {},
) {
  if (!autoWrite || !isConnected()) {
    return { cleanedReply: stripCalendarActionsFromText(replyText) };
  }

  const actions = extractAllCalendarActions(replyText);

  for (const { action, payload } of actions) {
    if (action === "CREATE") {
      if (!shouldAllowCalendarCreate(conversationContext)) {
        continue;
      }
      await createEvent(payload);
    } else if (action === "DELETE") {
      await deleteEvent(payload?.eventId);
    }
  }

  let cleanedReply = stripCalendarActionsFromText(replyText);
  cleanedReply = cleanedReply.replace(/\n{3,}/g, "\n\n");

  return { cleanedReply };
}

module.exports = {
  isConfigured,
  isConnected,
  getAuthUrl,
  handleOAuthCallback,
  getCalendarContext,
  getDateContext,
  buildCalendarInstructions,
  extractCalendarActions,
  extractAllCalendarActions,
  stripCalendarActionsFromText,
  shouldAllowCalendarCreate,
  processCalendarActions,
  createEvent,
  deleteEvent,
  TIMEZONE,
};
