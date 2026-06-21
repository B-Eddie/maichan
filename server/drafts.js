const calendar = require("./calendar");

const pendingDrafts = {};
const activityLog = [];
const stationState = {};
const MAX_LOG = 300; // max activity log length

function logActivity(chatId, type, detail, meta = {}) {
  activityLog.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    chatId,
    type,
    detail,
    at: new Date().toISOString(),
    ...meta,
  });
  if (activityLog.length > MAX_LOG) activityLog.length = MAX_LOG;
}

function formatCalendarActionLabel(action, payload) {
  if (action === "CREATE") {
    const summary = payload?.summary || "Untitled event";
    const start = payload?.start || "";
    return `Add calendar event: "${summary}"${start ? ` (${start})` : ""}`;
  }
  if (action === "DELETE") {
    return `Delete calendar event${payload?.eventId ? ` (${payload.eventId})` : ""}`;
  }
  return "Calendar action";
}

function parseDraftReply(rawReply, conversationContext = "") {
  const actions = [];

  const reactMatch = rawReply.match(/REACT:([^\s]+)/m);
  if (reactMatch) {
    actions.push({
      type: "reaction",
      emoji: reactMatch[1],
      label: `React with ${reactMatch[1]}`,
    });
  }

  const calActions = calendar.extractAllCalendarActions(rawReply);
  const timeAgreed = calendar.shouldAllowCalendarCreate(conversationContext);

  for (const { action, payload, raw } of calActions) {
    if (action === "CREATE" && !timeAgreed) continue;
    actions.push({
      type: action === "CREATE" ? "calendar_create" : "calendar_delete",
      payload,
      raw,
      label: formatCalendarActionLabel(action, payload),
    });
  }

  // remove actions from text
  let text = calendar.stripCalendarActionsFromText(rawReply);
  text = text.replace(/^REACT:[^\s]+.*$/gm, "").trim();
  text = text.replace(/\n{3,}/g, "\n\n").trim();

  return { text, actions };
}

function createDraft(
  chatId,
  triggerMessageId,
  incomingText,
  rawReply,
  conversationContext = "",
) {
  const { text, actions } = parseDraftReply(rawReply, conversationContext);
  const draft = {
    id: `${chatId}-${Date.now()}`,
    chatId,
    triggerMessageId,
    incomingText,
    conversationContext,
    rawReply,
    text,
    actions,
    createdAt: new Date().toISOString(),
  };
  pendingDrafts[chatId] = draft;
  logActivity(
    chatId,
    "draft_created",
    incomingText
      ? `Draft for: "${truncate(incomingText, 80)}"`
      : "Draft created",
    {
      draftText: text,
      actions,
    },
  );
  return draft;
}

function getDraft(chatId) {
  return pendingDrafts[chatId] || null;
}

function getAllDrafts() {
  return Object.values(pendingDrafts);
}

function rejectDraft(chatId) {
  const draft = pendingDrafts[chatId];
  if (!draft) return null;
  delete pendingDrafts[chatId];
  logActivity(chatId, "draft_rejected", "Draft discarded");
  return draft;
}

function updateStationMessages(chatId, messages, stripHtml) {
  if (!stationState[chatId]) {
    stationState[chatId] = {
      lastIncoming: null,
      lastOutgoing: null,
      hasNewMessage: false,
    };
  }

  let lastIncoming = null;
  let lastOutgoing = null;

  for (const msg of messages) {
    const text = stripHtml(msg.text);
    const hasVideo = msg.attachments?.some((a) => a.type === "video");
    const content = text || (hasVideo ? "[video]" : null);
    if (!content) continue;

    if (!msg.isSender && !lastIncoming) {
      lastIncoming = content;
    } else if (msg.isSender && !lastOutgoing) {
      lastOutgoing = content;
    }
    if (lastIncoming && lastOutgoing) break;
  }

  if (lastIncoming) stationState[chatId].lastIncoming = lastIncoming;
  if (lastOutgoing) stationState[chatId].lastOutgoing = lastOutgoing;
}

function markNewMessage(chatId, incomingText) {
  if (!stationState[chatId]) {
    stationState[chatId] = {
      lastIncoming: null,
      lastOutgoing: null,
      hasNewMessage: false,
    };
  }
  stationState[chatId].lastIncoming = incomingText;
  stationState[chatId].hasNewMessage = true;
  logActivity(chatId, "incoming", truncate(incomingText, 120));
}

function clearNewMessageFlag(chatId) {
  if (stationState[chatId]) {
    stationState[chatId].hasNewMessage = false;
  }
}

function setLastOutgoing(chatId, text) {
  if (!stationState[chatId]) {
    stationState[chatId] = {
      lastIncoming: null,
      lastOutgoing: null,
      hasNewMessage: false,
    };
  }
  stationState[chatId].lastOutgoing = text;
}

// add ... when too long
function truncate(str, len) {
  if (!str) return "";
  return str.length <= len ? str : `${str.slice(0, len)}…`;
}

function getActivityForChat(chatId, limit = 20) {
  return activityLog.filter((e) => e.chatId === chatId).slice(0, limit);
}

function getSimulationStations(watchedChats, processingChat) {
  return (watchedChats || []).map((chatId) => {
    const draft = pendingDrafts[chatId];
    const state = stationState[chatId] || {};
    const isGenerating = processingChat.has(chatId);

    return {
      chatId,
      isActive: isGenerating || !!draft,
      isGenerating,
      hasDraft: !!draft,
      draftText: draft?.text || null,
      draftActions: draft?.actions || [],
      incomingText: draft?.incomingText || state.lastIncoming || null,
      lastIncoming: state.lastIncoming || null,
      lastOutgoing: state.lastOutgoing || null,
      hasNewMessage: state.hasNewMessage || false,
      activity: getActivityForChat(chatId, 15),
    };
  });
}

module.exports = {
  pendingDrafts,
  logActivity,
  parseDraftReply,
  createDraft,
  getDraft,
  getAllDrafts,
  rejectDraft,
  updateStationMessages,
  markNewMessage,
  clearNewMessageFlag,
  setLastOutgoing,
  getActivityForChat,
  getSimulationStations,
  activityLog,
};
