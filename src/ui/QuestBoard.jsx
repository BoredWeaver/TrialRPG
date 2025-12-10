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

// icons
import { Map as MapIcon, Compass, CheckCircle, XCircle, Gift, Clock } from "lucide-react";

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
        <div className="flex items-center gap-3">
          <Compass className="w-5 h-5 text-amber-300" />
          <h2 className="text-lg font-semibold">Quest Board</h2>
          <div className="text-xs text-gray-400 ml-2 hidden sm:block">• Your active objectives</div>
        </div>

        <div className="flex items-center gap-3">
          {message ? (
            <div className="text-sm text-emerald-300 px-3 py-1 rounded bg-white/3">{message}</div>
          ) : (
            <div className="text-sm text-gray-400">Tips: Accept quests to earn rewards</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Available */}
        <div className="rounded-lg fantasy-border bg-panel-800 p-3">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-md font-semibold text-gray-100 flex items-center gap-2">
              <MapIcon className="w-4 h-4 text-sky-400" />
              Available
            </h3>
            <div className="text-xs text-gray-400">{available.length} found</div>
          </div>

          {available.length === 0 ? (
            <div className="text-gray-500 text-sm">No quests available.</div>
          ) : (
            <div className="flex flex-col gap-3">
              {available.map(q => (
                <div key={q.id} className="p-3 rounded-lg bg-[#0f1720] border border-[#1f2937]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-100 truncate">{q.title}</div>
                      <div className="text-xs text-gray-400 mt-1 truncate">{q.desc}</div>
                      <div className="text-xs text-gray-300 mt-2 truncate">{renderTypeLabel(q)} • {renderTargetSummary(q)}</div>
                    </div>
                    <div className="text-right text-xs text-gray-300 min-w-[80px]">{renderRewards(q.rewards)}</div>
                  </div>

                  <div className="flex gap-2 mt-3">
                    <button
                      className="flex-1 px-3 py-2 rounded bg-indigo-900 text-indigo-100 border border-indigo-700 inline-flex items-center justify-center gap-2"
                      onClick={() => handleAccept(q.id)}
                      title={`Accept ${q.title}`}
                    >
                      <CheckCircle className="w-4 h-4" />
                      Accept
                    </button>

                    <button
                      className="px-3 py-2 rounded bg-muted-700 text-gray-200 border border-muted-600 inline-flex items-center gap-2"
                      onClick={() => handleForceComplete(q.id)}
                      title="Force complete (dev)"
                    >
                      <Gift className="w-4 h-4" />
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
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-md font-semibold text-gray-100 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-300" />
              Active
            </h3>
            <div className="text-xs text-gray-400">{Object.keys(playerQuests.active || {}).length} active</div>
          </div>

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
                        <div className="font-semibold text-gray-100 truncate">{qDef?.title ?? id}</div>
                        <div className="text-xs text-gray-400 mt-1 truncate">{qDef?.desc}</div>
                        <div className="text-xs text-gray-300 mt-2 truncate">{renderTypeLabel(qDef)} • {renderTargetSummary(qDef)}</div>
                      </div>
                      <div className="text-right text-xs text-gray-300 min-w-[80px]">{renderRewards(qDef?.rewards)}</div>
                    </div>

                    <div className="mt-3">{renderProgress(qDef, state)}</div>

                    <div className="text-xs text-gray-300 mt-3 flex justify-between items-center">
                      <div className="truncate">Accepted: {state.acceptedAt ? new Date(state.acceptedAt).toLocaleString() : "—"}</div>
                      <div className="flex items-center gap-2">
                        <button
                          className="px-3 py-1 rounded bg-muted-700 text-gray-200 border border-muted-600 text-xs"
                          onClick={() => handleAbandon(id)}
                          title="Abandon quest"
                        >
                          <XCircle className="w-4 h-4 inline-block mr-1" />
                          Abandon
                        </button>
                        <button
                          className="px-3 py-1 rounded bg-indigo-900 text-indigo-100 border border-indigo-700 text-xs"
                          onClick={() => handleForceComplete(id)}
                          title="Force complete"
                        >
                          <CheckCircle className="w-4 h-4 inline-block mr-1" />
                          Complete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Completed */}
        <div className="rounded-lg fantasy-border bg-panel-800 p-3">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-md font-semibold text-gray-100 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-300" />
              Completed
            </h3>
            <div className="text-xs text-gray-400">{playerQuests.completed.length} finished</div>
          </div>

          {playerQuests.completed.length === 0 ? (
            <div className="text-gray-500 text-sm">No completed quests.</div>
          ) : (
            <div className="flex flex-col gap-3">
              {playerQuests.completed.map(qid => {
                const qDef = getQuestDef(qid);
                return (
                  <div key={qid} className="p-3 rounded-lg bg-[#0f1720] border border-[#1f2937]">
                    <div className="font-semibold text-gray-100 truncate">{qDef?.title ?? qid}</div>
                    <div className="text-xs text-gray-400 mt-1 truncate">{qDef?.desc ?? ""}</div>
                    <div className="text-xs text-gray-300 mt-2 truncate">Rewards: {renderRewards(qDef?.rewards)}</div>

                    <div className="flex mt-3">
                      <button
                        className="px-3 py-2 rounded bg-muted-700 text-gray-200 border border-muted-600 text-sm"
                        onClick={() => alert(JSON.stringify(qDef, null, 2))}
                        title="View quest definition"
                      >
                        <Gift className="w-4 h-4 inline-block mr-2" />
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
