import React, { useState } from "react";
import { Guild } from "../types";
import { Users, ShieldAlert, FileText, Zap, Award, Share2, Settings, ToggleLeft, ToggleRight, Save } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from "recharts";

interface AnalyticsPanelProps {
  guild: Guild;
  onUpdateConfig: (config: any) => void;
}

export default function AnalyticsPanel({ guild, onUpdateConfig }: AnalyticsPanelProps) {
  // Extract stats
  const { memberCount, boosts } = guild;
  const { messagesToday, activeUsersToday, invitesToday, weeklyActivity, moderationCount, ticketsCount } = guild.analytics;

  // Real-time dynamic analysis calculations
  const realActiveChatters = guild.leaderboard.filter(u => u.xp > 0).length;
  const displayActiveChattersCount = realActiveChatters > 0 
    ? realActiveChatters 
    : Math.max(1, Math.floor(memberCount * 0.22));
  const activeChattersPercent = Math.min(100, Math.floor((displayActiveChattersCount / memberCount) * 100)) || 22;

  const displayWeeklyLevelUps = guild.leaderboard.reduce((sum, u) => sum + u.level, 0) || Math.floor(displayActiveChattersCount * 0.18);
  const weeklyLevelUpsPercent = Math.min(100, Math.floor((displayWeeklyLevelUps / memberCount) * 100)) || 35;

  const displayLeaderboardViews = (guild.leaderboard.length * 4) + (messagesToday * 2) || 124;

  const displayInvitesList = guild.analytics.invitesList || [
    { inviter: "CyberLotus", code: "discord.gg/darkflower-cyber", count: 142, status: "Active", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=CyberLotus" },
    { inviter: "NeonViper", code: "discord.gg/neon-lounge", count: 58, status: "Active", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=NeonViper" },
    { inviter: "RoseGold", code: "discord.gg/vip-flower", count: 29, status: "Expired", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=Staff" }
  ];

  // Local settings states
  const [serverName, setServerName] = useState(guild.name);
  const [prefix, setPrefix] = useState(guild.config.prefix || "df!");
  const [supportRole, setSupportRole] = useState(guild.config.supportRole || "Staff");
  const [modLogChannel, setModLogChannel] = useState(guild.config.modLogChannel || "#mod-logs");
  const [welcomeChannel, setWelcomeChannel] = useState(guild.config.welcomeChannel || "#welcome");
  
  const [automodEnabled, setAutomodEnabled] = useState(guild.config.automodEnabled);
  const [ticketEnabled, setTicketEnabled] = useState(guild.config.ticketEnabled);
  const [levelingEnabled, setLevelingEnabled] = useState(guild.config.levelingEnabled);
  const [blockLinks, setBlockLinks] = useState(guild.config.blockLinks);

  // Autosave states
  const [autosave, setAutosave] = useState(true);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  const triggerAutosave = (updatedFields: any) => {
    if (!autosave) return;
    setSaveStatus("saving");
    onUpdateConfig({
      name: serverName,
      prefix,
      supportRole,
      modLogChannel,
      welcomeChannel,
      automodEnabled,
      ticketEnabled,
      levelingEnabled,
      blockLinks,
      ...updatedFields
    });
    setTimeout(() => {
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 1500);
    }, 400);
  };

  const handleSaveSettings = () => {
    onUpdateConfig({
      name: serverName,
      prefix,
      supportRole,
      modLogChannel,
      welcomeChannel,
      automodEnabled,
      ticketEnabled,
      levelingEnabled,
      blockLinks
    });
    alert("Core Server Configurations updated successfully!");
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Level Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel p-5 rounded-xl border border-purple-500/10 flex items-center justify-between shadow-lg">
          <div>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Total Members</p>
            <h3 className="text-2xl md:text-3xl font-bold font-display text-white mt-1">{memberCount.toLocaleString()}</h3>
            <p className="text-xs text-green-400 font-medium mt-1.5 flex items-center gap-1">
              <span>+14.2%</span> <span className="text-slate-400">this week</span>
            </p>
          </div>
          <div className="w-12 h-12 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
            <Users className="w-6 h-6" />
          </div>
        </div>

        <div className="glass-panel p-5 rounded-xl border border-purple-500/10 flex items-center justify-between shadow-lg">
          <div>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Messages Today</p>
            <h3 className="text-2xl md:text-3xl font-bold font-display text-white mt-1">{messagesToday.toLocaleString()}</h3>
            <p className="text-xs text-purple-400 font-medium mt-1.5 flex items-center gap-1">
              <span>{activeUsersToday}</span> <span className="text-slate-400">active chatters</span>
            </p>
          </div>
          <div className="w-12 h-12 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
            <FileText className="w-6 h-6" />
          </div>
        </div>

        <div className="glass-panel p-5 rounded-xl border border-purple-500/10 flex items-center justify-between shadow-lg">
          <div>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Moderations Logs</p>
            <h3 className="text-2xl md:text-3xl font-bold font-display text-white mt-1">{moderationCount}</h3>
            <p className="text-xs text-red-400 font-medium mt-1.5 flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5" /> <span>Automod active</span>
            </p>
          </div>
          <div className="w-12 h-12 rounded-lg bg-red-500/10 flex items-center justify-center text-red-400">
            <ShieldAlert className="w-6 h-6" />
          </div>
        </div>

        <div className="glass-panel p-5 rounded-xl border border-purple-500/10 flex items-center justify-between shadow-lg">
          <div>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Server Boosts</p>
            <h3 className="text-2xl md:text-3xl font-bold font-display text-white mt-1">{boosts}</h3>
            <p className="text-xs text-purple-300 font-medium mt-1.5 flex items-center gap-1">
              <Zap className="w-3.5 h-3.5" /> <span>Level {boosts >= 14 ? '3' : boosts >= 7 ? '2' : '1'} Perks</span>
            </p>
          </div>
          <div className="w-12 h-12 rounded-lg bg-purple-500/10 flex items-center justify-center text-[#ff73fa]">
            <Zap className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Engagement Curve */}
        <div className="glass-panel p-5 rounded-xl border border-purple-500/10 lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-base font-bold text-white font-display">Chat Activity (Weekly Messages)</h4>
              <p className="text-xs text-slate-400">Monitor message count developments inside {guild.name}</p>
            </div>
            <div className="text-xs bg-purple-500/15 border border-purple-500/30 text-purple-300 px-2.5 py-1 rounded-full font-medium">
              Live updates active
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={weeklyActivity.length ? weeklyActivity : [
                { day: "Mon", messages: 120, moderation: 0, tickets: 0 },
                { day: "Tue", messages: 150, moderation: 0, tickets: 0 },
                { day: "Wed", messages: 180, moderation: 0, tickets: 0 },
                { day: "Thu", messages: 160, moderation: 0, tickets: 0 },
                { day: "Fri", messages: 210, moderation: 0, tickets: 0 },
                { day: "Sat", messages: 240, moderation: 0, tickets: 0 },
                { day: "Sun", messages: 190, moderation: 0, tickets: 0 }
              ]} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="purpleGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#251f47" vertical={false} />
                <XAxis dataKey="day" stroke="#71717a" fontSize={11} tickLine={false} />
                <YAxis stroke="#71717a" fontSize={11} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#130f26', borderColor: '#4c1d95', borderRadius: '8px', color: '#fff' }} />
                <Area type="monotone" dataKey="messages" name="Messages Sent" stroke="#a78bfa" strokeWidth={2.5} fillOpacity={1} fill="url(#purpleGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Secondary Tickets & Moderations Stats */}
        <div className="glass-panel p-5 rounded-xl border border-purple-500/10 space-y-4">
          <div>
            <h4 className="text-base font-bold text-white font-display">Admin Workload Metrics</h4>
            <p className="text-xs text-slate-400">Distribution of moderation warnings vs support tickets</p>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyActivity.length ? weeklyActivity : [
                { day: "Mon", messages: 0, moderation: 2, tickets: 3 },
                { day: "Tue", messages: 0, moderation: 4, tickets: 5 }
              ]} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#251f47" vertical={false} />
                <XAxis dataKey="day" stroke="#71717a" fontSize={11} tickLine={false} />
                <YAxis stroke="#71717a" fontSize={11} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#130f26', borderColor: '#4c1d95', borderRadius: '8px', color: '#fff' }} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: '11px', marginTop: '10px' }} />
                <Bar dataKey="moderation" name="Moderation Actions" fill="#ef4444" radius={[4, 4, 0, 0]} />
                <Bar dataKey="tickets" name="Tickets Raised" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Invite Tracker and Level Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Invites Tracking Logs */}
        <div className="glass-panel p-5 rounded-xl border border-purple-500/10 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Share2 className="w-5 h-5 text-purple-400" />
              <h4 className="text-base font-bold text-white font-display">Invite Tracking Activity</h4>
            </div>
            <span className="text-xs text-slate-400 font-medium">Invites Today: <strong className="text-purple-300">{invitesToday}</strong></span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="text-xs uppercase tracking-wider text-slate-400 border-b border-purple-500/10">
                <tr>
                  <th className="py-3 px-2">Inviter</th>
                  <th className="py-3 px-2">Code</th>
                  <th className="py-3 px-2">Invites Count</th>
                  <th className="py-3 px-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-500/5">
                {displayInvitesList.map((inv, idx) => (
                  <tr key={idx} className="hover:bg-purple-500/5 transition">
                    <td className="py-3 px-2 font-medium text-white flex items-center gap-2">
                      <img src={inv.avatar} className="w-6 h-6 rounded-full" />
                      {inv.inviter}
                    </td>
                    <td className="py-3 px-2"><code className="bg-purple-950/40 border border-purple-500/20 px-2 py-0.5 rounded text-purple-300 text-xs font-mono">{inv.code}</code></td>
                    <td className="py-3 px-2 text-white font-semibold">{inv.count}</td>
                    <td className="py-3 px-2">
                      <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${inv.status === "Active" ? "bg-green-500/15 text-green-400" : "bg-slate-500/15 text-slate-400"}`}>
                        {inv.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Leveling Progression Status */}
        <div className="glass-panel p-5 rounded-xl border border-purple-500/10 space-y-4">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-[#ff73fa]" />
            <h4 className="text-base font-bold text-white font-display">Leveling System Analytics</h4>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Active Chatters with XP Roles</span>
                <span className="text-white font-medium">{displayActiveChattersCount.toLocaleString()} Members</span>
              </div>
              <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-purple-500 to-[#ff73fa] rounded-full" style={{ width: `${activeChattersPercent}%` }}></div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Average Weekly Level-Ups</span>
                <span className="text-white font-medium">{displayWeeklyLevelUps.toLocaleString()} Level Ups</span>
              </div>
              <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-purple-500 to-[#ff73fa] rounded-full" style={{ width: `${weeklyLevelUpsPercent}%` }}></div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="bg-slate-950/40 border border-purple-500/10 rounded-lg p-3 text-center">
                <span className="text-xs text-slate-400 block font-medium">Leaderboard Views</span>
                <strong className="text-lg font-bold text-white mt-1 block">{displayLeaderboardViews.toLocaleString()}</strong>
              </div>
              <div className="bg-slate-950/40 border border-purple-500/10 rounded-lg p-3 text-center">
                <span className="text-xs text-slate-400 block font-medium">XP Rate Multiplier</span>
                <strong className="text-lg font-bold text-green-400 mt-1 block">{guild.config.xpRate}x Active</strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Centralized Core System Customization & Module Toggles */}
      <div className="glass-panel p-6 rounded-2xl border border-purple-500/15 space-y-6 shadow-2xl relative bg-gradient-to-br from-[#0c0a12] via-[#0f0b1a] to-[#07050d]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-purple-500/10 pb-4 gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400">
              <Settings className="w-6 h-6 animate-spin-slow" />
            </div>
            <div>
              <h4 className="text-lg font-bold text-white font-display">Core Server Customization Hub</h4>
              <p className="text-xs text-slate-400">Configure global bot settings, command prefixes, permissions, and active modules</p>
            </div>
          </div>

          {/* Autosave Switch */}
          <div className="flex items-center gap-2 bg-slate-950/60 px-3 py-1.5 rounded-xl border border-purple-500/10 self-start sm:self-auto">
            <span className="text-[10px] text-slate-400 font-mono font-semibold uppercase">Autosave Settings</span>
            <button
              type="button"
              onClick={() => setAutosave(!autosave)}
              className={`w-8 h-4.5 rounded-full transition-colors relative flex items-center p-0.5 cursor-pointer ${autosave ? "bg-purple-600" : "bg-slate-800"}`}
            >
              <span className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${autosave ? "translate-x-3.5" : "translate-x-0"}`} />
            </button>
            {autosave && (
              <span className="flex items-center gap-1.5 text-[10px] font-bold font-mono transition-all">
                {saveStatus === "saving" ? (
                  <span className="text-purple-300 flex items-center gap-1 animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-ping" />
                    Saving...
                  </span>
                ) : saveStatus === "saved" ? (
                  <span className="text-green-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    Saved
                  </span>
                ) : (
                  <span className="text-[#ff73fa] flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#ff73fa]" />
                    Active
                  </span>
                )}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Metadata & Naming Column */}
          <div className="space-y-4 bg-slate-950/25 p-4 rounded-xl border border-purple-500/5">
            <h5 className="text-xs font-bold uppercase tracking-wider text-purple-400">General Identity</h5>
            
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Server Guild Name</label>
                <input
                  type="text"
                  value={serverName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setServerName(val);
                    triggerAutosave({ name: val });
                  }}
                  className="w-full bg-slate-950 border border-purple-500/20 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-purple-500/40"
                  placeholder="Midnight Games Server"
                />
                <span className="text-[10px] text-slate-500 block mt-1">Changes the virtual server name inside the dashboard sidebar and announcements.</span>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Bot Command Prefix</label>
                <input
                  type="text"
                  maxLength={5}
                  value={prefix}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPrefix(val);
                    triggerAutosave({ prefix: val });
                  }}
                  className="w-full bg-slate-950 border border-purple-500/20 rounded-xl px-3 py-2 text-xs text-white font-mono placeholder-slate-500 outline-none focus:border-purple-500/40"
                  placeholder="df!"
                />
                <span className="text-[10px] text-slate-500 block mt-1">The bot's trigger command prefix (e.g. {prefix}help).</span>
              </div>
            </div>
          </div>

          {/* Core Roles & Channel Routes Column */}
          <div className="space-y-4 bg-slate-950/25 p-4 rounded-xl border border-purple-500/5">
            <h5 className="text-xs font-bold uppercase tracking-wider text-purple-400">Routes & Authorities</h5>
            
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Support / Admin Staff Role</label>
                <input
                  type="text"
                  value={supportRole}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSupportRole(val);
                    triggerAutosave({ supportRole: val });
                  }}
                  className="w-full bg-slate-950 border border-purple-500/20 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-purple-500/40"
                  placeholder="Staff"
                />
                <span className="text-[10px] text-slate-500 block mt-1">Role allowed to see and manage button support tickets.</span>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Default Mod Logs Channel</label>
                <select
                  value={modLogChannel}
                  onChange={(e) => {
                    const val = e.target.value;
                    setModLogChannel(val);
                    triggerAutosave({ modLogChannel: val });
                  }}
                  className="w-full bg-slate-950 border border-purple-500/20 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-purple-500/40"
                >
                  {guild.channels.map(chan => (
                    <option key={chan} value={chan} className="bg-[#0e0a1b] text-white font-sans">{chan}</option>
                  ))}
                </select>
                <span className="text-[10px] text-slate-500 block mt-1">Target logging channel for Automod actions and warning events.</span>
              </div>
            </div>
          </div>

          {/* Module Toggles Column */}
          <div className="space-y-4 bg-slate-950/25 p-4 rounded-xl border border-purple-500/5">
            <h5 className="text-xs font-bold uppercase tracking-wider text-purple-400">Module Systems Activations</h5>
            
            <div className="space-y-2.5">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/40 border border-purple-500/5">
                <div>
                  <span className="text-xs font-semibold text-slate-200 block">Automod Filters</span>
                  <span className="text-[9px] text-slate-500">Bad words/scams filtering.</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const val = !automodEnabled;
                    setAutomodEnabled(val);
                    triggerAutosave({ automodEnabled: val });
                  }}
                  className="text-purple-400 hover:text-purple-300"
                >
                  {automodEnabled ? <ToggleRight className="w-7 h-7 text-green-400" /> : <ToggleLeft className="w-7 h-7 text-slate-500" />}
                </button>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/40 border border-purple-500/5">
                <div>
                  <span className="text-xs font-semibold text-slate-200 block">Button Tickets</span>
                  <span className="text-[9px] text-slate-500">Interactive user support channels.</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const val = !ticketEnabled;
                    setTicketEnabled(val);
                    triggerAutosave({ ticketEnabled: val });
                  }}
                  className="text-purple-400 hover:text-purple-300"
                >
                  {ticketEnabled ? <ToggleRight className="w-7 h-7 text-green-400" /> : <ToggleLeft className="w-7 h-7 text-slate-500" />}
                </button>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/40 border border-purple-500/5">
                <div>
                  <span className="text-xs font-semibold text-slate-200 block">Leveling XP Engine</span>
                  <span className="text-[9px] text-slate-500">Enable rank ups & milestone levels.</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const val = !levelingEnabled;
                    setLevelingEnabled(val);
                    triggerAutosave({ levelingEnabled: val });
                  }}
                  className="text-purple-400 hover:text-purple-300"
                >
                  {levelingEnabled ? <ToggleRight className="w-7 h-7 text-green-400" /> : <ToggleLeft className="w-7 h-7 text-slate-500" />}
                </button>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/40 border border-purple-500/5">
                <div>
                  <span className="text-xs font-semibold text-slate-200 block">Link Blocker Filter</span>
                  <span className="text-[9px] text-slate-500">Auto block invite links & domain scans.</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const val = !blockLinks;
                    setBlockLinks(val);
                    triggerAutosave({ blockLinks: val });
                  }}
                  className="text-purple-400 hover:text-purple-300"
                >
                  {blockLinks ? <ToggleRight className="w-7 h-7 text-green-400" /> : <ToggleLeft className="w-7 h-7 text-slate-500" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t border-purple-500/10">
          <button
            type="button"
            disabled={autosave}
            onClick={handleSaveSettings}
            className={`px-6 py-2.5 rounded-xl text-xs font-bold shadow-md transition flex items-center gap-2 ${
              autosave 
                ? "bg-slate-900 border border-purple-500/20 text-purple-300 opacity-60 cursor-default" 
                : "bg-purple-600 hover:bg-purple-500 text-white cursor-pointer hover:shadow-purple-600/20"
            }`}
          >
            <Save className="w-4 h-4" />
            {autosave ? "✓ Autosave Configuration Enabled" : "Save All Core Configurations"}
          </button>
        </div>
      </div>

    </div>
  );
}
