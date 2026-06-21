export default function StationPanel({
  station,
  personalityValue,
  onPersonalityChange,
  onSave,
  isSaving,
  onPanelInteract,
}) {
  const stopCanvas = (e) => e.stopPropagation();

  const statusLabel = station.isGenerating
    ? "Thinking…"
    : station.hasDraft
      ? "Draft ready"
      : station.isActive
        ? "Active"
        : "Watching";

  return (
    <div
      className="sim-station-panel"
      onPointerEnter={() => onPanelInteract(false)}
      onPointerLeave={() => onPanelInteract(true)}
      onPointerDown={stopCanvas}
      onPointerMove={stopCanvas}
      onPointerUp={stopCanvas}
      onWheel={stopCanvas}
    >
      {/* title */}
      <div className="sim-rules-header">
        <strong>{station.chatName}</strong>
        <span className={station.isActive ? "sim-active" : "sim-idle"}>
          {statusLabel}
        </span>
      </div>

      {/* text */}
      {station.hasDraft && station.draftText && (
        <div className="sim-draft-preview">
          <span className="sim-panel-label">Draft</span>
          <p>{station.draftText}</p>
          {(station.draftActions || []).map((a, i) => (
            <span key={i} className="sim-draft-action">
              {a.label}
            </span>
          ))}
        </div>
      )}

      <label className="sim-panel-label">
        {station.isCustom ? "Custom rules" : "Global rules (override below)"}
      </label>
      <textarea
        className="sim-panel-textarea"
        placeholder="Custom rules for this chat. Leave blank to use global rules."
        value={personalityValue}
        onChange={(e) => onPersonalityChange(station.chatId, e.target.value)}
        onFocus={() => onPanelInteract(false)}
        onBlur={() => onPanelInteract(true)}
        onPointerDown={stopCanvas}
      />

      {/* save button */}
      <div className="sim-panel-actions">
        <button
          type="button"
          className="sim-btn sim-btn-save"
          disabled={isSaving}
          onClick={onSave}
        >
          {isSaving ? "Saving…" : "Save rules"}
        </button>
      </div>
    </div>
  );
}
