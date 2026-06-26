const express = require("express");
const cors = require("cors");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { fileURLToPath } = require("url");
require("dotenv").config();

const calendar = require("./calendar");
const drafts = require("./drafts");

const app = express();
app.use(cors());
app.use(express.json());

// get env variables
const BEEPER_URL = process.env.BEEPER_BASE_URL;
const BEEPER_TOKEN = process.env.BEEPER_ACCESS_TOKEN;
const CONFIG_PATH = path.join(__dirname, "config.json");

const DEFAULT_CONFIG = {
  watchedChats: [],
  backgroundInfo: "",
  chatPersonalities: {},
  calendarEnabled: true,
  calendarAutoWrite: true,
  draftMode: true,
  sendDelayMinSec: 0,
  sendDelayMaxSec: 0,
};

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    saveConfig({ ...DEFAULT_CONFIG });
    return { ...DEFAULT_CONFIG };
  }
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getSendDelayMs(config) {
  const min = Math.max(0, Number(config.sendDelayMinSec) || 0);
  const max = Math.max(min, Number(config.sendDelayMaxSec) || 0);
  if (max <= 0) return 0;
  const sec = min + Math.random() * (max - min);
  return Math.round(sec * 1000);
}

async function applySendDelay(config) {
  const ms = getSendDelayMs(config);
  if (ms > 0) await sleep(ms);
}

const beeperHeaders = {
  Authorization: `Bearer ${BEEPER_TOKEN}`,
  "Content-Type": "application/json",
};

// detect network from Beeper chat ID
const IMESSAGE_PREFIX = "imsg##";
function isIMessage(chatId) {
  return typeof chatId === "string" && chatId.startsWith(IMESSAGE_PREFIX);
}

// api endpoints
app.get("/api/config", (req, res) => {
  res.json(loadConfig());
});

app.post("/api/config", (req, res) => {
  const existing = loadConfig();
  const {
    watchedChats,
    backgroundInfo,
    chatPersonalities,
    calendarEnabled,
    calendarAutoWrite,
    draftMode,
    sendDelayMinSec,
    sendDelayMaxSec,
  } = req.body;
  const minDelay = Math.max(0, Number(sendDelayMinSec) || 0);
  const maxDelay = Math.max(
    minDelay,
    Number(sendDelayMaxSec ?? existing.sendDelayMaxSec) || 0,
  );
  saveConfig({
    ...existing,
    watchedChats,
    backgroundInfo,
    chatPersonalities: chatPersonalities || {},
    calendarEnabled: calendarEnabled ?? existing.calendarEnabled ?? true,
    calendarAutoWrite: calendarAutoWrite ?? existing.calendarAutoWrite ?? true,
    draftMode: req.body.draftMode ?? existing.draftMode ?? true,
    sendDelayMinSec: minDelay,
    sendDelayMaxSec: maxDelay,
  });
  res.json({ success: true, message: "configuration synchronized" });
});

app.get("/api/calendar/status", (req, res) => {
  res.json({
    configured: calendar.isConfigured(),
    connected: calendar.isConnected(),
    timezone: calendar.TIMEZONE,
  });
});

app.get("/api/calendar/auth", (req, res) => {
  try {
    if (!calendar.isConfigured()) {
      return res
        .status(400)
        .json({ error: "Google Calendar OAuth not configured in .env" });
    }
    res.redirect(calendar.getAuthUrl());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// creds for calendar
app.get("/api/calendar/callback", async (req, res) => {
  try {
    const { code, error } = req.query;
    if (error) {
      return res.status(400).send(`Calendar auth failed: ${error}`);
    }
    if (!code) {
      return res.status(400).send("Missing authorization code");
    }
    await calendar.handleOAuthCallback(code);
    res.send(
      "<html><body style='font-family:sans-serif;padding:40px'><h2>Google Calendar connected</h2><p>You can close this tab and return to the dashboard.</p></body></html>",
    );
  } catch (err) {
    res.status(500).send(`Calendar connection failed: ${err.message}`);
  }
});

function getPersonalityForChat(config, chatId) {
  const override = config.chatPersonalities?.[chatId]?.trim();
  return override || config.backgroundInfo || "";
}

// more info for calendar
async function enrichPersonalityWithCalendar(personality, config) {
  let enriched = `${personality}

Reply format: plain text only, like a normal text message. Never use HTML or markup — no tags such as <p>, <br>, <b>, or <i>. No markdown either.`;

  enriched += `\n\n${calendar.getDateContext()}`;

  if (config.calendarEnabled === false) return enriched;
  if (!calendar.isConfigured() || !calendar.isConnected()) return enriched;

  const calendarContext = await calendar.getCalendarContext({ days: 7 });
  if (!calendarContext) return enriched;

  const autoWrite = config.calendarAutoWrite !== false;
  return (
    enriched + calendar.buildCalendarInstructions(calendarContext, autoWrite)
  );
}

app.get("/api/simulation", (req, res) => {
  const config = loadConfig();
  res.json({
    stations: drafts.getSimulationStations(config.watchedChats, processingChat),
    drafts: drafts.getAllDrafts(),
  });
});

app.get("/api/drafts", (req, res) => {
  res.json({ drafts: drafts.getAllDrafts() });
});

app.post("/api/drafts/:chatId/approve", async (req, res) => {
  const { chatId } = req.params;
  const draft = drafts.getDraft(chatId);
  if (!draft) {
    return res.status(404).json({ error: "No pending draft for this chat" });
  }

  const config = loadConfig();
  const editedText =
    typeof req.body.text === "string" ? req.body.text : draft.text;
  await executeApprovedDraft(chatId, draft, editedText, config);

  delete drafts.pendingDrafts[chatId];
  res.json({ success: true });
});

app.post("/api/drafts/:chatId/reject", (req, res) => {
  const { chatId } = req.params;
  const draft = drafts.rejectDraft(chatId);
  if (!draft) {
    return res.status(404).json({ error: "No pending draft for this chat" });
  }
  res.json({ success: true });
});

app.post("/api/beeper/focus", async (req, res) => {
  try {
    const { chatId } = req.body;
    if (!chatId) {
      return res.status(400).json({ error: "chatId is required" });
    }
    const response = await axios.post(
      `${BEEPER_URL}/focus`,
      { chatID: chatId },
      { headers: beeperHeaders },
    );
    res.json(response.data || { success: true });
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.error || err.message });
  }
});

app.post("/api/simulation/clear-alert", (req, res) => {
  const { chatId } = req.body;
  if (chatId) drafts.clearNewMessageFlag(chatId);
  res.json({ success: true });
});

// Debug endpoints to inspect Beeper API response format
app.get("/api/debug/chats", async (req, res) => {
  try {
    const response = await axios.get(`${BEEPER_URL}/chats/search`, {
      params: { limit: 50 },
      headers: beeperHeaders,
    });
    res.json({ status: response.status, data: response.data });
  } catch (err) {
    res.status(500).json({
      error: err.message,
      response: err.response?.data,
      status: err.response?.status,
    });
  }
});

app.get("/api/debug/messages/:chatId", async (req, res) => {
  try {
    const response = await axios.get(
      `${BEEPER_URL}/chats/${encodeURIComponent(req.params.chatId)}/messages`,
      { params: { limit: 5 }, headers: beeperHeaders },
    );
    res.json({ status: response.status, data: response.data });
  } catch (err) {
    res.status(500).json({
      error: err.message,
      response: err.response?.data,
      status: err.response?.status,
    });
  }
});

app.get("/api/beeper-chats", async (req, res) => {
  try {
    const params = { limit: 50, inbox: "primary" };
    let response = await axios.get(`${BEEPER_URL}/chats/search`, {
      params,
      headers: beeperHeaders,
      timeout: 15000,
    });
    let items = response.data?.items;
    if (!Array.isArray(items) || items.length === 0) {
      response = await axios.get(`${BEEPER_URL}/chats`, {
        params: { limit: 50 },
        headers: beeperHeaders,
        timeout: 15000,
      });
      items = response.data?.items;
    }
    res.json(Array.isArray(items) ? items : []);
  } catch (err) {
    console.error("beeper-chats failed:", err.message);
    res.json([]);
  }
});

// keeping track of messages
const lastProcessedMessageId = {};
const botSentMessageIds = new Set();
const processingChat = new Set();

// sanitize text
function stripHtml(text) {
  return text?.replace(/<[^>]*>/g, "")?.trim() || "";
}

// create history
function buildConversationSnippet(messages, latestText) {
  const parts = [];
  for (const msg of messages.slice(0, 8).reverse()) {
    const text = stripHtml(msg.text);
    if (text) parts.push(text);
  }
  if (latestText?.trim()) parts.push(stripHtml(latestText));
  return parts.join(" ");
}

function isOwnMessage(msg) {
  return msg.isSender === true || botSentMessageIds.has(msg.id);
}

// add histry and other info to give to ai
function buildChatMessages(backgroundInfo, textContent, history) {
  const messages = [
    {
      role: "system",
      content: `Context about me:\n${backgroundInfo}\n\nTask: Generate a natural reply to the incoming message in the voice of me. If you want to react to a message (for example, with a like or emoji reaction), include a line in your reply that says exactly REACT:[emoji] (e.g. REACT:👍). You may both send a normal reply and include a REACT line if you want to react as well. If you don't want to react, just send the reply as usual.`,
    },
  ];

  // history is most recent to oldest, so reverse it before adding to messages
  for (const msg of history.slice().reverse()) {
    if (!msg.text?.trim()) continue;
    messages.push({
      role: msg.isSender ? "assistant" : "user",
      content: msg.text,
    });
  }
  messages.push({ role: "user", content: textContent });
  return messages;
}

function extractOpenAiReply(data) {
  return data?.choices?.[0]?.message?.content || null;
}

function extractGeminiReply(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts
    .map((p) => (typeof p === "string" ? p : p.text))
    .filter(Boolean)
    .join("");
  return text || null;
}

// helper
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), ms),
    ),
  ]);
}

// get vidoe - for reels lol
async function downloadVideoAttachment(attachment) {
  const downloadUrl = attachment.id || attachment.srcURL;

  const { data } = await axios.post(
    `${BEEPER_URL}/assets/download`,
    { url: downloadUrl },
    { headers: beeperHeaders },
  );

  if (data.error || !data.srcURL) {
    throw new Error(data.error || "Failed to download video");
  }

  const localPath = data.srcURL.startsWith("file://")
    ? fileURLToPath(data.srcURL)
    : data.srcURL;

  if (!fs.existsSync(localPath)) {
    throw new Error(`Downloaded file not found: ${localPath}`);
  }

  const fileBytes = fs.readFileSync(localPath);

  return {
    base64: fileBytes.toString("base64"),
    mimeType: attachment.mimeType || "video/mp4",
  };
}

// video replies - only use gemini since only it supports
async function generateVideoReply(backgroundInfo, textContent, video) {
  const caption = stripHtml(textContent);
  const prompt = `Context about me:\n${backgroundInfo}\n\nTask: Watch this video and generate a natural reply in the voice of me.${caption ? `\n\nThey also sent: ${caption}` : ""}\n\nIf you want to react, include a line REACT:[emoji] (e.g. REACT:❤️). You may both react and reply. If you don't want to react, just send the reply.`;

  const geminiResponse = await withTimeout(
    axios.post(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        contents: [
          {
            role: "user",
            parts: [
              {
                inline_data: { mime_type: video.mimeType, data: video.base64 },
              },
              { text: prompt },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 500,
        },
      },
      {
        headers: {
          "x-goog-api-key": process.env.GEMINI_API_KEY,
          "Content-Type": "application/json",
        },
      },
    ),
    60000,
  );

  return extractGeminiReply(geminiResponse.data);
}

// draft actions
async function executeApprovedDraft(chatId, draft, replyText, config) {
  await applySendDelay(config);

  for (const action of draft.actions) {
    if (action.type === "reaction") {
      await axios.post(
        `${BEEPER_URL}/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(draft.triggerMessageId)}/reactions`,
        { reactionKey: action.emoji },
        { headers: beeperHeaders },
      );
      drafts.logActivity(chatId, "reaction", `Reacted with ${action.emoji}`);
    } else if (
      action.type === "calendar_create" &&
      config.calendarEnabled !== false &&
      calendar.isConnected()
    ) {
      const context = draft.conversationContext || draft.incomingText || "";
      if (!calendar.shouldAllowCalendarCreate(context)) {
        drafts.logActivity(
          chatId,
          "calendar_create",
          "Skipped — no specific time agreed yet",
        );
      } else {
        try {
          const event = await calendar.createEvent(action.payload);
          drafts.logActivity(
            chatId,
            "calendar_create",
            `Added: ${event.summary}`,
          );
        } catch (err) {
          drafts.logActivity(
            chatId,
            "calendar_create",
            `Failed: ${err.message}`,
          );
        }
      }
    } else if (
      action.type === "calendar_delete" &&
      config.calendarEnabled !== false &&
      calendar.isConnected()
    ) {
      try {
        await calendar.deleteEvent(action.payload?.eventId);
        drafts.logActivity(chatId, "calendar_delete", "Removed calendar event");
      } catch (err) {
        drafts.logActivity(chatId, "calendar_delete", `Failed: ${err.message}`);
      }
    }
  }

  // actual text
  if (replyText.length > 0) {
    const sendResponse = await axios.post(
      `${BEEPER_URL}/chats/${encodeURIComponent(chatId)}/messages`,
      { text: replyText },
      { headers: beeperHeaders },
    );

    const sentId = sendResponse?.data?.pendingMessageID;
    if (sentId) {
      botSentMessageIds.add(sentId);
      lastProcessedMessageId[chatId] = sentId;
    }
    drafts.setLastOutgoing(chatId, replyText);
    drafts.logActivity(chatId, "reply_sent", replyText);
  }

  drafts.logActivity(chatId, "draft_approved", "Draft approved and sent");
}

async function processAndSendBotResponse(
  chatId,
  msgId,
  finalReply,
  config,
  { conversationContext = "" } = {},
) {
  await applySendDelay(config);

  const reactMatch = finalReply.match(/REACT:([^\s]+)/m); // reactions

  let reply = finalReply;

  if (config.calendarEnabled !== false && calendar.isConnected()) {
    const { cleanedReply } = await calendar.processCalendarActions(finalReply, {
      autoWrite: config.calendarAutoWrite !== false,
      conversationContext,
    });
    reply = cleanedReply;
  } else {
    reply = calendar.stripCalendarActionsFromText(finalReply);
  }

  reply = reply.replace(/REACT:[^\s]+.*$/gm, "").trim();

  if (reactMatch) {
    await axios.post(
      `${BEEPER_URL}/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(msgId)}/reactions`,
      { reactionKey: reactMatch[1] },
      { headers: beeperHeaders },
    );
  }

  if (reply.length > 0) {
    const sendResponse = await axios.post(
      `${BEEPER_URL}/chats/${encodeURIComponent(chatId)}/messages`,
      { text: reply },
      { headers: beeperHeaders },
    );

    const sentId = sendResponse?.data?.pendingMessageID;
    if (sentId) {
      botSentMessageIds.add(sentId);
      lastProcessedMessageId[chatId] = sentId;
    }
  }
}

// generate responses
async function generateReply(backgroundInfo, textContent, history) {
  const messages = buildChatMessages(backgroundInfo, textContent, history);

  try {
    const nvidiaResponse = await withTimeout(
      axios.post(
        "https://integrate.api.nvidia.com/v1/chat/completions",
        {
          // model: "meta/llama-3.3-70b-instruct",
          // model: "mistralai/mistral-nemotron",
          model: "mistralai/mistral-small-4-119b-2603",
          messages,
          max_tokens: 500,
        },
        {
          headers: { Authorization: `Bearer ${process.env.NVIDIA_API_KEY}` },
        },
      ),
      10000,
    );
    const reply = extractOpenAiReply(nvidiaResponse.data);
    if (reply) return reply;
  } catch (err) {
    // fall through to Hack Club
  }

  try {
    const hackClubResponse = await withTimeout(
      axios.post(
        "https://ai.hackclub.com/proxy/v1/chat/completions",
        {
          model: "google/gemini-3.5-flash",
          messages,
        },
        {
          headers: { Authorization: `Bearer ${process.env.API_KEY}` },
        },
      ),
      10000,
    );
    const reply = extractOpenAiReply(hackClubResponse.data);
    if (reply) return reply;
  } catch (err) {
    // fall through to Gemini
  }

  const geminiResponse = await withTimeout(
    axios.post(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent",
      {
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Contextual about me:\n${backgroundInfo}\n\nTask: Generate a natural reply to the incoming message in the voice of me.\n\nMessage: ${textContent}`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          topP: 1,
          topK: 1,
          maxOutputTokens: 500,
        },
      },
      {
        headers: {
          "x-goog-api-key": process.env.GEMINI_API_KEY,
          "Content-Type": "application/json",
        },
      },
    ),
    10000,
  );

  return extractGeminiReply(geminiResponse.data);
}

async function fetchChatMessages(chatId, limit = 50) {
  const response = await axios.get(`${BEEPER_URL}/chats/${encodeURIComponent(chatId)}/messages`, {
    params: { limit },
    headers: beeperHeaders,
  });
  return response.data.items || [];
}

function describeAttachments(attachments) {
  if (!attachments || attachments.length === 0) return "";
  const counts = {};
  for (const a of attachments) {
    const type = a.type || "file";
    counts[type] = (counts[type] || 0) + 1;
  }
  const parts = Object.entries(counts).map(([type, count]) =>
    count > 1 ? `${count} ${type}s` : `a ${type}`,
  );
  return `[sent ${parts.join(" and ")}]`;
}

function formatTranscript(messages) {
  const lines = [];
  for (const msg of messages.slice().reverse()) {
    const text = stripHtml(msg.text);
    const attachmentDesc =
      msg.attachments?.length > 0
        ? msg.attachments.some((a) => a.type === "video")
          ? "[video]"
          : describeAttachments(msg.attachments)
        : "";
    let content = text;
    if (attachmentDesc)
      content = content ? `${content} ${attachmentDesc}` : attachmentDesc;
    if (!content?.trim()) continue;
    const speaker = msg.isSender ? "Me" : msg.senderName || "Them";
    lines.push(`${speaker}: ${content}`);
  }
  return lines.join("\n");
}

async function generateSummary(transcript, backgroundInfo) {
  const messages = [
    {
      role: "system",
      content: `Context about me:\n${backgroundInfo}\n\nTask: Summarize the conversation below between me (it is a bot in my place) and the other person. Cover key topics, plans or decisions and anything I should remember. Do not use em dashes and dont write fluff. Reply in maximum 3 sentences.`,
    },
    { role: "user", content: transcript },
  ];

  // again ai's to generate responses
  try {
    const nvidiaResponse = await withTimeout(
      axios.post(
        "https://integrate.api.nvidia.com/v1/chat/completions",
        {
          model: "mistralai/mistral-small-4-119b-2603",
          messages,
          max_tokens: 500,
        },
        {
          headers: { Authorization: `Bearer ${process.env.NVIDIA_API_KEY}` },
        },
      ),
      15000,
    );
    const reply = extractOpenAiReply(nvidiaResponse.data);
    if (reply) return reply;
  } catch (err) {
    // fall through
  }

  try {
    const hackClubResponse = await withTimeout(
      axios.post(
        "https://ai.hackclub.com/proxy/v1/chat/completions",
        {
          model: "google/gemini-3.5-flash",
          messages,
        },
        {
          headers: { Authorization: `Bearer ${process.env.API_KEY}` },
        },
      ),
      15000,
    );
    const reply = extractOpenAiReply(hackClubResponse.data);
    if (reply) return reply;
  } catch (err) {
    // fall through
  }

  const geminiResponse = await withTimeout(
    axios.post(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent",
      {
        contents: [
          {
            role: "user",
            parts: [{ text: `${messages[0].content}\n\n${transcript}` }],
          },
        ],
        generationConfig: { temperature: 0.5, maxOutputTokens: 500 },
      },
      {
        headers: {
          "x-goog-api-key": process.env.GEMINI_API_KEY,
          "Content-Type": "application/json",
        },
      },
    ),
    15000,
  );

  return extractGeminiReply(geminiResponse.data);
}

app.post("/api/summarize", async (req, res) => {
  try {
    const { chatId } = req.body;
    if (!chatId) {
      return res.status(400).json({ error: "chatId is required" });
    }

    const config = loadConfig();
    const messages = await fetchChatMessages(chatId, 50);
    const transcript = formatTranscript(messages);

    if (!transcript.trim()) {
      return res.status(400).json({ error: "No messages to summarize" });
    }

    const summary = await generateSummary(
      transcript,
      getPersonalityForChat(config, chatId),
    );
    if (!summary) {
      return res.status(500).json({ error: "Failed to generate summary" });
    }

    res.json({ summary, messageCount: messages.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function monitorWatchedChats() {
  // Load configs
  const config = loadConfig();
  const { watchedChats } = config;

  if (!watchedChats || watchedChats.length === 0) return;

  for (const chatId of watchedChats) {
    let messages;
    try {
      messages = await fetchChatMessages(chatId, 5);
    } catch {
      // Skip this chat on fetch failure
      continue;
    }
    if (messages.length === 0) continue;

    // Update state tracking for each chat
    drafts.updateStationMessages(chatId, messages, stripHtml);

    const newestMsg = messages[0];
    const msgId = newestMsg.id;
    const textContent = newestMsg.text;

    if (!lastProcessedMessageId[chatId]) {
      lastProcessedMessageId[chatId] = msgId;
      continue;
    }

    // Ignore own messages
    if (isOwnMessage(newestMsg)) {
      lastProcessedMessageId[chatId] = msgId;
      continue;
    }

    // Check for any attachment
    const videoAttachment = newestMsg.attachments?.find(
      (a) => a.type === "video",
    );
    const anyAttachment = newestMsg.attachments?.length > 0;
    const hasContent = textContent || anyAttachment;

    // only process if it's a new, processable message
    if (msgId === lastProcessedMessageId[chatId] || !hasContent) continue;
    if (processingChat.has(chatId)) continue;
    if (drafts.getDraft(chatId)) continue;

    lastProcessedMessageId[chatId] = msgId;
    processingChat.add(chatId);

    const incomingText =
      stripHtml(textContent) ||
      (videoAttachment
        ? "[video]"
        : anyAttachment
          ? describeAttachments(newestMsg.attachments)
          : "");
    drafts.markNewMessage(chatId, incomingText);

    const personality = getPersonalityForChat(config, chatId);
    const enrichedPersonality = await enrichPersonalityWithCalendar(
      personality,
      config,
    );

    try {
      let finalReply;

      if (videoAttachment) {
        // Prefer video-aware reply if video present
        try {
          const video = await downloadVideoAttachment(videoAttachment);
          finalReply = await generateVideoReply(
            enrichedPersonality,
            textContent,
            video,
          );
        } catch (err) {
          // fallback to text
          finalReply = await generateReply(
            enrichedPersonality,
            textContent || "[sent a video]",
            messages.slice(1, 10),
          );
        }
      } else {
        // normal msgs (or non-video attachments like images)
        const attachmentText = anyAttachment
          ? describeAttachments(newestMsg.attachments)
          : "";
        finalReply = await generateReply(
          enrichedPersonality,
          textContent || attachmentText,
          messages.slice(1, 10),
        );
      }

      if (finalReply) {
        const conversationContext = buildConversationSnippet(
          messages,
          incomingText,
        );
        const useDraftMode = config.draftMode !== false;
        if (useDraftMode) {
          // In draft mode, save for manual user review
          drafts.createDraft(
            chatId,
            msgId,
            incomingText,
            finalReply,
            conversationContext,
          );
        } else {
          await processAndSendBotResponse(chatId, msgId, finalReply, config, {
            conversationContext,
          });
          drafts.setLastOutgoing(chatId, stripHtml(finalReply));
          drafts.logActivity(chatId, "reply_sent", "Auto-sent reply");
        }
      }
    } finally {
      // Always clear processing
      processingChat.delete(chatId);
    }
  }
}

// tick chat monitoring every something seconds
setInterval(monitorWatchedChats, 2000);

const CLIENT_DIST = path.join(__dirname, "../client/dist");
if (fs.existsSync(path.join(CLIENT_DIST, "index.html"))) {
  app.use(express.static(CLIENT_DIST));
  app.get(/^\/(?!api).*/, (_req, res) => {
    res.sendFile(path.join(CLIENT_DIST, "index.html"));
  });
}

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  const hasUi = fs.existsSync(path.join(CLIENT_DIST, "index.html"));
  console.log(`agent on http://localhost:${PORT}`);
  if (hasUi) console.log(`dashboard at http://localhost:${PORT}`);
});
