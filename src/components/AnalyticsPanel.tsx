import React, { useState, useEffect } from "react";
import { Guild } from "../types";
import { 
  Users, ShieldAlert, FileText, Zap, Award, Share2, Settings, 
  ToggleLeft, ToggleRight, Save, Heart, Calendar, Bell, Sparkles, 
  Clock, ChevronDown, ChevronUp, RefreshCw, Gift, AlertCircle 
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from "recharts";
import { showToast } from "../utils/toast";

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
  const [localGuild, setLocalGuild] = useState<Guild>(guild);
  const [expandedMarriage, setExpandedMarriage] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [simulatingId, setSimulatingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  
  // Alert Scheduler Editing States
  const [editingMsg, setEditingMsg] = useState<string>("");
  const [editingChan, setEditingChan] = useState<string>("");
  const [editingEnabled, setEditingEnabled] = useState<boolean>(true);

  useEffect(() => {
    setLocalGuild(guild);
  }, [guild]);

  const [serverName, setServerName] = useState(guild.name);
  const [prefix, setPrefix] = useState(guild.config.prefix || "df!");
  const [supportRole, setSupportRole] = useState(guild.config.supportRole || "Staff");
  const [modLogChannel, setModLogChannel] = useState(guild.config.modLogChannel || "#mod-logs");
  const [welcomeChannel, setWelcomeChannel] = useState(guild.config.welcomeChannel || "#welcome");
  
  const [automodEnabled, setAutomodEnabled] = useState(guild.config.automodEnabled);
  const [ticketEnabled, setTicketEnabled] = useState(guild.config.ticketEnabled);
  const [levelingEnabled, setLevelingEnabled] = useState(guild.config.levelingEnabled);

  const handleSimulateMarriage = async (marriage: any, days: number) => {
    const marriageId = `${marriage.user1Id}-${marriage.user2Id}`;
    setSimulatingId(marriageId);
    const simulatedMarriedAt = Date.now() - (days * 24 * 60 * 60 * 1000);
    try {
      const res = await fetch(`/api/guilds/${localGuild.id}/marriages/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user1Id: marriage.user1Id,
          user2Id: marriage.user2Id,
          marriedAt: simulatedMarriedAt
        })
      });
      if (res.ok) {
        const data = await res.json();
        setLocalGuild(data.guild);
        showToast(`Simulated ${days} days elapsed! Tiers & interactive command upgrades are now updated.`, "success");
      } else {
        showToast("Failed to simulate marriage progression.", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Network error simulating progression.", "error");
    } finally {
      setSimulatingId(null);
    }
  };

  const handleSaveAlertConfig = async (marriage: any, enabled: boolean, channel: string, customMessage: string) => {
    const marriageId = `${marriage.user1Id}-${marriage.user2Id}`;
    setSavingId(marriageId);
    try {
      const res = await fetch(`/api/guilds/${localGuild.id}/marriages/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user1Id: marriage.user1Id,
          user2Id: marriage.user2Id,
          annconfig: {
            enabled,
            channel,
            customMessage
          }
        })
      });
      if (res.ok) {
        const data = await res.json();
        setLocalGuild(data.guild);
        showToast("Anniversary alert configuration updated successfully!", "success");
      } else {
        showToast("Failed to update alert settings.", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Network error updating settings.", "error");
    } finally {
      setSavingId(null);
    }
  };

  const handleTestAlert = async (marriage: any, tier: string) => {
    const marriageId = `${marriage.user1Id}-${marriage.user2Id}`;
    setTestingId(`${marriageId}-${tier}`);
    try {
      const res = await fetch(`/api/guilds/${localGuild.id}/marriages/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user1Id: marriage.user1Id,
          user2Id: marriage.user2Id,
          triggerAlertNow: tier
        })
      });
      if (res.ok) {
        const data = await res.json();
        setLocalGuild(data.guild);
        showToast(`Dispatched simulated ${tier} anniversary alert notification to Discord!`, "success");
      } else {
        showToast("Failed to dispatch test notification.", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Network error triggering alert.", "error");
    } finally {
      setTestingId(null);
    }
  };

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
      levelingEnabled
    });
    showToast("Core Server Configurations updated successfully!", "success");
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

          <div className="relative h-64 w-full">
            <ResponsiveContainer key="weekly-engagement-chart" width="100%" height="100%">
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

          <div className="relative h-64 w-full">
            <ResponsiveContainer key="admin-workload-chart" width="100%" height="100%">
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

      {/* Comprehensive Analytics Module */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Popular Channels Analytics */}
        <div className="glass-panel p-5 rounded-xl border border-purple-500/10 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-base font-bold text-white font-display">Popular Channels</h4>
              <p className="text-xs text-slate-400">Top active text and voice channels based on message volume</p>
            </div>
            <span className="text-xs text-purple-300 font-semibold font-mono bg-purple-500/10 px-2.5 py-1 rounded-md">Live Heatmap</span>
          </div>

          <div className="relative h-56 w-full">
            <ResponsiveContainer key="popular-channels-chart" width="100%" height="100%">
              <BarChart data={
                Object.entries(guild.analytics.popularChannels || {
                  "#general": 412,
                  "#music-lounge": 245,
                  "#bot-commands": 189,
                  "#welcome": 94,
                  "#announcements": 45,
                }).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
              } layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#251f47" horizontal={false} />
                <XAxis type="number" stroke="#71717a" fontSize={11} tickLine={false} />
                <YAxis dataKey="name" type="category" stroke="#71717a" fontSize={11} tickLine={false} width={100} />
                <Tooltip contentStyle={{ backgroundColor: '#130f26', borderColor: '#4c1d95', borderRadius: '8px', color: '#fff' }} />
                <Bar dataKey="count" name="Messages" fill="#a78bfa" radius={[0, 4, 4, 0]} barSize={12} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="overflow-x-auto pt-2">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="uppercase tracking-wider text-slate-400 border-b border-purple-500/10">
                <tr>
                  <th className="py-2 px-1">Channel</th>
                  <th className="py-2 px-1 text-right">Message Count</th>
                  <th className="py-2 px-1 text-right">Activity Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-500/5">
                {Object.entries(guild.analytics.popularChannels || {
                  "#general": 412,
                  "#music-lounge": 245,
                  "#bot-commands": 189,
                  "#welcome": 94,
                  "#announcements": 45,
                }).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).map((chan, idx, arr) => {
                  const total = arr.reduce((s, c) => s + c.count, 0) || 1;
                  const pct = Math.round((chan.count / total) * 100);
                  return (
                    <tr key={idx} className="hover:bg-purple-500/5 transition">
                      <td className="py-2.5 px-1 font-semibold text-purple-300 font-mono">{chan.name}</td>
                      <td className="py-2.5 px-1 text-right font-semibold text-white">{chan.count.toLocaleString()}</td>
                      <td className="py-2.5 px-1 text-right text-slate-400">
                        <div className="flex items-center justify-end gap-2">
                          <span>{pct}%</span>
                          <div className="w-12 bg-slate-950 h-1.5 rounded-full overflow-hidden inline-block">
                            <div className="bg-purple-500 h-full" style={{ width: `${pct}%` }}></div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bot Command Usage Analytics */}
        <div className="glass-panel p-5 rounded-xl border border-purple-500/10 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-base font-bold text-white font-display">Bot Command Usage</h4>
              <p className="text-xs text-slate-400">Frequency of slash commands invoked by server members</p>
            </div>
            <span className="text-xs text-green-300 font-semibold font-mono bg-green-500/10 px-2.5 py-1 rounded-md">Commands Run</span>
          </div>

          <div className="relative h-56 w-full">
            <ResponsiveContainer key="bot-command-usage-chart" width="100%" height="100%">
              <BarChart data={
                Object.entries(guild.analytics.botCommandUsage || {
                  "play": 124,
                  "rank": 86,
                  "help": 52,
                  "marry": 34,
                  "ticket": 22,
                  "mute": 15,
                }).map(([name, count]) => ({ name: `/${name}`, count })).sort((a, b) => b.count - a.count)
              } margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#251f47" vertical={false} />
                <XAxis dataKey="name" stroke="#71717a" fontSize={11} tickLine={false} />
                <YAxis stroke="#71717a" fontSize={11} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#130f26', borderColor: '#4c1d95', borderRadius: '8px', color: '#fff' }} />
                <Bar dataKey="count" name="Executions" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="overflow-x-auto pt-2">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="uppercase tracking-wider text-slate-400 border-b border-purple-500/10">
                <tr>
                  <th className="py-2 px-1">Slash Command</th>
                  <th className="py-2 px-1 text-right">Usage Count</th>
                  <th className="py-2 px-1 text-right">Trend Indicator</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-500/5">
                {Object.entries(guild.analytics.botCommandUsage || {
                  "play": 124,
                  "rank": 86,
                  "help": 52,
                  "marry": 34,
                  "ticket": 22,
                  "mute": 15,
                }).map(([name, count]) => ({ name: `/${name}`, count })).sort((a, b) => b.count - a.count).map((cmd, idx, arr) => {
                  const total = arr.reduce((s, c) => s + c.count, 0) || 1;
                  const pct = Math.round((cmd.count / total) * 100);
                  return (
                    <tr key={idx} className="hover:bg-purple-500/5 transition">
                      <td className="py-2.5 px-1 font-semibold text-emerald-400 font-mono">{cmd.name}</td>
                      <td className="py-2.5 px-1 text-right font-semibold text-white">{cmd.count.toLocaleString()}</td>
                      <td className="py-2.5 px-1 text-right text-slate-400">
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-[10px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">+{pct}% share</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Daily Active Users List */}
      <div className="glass-panel p-5 rounded-xl border border-purple-500/10 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-purple-400" />
            <div>
              <h4 className="text-base font-bold text-white font-display">Daily Active Users (DAU)</h4>
              <p className="text-xs text-slate-400">The specific server members who have participated in chat or commands today</p>
            </div>
          </div>
          <span className="text-xs text-purple-300 font-semibold font-mono bg-purple-500/10 px-3 py-1 rounded-full">
            {(guild.analytics.dailyActiveUsers && guild.analytics.dailyActiveUsers.length > 0 ? guild.analytics.dailyActiveUsers : ["CyberLotus", "NeonViper", "RoseGold", "Staff", "Aicherecter"]).length} Unique Active Today
          </span>
        </div>

        <div className="flex flex-wrap gap-3 pt-1">
          {(guild.analytics.dailyActiveUsers && guild.analytics.dailyActiveUsers.length > 0 ? guild.analytics.dailyActiveUsers : ["CyberLotus", "NeonViper", "RoseGold", "Staff", "Aicherecter"]).map((username, idx) => (
            <div key={idx} className="flex items-center gap-2 bg-slate-950/40 border border-purple-500/10 rounded-full pl-1.5 pr-3 py-1 text-xs text-slate-300 hover:border-purple-500/30 transition">
              <img src={`https://api.dicebear.com/7.x/pixel-art/svg?seed=${username}`} className="w-6 h-6 rounded-full" />
              <span className="font-semibold text-white">{username}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
            </div>
          ))}
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

      {/* Server Marriages Section */}
      <div className="glass-panel p-5 rounded-xl border border-pink-500/10 space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-pink-500/10 text-pink-400">
            <Heart className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h4 className="text-lg font-bold text-white font-display">💖 Server Marriages & Relationships 💍</h4>
            <p className="text-xs text-slate-400">Live relationship bonds registered on the DarkFlower Discord bot</p>
          </div>
        </div>

        {localGuild.marriages && localGuild.marriages.length > 0 ? (
          <div className="flex flex-col gap-4 pt-2">
            {localGuild.marriages.map((marriage, idx) => {
              const marriageId = `${marriage.user1Id}-${marriage.user2Id}`;
              const isExpanded = expandedMarriage === marriageId;
              
              // Calculate anniversary statistics
              const marriedAt = marriage.marriedAt;
              const daysMarried = Math.max(0, Math.floor((Date.now() - marriedAt) / (1000 * 60 * 60 * 24)));
              
              // Progress percent towards next milestones
              // Milestones: 7 days, 30 days, 365 days
              const bronzePercent = Math.min(100, (daysMarried / 7) * 100);
              const silverPercent = Math.min(100, (daysMarried / 30) * 100);
              const goldPercent = Math.min(100, (daysMarried / 365) * 100);

              const currentTier = daysMarried >= 365 ? 'Gold Tier' : daysMarried >= 30 ? 'Silver Tier' : daysMarried >= 7 ? 'Bronze Tier' : 'Freshly Wed';
              const annconfig = marriage.annconfig || { enabled: true, channel: localGuild.config.welcomeChannel || "#welcome", customMessage: "" };

              // Local expand toggle
              const toggleExpand = (mId: string, m: any) => {
                if (expandedMarriage === mId) {
                  setExpandedMarriage(null);
                } else {
                  setExpandedMarriage(mId);
                  const conf = m.annconfig || { enabled: true, channel: localGuild.config.welcomeChannel || "#welcome", customMessage: "" };
                  setEditingMsg(conf.customMessage || "");
                  setEditingChan(conf.channel || localGuild.config.welcomeChannel || "#welcome");
                  setEditingEnabled(conf.enabled !== false);
                }
              };

              return (
                <div key={idx} className="bg-slate-950/40 border border-pink-500/15 rounded-xl p-4 shadow-lg flex flex-col relative overflow-hidden transition-all duration-300">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 z-10">
                    <div className="flex items-center gap-4">
                      <div className="flex -space-x-3">
                        <img
                          src={`https://api.dicebear.com/7.x/pixel-art/svg?seed=${marriage.user1Tag}`}
                          alt={marriage.user1Tag}
                          className="w-11 h-11 rounded-full border-2 border-slate-900 bg-slate-950 shadow-md"
                        />
                        <img
                          src={`https://api.dicebear.com/7.x/pixel-art/svg?seed=${marriage.user2Tag}`}
                          alt={marriage.user2Tag}
                          className="w-11 h-11 rounded-full border-2 border-slate-900 bg-slate-950 shadow-md"
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h5 className="text-sm font-bold text-white font-display">
                            {marriage.user1Tag.split('#')[0]} & {marriage.user2Tag.split('#')[0]}
                          </h5>
                          <span className="text-[9px] bg-pink-500/10 border border-pink-500/25 text-pink-400 font-bold uppercase tracking-wider px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Heart className="w-2.5 h-2.5 fill-pink-500" /> {currentTier}
                          </span>
                        </div>
                        <p className="text-[10px] text-pink-300 font-medium mt-0.5">
                          Family: <span className="font-mono bg-pink-500/10 px-1.5 py-0.5 rounded border border-pink-500/20 text-pink-200">{marriage.familyName}</span>
                        </p>
                        <div className="text-[9px] text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
                          <span className="flex items-center gap-1"><Calendar className="w-3 h-3 text-slate-500" /> Anniversary: <strong className="text-slate-300">{new Date(marriage.marriedAt).toLocaleDateString()}</strong></span>
                          <span className="text-slate-600">•</span>
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-slate-500" /> Elapsed: <strong className="text-slate-200">{daysMarried} Days</strong></span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <button
                        onClick={() => toggleExpand(marriageId, marriage)}
                        className="px-3 py-1.5 rounded-lg border border-pink-500/20 hover:border-pink-500/40 hover:bg-pink-500/5 text-pink-400 hover:text-pink-300 text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                      >
                        <Settings className="w-3.5 h-3.5" />
                        <span>Alerts & Progress</span>
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5 ml-1" /> : <ChevronDown className="w-3.5 h-3.5 ml-1" />}
                      </button>
                    </div>
                  </div>

                  {/* Expandable Configuration & Simulation Dashboard */}
                  {isExpanded && (
                    <div className="mt-5 pt-4 border-t border-slate-900 space-y-6 z-10">
                      
                      {/* Section 1: Milestone Progress */}
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-pink-400" />
                          <h6 className="text-xs font-bold text-white uppercase tracking-wider font-display">Relationship Milestones & Upgrades</h6>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          {/* Bronze */}
                          <div className={`p-3 rounded-lg border flex flex-col justify-between ${daysMarried >= 7 ? 'bg-amber-950/10 border-amber-500/20' : 'bg-slate-950/40 border-slate-900'}`}>
                            <div>
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-amber-400 flex items-center gap-1">🥉 Bronze (1-Week)</span>
                                <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase ${daysMarried >= 7 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-900 text-slate-500'}`}>
                                  {daysMarried >= 7 ? 'Unlocked ✓' : 'Locked 🔒'}
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-400 mt-1">Upgraded cozy animations for `/hug` and `/kiss`, plus custom server chat badge.</p>
                              {daysMarried < 7 && (
                                <div className="mt-2 text-[9px] text-pink-300 font-mono">
                                  {7 - daysMarried} days remaining
                                </div>
                              )}
                            </div>
                            <div className="mt-3 pt-2 border-t border-slate-900/40 flex items-center justify-between gap-2">
                              <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                                <div className="bg-amber-500 h-full rounded-full" style={{ width: `${bronzePercent}%` }}></div>
                              </div>
                              <button
                                onClick={() => handleTestAlert(marriage, '1-week')}
                                disabled={testingId === `${marriageId}-1-week`}
                                className="px-2 py-0.5 text-[9px] bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded hover:bg-amber-500/20 transition whitespace-nowrap cursor-pointer"
                              >
                                {testingId === `${marriageId}-1-week` ? 'Firing...' : 'Test Alert'}
                              </button>
                            </div>
                          </div>

                          {/* Silver */}
                          <div className={`p-3 rounded-lg border flex flex-col justify-between ${daysMarried >= 30 ? 'bg-slate-800/20 border-slate-400/20' : 'bg-slate-950/40 border-slate-900'}`}>
                            <div>
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-300 flex items-center gap-1">🥈 Silver (1-Month)</span>
                                <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase ${daysMarried >= 30 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-900 text-slate-500'}`}>
                                  {daysMarried >= 30 ? 'Unlocked ✓' : 'Locked 🔒'}
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-400 mt-1">Upgraded deep romance animations and increases `/summon` limit from 3 to 5/day.</p>
                              {daysMarried < 30 && (
                                <div className="mt-2 text-[9px] text-pink-300 font-mono">
                                  {30 - daysMarried} days remaining
                                </div>
                              )}
                            </div>
                            <div className="mt-3 pt-2 border-t border-slate-900/40 flex items-center justify-between gap-2">
                              <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                                <div className="bg-slate-300 h-full rounded-full" style={{ width: `${silverPercent}%` }}></div>
                              </div>
                              <button
                                onClick={() => handleTestAlert(marriage, '1-month')}
                                disabled={testingId === `${marriageId}-1-month`}
                                className="px-2 py-0.5 text-[9px] bg-slate-300/10 border border-slate-300/30 text-slate-300 rounded hover:bg-slate-300/20 transition whitespace-nowrap cursor-pointer"
                              >
                                {testingId === `${marriageId}-1-month` ? 'Firing...' : 'Test Alert'}
                              </button>
                            </div>
                          </div>

                          {/* Gold */}
                          <div className={`p-3 rounded-lg border flex flex-col justify-between ${daysMarried >= 365 ? 'bg-yellow-950/15 border-yellow-500/20' : 'bg-slate-950/40 border-slate-900'}`}>
                            <div>
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-yellow-500 flex items-center gap-1">🏆 Gold (1-Year)</span>
                                <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase ${daysMarried >= 365 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-900 text-slate-500'}`}>
                                  {daysMarried >= 365 ? 'Unlocked ✓' : 'Locked 🔒'}
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-400 mt-1">Legendary everlasting animations, server wide announcement, and premium custom Golden name tag.</p>
                              {daysMarried < 365 && (
                                <div className="mt-2 text-[9px] text-pink-300 font-mono">
                                  {365 - daysMarried} days remaining
                                </div>
                              )}
                            </div>
                            <div className="mt-3 pt-2 border-t border-slate-900/40 flex items-center justify-between gap-2">
                              <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                                <div className="bg-yellow-500 h-full rounded-full" style={{ width: `${goldPercent}%` }}></div>
                              </div>
                              <button
                                onClick={() => handleTestAlert(marriage, '1-year')}
                                disabled={testingId === `${marriageId}-1-year`}
                                className="px-2 py-0.5 text-[9px] bg-yellow-500/10 border border-yellow-500/30 text-yellow-500 rounded hover:bg-yellow-500/20 transition whitespace-nowrap cursor-pointer"
                              >
                                {testingId === `${marriageId}-1-year` ? 'Firing...' : 'Test Alert'}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Section 2: Alert Scheduler Settings */}
                      <div className="bg-slate-950/60 border border-pink-500/5 rounded-xl p-4 space-y-4">
                        <div className="flex items-center gap-2">
                          <Bell className="w-4 h-4 text-purple-400" />
                          <h6 className="text-xs font-bold text-white uppercase tracking-wider font-display">Alert Scheduler & Announcement Settings</h6>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <label className="text-xs text-slate-300 font-semibold">Enable Automatic Announcements</label>
                              <button
                                type="button"
                                onClick={() => setEditingEnabled(!editingEnabled)}
                                className="text-purple-400 hover:text-purple-300 transition cursor-pointer"
                              >
                                {editingEnabled ? (
                                  <ToggleRight className="w-8 h-8" />
                                ) : (
                                  <ToggleLeft className="w-8 h-8 text-slate-600" />
                                )}
                              </button>
                            </div>

                            <div className="space-y-1">
                              <label className="text-[11px] text-slate-400">Target Notification Channel</label>
                              <select
                                value={editingChan}
                                onChange={(e) => setEditingChan(e.target.value)}
                                className="w-full bg-slate-900 border border-pink-500/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-pink-500/40 transition cursor-pointer"
                              >
                                {localGuild.channels?.map((chan: string) => (
                                  <option key={chan} value={chan.startsWith('#') ? chan : `#${chan}`}>
                                    #{chan.replace('#', '')}
                                  </option>
                                )) || (
                                  <option value="#welcome">#welcome</option>
                                )}
                              </select>
                            </div>

                            <div className="pt-2">
                              <button
                                onClick={() => handleSaveAlertConfig(marriage, editingEnabled, editingChan, editingMsg)}
                                disabled={savingId === marriageId}
                                className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer"
                              >
                                <Save className="w-3.5 h-3.5" />
                                {savingId === marriageId ? 'Saving alert schedule...' : 'Save Alerts Schedule'}
                              </button>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="text-[11px] text-slate-400 font-semibold">Custom Announcement Template</label>
                              <span className="text-[9px] text-purple-400 font-semibold uppercase">Placeholders Enabled</span>
                            </div>
                            
                            <textarea
                              value={editingMsg}
                              onChange={(e) => setEditingMsg(e.target.value)}
                              placeholder="Type a custom message or use quick presets below..."
                              className="w-full h-24 bg-slate-900 border border-pink-500/10 rounded-lg p-2.5 text-xs text-white font-mono focus:outline-none focus:border-pink-500/40 transition resize-none"
                            />

                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] text-slate-500 font-medium">Presets:</span>
                              <button
                                onClick={() => setEditingMsg("🎉 Happy {tier} to the wonderful {spouse1} & {spouse2} of the {family} family! Here is to many more years of love, laughter, and pure happiness! 💍🥂✨")}
                                className="px-1.5 py-0.5 text-[9px] bg-purple-500/10 border border-purple-500/20 text-purple-300 rounded hover:bg-purple-500/20 transition cursor-pointer"
                              >
                                Romantic
                              </button>
                              <button
                                onClick={() => setEditingMsg("🌸 Cozy Alert! {spouse1} and {spouse2} are celebrating their {tier}! The entire {family} family is sending you warm hugs and custom cozy animations! 🤗💕")}
                                className="px-1.5 py-0.5 text-[9px] bg-purple-500/10 border border-purple-500/20 text-purple-300 rounded hover:bg-purple-500/20 transition cursor-pointer"
                              >
                                Cozy
                              </button>
                              <button
                                onClick={() => setEditingMsg("⚡ SYSTEM BROADCAST: Critical milestone reached! {spouse1} and {spouse2} of the {family} family have ascended to the {tier}! Interactive protocols are fully operational! 🌌💫")}
                                className="px-1.5 py-0.5 text-[9px] bg-purple-500/10 border border-purple-500/20 text-purple-300 rounded hover:bg-purple-500/20 transition cursor-pointer"
                              >
                                Cyber Epic
                              </button>
                            </div>

                            <div className="grid grid-cols-2 gap-1.5 pt-1 text-[9px] text-slate-500 font-mono">
                              <div><span className="text-purple-400">{`{spouse1}`}</span>: Husband/Wife</div>
                              <div><span className="text-purple-400">{`{spouse2}`}</span>: Partner</div>
                              <div><span className="text-purple-400">{`{tier}`}</span>: Milestone Tier</div>
                              <div><span className="text-purple-400">{`{family}`}</span>: Family Surname</div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Section 3: Time Machine Playground Simulator */}
                      <div className="p-4 bg-pink-950/10 border border-pink-500/10 rounded-xl space-y-3">
                        <div className="flex items-center gap-2">
                          <Gift className="w-4 h-4 text-pink-400 animate-pulse" />
                          <h6 className="text-xs font-bold text-white uppercase tracking-wider font-display">Simulate Relationship Timeline (Developer Playground)</h6>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          Test the bot's dynamic commands unlocking, custom animations, daily summon limit increases, and automated announcements instantly by simulating days elapsed.
                        </p>
                        
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                          <button
                            onClick={() => handleSimulateMarriage(marriage, 0)}
                            disabled={simulatingId === marriageId}
                            className="py-1.5 px-2 bg-slate-900 border border-slate-800 text-[10px] text-slate-300 hover:border-pink-500/30 hover:bg-pink-500/5 rounded-lg transition font-semibold cursor-pointer"
                          >
                            Fresh Marriage (Day 0)
                          </button>
                          <button
                            onClick={() => handleSimulateMarriage(marriage, 8)}
                            disabled={simulatingId === marriageId}
                            className="py-1.5 px-2 bg-slate-900 border border-slate-800 text-[10px] text-slate-300 hover:border-amber-500/30 hover:bg-amber-500/5 rounded-lg transition font-semibold cursor-pointer"
                          >
                            🥉 1-Week (Day 8)
                          </button>
                          <button
                            onClick={() => handleSimulateMarriage(marriage, 32)}
                            disabled={simulatingId === marriageId}
                            className="py-1.5 px-2 bg-slate-900 border border-slate-800 text-[10px] text-slate-300 hover:border-slate-300/30 hover:bg-slate-300/5 rounded-lg transition font-semibold cursor-pointer"
                          >
                            🥈 1-Month (Day 32)
                          </button>
                          <button
                            onClick={() => handleSimulateMarriage(marriage, 366)}
                            disabled={simulatingId === marriageId}
                            className="py-1.5 px-2 bg-slate-900 border border-slate-800 text-[10px] text-slate-300 hover:border-yellow-500/30 hover:bg-yellow-500/5 rounded-lg transition font-semibold cursor-pointer"
                          >
                            🏆 1-Year (Day 366)
                          </button>
                        </div>
                      </div>

                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-slate-950/20 border border-purple-500/5 rounded-xl p-6 text-center space-y-2">
            <p className="text-xs text-slate-400">No active marriages in this guild yet.</p>
            <p className="text-[10px] text-slate-500">
              Members can use <code className="text-purple-400 font-mono bg-slate-950 px-1 py-0.5 rounded">/marry user:@spouse family_name:Surname</code> to get married!
            </p>
          </div>
        )}
      </div>

    </div>
  );
}
