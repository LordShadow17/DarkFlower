import React, { useState, useEffect } from "react";
import { Guild } from "../types";
import { Bot, ShieldAlert, Key, Eye, EyeOff, Check, RefreshCw, Power, Trash2, ExternalLink } from "lucide-react";
import { showToast } from "../utils/toast";

interface BrandingPanelProps {
  guild: Guild;
  onUpdateGuild: (updated: Guild) => void;
}

export default function BrandingPanel({ guild, onUpdateGuild }: BrandingPanelProps) {
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isActivating, setIsActivating] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRebooting, setIsRebooting] = useState(false);
  const [isUnlinking, setIsUnlinking] = useState(false);
  const [showUnlinkConfirm, setShowUnlinkConfirm] = useState(false);
  
  const [botConfig, setBotConfig] = useState<{
    configured: boolean;
    status: string;
    username: string;
    avatar: string;
    id: string;
    error?: string;
  }>({
    configured: false,
    status: "offline",
    username: "Custom Bot",
    avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=CustomBot",
    id: "",
  });

  const fetchBotStatus = async () => {
    try {
      const res = await fetch(`/api/guilds/${guild.id}/custom-bot`);
      if (res.ok) {
        const data = await res.json();
        setBotConfig(data);
      }
    } catch (err) {
      console.error("Error fetching custom bot status:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setIsLoading(true);
    fetchBotStatus();
  }, [guild.id]);

  const handleActivate = async () => {
    if (!token.trim()) {
      showToast("Please enter a valid Discord Bot Token", "error");
      return;
    }

    setIsActivating(true);
    try {
      const res = await fetch(`/api/guilds/${guild.id}/custom-bot/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() })
      });

      const data = await res.json();
      if (res.ok) {
        showToast("Custom bot activated successfully!", "success");
        setToken("");
        setBotConfig({
          configured: true,
          status: "online",
          username: data.guild.customBot?.username || "Custom Bot",
          avatar: data.guild.customBot?.avatar || "https://api.dicebear.com/7.x/pixel-art/svg?seed=CustomBot",
          id: data.guild.customBot?.id || "",
        });
        if (data.guild) {
          onUpdateGuild(data.guild);
        }
      } else {
        showToast(data.error || "Failed to activate custom bot", "error");
        // Update local bot configuration error info
        fetchBotStatus();
      }
    } catch (err) {
      showToast("Network error during custom bot activation", "error");
    } finally {
      setIsActivating(false);
    }
  };

  const handleSyncCommands = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch(`/api/guilds/${guild.id}/custom-bot/sync-commands`, {
        method: "POST"
      });
      const data = await res.json();
      if (res.ok) {
        showToast("Application slash commands synced globally!", "success");
      } else {
        showToast(data.error || "Failed to sync commands", "error");
      }
    } catch (err: any) {
      console.error("Sync error:", err);
      showToast(`Network error syncing commands: ${err.message || 'Unknown error'}`, "error");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleReboot = async () => {
    setIsRebooting(true);
    try {
      const res = await fetch(`/api/guilds/${guild.id}/custom-bot/reboot`, {
        method: "POST"
      });
      const data = await res.json();
      if (res.ok) {
        showToast("Custom bot rebooted successfully!", "success");
        setBotConfig({
          configured: true,
          status: "online",
          username: data.guild.customBot?.username || "Custom Bot",
          avatar: data.guild.customBot?.avatar || "https://api.dicebear.com/7.x/pixel-art/svg?seed=CustomBot",
          id: data.guild.customBot?.id || "",
        });
        if (data.guild) {
          onUpdateGuild(data.guild);
        }
      } else {
        showToast(data.error || "Failed to reboot custom bot", "error");
        fetchBotStatus();
      }
    } catch (err) {
      showToast("Network error during bot reboot", "error");
    } finally {
      setIsRebooting(false);
    }
  };

  const handleUnlink = async () => {
    setIsUnlinking(true);
    try {
      const res = await fetch(`/api/guilds/${guild.id}/custom-bot/unlink`, {
        method: "POST"
      });
      const data = await res.json();
      if (res.ok) {
        showToast("Custom bot token unlinked and deleted.", "success");
        setBotConfig({
          configured: false,
          status: "offline",
          username: "Custom Bot",
          avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=CustomBot",
          id: "",
        });
        setShowUnlinkConfirm(false);
        if (data.guild) {
          onUpdateGuild(data.guild);
        }
      } else {
        showToast(data.error || "Failed to unlink custom bot", "error");
      }
    } catch (err) {
      showToast("Network error unlinking token", "error");
    } finally {
      setIsUnlinking(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4 animate-pulse">
        <div className="w-12 h-12 rounded-full border-4 border-purple-500/20 border-t-purple-500 animate-spin" />
        <p className="text-slate-400 font-medium font-mono text-sm">Synchronizing telemetry parameters...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
      
      {/* Upper header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-purple-500/10 pb-6 gap-4">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight font-display flex items-center gap-2">
            <Bot className="w-7 h-7 text-purple-400" />
            Custom Branding <span className="text-purple-400 text-xs px-2.5 py-0.5 rounded-full bg-purple-500/10 font-mono font-semibold uppercase tracking-widest border border-purple-500/20">White-Label</span>
          </h2>
          <p className="text-sm text-slate-400 mt-1 font-sans">
            Turn our system into your own private server bot with a customized name, identity, and profile picture.
          </p>
        </div>
        
        {/* Connection status badge */}
        <div className="flex items-center gap-2.5 self-start md:self-auto bg-slate-950/60 px-4 py-2 rounded-2xl border border-purple-500/10">
          <div className="relative flex h-3 w-3">
            {botConfig.status === "online" && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            )}
            <span className={`relative inline-flex rounded-full h-3 w-3 ${botConfig.status === "online" ? "bg-green-500" : botConfig.status === "error" ? "bg-red-500" : "bg-slate-500"}`}></span>
          </div>
          <span className="text-xs font-bold font-mono text-white uppercase tracking-wider">
            Status: {botConfig.status === "online" ? "Online" : botConfig.status === "error" ? "Error" : "Inactive"}
          </span>
        </div>
      </div>

      {!botConfig.configured ? (
        /* Setup Page (Before Activation) */
        <div className="space-y-6">
          <div className="glass-panel p-6 rounded-3xl border border-purple-500/15 bg-slate-900/40 shadow-2xl space-y-6">
            
            {/* Instructional Alert Box */}
            <div className="bg-purple-950/20 rounded-2xl p-5 border border-purple-500/10 space-y-4">
              <div className="flex items-center gap-2 border-b border-purple-500/10 pb-2">
                <ShieldAlert className="w-5 h-5 text-purple-400" />
                <h4 className="font-bold text-white text-sm font-display uppercase tracking-wider">Instructions to setup custom branding</h4>
              </div>
              <ul className="space-y-3.5 text-xs text-slate-300">
                <li className="flex items-start gap-2.5">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold font-mono">1</span>
                  <div>
                    Go to the <a href="https://discord.com/developers/applications" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline inline-flex items-center gap-0.5 font-semibold">Discord Developer Portal <ExternalLink className="w-3 h-3" /></a> and create a **New Application**.
                  </div>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold font-mono">2</span>
                  <div>
                    Navigate to the **Bot** tab on the left-side menu. Add a bot user, upload your custom avatar image, set your bot's custom display name, and scroll down to the **Privileged Gateway Intents** section.
                  </div>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold font-mono">3</span>
                  <div className="space-y-1">
                    <div>You **MUST** enable all 3 privileged intent switches:</div>
                    <div className="flex flex-wrap gap-2 pt-1 font-mono text-[10px]">
                      <span className="bg-slate-950 px-2 py-0.5 rounded border border-purple-500/10 text-slate-300">Presence Intent</span>
                      <span className="bg-slate-950 px-2 py-0.5 rounded border border-purple-500/10 text-slate-300">Server Members Intent</span>
                      <span className="bg-slate-950 px-2 py-0.5 rounded border border-purple-500/10 text-slate-300">Message Content Intent</span>
                    </div>
                  </div>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold font-mono">4</span>
                  <div>
                    Click **Reset Token**, authorize the action, copy the generated bot token, and paste it below.
                  </div>
                </li>
              </ul>
            </div>

            {/* Token Input Form */}
            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block flex items-center gap-1.5">
                <Key className="w-4 h-4 text-purple-400" />
                Your Secret Discord Bot Token
              </label>
              <div className="relative">
                <input
                  type={showToken ? "text" : "password"}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Paste your secret bot token here (MTk4MDUz...)"
                  className="w-full bg-slate-950 border border-purple-500/15 rounded-2xl py-4.5 pl-5 pr-14 text-sm font-mono text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/50 transition-all shadow-inner focus:ring-1 focus:ring-purple-500/20"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-4.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                >
                  {showToken ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Error state if last connection failed */}
            {botConfig.status === "error" && botConfig.error && (
              <div className="bg-red-950/20 border border-red-500/20 p-4.5 rounded-2xl flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-red-300 font-mono">
                  <div className="font-bold text-red-400 uppercase mb-1">Previous Connection Failed:</div>
                  {botConfig.error}
                </div>
              </div>
            )}

            {/* Action button */}
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={handleActivate}
                disabled={isActivating}
                className="w-full sm:w-auto px-10 py-4 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 text-white font-bold rounded-2xl cursor-pointer hover:shadow-lg hover:shadow-purple-500/15 transition-all flex items-center justify-center gap-2 shadow-md border border-purple-500/25 active:scale-98"
              >
                {isActivating ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    Connecting Discord Gateway...
                  </>
                ) : (
                  <>
                    <Bot className="w-5 h-5" />
                    Activate Custom Bot
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Management Page (After Activation) */
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Profile Box */}
            <div className="md:col-span-1 glass-panel p-6 rounded-3xl border border-purple-500/10 bg-slate-900/30 flex flex-col items-center justify-center text-center space-y-4">
              <div className="relative group">
                <div className="absolute inset-0 bg-purple-500/25 rounded-full blur-xl group-hover:scale-110 transition-transform duration-300" />
                <img
                  src={botConfig.avatar}
                  alt={botConfig.username}
                  referrerPolicy="no-referrer"
                  className="relative w-24 h-24 rounded-full border-2 border-purple-500/30 shadow-2xl object-cover bg-slate-950"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${botConfig.username}`;
                  }}
                />
                <div className="absolute bottom-0 right-1 bg-green-500 border-3 border-slate-900 w-5.5 h-5.5 rounded-full flex items-center justify-center shadow-lg">
                  <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                </div>
              </div>
              
              <div className="space-y-1">
                <h3 className="text-lg font-black text-white font-display tracking-tight">{botConfig.username}</h3>
                <p className="text-[10px] font-mono text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2.5 py-0.5 rounded-full inline-block uppercase tracking-wider font-semibold">Custom Instance</p>
              </div>

              {botConfig.id && (
                <div className="w-full bg-slate-950/60 rounded-xl p-2.5 border border-purple-500/5">
                  <div className="text-[9px] font-bold font-mono text-slate-500 uppercase tracking-widest">Application Client ID</div>
                  <div className="text-xs font-mono text-slate-300 select-all">{botConfig.id}</div>
                </div>
              )}
            </div>

            {/* Quick Actions / Telemetry details */}
            <div className="md:col-span-2 glass-panel p-6 rounded-3xl border border-purple-500/10 bg-slate-900/30 flex flex-col justify-between space-y-6">
              
              {/* Telemetry info */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-purple-500/5 pb-2">Bot Telemetry Parameters</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-950/40 p-3.5 rounded-2xl border border-purple-500/5 space-y-1">
                    <span className="text-[10px] text-slate-500 font-mono font-semibold uppercase block">Active Process</span>
                    <span className="text-sm font-bold text-white font-mono">White-Label Worker #1</span>
                  </div>
                  <div className="bg-slate-950/40 p-3.5 rounded-2xl border border-purple-500/5 space-y-1">
                    <span className="text-[10px] text-slate-500 font-mono font-semibold uppercase block">Command Scope</span>
                    <span className="text-sm font-bold text-white font-mono">Global & Guild (Full)</span>
                  </div>
                </div>

                {botConfig.status === "error" && botConfig.error && (
                  <div className="bg-red-950/20 border border-red-500/25 p-4 rounded-xl flex items-start gap-3 mt-2">
                    <ShieldAlert className="w-5 h-5 text-red-400 flex-shrink-0" />
                    <div className="text-xs text-red-300 font-mono">
                      <span className="font-bold text-red-400 block mb-1">Worker Sync Fault:</span>
                      {botConfig.error}
                    </div>
                  </div>
                )}
              </div>

              {/* Controls */}
              <div className="space-y-3 pt-4 border-t border-purple-500/5">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Custom Bot Controls</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  
                  {/* Sync Commands */}
                  <button
                    type="button"
                    disabled={isSyncing || isRebooting || isUnlinking}
                    onClick={handleSyncCommands}
                    className="px-4 py-3 bg-slate-950 hover:bg-slate-900 border border-purple-500/15 hover:border-purple-500/30 text-xs font-bold text-slate-200 hover:text-white rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-98 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 text-purple-400 ${isSyncing ? 'animate-spin' : ''}`} />
                    Sync Commands
                  </button>

                  {/* Reboot */}
                  <button
                    type="button"
                    disabled={isSyncing || isRebooting || isUnlinking}
                    onClick={handleReboot}
                    className="px-4 py-3 bg-slate-950 hover:bg-slate-900 border border-purple-500/15 hover:border-purple-500/30 text-xs font-bold text-slate-200 hover:text-white rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-98 disabled:opacity-50"
                  >
                    <Power className={`w-4 h-4 text-green-400 ${isRebooting ? 'animate-spin' : ''}`} />
                    Reboot Bot
                  </button>

                  {/* Unlink Token */}
                  {showUnlinkConfirm ? (
                    <div className="col-span-1 sm:col-span-3 flex flex-col sm:flex-row items-center justify-between gap-3 bg-red-950/20 border border-red-500/20 p-4 rounded-xl mt-2 animate-fade-in w-full text-left">
                      <div className="flex items-center gap-2">
                        <ShieldAlert className="w-5 h-5 text-red-400 flex-shrink-0 animate-pulse" />
                        <span className="text-xs text-red-200">
                          Are you sure? This shuts down the bot and deletes the token.
                        </span>
                      </div>
                      <div className="flex gap-2 w-full sm:w-auto">
                        <button
                          type="button"
                          onClick={() => setShowUnlinkConfirm(false)}
                          className="flex-1 sm:flex-none px-3 py-1.5 bg-slate-900 border border-slate-700 hover:bg-slate-800 text-xs text-slate-300 rounded-lg transition-all cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={isUnlinking}
                          onClick={handleUnlink}
                          className="flex-1 sm:flex-none px-3 py-1.5 bg-red-600 hover:bg-red-500 text-xs font-bold text-white rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1"
                        >
                          {isUnlinking ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          Confirm Delete
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={isSyncing || isRebooting || isUnlinking}
                      onClick={() => setShowUnlinkConfirm(true)}
                      className="px-4 py-3 bg-red-950/20 hover:bg-red-950/40 border border-red-500/20 hover:border-red-500/40 text-xs font-bold text-red-400 hover:text-red-300 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-98 disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                      Unlink Token
                    </button>
                  )}

                </div>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
