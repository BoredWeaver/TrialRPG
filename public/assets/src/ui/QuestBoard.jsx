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
 * QuestBoard — improved UI
 * - Shows Available / Active / Completed columns
 * - Supports dungeon_clear quests and shows friendly type labels
 * - Uses fantasy-border / panel classes used elsewhere in project
 * - All logic unchanged; purely presentation
 */

export default function QuestBoard() {
  const { progress } = usePlayerProgress();
  const [message, setMessage] = useState(null);

  const available = useMemo(() => getAvailableQuestsForPlayer(progress), [progress]);
  const playerQuests = useMemo(() => loadPlayerQuests(progress), [progress]);

  function flash(msg, ttl = 2200) {
    setMessage(msg);
    if (ttl > 0) setTimeout(() => setMessage(null), ttl);
  }

  function handleAccept(id) {
    const res = acceptQuest(id);
    if (!res || !res.success) return flash(`Accept failed: ${res?.reason || "unknown"}`);
    flash("Quest accepted");
  }

  function handleAbandon(id) {
    const res = abandonQuest(id);
    if (!res || !res.success) return flash(`Abandon failed: ${res?.reason || "unknown"}`);
    flash("Quest abandoned");
  }

  function handleForceComplete(id) {
    const res = completeQuestManually(id);
    if (!res || !res.success) return flash(`Complete failed: ${res?.reason || "unknown"}`);
    flash("Quest completed (forced)");
  }

  function renderTypeLabel(q) {
    const t = q?.type || "unknown";
    const mapping = {
      kill: "Kill",
      collect: "Collect",
      visit: "Visit",
      travel: "Travel",
      dungeon_clear: "Clear Dungeon",
    };
    return mapping[t] || t;
  }

  function renderTargetSummary(q) {
    if (!q || !q.target) return "—";
    switch (q.type) {
      case "kill":
        return `${q.target.qty || "?"}× ${q.target.enemyId || "enemy"}`;
      case "collect":
        return `${q.target.qty || "?"}× ${q.target.itemId || "item"}`;
      case "visit":
        return `Visit ${q.target.locationId || "?"}`;
      case "travel":
        return `Travel ${q.target.from || "?"} → ${q.target.to || "?"}`;
      case "dungeon_clear":
        return `Clear ${q.target.dungeonId || q.target.dungeonKey || "dungeon"}`;
      default:
        return JSON.stringify(q.target);
    }
  }

  function renderRewards(rewards = {}) {
    if (!rewards) return "—";
    const parts = [];
    if (Number(rewards.gold)) parts.push(`${rewards.gold}g`);
    if (Number(rewards.exp)) parts.push(`${rewards.exp} XP`);
    if (Array.isArray(rewards.items) && rewards.items.length) {
      parts.push(rewards.items.map(it => `${it.qty || 1}×${it.id}`).join(", "));
    }
    return parts.length ? parts.join(" • ") : "—";
  }

  function renderProgress(qDef, state) {
    if (!qDef || !state) return null;
    const type = qDef.type;
    if (type === "kill") {
      const killed = Number(state.progress?.killed) || 0;
      const target = Number(qDef.target?.qty) || 0;
      const pct = Math.min(100, target ? Math.round((killed / target) * 100) : 0);
      return (
        <>
          <div className="text-xs text-gray-300">{killed} / {target} kills</div>
          <div className="w-full bg-muted-700 rounded h-2 mt-1 overflow-hidden">
            <div className="h-2 bg-indigo-500" style={{ width: `${pct}%` }} />
          </div>
        </>
      );
    }
    if (type === "collect") {
      const collected = Number(state.progress?.collected) || 0;
      const target = Number(qDef.target?.qty) || 0;
      const pct = Math.min(100, target ? Math.round((collected / target) * 100) : 0);
      return (
        <>
          <div className="text-xs text-gray-300">{collected} / {target} collected</div>
          <div className="w-full bg-muted-700 rounded h-2 mt-1 overflow-hidden">
            <div className="h-2 bg-emerald-500" style={{ width: `${pct}%` }} />
          </div>
        </>
      );
    }
    if (type === "visit" || type === "travel" || type === "dungeon_clear") {
      const done = !!state.progress?.visited || !!state.progress?.cleared;
      return <div className={`text-xs mt-1 ${done ? "text-emerald-400" : "text-gray-400"}`}>{done ? "Completed" : "Not completed"}</div>;
    }
    return <div className="text-xs text-gray-400 mt-1">{JSON.stringify(state.progress)}</div>;
  }

  return (
    <div className="p-4 text-gray-200">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Quest Board</h2>
        <div className="text-sm text-gray-400">{message}</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Available */}
        <div className="rounded-lg fantasy-border bg-panel-800 p-3">
          <h3 className="text-md font-semibold text-gray-100 mb-3">Available</h3>

          {available.length === 0 ? (
            <div className="text-gray-500 text-sm">No quests available.</div>
          ) : (
            <div className="flex flex-col gap-3">
              {available.map(q => (
                <div key={q.id} className="p-3 rounded-lg bg-[#0f1720] border border-[#1f2937]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-100">{q.title}</div>
                      <div className="text-xs text-gray-400 mt-1 truncate">{q.desc}</div>
                      <div className="text-xs text-gray-300 mt-2">{renderTypeLabel(q)} • {renderTargetSummary(q)}</div>
                    </div>
                    <div className="text-right text-xs text-gray-300">{renderRewards(q.rewards)}</div>
                  </div>

                  <div className="flex gap-2 mt-3">
                    <button
                      className="flex-1 px-3 py-2 rounded bg-indigo-900 text-indigo-100 border border-indigo-700"
                      onClick={() => handleAccept(q.id)}
                    >
                      Accept
                    </button>

                    <button
                      className="px-3 py-2 rounded bg-muted-700 text-gray-200 border border-muted-600"
                      onClick={() => handleForceComplete(q.id)}
                    >
                      Complete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Active */}
        <div className="rounded-lg fantasy-border bg-panel-800 p-3">
          <h3 className="text-md font-semibold text-gray-100 mb-3">Active</h3>

          {Object.keys(playerQuests.active || {}).length === 0 ? (
            <div className="text-gray-500 text-sm">No active quests.</div>
          ) : (
            <div className="flex flex-col gap-3">
              {Object.entries(playerQuests.active).map(([id, state]) => {
                const qDef = getQuestDef(id);
                return (
                  <div key={id} className="p-3 rounded-lg bg-[#0f1720] border border-[#1f2937]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-100">{qDef?.title ?? id}</div>
                        <div className="text-xs text-gray-400 mt-1 truncate">{qDef?.desc}</div>
                        <div className="text-xs text-gray-300 mt-2">{renderTypeLabel(qDef)} • {renderTargetSummary(qDef)}</div>
                      </div>
                      <div className="text-right text-xs text-gray-300">{renderRewards(qDef?.rewards)}</div>
                    </div>

                    <div className="mt-3">{renderProgress(qDef, state)}</div>

                    <div className="text-xs text-gray-300 mt-3 flex justify-between">
                      <div>Accepted: {state.acceptedAt ? new Date(state.acceptedAt).toLocaleString() : "—"}</div>
                      <div>Actions</div>
                    </div>

                    <div className="flex gap-2 mt-3">
                      <button
                        className="px-3 py-2 rounded bg-muted-700 text-gray-200 border border-muted-600 flex-1"
                        onClick={() => handleAbandon(id)}
                      >
                        Abandon
                      </button>
                      <button
                        className="px-3 py-2 rounded bg-indigo-900 text-indigo-100 border border-indigo-700"
                        onClick={() => handleForceComplete(id)}
                      >
                        Complete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Completed */}
        <div className="rounded-lg fantasy-border bg-panel-800 p-3">
          <h3 className="text-md font-semibold text-gray-100 mb-3">Completed</h3>

          {playerQuests.completed.length === 0 ? (
            <div className="text-gray-500 text-sm">No completed quests.</div>
          ) : (
            <div className="flex flex-col gap-3">
              {playerQuests.completed.map(qid => {
                const qDef = getQuestDef(qid);
                return (
                  <div key={qid} className="p-3 rounded-lg bg-[#0f1720] border border-[#1f2937]">
                    <div className="font-semibold text-gray-100">{qDef?.title ?? qid}</div>
                    <div className="text-xs text-gray-400 mt-1">{qDef?.desc ?? ""}</div>
                    <div className="text-xs text-gray-300 mt-2">Rewards: {renderRewards(qDef?.rewards)}</div>

                    <div className="flex mt-3">
                      <button
                        className="px-3 py-2 rounded bg-muted-700 text-gray-200 border border-muted-600"
                        onClick={() => alert(JSON.stringify(qDef, null, 2))}
                      >
                        View
                      </button>
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
