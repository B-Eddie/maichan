import { useState } from "react";

function ActionChip({ action }) {
  const icons = {
    reaction: "↩",
    calendar_create: "📅",
    calendar_delete: "🗑",
  };
  return (
    <span className="draft-action-chip">
      <span className="draft-action-icon">{icons[action.type] || "•"}</span>
      {action.label}
    </span>
  );
}

export default function DraftPanel({
  drafts,
  chatNameById,
  onApprove,
  onReject,
}) {
  const [editing, setEditing] = useState({});

  if (!drafts.length) return null;

  const getText = (draft) =>
    editing[draft.chatId] !== undefined ? editing[draft.chatId] : draft.text;

  return (
    <section className="draft-section">
      <h3>Pending drafts</h3>
      <p>Review and approve actions before the bot sends it</p>
      <div className="draft-list">
        {drafts.map((draft) => {
          const chatName =
            chatNameById[draft.chatId] || draft.chatId.slice(0, 12);
          const isBusy = editing[`${draft.chatId}_busy`];
          return (
            <div key={draft.id} className="draft-card">
              <div className="draft-card-header">
                <strong>{chatName}</strong>
                <span className="draft-time">
                  {new Date(draft.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>

              {draft.incomingText && (
                <div className="draft-incoming">
                  <span className="draft-label">They said</span>
                  <p>{draft.incomingText}</p>
                </div>
              )}

              <div className="draft-reply">
                <span className="draft-label">Draft reply</span>
                <textarea
                  value={getText(draft)}
                  onChange={(e) =>
                    setEditing((prev) => ({
                      ...prev,
                      [draft.chatId]: e.target.value,
                    }))
                  }
                  rows={3}
                  placeholder="(no text - actions only)"
                />
              </div>

              {draft.actions?.length > 0 && (
                <div className="draft-actions">
                  <span className="draft-label">Planned actions</span>
                  <div className="draft-action-chips">
                    {draft.actions.map((action, i) => (
                      <ActionChip key={i} action={action} />
                    ))}
                  </div>
                </div>
              )}

              <div className="draft-card-actions">
                <button
                  type="button"
                  className="btn btn--save"
                  disabled={isBusy}
                  onClick={async () => {
                    setEditing((prev) => ({
                      ...prev,
                      [`${draft.chatId}_busy`]: true,
                    }));
                    await onApprove(draft.chatId, getText(draft));
                    setEditing((prev) => {
                      const next = { ...prev };
                      delete next[draft.chatId];
                      delete next[`${draft.chatId}_busy`];
                      return next;
                    });
                  }}
                >
                  {isBusy ? "Sending…" : "Approve & send"}
                </button>
                <button
                  type="button"
                  //   className="btn btn--secondary"
                  //   disabled={isBusy}
                  //   onClick={async () => {
                  //     setEditing((prev) => ({
                  //       ...prev,
                  //       [`${draft.chatId}_busy`]: true,
                  //     }));
                  //     await onSuggestAlternative(draft.chatId);
                  //     setEditing((prev) => ({
                  //       ...prev,
                  //       [`${draft.chatId}_busy`]: false,
                  //     }));
                  //   }}
                  // >
                  //   {isBusy ? "Suggesting…" : "Suggest Alternative"}
                  // </button>
                  // <button
                  //   type="button"
                  className="btn btn--ghost"
                  disabled={isBusy}
                  onClick={() => onReject(draft.chatId)}
                >
                  Discard
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
