import React, { useState } from "react";
import { Guild } from "../types";
import { Award, Zap, Volume2, Shield, Calendar, Users, Plus, Trash2 } from "lucide-react";

interface LevelingPanelProps {
  guild: Guild;
  onUpdateConfig: (config: any) => void;
}

export default function LevelingPanel({ guild, onUpdateConfig }: LevelingPanelProps) {
  const { config, leaderboard } = guild;

  // Local config settings
  const [levelingEnabled, setLevelingEnabled] = useState(config.levelingEnabled ?? true);
  const [xpRate, setXpRate] = useState(config.xpRate || 1.0);
  const [levelChannel, setLevelChannel] = useState(config.levelChannel || "#level-ups");
  const [milestones, setMilestones] = useState<Array<{ level: number; role: string }>>(
    config.levelRoles || [
      { level: 5, role: "Bronze Bud" },
      { level: 15, role: "Violet Petal" },
      { level: 30, role: "DarkFlower Elder" }
    ]
  );

  // Autosave states
  const [autosave, setAutosave] = useState(true);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  const triggerAutosave = (updatedFields: any) => {
    if (!autosave) return;
    setSaveStatus("saving");
    onUpdateConfig({
      levelingEnabled,
      xpRate,
      levelChannel,
      levelRoles: milestones,
      ...updatedFields
    });
    setTimeout(() => {
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 1500);
    }, 400);
  };

  const handleSaveSettings = () => {
    onUpdateConfig({
      levelingEnabled,
      xpRate,
      levelChannel,
      levelRoles: milestones
    });
    alert("Leveling and Progression rewards settings saved!");
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 animate-fade-in">
      
      {/* Left Settings Column */}
      <div className="space-y-6">
        <div className="glass-panel p-5 rounded-2xl border border-purple-500/10 space-y-4 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-purple-500/10 pb-3 gap-3">
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-purple-400" />
              <h4 className="text-base font-bold text-white font-display">Leveling System Setup</h4>
            </div>

            {/* Autosave Status Switch */}
            <div className="flex items-center gap-2 bg-slate-950/60 px-2.5 py-1 rounded-xl border border-purple-500/10">
              <span className="text-[9px] text-slate-400 font-mono font-semibold uppercase">Autosave</span>
              <button
                type="button"
                onClick={() => setAutosave(!autosave)}
                className={`w-7.5 h-4 rounded-full transition-colors relative flex items-center p-0.5 cursor-pointer ${autosave ? "bg-purple-600" : "bg-slate-800"}`}
              >
                <span className={`w-3 h-3 rounded-full bg-white transition-transform ${autosave ? "translate-x-3.5" : "translate-x-0"}`} />
              </button>
              {autosave && (
                <span className="flex items-center gap-1 text-[9px] font-bold font-mono transition-all">
                  {saveStatus === "saving" ? (
                    <span className="text-purple-300 flex items-center gap-1 animate-pulse">
                      Saving...
                    </span>
                  ) : saveStatus === "saved" ? (
                    <span className="text-green-400">
                      Saved
                    </span>
                  ) : (
                    <span className="text-purple-400">
                      Active
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/40 border border-purple-500/5">
              <div>
                <label className="text-xs font-semibold text-slate-300 block">Leveling Active</label>
                <span className="text-[10px] text-slate-500">Enable voice/text XP calculation.</span>
              </div>
              <input
                type="checkbox"
                checked={levelingEnabled}
                onChange={(e) => {
                  const val = e.target.checked;
                  setLevelingEnabled(val);
                  triggerAutosave({ levelingEnabled: val });
                }}
                className="w-4 h-4 accent-purple-500 cursor-pointer"
              />
            </div>

            <div className="p-3 rounded-xl bg-slate-950/40 border border-purple-500/5 space-y-2">
              <div className="flex justify-between">
                <label className="text-xs font-semibold text-slate-300">XP Generation Rate</label>
                <span className="text-xs font-mono text-purple-300">{xpRate}x Boosted</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="3.0"
                step="0.5"
                value={xpRate}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setXpRate(val);
                  triggerAutosave({ xpRate: val });
                }}
                className="w-full accent-purple-500 h-1 rounded-full cursor-pointer"
              />
              <span className="text-[10px] text-slate-400 block">Modifiers speed up how fast active chatters rank up.</span>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1">Level-Up Alerts Channel</label>
              <select
                value={levelChannel}
                onChange={(e) => {
                  const val = e.target.value;
                  setLevelChannel(val);
                  triggerAutosave({ levelChannel: val });
                }}
                className="w-full bg-slate-950 border border-purple-500/20 rounded-xl px-3 py-2 text-xs text-white outline-none"
              >
                {guild.channels.map((chan) => (
                  <option key={chan} value={chan}>{chan}</option>
                ))}
              </select>
            </div>

            <button
              type="button"
              disabled={autosave}
              onClick={handleSaveSettings}
              className={`w-full py-2 rounded-xl text-xs font-semibold shadow transition ${autosave ? "bg-slate-900 border border-purple-500/25 text-purple-300 opacity-60 cursor-default" : "bg-purple-600 hover:bg-purple-500 text-white cursor-pointer"}`}
            >
              {autosave ? "✓ Autosave Enabled" : "Save Leveling Configurations"}
            </button>
          </div>
        </div>        {/* Level Roles Rewards */}
        <div className="glass-panel p-5 rounded-2xl border border-purple-500/10 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-[#ff73fa]" />
              <h5 className="text-sm font-bold text-white font-display">Automated Role Milestones</h5>
            </div>
            <button
              type="button"
              onClick={() => {
                const updated = [...milestones, { level: 40, role: "🌸 Level 40 Reward" }];
                setMilestones(updated);
                triggerAutosave({ levelRoles: updated });
              }}
              className="flex items-center gap-1 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/20 px-2 py-1 rounded-xl text-xs transition font-semibold cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Reward
            </button>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Configure custom roles to be automatically assigned to members as they cross different Level milestones.
          </p>

          <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1">
            {milestones.length === 0 ? (
              <p className="text-xs text-slate-500 italic text-center py-4 bg-slate-950/20 rounded-xl border border-dashed border-purple-500/10">
                No active milestone rewards configured. Add one below!
              </p>
            ) : (
              milestones.map((m, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2 rounded-xl bg-slate-950/40 border border-purple-500/5 group">
                  <div className="w-20 shrink-0">
                    <label className="text-[9px] text-slate-500 font-mono block mb-0.5">LVL</label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={m.level}
                      onChange={(e) => {
                        const val = Math.max(1, Number(e.target.value) || 1);
                        const updated = [...milestones];
                        updated[idx] = { ...updated[idx], level: val };
                        setMilestones(updated);
                        triggerAutosave({ levelRoles: updated });
                      }}
                      className="w-full bg-slate-950 border border-purple-500/20 rounded-lg px-2 py-1 text-xs text-white text-center font-mono outline-none focus:border-purple-500/40"
                    />
                  </div>
                  
                  <div className="flex-1">
                    <label className="text-[9px] text-slate-500 font-mono block mb-0.5">Awarded Role</label>
                    <input
                      type="text"
                      value={m.role}
                      placeholder="e.g. Bronze Bud"
                      onChange={(e) => {
                        const val = e.target.value;
                        const updated = [...milestones];
                        updated[idx] = { ...updated[idx], role: val };
                        setMilestones(updated);
                        triggerAutosave({ levelRoles: updated });
                      }}
                      className="w-full bg-slate-950 border border-purple-500/20 rounded-lg px-3 py-1 text-xs text-white outline-none focus:border-purple-500/40"
                    />
                  </div>

                  <div className="pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        const updated = milestones.filter((_, i) => i !== idx);
                        setMilestones(updated);
                        triggerAutosave({ levelRoles: updated });
                      }}
                      className="p-1.5 rounded-lg bg-red-500/10 border border-red-500/10 hover:bg-red-500/20 hover:border-red-500/25 text-red-400 hover:text-red-300 transition cursor-pointer"
                      title="Delete milestone reward"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Right Column (2 spans): Leaderboard Grid view */}
      <div className="xl:col-span-2 space-y-6">
        <div className="glass-panel p-5 rounded-2xl border border-purple-500/10 space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-purple-500/10 pb-3">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-purple-400" />
              <h4 className="text-base font-bold text-white font-display">Guild Level Leaderboard</h4>
            </div>
            <span className="text-xs text-slate-400">Announcements: <strong className="text-purple-300 font-mono">{levelChannel}</strong></span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="text-xs uppercase tracking-wider text-slate-400 border-b border-purple-500/10">
                <tr>
                  <th className="py-3 px-2">Rank</th>
                  <th className="py-3 px-2">Active Member</th>
                  <th className="py-3 px-2">Total Level</th>
                  <th className="py-3 px-2">Current XP</th>
                  <th className="py-3 px-2">XP Progress Bar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-500/5">
                {leaderboard.length ? (
                  [...leaderboard].sort((a, b) => b.xp - a.xp).map((member, idx) => {
                    const rank = idx + 1;
                    
                    // Unified progression calculation matching server.ts
                    const getXPCurveInfo = (totalXp: number) => {
                      let lvl = 1;
                      let tempXp = totalXp;
                      while (true) {
                        const neededForNext = lvl * 600;
                        if (tempXp >= neededForNext) {
                          tempXp -= neededForNext;
                          lvl++;
                        } else {
                          break;
                        }
                      }
                      return { level: lvl, xpInLevel: tempXp, xpNeeded: lvl * 600 };
                    };

                    const lvlInfo = getXPCurveInfo(member.xp);
                    const xpPct = Math.max(0, Math.min(100, Math.floor((lvlInfo.xpInLevel / lvlInfo.xpNeeded) * 100)));

                    return (
                      <tr key={idx} className="hover:bg-purple-500/5 transition">
                        <td className="py-3 px-2">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold font-display ${
                            rank === 1 ? "bg-yellow-500 text-slate-950" :
                            rank === 2 ? "bg-slate-300 text-slate-950" :
                            rank === 3 ? "bg-amber-600 text-white" :
                            "bg-slate-950 text-slate-400 border border-purple-500/10"
                          }`}>
                            {rank}
                          </span>
                        </td>
                        <td className="py-3 px-2 font-medium text-white flex items-center gap-2.5">
                          <img src={member.avatar} className="w-7 h-7 rounded-full bg-slate-900" referrerPolicy="no-referrer" />
                          <div>
                            <span className="block font-semibold">{member.user}</span>
                            {rank === 1 && <span className="text-[9px] text-[#ff73fa] uppercase font-bold">Server Champion</span>}
                          </div>
                        </td>
                        <td className="py-3 px-2 text-white font-bold font-display">
                          Level {lvlInfo.level}
                        </td>
                        <td className="py-3 px-2 text-slate-400 font-mono text-xs">
                          {member.xp.toLocaleString()} XP
                        </td>
                        <td className="py-3 px-2 w-44">
                          <div className="space-y-1">
                            <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-purple-500 to-[#ff73fa] rounded-full" style={{ width: `${xpPct}%` }}></div>
                            </div>
                            <span className="text-[9px] text-slate-500 block font-mono">{xpPct}% ({lvlInfo.xpInLevel}/{lvlInfo.xpNeeded})</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className="py-6 px-2 text-center text-slate-500 italic">Leveling is active. Let chatters chat in public channels to populate leaderboard rankings!</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>
  );
}
