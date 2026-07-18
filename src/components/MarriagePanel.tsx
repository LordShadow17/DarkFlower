import React, { useState } from "react";
import { Guild, MarriageConfig } from "../types";
import { Heart, Users, Clock, ShieldAlert, Award, Image as ImageIcon, Palette, Type, ShieldX, UserCheck, Trash2, Plus, Search } from "lucide-react";
import { showToast } from "../utils/toast";

interface MarriagePanelProps {
  guild: Guild;
  onUpdateGuild: (updated: Guild) => void;
}

export default function MarriagePanel({ guild, onUpdateGuild }: MarriagePanelProps) {
  // Config state
  const [maxSpouses, setMaxSpouses] = useState(guild.marriageConfig?.maxSpouses ?? 2);
  const [cooldownSeconds, setCooldownSeconds] = useState(guild.marriageConfig?.cooldownSeconds ?? 60);
  const [requireDivorceFee, setRequireDivorceFee] = useState(guild.marriageConfig?.requireDivorceFee ?? false);
  const [roleRewards, setRoleRewards] = useState<Array<{ days: number; roleName: string }>>(
    guild.marriageConfig?.roleRewards ?? [
      { days: 30, roleName: "Sweethearts" },
      { days: 100, roleName: "In Love" }
    ]
  );

  // Styling state
  const [bannerUrl, setBannerUrl] = useState(guild.marriageConfig?.bannerUrl ?? "https://api.dicebear.com/7.x/identicon/svg?seed=marriage");
  const [embedColor, setEmbedColor] = useState(guild.marriageConfig?.embedColor ?? "#FF69B4");
  const [customWeddingText, setCustomWeddingText] = useState(
    guild.marriageConfig?.customWeddingText ?? "A lifetime of love, laughter, and happiness together! ✨"
  );

  // Search filter for registry
  const [searchQuery, setSearchQuery] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Handlers for milestones
  const handleAddMilestone = () => {
    setRoleRewards([...roleRewards, { days: 30, roleName: "Newlywed Badge" }]);
  };

  const handleRemoveMilestone = (index: number) => {
    setRoleRewards(roleRewards.filter((_, i) => i !== index));
  };

  const handleMilestoneChange = (index: number, key: "days" | "roleName", value: any) => {
    const updated = [...roleRewards];
    updated[index] = { ...updated[index], [key]: value };
    setRoleRewards(updated);
  };

  // Save full configurations
  const handleSaveConfig = async () => {
    setIsSaving(true);
    const payload: MarriageConfig = {
      maxSpouses,
      cooldownSeconds,
      requireDivorceFee,
      roleRewards,
      bannerUrl,
      embedColor,
      customWeddingText
    };

    try {
      const res = await fetch(`/api/guilds/${guild.id}/marriage/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        onUpdateGuild({
          ...guild,
          marriageConfig: data.marriageConfig
        });
        showToast("Marriage configuration successfully saved to server memory! 💍", "success");
      } else {
        showToast("Failed to save marriage configuration.", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error connecting to server database.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  // Administrative Force Divorce
  const handleForceDivorce = async (user1Id: string, user2Id: string) => {
    const confirm = window.confirm("Are you sure you want to administratively force divorce this couple? This will also remove their family nick suffix and family role.");
    if (!confirm) return;

    try {
      const res = await fetch(`/api/guilds/${guild.id}/marriage/force-divorce`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user1Id, user2Id })
      });

      if (res.ok) {
        const data = await res.json();
        onUpdateGuild({
          ...guild,
          marriages: data.marriages
        });
        showToast("Administrative Force Divorce completed. Database and nick suffixes updated.", "success");
      } else {
        showToast("Failed to execute force divorce.", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Server connection error during force divorce.", "error");
    }
  };

  // Get count of children associated with a marriage
  const getChildrenCountForMarriage = (m: any) => {
    if (!guild.parentChildLinks) return 0;
    // Count links where either spouse is parent
    const uniqueChildren = new Set(
      guild.parentChildLinks
        .filter(l => l.parentId === m.user1Id || l.parentId === m.user2Id)
        .map(l => l.childId)
    );
    return uniqueChildren.size;
  };

  const marriages = guild.marriages || [];
  const filteredMarriages = marriages.filter(m => {
    const query = searchQuery.toLowerCase();
    return (
      m.user1Tag.toLowerCase().includes(query) ||
      m.user2Tag.toLowerCase().includes(query) ||
      m.familyName.toLowerCase().includes(query)
    );
  });

  return (
    <div className="space-y-6 animate-fade-in" id="marriage-lounge">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white font-display flex items-center gap-2">
            <Heart className="w-6 h-6 text-pink-500 fill-pink-500/20" />
            Marriage & Families System
          </h2>
          <p className="text-sm text-slate-400">
            Expand relationships with custom proposals, family tree lineage nodes, and roles rewards.
          </p>
        </div>
        <button
          onClick={handleSaveConfig}
          disabled={isSaving}
          className="btn-primary flex items-center gap-2 bg-gradient-to-r from-pink-600 to-purple-600 text-white font-semibold py-2.5 px-5 rounded-xl shadow-lg shadow-pink-500/10 cursor-pointer hover:from-pink-500 hover:to-purple-500 transition-all disabled:opacity-50"
        >
          {isSaving ? "Saving Config..." : "Save System Config"}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Core Settings & Limitations Card */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-6" id="marriage-core-settings">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <Users className="w-5 h-5 text-pink-500" />
            <h4 className="text-base font-bold text-white font-display">Marriage System Configuration</h4>
          </div>

          <div className="space-y-5">
            {/* Max Spouses */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold text-slate-400">Max Spouses Allowed</label>
                <span className="text-xs font-mono font-bold text-pink-400">{maxSpouses} {maxSpouses === 1 ? "(Monogamy)" : "(Polygamy)"}</span>
              </div>
              <input
                type="range"
                min="1"
                max="5"
                step="1"
                value={maxSpouses}
                onChange={(e) => setMaxSpouses(parseInt(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-pink-500"
              />
              <p className="text-[10px] text-slate-500">Lock the server to strict monogamy or allow multiple concurrent partners.</p>
            </div>

            {/* Proposal Cooldown */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold text-slate-400">Command Proposal Cooldown</label>
                <span className="text-xs font-mono font-bold text-purple-400">{cooldownSeconds}s</span>
              </div>
              <input
                type="range"
                min="10"
                max="600"
                step="10"
                value={cooldownSeconds}
                onChange={(e) => setCooldownSeconds(parseInt(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
              />
              <p className="text-[10px] text-slate-500">Add a time delay limit between spouse proposals to protect chat channels from spam.</p>
            </div>

            {/* Divorce Fee Switch */}
            <div className="flex items-center justify-between bg-slate-950/40 p-3 rounded-xl border border-slate-800">
              <div className="space-y-0.5">
                <span className="text-xs font-semibold text-white block">Divorce Currency Fee</span>
                <span className="text-[10px] text-slate-400 block">Requires currency from the server economy to execute `/divorce`.</span>
              </div>
              <button
                type="button"
                onClick={() => setRequireDivorceFee(!requireDivorceFee)}
                className={`w-10 h-5 rounded-full transition-colors relative flex items-center p-0.5 cursor-pointer ${requireDivorceFee ? "bg-pink-600" : "bg-slate-800"}`}
              >
                <span className={`w-4 h-4 rounded-full bg-white transition-transform ${requireDivorceFee ? "translate-x-5" : "translate-x-0"}`} />
              </button>
            </div>

            {/* Family Role Rewards */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold text-slate-400 flex items-center gap-1">
                  <Award className="w-3.5 h-3.5 text-pink-500" />
                  Family Role Rewards Matrix
                </label>
                <button
                  onClick={handleAddMilestone}
                  className="flex items-center gap-1 text-[11px] font-bold text-pink-400 hover:text-pink-300 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Milestone
                </button>
              </div>

              <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                {roleRewards.map((reward, idx) => (
                  <div key={idx} className="flex gap-2 items-center bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80">
                    <div className="w-24">
                      <label className="text-[9px] font-semibold text-slate-500 uppercase block mb-0.5">Days Married</label>
                      <input
                        type="number"
                        value={reward.days}
                        onChange={(e) => handleMilestoneChange(idx, "days", parseInt(e.target.value) || 0)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs font-mono text-white focus:outline-none focus:border-pink-500"
                        placeholder="30"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-[9px] font-semibold text-slate-500 uppercase block mb-0.5">Role to Assign</label>
                      <input
                        type="text"
                        value={reward.roleName}
                        onChange={(e) => handleMilestoneChange(idx, "roleName", e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-pink-500"
                        placeholder="In Love Role"
                      />
                    </div>
                    <button
                      onClick={() => handleRemoveMilestone(idx)}
                      className="text-slate-500 hover:text-red-400 transition-colors self-end mb-1 p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}

                {roleRewards.length === 0 && (
                  <div className="text-center p-4 bg-slate-900/20 rounded-xl border border-dashed border-slate-800 text-slate-500 text-xs">
                    No family role rewards configured yet.
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>

        {/* Proposal Announcement Image Customizer Card */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-6" id="marriage-styling">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <ImageIcon className="w-5 h-5 text-purple-400" />
            <h4 className="text-base font-bold text-white font-display">Marriage Announcement Styling</h4>
          </div>

          <div className="space-y-5">
            {/* Banner Background */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-purple-400" />
                Banner Backdrop Asset URL
              </label>
              <input
                type="text"
                value={bannerUrl}
                onChange={(e) => setBannerUrl(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                placeholder="https://example.com/wedding-banner.png"
              />
              <p className="text-[10px] text-slate-500">The customized backdrop template used inside Discord Embed blocks on approval.</p>
            </div>

            {/* Color Hex Picker */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5 text-purple-400" />
                Theme Color Key Hex
              </label>
              <div className="flex gap-2">
                <div
                  className="w-10 h-9 rounded-xl border border-slate-800 transition-all shadow-inner"
                  style={{ backgroundColor: embedColor }}
                />
                <input
                  type="text"
                  value={embedColor}
                  onChange={(e) => setEmbedColor(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-purple-500"
                  placeholder="#FF69B4"
                />
              </div>
            </div>

            {/* Default Wedding Custom text */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                <Type className="w-3.5 h-3.5 text-purple-400" />
                Announcement Flavor Text
              </label>
              <textarea
                value={customWeddingText}
                onChange={(e) => setCustomWeddingText(e.target.value)}
                rows={3}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500 resize-none"
                placeholder="A lifetime of love, laughter, and happiness together!"
              />
              <p className="text-[10px] text-slate-500">Custom flavor template. Use `{`proposer`}` and `{`partner`}` to dynamically insert names.</p>
            </div>

            {/* Live Interactive Preview Box */}
            <div className="border border-slate-800/80 rounded-2xl overflow-hidden bg-slate-950/70 p-4 relative space-y-2 shadow-inner">
              <div className="absolute top-0 left-0 w-1.5 h-full" style={{ backgroundColor: embedColor }} />
              <div className="flex justify-between items-start text-[10px] text-slate-400 uppercase tracking-widest font-mono font-semibold">
                <span>Discord Embed Preview</span>
                <span className="text-pink-500">💖 Marriage Announcement</span>
              </div>
              <h5 className="text-sm font-bold text-white font-display">💝 They Said YES! The Marriage is Official! 💍</h5>
              <p className="text-xs text-slate-300">
                🎉 **PressTV** and **Wumpus** are now officially married with the family name **Lovely**! 🎉
              </p>
              <p className="text-xs text-slate-400 italic">
                "{customWeddingText.replace(/{proposer}/g, "PressTV").replace(/{partner}/g, "Wumpus")}"
              </p>
            </div>
          </div>
        </div>

      </div>

      {/* Server Lineage Registry List */}
      <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4" id="marriage-registry">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-3 gap-3">
          <div className="flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-pink-500" />
            <h4 className="text-base font-bold text-white font-display">Server Relationship Database</h4>
          </div>

          {/* Search bar inside header */}
          <div className="relative w-full sm:w-64 z-10">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <Search className="w-3.5 h-3.5 text-slate-500" />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-pink-500/50"
              placeholder="Search couples or family..."
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/20">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900/60 border-b border-slate-800 text-[10px] font-bold font-mono text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4">Spouses Partner Profiles</th>
                <th className="py-3 px-4">Family Node</th>
                <th className="py-3 px-4">Duration Milestone</th>
                <th className="py-3 px-4">Lineage Nodes</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50 text-xs">
              {filteredMarriages.map((m, idx) => {
                const daysMarried = Math.max(0, Math.floor((Date.now() - m.marriedAt) / (1000 * 60 * 60 * 24)));
                const childrenCount = getChildrenCountForMarriage(m);

                return (
                  <tr key={idx} className="hover:bg-slate-900/20 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="flex -space-x-2">
                          <img
                            src={`https://api.dicebear.com/7.x/pixel-art/svg?seed=${m.user1Tag}`}
                            alt="avatar A"
                            className="w-6 h-6 rounded-full border border-slate-800 bg-slate-900"
                          />
                          <img
                            src={`https://api.dicebear.com/7.x/pixel-art/svg?seed=${m.user2Tag}`}
                            alt="avatar B"
                            className="w-6 h-6 rounded-full border border-slate-800 bg-slate-900"
                          />
                        </div>
                        <div>
                          <span className="font-semibold text-white">{m.user1Tag}</span>
                          <span className="text-slate-500 mx-1">and</span>
                          <span className="font-semibold text-white">{m.user2Tag}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-pink-400">
                      {m.familyName}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1 bg-pink-500/10 text-pink-400 px-2 py-0.5 rounded-full text-[10px] font-mono border border-pink-500/10">
                        <Clock className="w-3 h-3" /> Married {daysMarried} Days
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-300">
                      👶 {childrenCount} Child(ren)
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => handleForceDivorce(m.user1Id, m.user2Id)}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-red-500 hover:text-white hover:bg-red-600/80 px-2.5 py-1 rounded-lg border border-red-500/20 transition-all cursor-pointer"
                      >
                        <ShieldX className="w-3.5 h-3.5" /> Force Divorce
                      </button>
                    </td>
                  </tr>
                );
              })}

              {filteredMarriages.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500 font-medium">
                    No active marriage unions found in the lineage registry database.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
