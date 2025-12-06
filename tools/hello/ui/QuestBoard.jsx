// src/ui/QuestBoard.jsx
import React, { useMemo, useState } from "react";
import usePlayerProgress from "../state/usePlayerProgress.js";
import {
  getAvailableQuestsForPlayer,
  loadPlayerQuests,
  acceptQuest,
  abandonQuest,
  completeQuestManually,
  getQuestDef,
} from "../state/quests.js";

/**
 * QuestBoard
 *
 * Shows Available / Active / Completed quests.
 * - Accept moves a quest into active state.
 * - Abandon removes it from active.
 * - Complete (force) marks completed and grants rewards (useful for testing).
 *
 * UI refreshes automatically because usePlayerProgress listens to progress updates.
 */
export default function QuestBoard() {
  const { progress } = usePlayerProgress();
  const [message, setMessage] = useState(null);

  const available = useMemo(() => getAvailableQuestsForPlayer(progress), [progress]);
  const playerQuests = useMemo(() => loadPlayerQuests(progress), [progress]);

  function showMsg(txt, ttl = 2500) {
    setMessage(txt);
    if (ttl > 0) setTimeout(() => setMessage(null), ttl);
  }

  function handleAccept(id) {
    const res = acceptQuest(id);
    if (!res || !res.success) {
      showMsg(`Accept failed: ${res?.reason || "unknown"}`);
      return;
    }
    showMsg("Quest accepted");
  }

  function handleAbandon(id) {
    const res = abandonQuest(id);
    if (!res || !res.success) {
      showMsg(`Abandon failed: ${res?.reason || "unknown"}`);
      return;
    }
    showMsg("Quest abandoned");
  }

  function handleForceComplete(id) {
    const res = completeQuestManually(id);
    if (!res || !res.success) {
      showMsg(`Complete failed: ${res?.reason || "unknown"}`);
      return;
    }
    showMsg("Quest completed (forced)");
  }

  function renderProgress(qDef, state) {
    if (!qDef || !state) return null;
    const type = qDef.type;
    if (type === "kill") {
      const killed = Number(state.progress?.killed) || 0;
      const target = Number(qDef.target?.qty) || 0;
      return (
        <div style={styles.progressWrap}>
          <div style={styles.progressLabel}>{killed} / {target} kills</div>
          <div style={styles.progressBar}>
            <div style={{ ...styles.progressFill, width: `${Math.min(100, target ? (killed / target) * 100 : 0)}%` }} />
          </div>
        </div>
      );
    }
    if (type === "collect") {
      const collected = Number(state.progress?.collected) || 0;
      const target = Number(qDef.target?.qty) || 0;
      return (
        <div style={styles.progressWrap}>
          <div style={styles.progressLabel}>{collected} / {target} collected</div>
          <div style={styles.progressBar}>
            <div style={{ ...styles.progressFill, width: `${Math.min(100, target ? (collected / target) * 100 : 0)}%` }} />
          </div>
        </div>
      );
    }
    if (type === "visit" || type === "travel") {
      const visited = !!state.progress?.visited;
      return <div style={{ color: visited ? "#0a0" : "#666" }}>{visited ? "Visited" : "Not yet visited"}</div>;
    }
    // default: show raw progress
    return <div style={{ color: "#666", fontSize: 13 }}>{JSON.stringify(state.progress)}</div>;
  }

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <h2 style={{ margin: 0 }}>Quest Board</h2>
        <div style={{ color: "#666" }}>{message}</div>
      </div>

      <div style={styles.columns}>
        {/* Available */}
        <div style={styles.col}>
          <h3 style={styles.colTitle}>Available</h3>
          {available.length === 0 ? (
            <div style={styles.empty}>No quests available.</div>
          ) : (
            <div style={styles.list}>
              {available.map((q) => (
                <div key={q.id} style={styles.card}>
                  <div style={styles.cardTitle}>{q.title}</div>
                  <div style={styles.cardDesc}>{q.desc}</div>
                  <div style={styles.metaRow}>
                    <div style={styles.minLevel}>Min Lv: {q.minLevel ?? 1}</div>
                    <div style={styles.reward}>Rewards: {renderRewards(q.rewards)}</div>
                  </div>
                  <div style={styles.cardActions}>
                    <button style={styles.btn} onClick={() => handleAccept(q.id)}>Accept</button>
                    <button style={styles.btnAlt} onClick={() => handleForceComplete(q.id)}>Complete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Active */}
        <div style={styles.col}>
          <h3 style={styles.colTitle}>Active</h3>
          {Object.keys(playerQuests.active || {}).length === 0 ? (
            <div style={styles.empty}>No active quests.</div>
          ) : (
            <div style={styles.list}>
              {Object.entries(playerQuests.active).map(([id, state]) => {
                const qDef = getQuestDef(id);
                return (
                  <div key={id} style={styles.card}>
                    <div style={styles.cardTitle}>{qDef?.title ?? id}</div>
                    <div style={styles.cardDesc}>{qDef?.desc ?? ""}</div>

                    <div style={{ marginTop: 8 }}>
                      {renderProgress(qDef, state)}
                    </div>

                    <div style={styles.metaRow}>
                      <div style={styles.minLevel}>Accepted: {new Date(state.acceptedAt).toLocaleString()}</div>
                      <div style={styles.reward}>Rewards: {renderRewards(qDef?.rewards)}</div>
                    </div>

                    <div style={styles.cardActions}>
                      <button style={styles.btnAlt} onClick={() => handleAbandon(id)}>Abandon</button>
                      <button style={styles.btn} onClick={() => handleForceComplete(id)}>Complete</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Completed */}
        <div style={styles.col}>
          <h3 style={styles.colTitle}>Completed</h3>
          {playerQuests.completed.length === 0 ? (
            <div style={styles.empty}>No completed quests.</div>
          ) : (
            <div style={styles.list}>
              {playerQuests.completed.map((qid) => {
                const qDef = getQuestDef(qid);
                return (
                  <div key={qid} style={styles.card}>
                    <div style={styles.cardTitle}>{qDef?.title ?? qid}</div>
                    <div style={styles.cardDesc}>{qDef?.desc ?? ""}</div>
                    <div style={styles.cardActions}>
                      <button style={styles.btnAlt} onClick={() => alert(JSON.stringify(qDef, null, 2))}>View</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* small helper for rewards preview */
function renderRewards(rewards = {}) {
  if (!rewards) return "—";
  const parts = [];
  if (rewards.gold) parts.push(`${rewards.gold}g`);
  if (rewards.exp) parts.push(`${rewards.exp} XP`);
  if (Array.isArray(rewards.items) && rewards.items.length > 0) {
    parts.push(rewards.items.map((it) => `${it.qty || 1}×${it.id}`).join(", "));
  }
  return parts.length ? parts.join(" • ") : "—";
}

/* ---------------- Styles ---------------- */
const styles = {
  root: { padding: 18 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  columns: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 },
  col: { background: "#fff", padding: 12, border: "1px solid #eee", borderRadius: 8, minHeight: 120 },
  colTitle: { marginTop: 0, marginBottom: 8 },
  list: { display: "grid", gap: 8 },
  card: { padding: 10, border: "1px solid #f0f0f0", borderRadius: 8, background: "#fff" },
  cardTitle: { fontWeight: 700 },
  cardDesc: { color: "#666", marginTop: 6, fontSize: 13 },
  cardActions: { marginTop: 10, display: "flex", gap: 8 },
  btn: { padding: "6px 10px", borderRadius: 8, border: "1px solid #2d7", background: "#f7fff7", cursor: "pointer" },
  btnAlt: { padding: "6px 10px", borderRadius: 8, border: "1px solid #eee", background: "#fff", cursor: "pointer" },
  empty: { color: "#666" },
  metaRow: { marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 },
  minLevel: { color: "#666", fontSize: 12 },
  reward: { color: "#666", fontSize: 12 },
  progressWrap: { marginTop: 6 },
  progressLabel: { fontSize: 13, color: "#333", marginBottom: 6 },
  progressBar: { height: 10, background: "#f0f0f0", borderRadius: 999, overflow: "hidden" },
  progressFill: { height: "100%", background: "#91caff", width: "0%" },
};
