import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import "./App.css";
import ConversationOffice from "./simulation/ConversationOffice";
import DraftPanel from "./DraftPanel";
import ActivityLog from "./ActivityLog";
import { PERSONALITY_TEMPLATES } from "./personalityTemplates";

// chata personality template
function TemplatePicker({ onSelect }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="template-picker">
      <button
        type="button"
        className="btn btn--ghost"
        onClick={() => setOpen(!open)}
      >
        Use template
      </button>
      {open && (
        <div className="template-menu">
          {PERSONALITY_TEMPLATES.map((t) => (
            <button
              key={t.name}
              type="button"
              className="template-option"
              onClick={() => {
                onSelect(t.text);
                setOpen(false);
              }}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [availableChats, setAvailableChats] = useState([]);
  const [watchedChats, setWatchedChats] = useState([]);
  const [backgroundInfo, setBackgroundInfo] = useState("");
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState("");
  const saveTimer = useRef(null);
  const [dirty, setDirty] = useState(false);
  const [summaries, setSummaries] = useState({});
  const [summarizingId, setSummarizingId] = useState(null);
  const [chatPersonalities, setChatPersonalities] = useState({});
  const [expandedPersonality, setExpandedPersonality] = useState({});
  const [simStations, setSimStations] = useState([]);
  const [pendingDrafts, setPendingDrafts] = useState([]);
  const [calendarEnabled, setCalendarEnabled] = useState(true);
  const [calendarAutoWrite, setCalendarAutoWrite] = useState(true);
  const [draftMode, setDraftMode] = useState(true);
  const [sendDelayMinSec, setSendDelayMinSec] = useState(0);
  const [sendDelayMaxSec, setSendDelayMaxSec] = useState(0);
  const [calendarStatus, setCalendarStatus] = useState({
    configured: false,
    connected: false,
  });
  const [activityFilter, setActivityFilter] = useState(null);
  const [beeperStatus, setBeeperStatus] = useState("loading");

  const loadBeeperChats = useCallback(async () => {
    setBeeperStatus("loading");
    try {
      const beeperRes = await fetch("/api/beeper-chats");
      if (!beeperRes.ok) {
        setBeeperStatus("error");
        return;
      }
      const beeperData = await beeperRes.json();
      const chats = Array.isArray(beeperData)
        ? beeperData
        : beeperData?.items || [];
      setAvailableChats(chats);
      setBeeperStatus(chats.length > 0 ? "ok" : "empty");
    } catch {
      setBeeperStatus("error");
    }
  }, []);

  const chatNameById = useMemo(() => {
    const map = {};
    for (const chat of availableChats) {
      map[chat.id] = chat.title || chat.network || "Unknown Chat";
    }
    return map;
  }, [availableChats]);

  const simulationStations = useMemo(() => {
    return watchedChats.map((chatId) => {
      const sim = simStations.find((s) => s.chatId === chatId) || {};
      const override = chatPersonalities[chatId]?.trim();
      return {
        chatId,
        chatName: chatNameById[chatId] || chatId.slice(0, 12),
        isCustom: !!override,
        isActive: !!sim.isActive,
        isGenerating: !!sim.isGenerating,
        hasDraft: !!sim.hasDraft,
        draftText: sim.draftText || null,
        draftActions: sim.draftActions || [],
        lastIncoming: sim.lastIncoming || null,
        lastOutgoing: sim.lastOutgoing || null,
        incomingText: sim.incomingText || null,
        hasNewMessage: !!sim.hasNewMessage,
        activity: sim.activity || [],
      };
    });
  }, [watchedChats, chatPersonalities, chatNameById, simStations]);

  // initial configs
  useEffect(() => {
    async function initDashboard() {
      try {
        const configRes = await fetch("/api/config");
        if (configRes.ok) {
          const configData = await configRes.json();
          setWatchedChats(configData.watchedChats || []);
          setBackgroundInfo(configData.backgroundInfo || "");
          setChatPersonalities(configData.chatPersonalities || {});
          setCalendarEnabled(configData.calendarEnabled !== false);
          setCalendarAutoWrite(configData.calendarAutoWrite !== false);
          setDraftMode(configData.draftMode !== false);
          setSendDelayMinSec(Math.max(0, Number(configData.sendDelayMinSec) || 0));
          setSendDelayMaxSec(Math.max(0, Number(configData.sendDelayMaxSec) || 0));
        }
      } catch {
        // config load failed
      }

      try {
        const calRes = await fetch("/api/calendar/status");
        if (calRes.ok) setCalendarStatus(await calRes.json());
      } catch {
        // calendar status optional
      }

      await loadBeeperChats();
      setLoading(false);
    }
    initDashboard();
  }, [loadBeeperChats]);

  useEffect(() => {
    async function pollSimulation() {
      try {
        const res = await fetch("/api/simulation");
        if (!res.ok) return;
        const data = await res.json();
        setSimStations(data.stations || []);
        setPendingDrafts(data.drafts || []);
      } catch {
        // server may be offline
      }
    }
    pollSimulation();
    const id = setInterval(pollSimulation, 2000);
    return () => clearInterval(id);
  }, []);

  // open chat in beeper
  const openInBeeper = useCallback(async (chatId) => {
    try {
      await fetch("/api/beeper/focus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId }),
      });
    } catch {
      // Beeper may be offline
    }
  }, []);

  const clearWalkAlert = useCallback(async (chatId) => {
      await fetch("/api/simulation/clear-alert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId }),
    });
  }, []);

  const handleApproveDraft = async (chatId, text) => {
    const res = await fetch(
      `/api/drafts/${encodeURIComponent(chatId)}/approve`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      },
    );
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Approve failed");
    }
    setPendingDrafts((prev) => prev.filter((d) => d.chatId !== chatId));
  };

  const handleRejectDraft = async (chatId) => {
    await fetch(
      `/api/drafts/${encodeURIComponent(chatId)}/reject`,
      {
        method: "POST",
      },
    );
    setPendingDrafts((prev) => prev.filter((d) => d.chatId !== chatId));
  };

  // toggle watch chat
  const toggleWatchStatus = (chatId) => {
    if (watchedChats.includes(chatId)) {
      setWatchedChats(watchedChats.filter((id) => id !== chatId));
    } else {
      setWatchedChats([...watchedChats, chatId]);
    }
  };

  const handleCloseSummary = (chatId) => {
    setSummaries((prev) => {
      const next = { ...prev };
      delete next[chatId];
      return next;
    });
  };

  // summarize chat
  const handleSummarize = async (chatId) => {
    setSummarizingId(chatId);
    try {
      const response = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Summary failed");
      setSummaries((prev) => ({ ...prev, [chatId]: data.summary }));
    } catch (err) {
      setSummaries((prev) => ({ ...prev, [chatId]: `Error: ${err.message}` }));
    } finally {
      setSummarizingId(null);
    }
  };

  const togglePersonalityPanel = (chatId) => {
    setExpandedPersonality((prev) => ({
      ...prev,
      [chatId]: !prev[chatId],
    }));
  };

  const updateChatPersonality = (chatId, value) => {
    setChatPersonalities((prev) => ({ ...prev, [chatId]: value }));
  };

  const doSave = useCallback(async () => {
    setSaveStatus("Saving...");
    try {
      const response = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          watchedChats,
          backgroundInfo,
          chatPersonalities,
          calendarEnabled,
          calendarAutoWrite,
          draftMode,
          sendDelayMinSec,
          sendDelayMaxSec: Math.max(sendDelayMinSec, sendDelayMaxSec),
        }),
      });
      if (response.ok) {
        setSaveStatus("Saved");
        setTimeout(() => setSaveStatus(""), 2000);
      }
    } catch {
      setSaveStatus("Save failed");
      setTimeout(() => setSaveStatus(""), 3000);
    }
  }, [watchedChats, backgroundInfo, chatPersonalities, calendarEnabled, calendarAutoWrite, draftMode, sendDelayMinSec, sendDelayMaxSec]);

  // auto-save on changes with debounce
  useEffect(() => {
    if (!dirty) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      doSave();
      setDirty(false);
    }, 600);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [dirty, doSave]);

  // mark dirty when any setting changes
  useEffect(() => {
    setDirty(true);
  }, [watchedChats, backgroundInfo, chatPersonalities, calendarEnabled, calendarAutoWrite, draftMode, sendDelayMinSec, sendDelayMaxSec]);

  // when stuff is loading
  if (loading) {
    return (
      <div className="app-loading">
        <div className="app-loading-spinner" />
        Loading agent config…
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Maichan</h1>
        <p>Configure rules, watch conversations, and preview your bots.</p>
      </header>

      <DraftPanel
        drafts={pendingDrafts}
        chatNameById={chatNameById}
        onApprove={handleApproveDraft}
        onReject={handleRejectDraft}
      />

      <ActivityLog
        stations={simulationStations}
        chatNameById={chatNameById}
        selectedChatId={activityFilter}
        onSelectChat={setActivityFilter}
      />

      <section className="sim-section">
        <h3>Conversation Simulation</h3>
        <p>
          Click a desk to open that chat in Beeper. Drag to orbit the camera.
        </p>
        <ConversationOffice
          stations={simulationStations}
          chatPersonalities={chatPersonalities}
          onPersonalityChange={updateChatPersonality}
          onOpenChat={openInBeeper}
          onWalkComplete={clearWalkAlert}
        />
      </section>

      <section>
        <h3>AI Knowledge & Personality Rules</h3>
        <p>
          Default rules for all chats. Override per chat below with custom
          personality rules.
        </p>
        <textarea
          placeholder="My name is Alex. I am currently out of town until Friday. React to messages when people say something funny. Only add events to the calendar if they're on weekends."
          value={backgroundInfo}
          onChange={(e) => setBackgroundInfo(e.target.value)}
        />
        <TemplatePicker onSelect={setBackgroundInfo} />
      </section>

      <section>
        <h3>Global options</h3>
        <p>Configure how the bot interacts in messages.</p>
        <label>
          <input
            type="checkbox"
            checked={calendarEnabled}
            onChange={(e) => setCalendarEnabled(e.target.checked)}
          />
          Include calendar context in replies
        </label>
        <label>
          <input
            type="checkbox"
            checked={calendarAutoWrite}
            onChange={(e) => setCalendarAutoWrite(e.target.checked)}
            disabled={!calendarEnabled}
          />
          Allow bot to automatically edit events
        </label>
        <label>
          <input
            type="checkbox"
            checked={draftMode}
            onChange={(e) => setDraftMode(e.target.checked)}
          />
          Draft mode (request approval for messages before sending)
        </label>
        <div className="delay-field">
          <span className="delay-field-label">Reply delay (seconds)</span>
          <p className="delay-field-hint">
            Wait a random amount of time between min and max before sending a reply.
            Set both to 0 to send immediately.
          </p>
          <div className="delay-inputs">
            <label>
              Min
              <input
                type="number"
                min={0}
                step={1}
                value={sendDelayMinSec}
                onChange={(e) =>
                  setSendDelayMinSec(Math.max(0, Number(e.target.value) || 0))
                }
              />
            </label>
            <span className="delay-separator">to</span>
            <label>
              Max
              <input
                type="number"
                min={0}
                step={1}
                value={sendDelayMaxSec}
                onChange={(e) =>
                  setSendDelayMaxSec(Math.max(0, Number(e.target.value) || 0))
                }
              />
            </label>
          </div>
        </div>
      </section>

      <section>
        <h3>Choose Conversations to Automate</h3>
        <p>Choose where to watch and reply.</p>

        {/* convo list */}
        <div className="chat-list">
          {availableChats.length === 0 && (
            <div className="chat-list-empty">
              {beeperStatus === "loading" && <p>Loading chats from Beeper…</p>}
              {beeperStatus === "empty" && (
                <>
                  <p>No chats found. Make sure Beeper Desktop is running and logged in.</p>
                  <button type="button" className="btn btn--ghost" onClick={loadBeeperChats}>
                    Retry
                  </button>
                </>
              )}
              {beeperStatus === "error" && (
                <>
                  <p>Could not load chats. Is the server running?</p>
                  <button type="button" className="btn btn--ghost" onClick={loadBeeperChats}>
                    Retry
                  </button>
                </>
              )}
            </div>
          )}
          {availableChats.map((chat) => {
            const isWatched = watchedChats.includes(chat.id);
            const chatName = chat.title || chat.network || "Unknown Chat Link";
            const hasSummary = !!summaries[chat.id];
            const hasCustomPersonality = !!chatPersonalities[chat.id]?.trim();
            const isPersonalityOpen = expandedPersonality[chat.id];
            return (
              <div key={chat.id}>
                <div
                  className={[
                    "chat-row",
                    isWatched && "chat-row--watched",
                    isPersonalityOpen && "chat-row--expanded",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <div className="chat-info">
                    <strong>{chatName}</strong>
                    <span
                      className={
                        hasCustomPersonality ? "custom-rules" : undefined
                      }
                    >
                      {hasCustomPersonality
                        ? "Custom rules"
                        : "Using global rules"}
                    </span>
                  </div>
                  <div className="chat-actions">
                    <button
                      type="button"
                      onClick={() => togglePersonalityPanel(chat.id)}
                      className={`btn btn--outline-warning${hasCustomPersonality ? " active" : ""}`}
                    >
                      {isPersonalityOpen ? "Hide Rules" : "Rules"}
                    </button>
                    {!hasSummary && (
                      <button
                        type="button"
                        onClick={() => handleSummarize(chat.id)}
                        disabled={summarizingId === chat.id}
                        className="btn btn--purple"
                      >
                        {summarizingId === chat.id
                          ? "Summarizing…"
                          : "Summarize"}
                      </button>
                    )}
                    {hasSummary && (
                      <button
                        type="button"
                        onClick={() => handleCloseSummary(chat.id)}
                        className="close-summary"
                        aria-label="Close summary"
                        title="Close summary"
                      >
                        Close summary
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleWatchStatus(chat.id)}
                      className={
                        isWatched ? "btn btn--danger" : "btn btn--watch"
                      }
                    >
                      {isWatched ? "Unwatch" : "Watch"}
                    </button>
                  </div>
                </div>
                {isPersonalityOpen && (
                  <div className="chat-personality-panel">
                    <textarea
                      placeholder="Custom rules for this chat only. Leave blank to use global rules above."
                      value={chatPersonalities[chat.id] || ""}
                      onChange={(e) =>
                        updateChatPersonality(chat.id, e.target.value)
                      }
                    />
                    <TemplatePicker
                      onSelect={(text) => updateChatPersonality(chat.id, text)}
                    />
                  </div>
                )}
                {summaries[chat.id] && (
                  <div className="chat-summary">
                    <strong>Summary</strong>
                    {summaries[chat.id]}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section id="calendar">
        <h3>Google Calendar</h3>
        <p>Connect your calendar so the bot has access to your events.</p>
        <div className="calendar-status-row">
          <span
            className={`status-badge ${calendarStatus.connected ? "status-badge--connected" : "status-badge--disconnected"}`}
          >
            <span className="status-badge-dot" />
            {calendarStatus.connected ? "Connected" : "Not connected"}
          </span>
          {calendarStatus.timezone && (
            <span className="calendar-meta">
              Timezone: {calendarStatus.timezone}
            </span>
          )}
          {!calendarStatus.connected && (
            <a
              href="/api/calendar/auth"
              target="_blank"
              rel="noreferrer"
              className="btn btn--link"
            >
              Connect Google Calendar
            </a>
          )}
        </div>
      </section>
      
      {saveStatus && (
        <div className="save-status-bar">
          <span className="save-status">{saveStatus}</span>
        </div>
      )}
    </div>
  );
}
