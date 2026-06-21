const TYPE_LABELS = {
  incoming: "Incoming",
  draft_created: "Draft",
  draft_approved: "Approved",
  draft_rejected: "Discarded",
  reply_sent: "Sent",
  reaction: "Reaction",
  calendar_create: "Calendar",
  calendar_delete: "Calendar",
};

export default function ActivityLog({
  stations,
  chatNameById,
  selectedChatId,
  onSelectChat,
}) {
  // adds chatName to help associate activity with its chat name for display
  const allActivity = stations.flatMap((s) =>
    (s.activity || []).map((e) => ({
      ...e,
      chatName: chatNameById[s.chatId] || s.chatName,
    })),
  );
  allActivity.sort((a, b) => new Date(b.at) - new Date(a.at));

  const filtered = selectedChatId
    ? allActivity.filter((e) => e.chatId === selectedChatId)
    : allActivity;

  const display = filtered.slice(0, 30);

  return (
    <section className="activity-section">
      <h3>Activity log</h3>
      <p>Replies, reactions, and calendar actions across your stations.</p>

      {stations.length > 1 && (
        <div className="activity-filters">
          <button
            type="button"
            className={`btn btn--ghost${!selectedChatId ? " active" : ""}`}
            onClick={() => onSelectChat(null)}
          >
            All
          </button>
          {stations.map((s) => (
            <button
              key={s.chatId}
              type="button"
              className={`btn btn--ghost${selectedChatId === s.chatId ? " active" : ""}`}
              onClick={() => onSelectChat(s.chatId)}
            >
              {chatNameById[s.chatId] || s.chatName}
            </button>
          ))}
        </div>
      )}

      {/* activity log stream */}
      <div className="activity-timeline">
        {display.length === 0 ? (
          <p className="activity-empty">No activity yet.</p>
        ) : (
          display.map((entry) => (
            <div
              key={entry.id}
              className={`activity-entry activity-entry--${entry.type}`}
            >
              <div className="activity-entry-meta">
                <span className="activity-type">
                  {TYPE_LABELS[entry.type] || entry.type}
                </span>
                {!selectedChatId && (
                  <span className="activity-chat">{entry.chatName}</span>
                )}
                <time className="activity-time">
                  {new Date(entry.at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </div>
              <p className="activity-detail">{entry.detail}</p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
