import React, { useState, useEffect, useRef } from "react";
import { UserSession, Guild, Ticket } from "./types";
import DiscordAuthModal from "./components/DiscordAuthModal";
import AnalyticsPanel from "./components/AnalyticsPanel";
import MusicPanel from "./components/MusicPanel";
import ModerationPanel from "./components/ModerationPanel";
import TicketPanel from "./components/TicketPanel";
import LevelingPanel from "./components/LevelingPanel";
import WelcomerPanel from "./components/WelcomerPanel";
import WebhookPanel from "./components/WebhookPanel";
import AiModPanel from "./components/AiModPanel";
import DiagnosticsPanel from "./components/DiagnosticsPanel";
import BrandingPanel from "./components/BrandingPanel";
import ButtonRolesPanel from "./components/ButtonRolesPanel";
import MarriagePanel from "./components/MarriagePanel";

import {
  LayoutDashboard,
  Music,
  Shield,
  MessageSquare,
  Award,
  Volume2,
  Share2,
  Sparkles,
  ShieldAlert,
  Server,
  LogOut,
  ChevronRight,
  Menu,
  X,
  Plus,
  HelpCircle,
  CheckCircle,
  AlertTriangle,
  Info,
  Bot,
  Sliders,
  Heart,
  RefreshCw
} from "lucide-react";

export default function App() {
  const [session, setSession] = useState<UserSession | null>(() => {
    try {
      const stored = localStorage.getItem("discord_session");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.loggedIn) {
          return parsed;
        }
      }
    } catch (e) {
      console.error("Failed to parse initial session from localStorage", e);
    }
    return null;
  });
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [selectedGuildId, setSelectedGuildId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("analytics");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [botStatus, setBotStatus] = useState<{
    connected: boolean;
    username: string;
    avatar: string;
    id: string;
    hasToken: boolean;
    clientId: string;
    supportInvite?: string;
  } | null>(null);

  const [syncStatus, setSyncStatus] = useState<{ latency: number, status: string }>({ latency: -1, status: 'disconnected' });
  const [toasts, setToasts] = useState<{ id: string; message: string; type: 'success' | 'error' | 'info' | 'warning' }[]>([]);

  useEffect(() => {
    window.showToast = (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'success') => {
      const id = Math.random().toString(36).substring(2, 9);
      setToasts(prev => [...prev, { id, message, type }]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 4000);
    };
    return () => {
      window.showToast = undefined;
    };
  }, []);

  // Initial Fetch Setup
  const fetchData = async () => {
    try {
      // Fetch User Session
      const userRes = await fetch("/api/auth/me");
      if (userRes.ok) {
        const userData = await userRes.json();
        setSession(userData);
        if (userData && userData.loggedIn) {
          localStorage.setItem("discord_session", JSON.stringify(userData));
        } else {
          localStorage.removeItem("discord_session");
        }
      }

      // Fetch Guilds
      const guildsRes = await fetch("/api/guilds");
      if (guildsRes.status === 401) {
        console.warn("Session expired (401 from /api/guilds). Resetting local session.");
        setSession(null);
        localStorage.removeItem("discord_session");
      } else if (guildsRes.ok) {
        const guildsData = await guildsRes.json();
        setGuilds(guildsData);
      }

      // Fetch Bot Status
      const botRes = await fetch("/api/bot/status");
      if (botRes.ok) {
        const botData = await botRes.json();
        setBotStatus(botData);
      }
    } catch (err) {
      console.error("Failed to load backend initial data:", err);
    }
  };

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isUnmountedRef = useRef<boolean>(false);

  const connectWs = () => {
    if (isUnmountedRef.current) return;

    // Clear existing timer if any
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Close existing socket if open
    if (wsRef.current) {
      try {
        wsRef.current.onclose = null;
        wsRef.current.close();
      } catch (err) {
        console.error("Error closing existing WS connection:", err);
      }
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    console.log("[WebSocket] Connecting to", wsUrl);
    const socket = new WebSocket(wsUrl);
    wsRef.current = socket;

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'SYNC_STATUS') {
          setSyncStatus({ latency: data.latency, status: data.status });
        }
      } catch (e) {
        console.error("Failed to parse websocket message", e);
      }
    };

    socket.onclose = () => {
      setSyncStatus({ latency: -1, status: 'disconnected' });
      // Attempt to reconnect after 3 seconds
      if (!isUnmountedRef.current) {
        reconnectTimeoutRef.current = setTimeout(connectWs, 3000);
      }
    };
  };

  useEffect(() => {
    fetchData();
    isUnmountedRef.current = false;
    connectWs();

    return () => {
      isUnmountedRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, []);

  const handleLoginSuccess = () => {
    fetchData();
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setSession(null);
      localStorage.removeItem("discord_session");
      setSelectedGuildId(null);
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const [reconnectingBot, setReconnectingBot] = useState(false);

  const handleReconnectBot = async () => {
    setReconnectingBot(true);
    if (window.showToast) {
      window.showToast("Initiating Discord Gateway reconnect request...", "info");
    }
    try {
      const res = await fetch("/api/bot/reconnect", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          if (window.showToast) {
            window.showToast("Discord Bot successfully re-logged in and online!", "success");
          }
          fetchData();
        } else {
          throw new Error(data.error || "Failed to reconnect");
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
    } catch (err: any) {
      console.error(err);
      if (window.showToast) {
        window.showToast(`Reconnection failed: ${err.message}`, "error");
      }
    } finally {
      setReconnectingBot(false);
    }
  };

  const handleInviteBot = (guildId: string) => {
    if (botStatus && botStatus.clientId) {
      const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${botStatus.clientId}&permissions=8&scope=bot%20applications.commands&guild_id=${guildId}`;
      window.open(inviteUrl, "_blank");
    } else {
      if (window.showToast) {
        window.showToast("Please configure DISCORD_CLIENT_ID in your Secrets panel first to generate your live bot invitation link.", "warning");
      } else {
        alert("Please configure DISCORD_CLIENT_ID in your Secrets panel first to generate your live bot invitation link.");
      }
    }
  };

  const handleScanDiagnostics = async () => {
    if (!selectedGuildId) return;
    try {
      const res = await fetch(`/api/guilds/${selectedGuildId}/diagnostics/scan`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setGuilds(guilds.map(g => g.id === selectedGuildId ? { ...g, errors: data.errors } : g));
      }
    } catch (err) {
      console.error("Failed to run real diagnostics scan:", err);
    }
  };

  const handleUpdateConfig = async (updatedConfig: any) => {
    if (!selectedGuildId) return;
    try {
      const res = await fetch(`/api/guilds/${selectedGuildId}/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedConfig)
      });
      if (res.ok) {
        const data = await res.json();
        setGuilds(guilds.map(g => g.id === selectedGuildId ? { ...g, config: data.config } : g));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateGuild = (updatedGuild: Guild) => {
    setGuilds(guilds.map(g => g.id === updatedGuild.id ? updatedGuild : g));
  };

  const handleOpenTicket = async (): Promise<Ticket> => {
    if (!selectedGuildId) throw new Error("No guild selected");
    const res = await fetch(`/api/guilds/${selectedGuildId}/ticket/create`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setGuilds(guilds.map(g => g.id === selectedGuildId ? { ...g, tickets: [...g.tickets, data.ticket], analytics: { ...g.analytics, ticketsCount: g.analytics.ticketsCount + 1 } } : g));
      return data.ticket;
    }
    throw new Error("Failed to create ticket");
  };

  const handleSendMessage = async (ticketId: string, text: string, sender?: string) => {
    if (!selectedGuildId) return;
    const res = await fetch(`/api/guilds/${selectedGuildId}/ticket/${ticketId}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, sender })
    });
    if (res.ok) {
      const data = await res.json();
      setGuilds(guilds.map(g => g.id === selectedGuildId ? {
        ...g,
        tickets: g.tickets.map(t => t.id === ticketId ? data.ticket : t)
      } : g));
    }
  };

  const handleCloseTicket = async (ticketId: string) => {
    if (!selectedGuildId) return;
    const res = await fetch(`/api/guilds/${selectedGuildId}/ticket/${ticketId}/close`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setGuilds(guilds.map(g => g.id === selectedGuildId ? {
        ...g,
        tickets: g.tickets.map(t => t.id === ticketId ? data.ticket : t)
      } : g));
    }
  };

  const handleExecuteCommand = async (command: string, user: string, reason: string) => {
    if (!selectedGuildId) return;
    const res = await fetch(`/api/guilds/${selectedGuildId}/moderation/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command, user, reason })
    });
    if (res.ok) {
      const data = await res.json();
      setGuilds(guilds.map(g => g.id === selectedGuildId ? {
        ...g,
        modLogs: [data.log, ...g.modLogs],
        analytics: { ...g.analytics, moderationCount: g.analytics.moderationCount + 1 }
      } : g));
    }
  };

  const handleFixError = async (errorId: string) => {
    if (!selectedGuildId) return;
    const res = await fetch(`/api/guilds/${selectedGuildId}/errors/${errorId}/fix`, { method: "POST" });
    if (res.ok) {
      setGuilds(guilds.map(g => {
        if (g.id === selectedGuildId) {
          // Resolve config variables locally for responsive feedback
          const errCode = g.errors.find(e => e.id === errorId)?.code;
          let configCopy = { ...g.config };
          if (errCode === "ERR_TICKET_ROLE_MISSING") {
            configCopy.supportRole = "Moderator";
          } else if (errCode === "ERR_NO_MOD_LOG_CHANNEL") {
            configCopy.modLogChannel = "#mod-logs";
          } else if (errCode === "ERR_WEBHOOK_STALE") {
            configCopy.webhooks = configCopy.webhooks.map(w => 
              w.id === "wh-1" ? { ...w, url: "https://discord.com/api/webhooks/123456/fixed_url_repaired_by_darkflower" } : w
            );
          }
          return {
            ...g,
            config: configCopy,
            errors: g.errors.filter(e => e.id !== errorId)
          };
        }
        return g;
      }));
    }
  };

  const handleSendWebhook = async (webhookId: string, payload: any) => {
    if (!selectedGuildId) throw new Error("No server selected");
    const res = await fetch(`/api/guilds/${selectedGuildId}/webhook/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "Unknown server error");
      throw new Error(`Server returned status ${res.status}: ${errText}`);
    }
    const data = await res.json();
    // Push log feed to show transaction was successful
    setGuilds(guilds.map(g => {
      if (g.id === selectedGuildId) {
        const wh = g.config.webhooks.find(w => w.id === webhookId);
        const logReason = payload.content 
          ? `Message: "${payload.content}"${payload.title ? ` | Embed: "${payload.title}"` : ""}` 
          : `Rich Embed: "${payload.title}"`;
        return {
          ...g,
          modLogs: [{
            id: `wh-log-${Date.now()}`,
            type: "Webhook",
            moderator: payload.customName || wh?.name || "Webhook",
            user: wh?.channel || "#general",
            reason: logReason,
            timestamp: "Just now"
          }, ...g.modLogs]
        };
      }
      return g;
    }));
  };

  const selectedGuild = guilds.find(g => g.id === selectedGuildId);

  // If user is not authenticated, load the full-screen Discord login simulation
  if (!session || !session.loggedIn) {
    return <DiscordAuthModal onLogin={handleLoginSuccess} />;
  }

  // --- RENDERING TABS SWITCHER ---
  const renderTabContent = () => {
    if (!selectedGuild) return null;

    switch (activeTab) {
      case "analytics":
        return <AnalyticsPanel guild={selectedGuild} onUpdateConfig={handleUpdateConfig} />;
      case "music":
        return <MusicPanel guild={selectedGuild} />;
      case "moderation":
        return (
          <ModerationPanel
            guild={selectedGuild}
            onUpdateConfig={handleUpdateConfig}
            onExecuteCommand={handleExecuteCommand}
          />
        );
      case "tickets":
        return (
          <TicketPanel
            guild={selectedGuild}
            onUpdateConfig={handleUpdateConfig}
            onOpenTicket={handleOpenTicket}
            onSendMessage={handleSendMessage}
            onCloseTicket={handleCloseTicket}
          />
        );
      case "buttonroles":
        return <ButtonRolesPanel guild={selectedGuild} onUpdateGuild={handleUpdateGuild} />;
      case "marriage":
        return <MarriagePanel guild={selectedGuild} onUpdateGuild={handleUpdateGuild} />;
      case "leveling":
        return <LevelingPanel guild={selectedGuild} onUpdateConfig={handleUpdateConfig} />;
      case "welcomer":
        return <WelcomerPanel guild={selectedGuild} onUpdateConfig={handleUpdateConfig} />;
      case "webhooks":
        return (
          <WebhookPanel
            guild={selectedGuild}
            onUpdateConfig={handleUpdateConfig}
            onSendWebhookEmbed={handleSendWebhook}
          />
        );
      case "ai":
        return <AiModPanel guild={selectedGuild} />;
      case "branding":
        return <BrandingPanel guild={selectedGuild} onUpdateGuild={handleUpdateGuild} />;
      case "diagnostics":
        return (
          <DiagnosticsPanel
            guild={selectedGuild}
            onFixError={handleFixError}
            onScan={handleScanDiagnostics}
            wsStatus={syncStatus.status}
            onRetryConnection={connectWs}
          />
        );
      default:
        return <AnalyticsPanel guild={selectedGuild} onUpdateConfig={handleUpdateConfig} />;
    }
  };

  // --- SERVER SELECTOR ROUTE SCREEN ---
  if (!selectedGuildId) {
    return (
      <div className="min-h-screen bg-[#08060f] py-12 px-4 relative flex flex-col justify-between font-sans">
        {/* Floating purple background orbs */}
        <div className="absolute top-10 left-1/4 w-96 h-96 rounded-full bg-purple-900/10 blur-3xl"></div>
        <div className="absolute bottom-10 right-1/4 w-96 h-96 rounded-full bg-indigo-950/10 blur-3xl"></div>

        <div className="w-full max-w-4xl mx-auto space-y-8 relative z-10">
          
          {/* Header */}
          <div className="text-center space-y-3">
            <div className="w-20 h-20 mx-auto rounded-full bg-[#161127] border-2 border-[#8b5cf6]/30 flex items-center justify-center shadow-2xl darkflower-glow">
              {/* Custom Purple Lotus Icon */}
              <svg viewBox="0 0 100 100" className="w-14 h-14 text-[#a855f7]">
                <path fill="currentColor" d="M50 15 C45 35 30 45 15 50 C30 55 45 65 50 85 C55 65 70 55 85 50 C70 45 55 35 50 15 Z" />
                <path fill="#6d28d9" d="M50 30 C47 42 38 48 30 50 C38 52 47 58 50 70 C53 58 62 52 70 50 C62 48 53 42 50 30 Z" />
                <circle cx="50" cy="50" r="5" fill="#f3e8ff" />
              </svg>
            </div>

            <h1 className="text-4xl md:text-5xl font-black font-display text-white tracking-tight leading-none">
              DARK<span className="text-[#a855f7] darkflower-text-glow">FLOWER</span>
            </h1>
            <p className="text-slate-400 text-sm max-w-md mx-auto">
              Select an authorized Discord guild to inspect live channel insights, automod systems, and configuration variables.
            </p>
          </div>

          {/* Bot Connection status bar */}
          {botStatus && (
            <div className="glass-panel p-5 rounded-2xl border border-purple-500/15 bg-slate-950/40 space-y-4 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500/30 to-[#ff73fa]/30"></div>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-purple-500/10">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    {botStatus.connected ? (
                      <img src={botStatus.avatar || "https://api.dicebear.com/7.x/pixel-art/svg?seed=DarkFlower"} className="w-10 h-10 rounded-full border border-green-500/40 bg-slate-900" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-purple-950/50 border border-purple-500/20 flex items-center justify-center text-purple-400 font-black font-mono text-sm">DF</div>
                    )}
                    <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#08060f] ${botStatus.connected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.7)] animate-pulse' : botStatus.hasToken ? 'bg-amber-500' : 'bg-slate-500'}`} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-white font-display flex items-center gap-2">
                      {botStatus.connected ? botStatus.username : "DarkFlower Gateway Simulator"}
                      {botStatus.connected && (
                        <span className="text-[9px] bg-green-500/15 text-green-400 border border-green-500/20 px-1.5 py-0.5 rounded font-mono font-bold uppercase">Ready</span>
                      )}
                    </h3>
                    <p className="text-xs text-slate-400">
                      {botStatus.connected 
                        ? `Logged in as bot application. Gateway active.` 
                        : botStatus.hasToken 
                        ? "Configured with Token. Attempting login..." 
                        : "Running in local demo mode (Simulation active)."}
                    </p>
                    {!botStatus.connected && botStatus.hasToken && (
                      <button
                        onClick={handleReconnectBot}
                        disabled={reconnectingBot}
                        className="mt-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 text-[10px] font-bold px-2 py-1 rounded-lg transition flex items-center gap-1 cursor-pointer"
                      >
                        <RefreshCw className={`w-3 h-3 ${reconnectingBot ? 'animate-spin' : ''}`} />
                        {reconnectingBot ? "Reconnecting..." : "Force Reconnect Bot"}
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {botStatus.clientId && (
                    <a
                      href={`https://discord.com/api/oauth2/authorize?client_id=${botStatus.clientId}&permissions=8&scope=bot%20applications.commands`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold px-3.5 py-1.5 rounded-xl text-xs transition flex items-center gap-1.5 shadow cursor-pointer hover:scale-105"
                    >
                      <svg viewBox="0 0 127.14 96.36" className="w-3.5 h-3.5 fill-current">
                        <path d="M107.7,8.07A105.15,105.15,0,0,0,77.26,0a77.19,77.19,0,0,0-3.3,6.83A96.67,96.67,0,0,0,53.22,6.83,77.19,77.19,0,0,0,49.88,0,105.15,105.15,0,0,0,19.44,8.07C3.66,31.58-1.86,54.65,1,77.53a105.73,105.73,0,0,0,32,16.29,77.7,77.7,0,0,0,6.73-11,68.6,68.6,0,0,1-10.64-5.12c.91-.67,1.81-1.37,2.68-2.1a75.22,75.22,0,0,0,70.92,0c.87.73,1.77,1.43,2.68,2.1a68.86,68.86,0,0,1-10.64,5.12,77.7,77.7,0,0,0,6.73,11,105.73,105.73,0,0,0,32-16.29C129.43,48.24,123.36,25.41,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53S36.18,40.36,42.45,40.36,53.83,46,53.83,53,48.72,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.24,60,73.24,53S78.41,40.36,84.69,40.36,96.07,46,96.07,53,91,65.69,84.69,65.69Z"/>
                      </svg>
                      Invite Bot to Server
                    </a>
                  )}
                  {botStatus.supportInvite && (
                    <a
                      href={botStatus.supportInvite}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-[#242528] hover:bg-[#2f3136] text-white border border-purple-500/20 font-bold px-3.5 py-1.5 rounded-xl text-xs transition flex items-center gap-1.5 shadow cursor-pointer hover:scale-105"
                    >
                      <HelpCircle className="w-3.5 h-3.5 text-purple-400" />
                      Support Server
                    </a>
                  )}
                  {!botStatus.clientId && !botStatus.supportInvite && (
                    <span className="text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2.5 py-1 rounded-xl font-bold font-mono">
                      {botStatus.connected ? "REAL_BOT_ACTIVE" : "OFFLINE_SIMULATION"}
                    </span>
                  )}
                </div>
              </div>

              {!botStatus.hasToken && (
                <div className="bg-[#120f26]/60 rounded-xl p-3.5 border border-purple-500/10 flex items-start gap-3">
                  <div className="p-1.5 rounded-lg bg-purple-950/60 border border-purple-500/20 text-purple-400 shrink-0 mt-0.5">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                    </svg>
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-slate-200">How to connect your Discord Bot & Live Auth:</h4>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      To synchronize this admin dashboard with your real Discord server, configure <code className="text-purple-300 font-mono font-semibold px-1.5 py-0.5 bg-slate-900 rounded">DISCORD_BOT_TOKEN</code>, <code className="text-purple-300 font-mono font-semibold px-1.5 py-0.5 bg-slate-900 rounded">DISCORD_CLIENT_ID</code>, and <code className="text-purple-300 font-mono font-semibold px-1.5 py-0.5 bg-slate-900 rounded">DISCORD_CLIENT_SECRET</code> in the Secrets panel in the Settings menu of your build panel. Once saved, this station will boot up your live Gateway client and enable secure popup-based Discord OAuth automatically!
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Guild Cards selection grid */}
          {guilds.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {guilds.map((guild) => (
                <div
                  key={guild.id}
                  className="glass-panel p-5 rounded-2xl border border-purple-500/10 hover:border-[#8b5cf6]/35 transition-all duration-300 flex flex-col justify-between group shadow-xl relative overflow-hidden bg-slate-950/20"
                >
                  {/* Visual hover background banner */}
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-600 to-[#ff73fa] opacity-0 group-hover:opacity-100 transition"></div>

                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-2xl overflow-hidden border border-purple-500/20 shadow-md shrink-0">
                      <img src={guild.icon} className="w-full h-full object-cover" />
                    </div>

                    <div>
                      <h3 className="text-base font-bold text-white font-display tracking-tight group-hover:text-purple-300 transition">
                        {guild.name}
                      </h3>
                      <p className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                        <span className="font-semibold text-white">{guild.memberCount.toLocaleString()}</span> Members
                        <span className="text-purple-500">•</span>
                        <span className="font-semibold text-purple-400">{guild.boosts} Boosts</span>
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-purple-500/5 flex items-center justify-between">
                    <div>
                      {guild.hasBot ? (
                        <span className="text-[10px] bg-green-500/10 text-green-400 border border-green-500/20 px-2.5 py-0.5 rounded-full font-bold">
                          Bot Active
                        </span>
                      ) : (
                        <span className="text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 px-2.5 py-0.5 rounded-full font-bold">
                          Bot Inactive
                        </span>
                      )}
                    </div>

                    {guild.hasBot ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedGuildId(guild.id);
                          setActiveTab("analytics");
                        }}
                        className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-4 py-2 rounded-xl text-xs transition flex items-center gap-1 cursor-pointer shadow group-hover:translate-x-1"
                      >
                        Configure Dashboard <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleInviteBot(guild.id)}
                        className="bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold px-4 py-2 rounded-xl text-xs transition flex items-center gap-1 cursor-pointer shadow"
                      >
                        Invite DarkFlower <Plus className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="glass-panel p-8 rounded-2xl border border-purple-500/10 bg-slate-950/20 text-center space-y-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-purple-950/40 border border-purple-500/20 flex items-center justify-center text-purple-400">
                <Server className="w-8 h-8 text-purple-400" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-lg font-bold text-white font-display">No Servers Authorized Yet</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                  No active servers found. To manage a server, you must have Administrator or Manage Server permissions in it, and the DarkFlower bot must be invited to that server.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                {botStatus?.clientId && (
                  <a
                    href={`https://discord.com/api/oauth2/authorize?client_id=${botStatus.clientId}&permissions=8&scope=bot%20applications.commands`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold px-4 py-2 rounded-xl text-xs transition flex items-center gap-1.5 shadow hover:scale-105"
                  >
                    <svg viewBox="0 0 127.14 96.36" className="w-3.5 h-3.5 fill-current">
                      <path d="M107.7,8.07A105.15,105.15,0,0,0,77.26,0a77.19,77.19,0,0,0-3.3,6.83A96.67,96.67,0,0,0,53.22,6.83,77.19,77.19,0,0,0,49.88,0,105.15,105.15,0,0,0,19.44,8.07C3.66,31.58-1.86,54.65,1,77.53a105.73,105.73,0,0,0,32,16.29,77.7,77.7,0,0,0,6.73-11,68.6,68.6,0,0,1-10.64-5.12c.91-.67,1.81-1.37,2.68-2.1a75.22,75.22,0,0,0,70.92,0c.87.73,1.77,1.43,2.68,2.1a68.86,68.86,0,0,1-10.64,5.12,77.7,77.7,0,0,0,6.73,11,105.73,105.73,0,0,0,32-16.29C129.43,48.24,123.36,25.41,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53S36.18,40.36,42.45,40.36,53.83,46,53.83,53,48.72,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.24,60,73.24,53S78.41,40.36,84.69,40.36,96.07,46,96.07,53,91,65.69,84.69,65.69Z"/>
                    </svg>
                    Invite Bot to Server
                  </a>
                )}
                {botStatus?.supportInvite && (
                  <a
                    href={botStatus.supportInvite}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-[#242528] hover:bg-[#2f3136] text-white border border-purple-500/20 font-bold px-4 py-2 rounded-xl text-xs transition flex items-center gap-1.5 shadow hover:scale-105"
                  >
                    <HelpCircle className="w-3.5 h-3.5 text-purple-400" />
                    Join Support Server
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Footer Account Status */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-slate-950/40 border border-purple-500/5">
            <div className="flex items-center gap-3">
              <img src={session.avatar} className="w-10 h-10 rounded-full border border-purple-500/30 bg-slate-900" />
              <div>
                <span className="text-xs text-slate-400 block font-medium">Logged in via Discord as</span>
                <span className="text-sm font-bold text-white">{session.username}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="text-xs text-red-400 hover:text-red-300 hover:underline flex items-center gap-1 py-2 px-4 rounded-xl border border-red-500/10 hover:bg-red-500/5 cursor-pointer"
            >
              <LogOut className="w-4 h-4" /> Logout Account
            </button>
          </div>

        </div>
      </div>
    );
  }

  // --- CORE SYSTEM DASHBOARD LAYOUT ---
  return (
    <div className="min-h-screen bg-[#07050d] text-slate-100 flex flex-col lg:flex-row relative font-sans overflow-hidden">
      
      {/* Sidebar - Desktop */}
      <aside className="hidden lg:flex flex-col w-64 bg-[#0e0a1b]/95 border-r border-purple-500/10 shrink-0 h-screen sticky top-0 overflow-y-auto z-20">
        {/* Brand Banner */}
        <div className="p-6 border-b border-purple-500/10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#161127] border border-[#8b5cf6]/45 flex items-center justify-center shadow-lg">
            <svg viewBox="0 0 100 100" className="w-6.5 h-6.5 text-[#a855f7]">
              <path fill="currentColor" d="M50 15 C45 35 30 45 15 50 C30 55 45 65 50 85 C55 65 70 55 85 50 C70 45 55 35 50 15 Z" />
            </svg>
          </div>
          <div>
            <h2 className="text-md font-black tracking-tight font-display text-white">
              DARK<span className="text-[#a855f7]">FLOWER</span>
            </h2>
            <span className="text-[9px] text-[#a855f7]/80 uppercase font-bold tracking-wider font-mono">Control Station</span>
          </div>
        </div>

        {/* Selected Guild Selector shortcut */}
        <div className="p-4 border-b border-purple-500/5">
          <button
            type="button"
            onClick={() => setSelectedGuildId(null)}
            className="w-full flex items-center gap-2.5 p-2 rounded-xl bg-purple-950/15 border border-purple-500/10 hover:border-purple-500/30 transition text-left cursor-pointer"
          >
            <img src={selectedGuild.icon} className="w-8 h-8 rounded-lg object-cover" />
            <div className="min-w-0 flex-1">
              <span className="text-[9px] text-slate-400 font-medium block">Active Server</span>
              <span className="text-xs font-bold text-white truncate block">{selectedGuild.name}</span>
            </div>
            <span className="text-[10px] bg-purple-500/15 text-purple-400 px-1.5 py-0.5 rounded font-bold shrink-0 border border-purple-500/10">Switch</span>
          </button>
        </div>

        {/* Modules Navigation Links */}
        <nav className="p-4 space-y-1 flex-1">
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block px-3 mb-2.5">Guild Modules</span>
          
          <button
            onClick={() => setActiveTab("analytics")}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition cursor-pointer ${
              activeTab === "analytics" ? "bg-purple-600 text-white shadow-lg shadow-purple-600/15" : "text-slate-400 hover:text-white hover:bg-purple-950/10"
            }`}
          >
            <LayoutDashboard className="w-4 h-4 shrink-0" /> General & Analytics
          </button>

          <button
            onClick={() => setActiveTab("music")}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition cursor-pointer ${
              activeTab === "music" ? "bg-purple-600 text-white shadow-lg shadow-purple-600/15" : "text-slate-400 hover:text-white hover:bg-purple-950/10"
            }`}
          >
            <Music className="w-4 h-4 shrink-0" /> Music Streamer
          </button>

          <button
            onClick={() => setActiveTab("moderation")}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition cursor-pointer ${
              activeTab === "moderation" ? "bg-purple-600 text-white shadow-lg shadow-purple-600/15" : "text-slate-400 hover:text-white hover:bg-purple-950/10"
            }`}
          >
            <Shield className="w-4 h-4 shrink-0" /> Moderation & Console
          </button>

          <button
            onClick={() => setActiveTab("tickets")}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition cursor-pointer ${
              activeTab === "tickets" ? "bg-purple-600 text-white shadow-lg shadow-purple-600/15" : "text-slate-400 hover:text-white hover:bg-purple-950/10"
            }`}
          >
            <MessageSquare className="w-4 h-4 shrink-0" /> Button Ticket System
          </button>

          <button
            onClick={() => setActiveTab("buttonroles")}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition cursor-pointer ${
              activeTab === "buttonroles" ? "bg-purple-600 text-white shadow-lg shadow-purple-600/15" : "text-slate-400 hover:text-white hover:bg-purple-950/10"
            }`}
          >
            <Sliders className="w-4 h-4 shrink-0" /> Button Roles Manager
          </button>

          <button
            onClick={() => setActiveTab("marriage")}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition cursor-pointer ${
              activeTab === "marriage" ? "bg-purple-600 text-white shadow-lg shadow-purple-600/15" : "text-slate-400 hover:text-white hover:bg-purple-950/10"
            }`}
          >
            <Heart className="w-4 h-4 shrink-0" /> Marriage & Families
          </button>

          <button
            onClick={() => setActiveTab("leveling")}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition cursor-pointer ${
              activeTab === "leveling" ? "bg-purple-600 text-white shadow-lg shadow-purple-600/15" : "text-slate-400 hover:text-white hover:bg-purple-950/10"
            }`}
          >
            <Award className="w-4 h-4 shrink-0" /> Leveling Leaderboard
          </button>

          <button
            onClick={() => setActiveTab("welcomer")}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition cursor-pointer ${
              activeTab === "welcomer" ? "bg-purple-600 text-white shadow-lg shadow-purple-600/15" : "text-slate-400 hover:text-white hover:bg-purple-950/10"
            }`}
          >
            <Volume2 className="w-4 h-4 shrink-0" /> Welcomer Banners
          </button>

          <button
            onClick={() => setActiveTab("webhooks")}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition cursor-pointer ${
              activeTab === "webhooks" ? "bg-purple-600 text-white shadow-lg shadow-purple-600/15" : "text-slate-400 hover:text-white hover:bg-purple-950/10"
            }`}
          >
            <Share2 className="w-4 h-4 shrink-0" /> Webhook Embeds
          </button>

          <button
            onClick={() => setActiveTab("branding")}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition cursor-pointer ${
              activeTab === "branding" ? "bg-purple-600 text-white shadow-lg shadow-purple-600/15" : "text-slate-400 hover:text-white hover:bg-purple-950/10"
            }`}
          >
            <Bot className="w-4 h-4 shrink-0" /> Custom Branding
          </button>

          <button
            onClick={() => setActiveTab("ai")}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition cursor-pointer ${
              activeTab === "ai" ? "bg-purple-600 text-white shadow-lg shadow-purple-600/15" : "text-slate-400 hover:text-white hover:bg-purple-950/10"
            }`}
          >
            <Sparkles className="w-4 h-4 shrink-0" /> Administrative AI Chat
          </button>

          <button
            onClick={() => setActiveTab("diagnostics")}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition cursor-pointer ${
              activeTab === "diagnostics" ? "bg-purple-600 text-white shadow-lg shadow-purple-600/15" : "text-slate-400 hover:text-white hover:bg-purple-950/10"
            }`}
          >
            <span className="flex items-center gap-3"><ShieldAlert className="w-4 h-4 shrink-0" /> Auto-Fix Diagnostics</span>
            {selectedGuild.errors.length > 0 && (
              <span className="bg-red-500 text-white font-bold text-[9px] w-4.5 h-4.5 rounded-full flex items-center justify-center animate-pulse">{selectedGuild.errors.length}</span>
            )}
          </button>
        </nav>

        {/* Footer profile status */}
        <div className="p-4 border-t border-purple-500/10 bg-[#07050d] flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <img src={session.avatar} className="w-8 h-8 rounded-full border border-purple-500/30 shrink-0" />
            <div className="min-w-0">
              <span className="text-white text-xs font-bold truncate block">{session.username}</span>
              <span className="text-[9px] text-slate-500 font-medium truncate block">Dashboard Client</span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="text-slate-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/5 transition cursor-pointer shrink-0"
            title="Logout account"
          >
            <LogOut className="w-4.5 h-4.5" />
          </button>
        </div>
      </aside>

      {/* Sidebar - Mobile Header Bar & Drawer */}
      <header className="lg:hidden w-full bg-[#0e0a1b] border-b border-purple-500/10 px-4 py-3.5 flex items-center justify-between sticky top-0 left-0 z-40">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 100 100" className="w-7.5 h-7.5 text-[#a855f7]">
            <path fill="currentColor" d="M50 15 C45 35 30 45 15 50 C30 55 45 65 50 85 C55 65 70 55 85 50 C70 45 55 35 50 15 Z" />
          </svg>
          <h2 className="text-sm font-black tracking-tight font-display text-white">
            DARK<span className="text-[#a855f7]">FLOWER</span>
          </h2>
        </div>

        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="text-slate-200 hover:text-purple-400 p-1 rounded transition"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </header>

      {/* Mobile Drawer Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-30 lg:hidden flex bg-black/60 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)}>
          <div className="w-64 bg-[#0e0a1b] h-full flex flex-col justify-between border-r border-purple-500/15" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-purple-500/10 flex items-center gap-2">
              <svg viewBox="0 0 100 100" className="w-6.5 h-6.5 text-[#a855f7]">
                <path fill="currentColor" d="M50 15 C45 35 30 45 15 50 C30 55 45 65 50 85 C55 65 70 55 85 50 C70 45 55 35 50 15 Z" />
              </svg>
              <h2 className="text-xs font-black tracking-tight font-display text-white">DARKFLOWER</h2>
            </div>

            <nav className="p-3 space-y-1 flex-1 overflow-y-auto">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block px-2.5 mb-2">Modules</span>
              
              {[
                { tab: "analytics", label: "General & Analytics", icon: LayoutDashboard },
                { tab: "music", label: "Music Streamer", icon: Music },
                { tab: "moderation", label: "Moderation & Console", icon: Shield },
                { tab: "tickets", label: "Button Ticket System", icon: MessageSquare },
                { tab: "buttonroles", label: "Button Roles Manager", icon: Sliders },
                { tab: "marriage", label: "Marriage & Families", icon: Heart },
                { tab: "leveling", label: "Leveling Leaderboard", icon: Award },
                { tab: "welcomer", label: "Welcomer Banners", icon: Volume2 },
                { tab: "webhooks", label: "Webhook Embeds", icon: Share2 },
                { tab: "branding", label: "Custom Branding", icon: Bot },
                { tab: "ai", label: "Administrative AI Chat", icon: Sparkles },
                { tab: "diagnostics", label: "Auto-Fix Diagnostics", icon: ShieldAlert }
              ].map(({ tab, label, icon: Icon }) => (
                <button
                  key={tab}
                  onClick={() => {
                    setActiveTab(tab);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition cursor-pointer ${
                    activeTab === tab ? "bg-purple-600 text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" /> {label}
                </button>
              ))}
              
              <button
                onClick={() => {
                  setSelectedGuildId(null);
                  setMobileMenuOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold text-purple-400 hover:bg-purple-950/10 transition mt-4 cursor-pointer"
              >
                <Server className="w-4 h-4" /> Switch Server
              </button>
            </nav>

            <div className="p-3 border-t border-purple-500/10 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <img src={session.avatar} className="w-7 h-7 rounded-full border border-purple-500/30 shrink-0" />
                <span className="text-white text-xs font-bold truncate block">{session.username}</span>
              </div>
              <button onClick={handleLogout} className="text-slate-500 hover:text-red-400 p-1"><LogOut className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      )}

      {/* Main Container */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto max-w-7xl mx-auto w-full relative z-10">
        
        {/* Module Title Banner */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-[10px] bg-purple-500/10 border border-purple-500/25 text-purple-400 px-3 py-1 rounded-full font-bold uppercase tracking-wider font-mono">
                Server: {selectedGuild.name}
              </span>
              
              {/* Real-time Sync Status Indicator */}
              <div className="flex items-center gap-1.5 bg-slate-950/60 border border-purple-500/10 px-2.5 py-1 rounded-full">
                <div className="relative flex h-2 w-2">
                  {syncStatus.status === 'connected' ? (
                    <>
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                    </>
                  ) : (
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                  )}
                </div>
                <span className="text-[10px] font-mono font-semibold text-slate-300">
                  {syncStatus.status === 'connected' ? `SYNC: ${syncStatus.latency >= 0 ? `${syncStatus.latency}ms` : 'PINGING'}` : 'DISCONNECTED'}
                </span>
              </div>
            </div>
            <h2 className="text-2xl md:text-3xl font-black font-display text-white mt-1 tracking-tight flex items-center gap-2 capitalize">
              {activeTab === "ai" ? "Administrative AI Chat" : activeTab === "diagnostics" ? "Auto-Fix Diagnostics" : `${activeTab} Controls`}
            </h2>
          </div>

          {/* Quick Stats overview */}
          <div className="flex items-center gap-3 bg-slate-950/40 p-2.5 rounded-2xl border border-purple-500/5">
            <span className="text-xs text-slate-400">Total Commands Executed:</span>
            <strong className="text-xs font-mono text-white bg-purple-950 border border-purple-500/10 px-2.5 py-1 rounded-lg">
              {selectedGuild.analytics.moderationCount + selectedGuild.analytics.ticketsCount + 142}
            </strong>
          </div>
        </div>

        {/* Dynamic Panel Mounting */}
        {renderTabContent()}

      </main>

      {/* Toast Notification Container */}
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 max-w-sm w-full pointer-events-none px-4 sm:px-0">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl border backdrop-blur-md shadow-2xl transition-all duration-300 transform translate-y-0 animate-fade-in ${
              toast.type === "success"
                ? "bg-[#0d1f14]/90 border-green-500/30 text-green-200"
                : toast.type === "error"
                ? "bg-[#251214]/90 border-red-500/30 text-red-200"
                : toast.type === "warning"
                ? "bg-[#241d10]/90 border-yellow-500/30 text-yellow-200"
                : "bg-[#0e1324]/90 border-blue-500/30 text-blue-200"
            }`}
          >
            <div className="shrink-0 mt-0.5">
              {toast.type === "success" && <CheckCircle className="w-5 h-5 text-green-400" />}
              {toast.type === "error" && <AlertTriangle className="w-5 h-5 text-red-400" />}
              {toast.type === "warning" && <AlertTriangle className="w-5 h-5 text-yellow-400" />}
              {toast.type === "info" && <Info className="w-5 h-5 text-blue-400" />}
            </div>
            <div className="flex-1 text-xs font-semibold leading-relaxed">
              {toast.message}
            </div>
            <button
              type="button"
              onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
              className="text-slate-400 hover:text-white transition shrink-0 self-start p-0.5 rounded cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
