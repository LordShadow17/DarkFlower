import React, { useState, useEffect } from "react";
import { Guild, CustomBotInstance } from "../types";
import { 
  Bot, 
  ShieldAlert, 
  Key, 
  Eye, 
  EyeOff, 
  Check, 
  RefreshCw, 
  Power, 
  Trash2, 
  Plus, 
  Sparkles, 
  HelpCircle, 
  ShieldCheck, 
  X, 
  ExternalLink,
  ChevronRight,
  Sliders,
  Server
} from "lucide-react";
import { showToast } from "../utils/toast";

interface BrandingPanelProps {
  guild: Guild;
  onUpdateGuild: (updated: Guild) => void;
}

interface ModuleDef {
  id: string;
  name: string;
  description: string;
}

const MODULES_LIST: ModuleDef[] = [
  { id: "moderation", name: "Moderation & Security Systems", description: "Handles bad word filtering, link blocking, server modlogs, and automated chat safety." },
  { id: "leveling", name: "Leveling & XP Rewards", description: "Controls user activity XP accumulation, level ups, role milestones, and leaderboards." },
  { id: "tickets", name: "Ticket & Support Modals", description: "Powers the interactive support channel creator, button panels, and ticket chat archiving." },
  { id: "fun", name: "Fun & Marriage Modules", description: "Brings the flirt, hug, poke, and kiss simulation, AFK nickname handlers, and spouse summons." },
  { id: "voice", name: "Voice & Music Systems", description: "Listens to voice state modifications and automates dynamic voice features." }
];

export default function BrandingPanel({ guild, onUpdateGuild }: BrandingPanelProps) {
  const [bots, setBots] = useState<CustomBotInstance[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Helper to safely fetch JSON, throwing detailed error if the response is HTML/non-JSON
  const safeFetchJson = async (res: Response) => {
    const contentType = res.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      return await res.json();
    }
    const text = await res.text();
    // Clean up HTML tags if any to make it readable in toast
    const cleanText = text.replace(/<[^>]*>/g, '').trim();
    throw new Error(cleanText.substring(0, 100) || `Server error (${res.status})`);
  };
  
  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [botToEdit, setBotToEdit] = useState<CustomBotInstance | null>(null);
  const [token, setToken] = useState("");
  const [newToken, setNewToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [showNewToken, setShowNewToken] = useState(false);
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [isActivating, setIsActivating] = useState(false);

  // Per-Bot Action Loading States (Keyed by Bot ID)
  const [syncingBots, setSyncingBots] = useState<Record<string, boolean>>({});
  const [rebootingBots, setRebootingBots] = useState<Record<string, boolean>>({});
  const [unlinkingBots, setUnlinkingBots] = useState<Record<string, boolean>>({});
  const [confirmUnlinkBotId, setConfirmUnlinkBotId] = useState<string | null>(null);
  const [updatingModulesBots, setUpdatingModulesBots] = useState<Record<string, boolean>>({});

  const fetchBotStatus = async () => {
    try {
      const res = await fetch(`/api/guilds/${guild.id}/custom-bot`);
      if (res.ok) {
        const data = await safeFetchJson(res);
        setBots(data.bots || []);
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

    // Live continuous status synchronization for custom bots
    const interval = setInterval(() => {
      fetchBotStatus();
    }, 6000);

    return () => clearInterval(interval);
  }, [guild.id]);

  // Find which bots own a module
  const getModuleOwners = (moduleId: string) => {
    return bots.filter(b => b.status !== 'error' && b.modules.includes(moduleId));
  };

  const handleOpenAddModal = () => {
    // Default to selecting all modules
    const allModules = MODULES_LIST.map(m => m.id);
    
    setSelectedModules(allModules);
    setToken("");
    setShowToken(false);
    setIsModalOpen(true);
  };

  const handleToggleModule = (moduleId: string) => {
    if (selectedModules.includes(moduleId)) {
      setSelectedModules(selectedModules.filter(id => id !== moduleId));
    } else {
      setSelectedModules([...selectedModules, moduleId]);
    }
  };

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
        body: JSON.stringify({ 
          token: token.trim(),
          modules: selectedModules
        })
      });

      const data = await safeFetchJson(res);
      if (res.ok) {
        showToast("Custom bot instance deployed and launched!", "success");
        setIsModalOpen(false);
        fetchBotStatus();
        if (data.guild) {
          onUpdateGuild(data.guild);
        }
      } else {
        showToast(data.error || "Failed to activate custom bot", "error");
      }
    } catch (err: any) {
      showToast(`Network error during custom bot activation: ${err.message || 'Unknown error'}`, "error");
    } finally {
      setIsActivating(false);
    }
  };

  const handleOpenEditModal = (bot: CustomBotInstance) => {
    setBotToEdit(bot);
    setSelectedModules(bot.modules);
    setNewToken("");
    setIsEditModalOpen(true);
  };

  const handleUpdateToken = async () => {
    if (!botToEdit || !newToken.trim()) return;

    setUpdatingModulesBots(prev => ({ ...prev, [botToEdit.id]: true }));
    try {
      const res = await fetch(`/api/guilds/${guild.id}/custom-bot/update-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          botId: botToEdit.id,
          token: newToken.trim()
        })
      });

      const data = await safeFetchJson(res);
      if (res.ok) {
        showToast("Custom bot token updated successfully!", "success");
        setNewToken("");
        setIsEditModalOpen(false);
        fetchBotStatus();
        if (data.guild) {
          onUpdateGuild(data.guild);
        }
      } else {
        showToast(data.error || "Failed to update token", "error");
      }
    } catch (err: any) {
      showToast(`Network error updating token: ${err.message || 'Unknown error'}`, "error");
    } finally {
      setUpdatingModulesBots(prev => ({ ...prev, [botToEdit.id]: false }));
    }
  };

  const handleUpdateModules = async () => {
    if (!botToEdit) return;

    setUpdatingModulesBots(prev => ({ ...prev, [botToEdit.id]: true }));
    try {
      const res = await fetch(`/api/guilds/${guild.id}/custom-bot/update-modules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          botId: botToEdit.id,
          modules: selectedModules
        })
      });

      const data = await safeFetchJson(res);
      if (res.ok) {
        showToast("Custom bot modules updated successfully!", "success");
        setIsEditModalOpen(false);
        fetchBotStatus();
        if (data.guild) {
          onUpdateGuild(data.guild);
        }
      } else {
        showToast(data.error || "Failed to update modules", "error");
      }
    } catch (err: any) {
      showToast(`Network error updating modules: ${err.message || 'Unknown error'}`, "error");
    } finally {
      setUpdatingModulesBots(prev => ({ ...prev, [botToEdit.id]: false }));
    }
  };

  const handleSyncCommands = async (botId: string) => {
    setSyncingBots(prev => ({ ...prev, [botId]: true }));
    try {
      const res = await fetch(`/api/guilds/${guild.id}/custom-bot/sync-commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botId })
      });
      const data = await safeFetchJson(res);
      if (res.ok) {
        showToast("Application commands synced successfully for this instance!", "success");
      } else {
        showToast(data.error || "Failed to sync commands", "error");
      }
    } catch (err: any) {
      showToast(`Network error syncing commands: ${err.message || 'Unknown error'}`, "error");
    } finally {
      setSyncingBots(prev => ({ ...prev, [botId]: false }));
    }
  };

  const handleReboot = async (botId: string) => {
    setRebootingBots(prev => ({ ...prev, [botId]: true }));
    try {
      const res = await fetch(`/api/guilds/${guild.id}/custom-bot/reboot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botId })
      });
      const data = await safeFetchJson(res);
      if (res.ok) {
        showToast("Custom bot instance rebooted successfully!", "success");
        fetchBotStatus();
        if (data.guild) {
          onUpdateGuild(data.guild);
        }
      } else {
        showToast(data.error || "Failed to reboot custom bot", "error");
      }
    } catch (err: any) {
      showToast(`Network error during bot reboot: ${err.message || 'Unknown error'}`, "error");
    } finally {
      setRebootingBots(prev => ({ ...prev, [botId]: false }));
    }
  };

  const handleUnlink = async (botId: string) => {
    setUnlinkingBots(prev => ({ ...prev, [botId]: true }));
    try {
      const res = await fetch(`/api/guilds/${guild.id}/custom-bot/unlink`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botId })
      });
      const data = await safeFetchJson(res);
      if (res.ok) {
        showToast("Custom bot instance terminated and unlinked.", "success");
        setConfirmUnlinkBotId(null);
        fetchBotStatus();
        if (data.guild) {
          onUpdateGuild(data.guild);
        }
      } else {
        showToast(data.error || "Failed to unlink custom bot", "error");
      }
    } catch (err: any) {
      showToast(`Network error unlinking token: ${err.message || 'Unknown error'}`, "error");
    } finally {
      setUnlinkingBots(prev => ({ ...prev, [botId]: false }));
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4 animate-pulse">
        <div className="w-12 h-12 rounded-full border-4 border-purple-500/20 border-t-purple-500 animate-spin" />
        <p className="text-slate-400 font-medium font-mono text-sm">Synchronizing telemetry parameters...</p>
      </div>
    );
  }

  const MAX_SLOTS = 5;
  const emptySlotsCount = Math.max(0, MAX_SLOTS - bots.length);

  return (
    <div id="branding-panel-container" className="max-w-6xl mx-auto space-y-10 animate-fade-in px-4">
      
      {/* Premium Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-purple-500/10 pb-8 gap-4">
        <div className="space-y-2">
          <h2 className="text-3xl font-black text-white tracking-tight font-display flex items-center gap-3">
            <Bot className="w-9 h-9 text-purple-400 animate-pulse" />
            Multi-Bot Custom Branding
            <span className="text-[10px] text-purple-400 px-3 py-1 rounded-full bg-purple-500/10 font-mono font-bold uppercase tracking-widest border border-purple-500/20">White-Label</span>
          </h2>
          <p className="text-sm text-slate-400 max-w-2xl font-sans leading-relaxed">
            Deploy multiple custom-branded bots to divide tasks and customize your server's team. Keep your modules routed efficiently across separate white-label client instances.
          </p>
        </div>

        {/* Global Stats info */}
        <div className="flex items-center gap-4 bg-slate-950/60 p-4 rounded-2xl border border-purple-500/10">
          <div className="text-right">
            <div className="text-[10px] font-bold font-mono text-slate-500 uppercase tracking-widest">Active Clients</div>
            <div className="text-lg font-black text-white font-mono">{bots.filter(b => b.status === 'online').length} / {bots.length}</div>
          </div>
          <div className="h-8 w-px bg-purple-500/10" />
          <div className="text-right">
            <div className="text-[10px] font-bold font-mono text-slate-500 uppercase tracking-widest">Bot Slot Limit</div>
            <div className="text-lg font-black text-purple-400 font-mono">{bots.length} / {MAX_SLOTS}</div>
          </div>
          <div className="h-8 w-px bg-purple-500/10" />
          <button
            type="button"
            onClick={() => {
              setIsLoading(true);
              fetchBotStatus();
              showToast("Auditing live Discord gateway connections...", "info");
            }}
            className="p-2.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 rounded-xl transition border border-purple-500/20 cursor-pointer"
            title="Recheck Live Bot Connections"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Instructional alert helper */}
      <div className="bg-slate-900/40 rounded-3xl p-6 border border-purple-500/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-xl">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-purple-500/10 rounded-2xl border border-purple-500/20 text-purple-400">
            <Sparkles className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h4 className="font-bold text-white text-base font-display">How does Multi-Bot routing work?</h4>
            <p className="text-xs text-slate-400 leading-relaxed max-w-xl">
              By deploying separate bot tokens, you can divide duties (e.g., Bot #1 handles Moderation, Bot #2 handles Support Tickets). Modules checked on one bot cannot be handled by another bot, preventing duplicate responses on your Discord server!
            </p>
          </div>
        </div>
        <a 
          href="https://discord.com/developers/applications" 
          target="_blank" 
          rel="noopener noreferrer" 
          className="px-5 py-3 bg-slate-950 hover:bg-slate-900 border border-purple-500/15 hover:border-purple-500/30 text-xs font-bold text-slate-300 hover:text-white rounded-xl transition-all flex items-center gap-2 group whitespace-nowrap self-stretch md:self-auto justify-center"
        >
          <ExternalLink className="w-4 h-4 text-purple-400 group-hover:scale-110 transition-transform" />
          Developer Portal
        </a>
      </div>

      {/* Bot Slot Allocation Matrix (Grid View) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-white font-display uppercase tracking-wider flex items-center gap-2">
            <Sliders className="w-5 h-5 text-purple-400" />
            Bot Slot Allocation Matrix
          </h3>
          <span className="text-xs font-mono text-slate-500">Grid Matrix View</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Active Bot Cards */}
          {bots.map((bot, index) => {
            const isSyncing = syncingBots[bot.id];
            const isRebooting = rebootingBots[bot.id];
            const isUnlinking = unlinkingBots[bot.id];
            const isConfirmingDelete = confirmUnlinkBotId === bot.id;

            return (
              <div 
                key={bot.id || index}
                className="glass-panel p-6 rounded-3xl border border-purple-500/10 hover:border-purple-500/25 bg-slate-900/30 shadow-xl flex flex-col justify-between transition-all hover:translate-y-[-2px] space-y-6 relative overflow-hidden"
              >
                {/* Glowing subtle card accent */}
                <div className={`absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl opacity-10 ${bot.status === 'online' ? 'bg-green-500' : bot.status === 'error' ? 'bg-red-500' : 'bg-slate-500'}`} />

                {/* Profile Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <img
                        src={bot.avatar}
                        alt={bot.username}
                        referrerPolicy="no-referrer"
                        className="w-14 h-14 rounded-full border-2 border-purple-500/20 object-cover bg-slate-950"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${bot.username}`;
                        }}
                      />
                      <div className={`absolute bottom-0 right-0 border-2 border-slate-900 w-4.5 h-4.5 rounded-full flex items-center justify-center shadow-lg ${bot.status === 'online' ? 'bg-green-500' : bot.status === 'error' ? 'bg-red-500' : 'bg-slate-500'}`}>
                        {bot.status === 'online' && <div className="w-1 h-1 rounded-full bg-white animate-pulse" />}
                      </div>
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-base tracking-tight font-display line-clamp-1">{bot.username}</h4>
                      <p className="text-[10px] font-mono text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full inline-block uppercase tracking-wider font-semibold">Slot #{index + 1}</p>
                    </div>
                  </div>

                  {/* Status Indicator Badge */}
                  <div className={`px-2.5 py-1 rounded-full border text-[10px] font-bold font-mono uppercase tracking-wider ${
                    bot.status === 'online' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 
                    bot.status === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-400' : 
                    'bg-slate-500/10 border-slate-500/20 text-slate-400'
                  }`}>
                    {bot.status === 'online' ? 'Online' : bot.status === 'error' ? 'Error' : 'Offline'}
                  </div>
                </div>

                {/* Assigned Modules badging */}
                <div className="space-y-2">
                  <span className="text-[10px] font-bold font-mono text-slate-500 uppercase tracking-widest block">Assigned Functions</span>
                  {bot.modules.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {bot.modules.map(modId => {
                        const modDef = MODULES_LIST.find(m => m.id === modId);
                        return (
                          <span 
                            key={modId}
                            className="bg-slate-950 border border-purple-500/10 hover:border-purple-500/20 text-[10px] font-mono text-slate-300 px-2 py-1 rounded-md cursor-help"
                            title={modDef?.description}
                          >
                            {modDef?.name.split(" & ")[0] || modId}
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <span className="text-xs font-mono text-slate-500 italic block">No modules routed to this client</span>
                  )}
                </div>

                {/* Bot Details & Error Display */}
                {bot.status === 'error' && bot.error && (
                  <div className="bg-red-950/20 border border-red-500/20 p-3 rounded-xl flex items-start gap-2.5">
                    <ShieldAlert className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5 animate-pulse" />
                    <div className="text-[10px] text-red-300 font-mono leading-relaxed line-clamp-2" title={bot.error}>
                      <span className="font-bold text-red-400">Connection Fault:</span> {bot.error}
                    </div>
                  </div>
                )}

                {/* Per-bot Sync / Reboot / Trash Controls */}
                <div className="border-t border-purple-500/5 pt-4">
                  {isConfirmingDelete ? (
                    <div className="bg-red-950/20 border border-red-500/20 p-3 rounded-2xl flex flex-col gap-2 animate-fade-in text-left">
                      <span className="text-[10px] text-red-200">
                        Confirm decommissioning of this client? Active event logs will halt.
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmUnlinkBotId(null)}
                          className="flex-1 px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[10px] text-slate-300 rounded-lg transition-all cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={isUnlinking}
                          onClick={() => handleUnlink(bot.id)}
                          className="flex-1 px-2.5 py-1.5 bg-red-600 hover:bg-red-500 text-[10px] font-bold text-white rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1"
                        >
                          {isUnlinking ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                          Terminate
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-2">
                      <button
                        type="button"
                        disabled={isSyncing || isRebooting || isUnlinking}
                        onClick={() => handleSyncCommands(bot.id)}
                        className="px-2 py-2 bg-slate-950 hover:bg-slate-900 border border-purple-500/10 hover:border-purple-500/30 text-[10px] font-bold text-slate-300 hover:text-white rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50"
                        title="Publish system slash commands on this token"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 text-purple-400 ${isSyncing ? 'animate-spin' : ''}`} />
                      </button>
                      
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(bot)}
                        className="px-2 py-2 bg-slate-950 hover:bg-slate-900 border border-purple-500/10 hover:border-purple-500/30 text-[10px] font-bold text-purple-400 hover:text-white rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50"
                        title="Edit bot modules"
                      >
                        <Sliders className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        disabled={isSyncing || isRebooting || isUnlinking}
                        onClick={() => handleReboot(bot.id)}
                        className="px-2 py-2 bg-slate-950 hover:bg-slate-900 border border-purple-500/10 hover:border-purple-500/30 text-[10px] font-bold text-slate-300 hover:text-white rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50"
                        title="Perform immediate warm boot on this token"
                      >
                        <Power className={`w-3.5 h-3.5 text-green-400 ${isRebooting ? 'animate-spin' : ''}`} />
                      </button>

                      <button
                        type="button"
                        disabled={isSyncing || isRebooting || isUnlinking}
                        onClick={() => setConfirmUnlinkBotId(bot.id)}
                        className="px-2 py-2 bg-red-950/10 hover:bg-red-950/30 border border-red-500/10 hover:border-red-500/30 text-[10px] font-bold text-red-400 hover:text-red-300 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50"
                        title="Disconnect and remove this token"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Empty Slot Card Actions */}
          {Array.from({ length: emptySlotsCount }).map((_, slotIdx) => {
            const absoluteSlotNo = bots.length + slotIdx + 1;
            return (
              <div 
                key={`empty-slot-${slotIdx}`}
                className="border-2 border-dashed border-purple-500/20 hover:border-purple-500/45 bg-slate-900/5 hover:bg-slate-900/10 rounded-3xl p-6 flex flex-col items-center justify-center text-center space-y-4 min-h-[250px] transition-all cursor-pointer hover:shadow-lg hover:shadow-purple-500/5 active:scale-98 group"
                onClick={handleOpenAddModal}
              >
                <div className="w-12 h-12 rounded-full border-2 border-dashed border-purple-500/20 group-hover:border-purple-500/40 flex items-center justify-center text-purple-400 group-hover:scale-110 transition-all">
                  <Plus className="w-6 h-6 text-purple-400" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-bold text-slate-300 text-sm font-display group-hover:text-white transition-colors">Empty Slot #{absoluteSlotNo}</h4>
                  <p className="text-xs text-slate-500 font-sans max-w-[200px] leading-relaxed mx-auto">
                    Configure a new custom bot token to route modular server functionalities.
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Edit Modules Modal */}
      {isEditModalOpen && botToEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-fade-in overflow-y-auto">
          <div className="relative w-full max-w-xl bg-slate-900 border border-purple-500/20 rounded-3xl p-6 md:p-8 shadow-2xl space-y-6 my-8 max-h-[90vh] overflow-y-auto">
            
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-purple-500/10 pb-4">
              <div className="space-y-1">
                <h3 className="text-xl font-black text-white font-display tracking-tight flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-purple-400" />
                  Edit Bot Modules: {botToEdit.username}
                </h3>
                <p className="text-xs text-slate-400">Update module assignments for this bot instance.</p>
              </div>
              <button 
                onClick={() => setIsEditModalOpen(false)}
                className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Token Inputs */}
            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block flex items-center gap-2">
                <Key className="w-4 h-4 text-purple-400" />
                Update Discord Bot Token (Leave blank to keep current)
              </label>
              <div className="relative">
                <input
                  type={showNewToken ? "text" : "password"}
                  value={newToken}
                  onChange={(e) => setNewToken(e.target.value)}
                  placeholder="Enter new token if needed"
                  className="w-full bg-slate-950 border border-purple-500/15 rounded-2xl py-4 pl-4 pr-12 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/50 transition-all focus:ring-1 focus:ring-purple-500/10"
                />
                <button
                  type="button"
                  onClick={() => setShowNewToken(!showNewToken)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                >
                  {showNewToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Module Routing Matrix (Checkboxes) */}
            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block flex items-center gap-2">
                <Sliders className="w-4 h-4 text-purple-400" />
                Module Routing Matrix
              </label>

              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                {MODULES_LIST.map((mod) => {
                  const owners = getModuleOwners(mod.id).filter(b => b.id !== botToEdit.id);
                  const isChecked = selectedModules.includes(mod.id);

                  return (
                    <div 
                      key={mod.id}
                      onClick={() => handleToggleModule(mod.id)}
                      className={`p-3.5 rounded-2xl border transition-all text-left flex items-start gap-3.5 select-none ${
                        isChecked ? 'bg-purple-950/15 border-purple-500/30 cursor-pointer' :
                        'bg-slate-950/40 border-purple-500/5 hover:border-purple-500/15 cursor-pointer'
                      }`}
                    >
                      {/* Checkbox box */}
                      <div className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-all ${
                        isChecked ? 'bg-purple-500 border-purple-400 text-white' :
                        'bg-slate-950 border-purple-500/10'
                      }`}>
                        {isChecked && <Check className="w-3.5 h-3.5 font-black" />}
                      </div>

                      {/* Title & Description */}
                      <div className="space-y-1">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5">
                          <span className="text-xs font-bold text-white">{mod.name}</span>
                          {owners.length > 0 && (
                            <span className="text-[9px] font-mono font-bold bg-purple-500/10 border border-purple-500/20 text-purple-300 px-2 py-0.5 rounded-md uppercase tracking-wider">
                              Active on: {owners.map(o => o.username).join(", ")}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 leading-relaxed font-sans">{mod.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-purple-500/10">
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="px-5 py-3 bg-slate-950 hover:bg-slate-900 border border-purple-500/10 hover:border-purple-500/20 text-xs font-bold text-slate-300 hover:text-white rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (newToken.trim()) await handleUpdateToken();
                  await handleUpdateModules();
                }}
                disabled={updatingModulesBots[botToEdit.id]}
                className="px-6 py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-md active:scale-98 cursor-pointer"
              >
                {updatingModulesBots[botToEdit.id] ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    Save Changes
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Custom Bot Modal Wrapper */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-fade-in overflow-y-auto">
          <div className="relative w-full max-w-xl bg-slate-900 border border-purple-500/20 rounded-3xl p-6 md:p-8 shadow-2xl space-y-6 my-8 max-h-[90vh] overflow-y-auto">
            
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-purple-500/10 pb-4">
              <div className="space-y-1">
                <h3 className="text-xl font-black text-white font-display tracking-tight flex items-center gap-2">
                  <Server className="w-5 h-5 text-purple-400" />
                  Deploy Custom Bot Instance
                </h3>
                <p className="text-xs text-slate-400">Add client secret token and map module pathways.</p>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Token Inputs */}
            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block flex items-center gap-2">
                <Key className="w-4 h-4 text-purple-400" />
                Discord Bot Token
              </label>
              <div className="relative">
                <input
                  type={showToken ? "text" : "password"}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Paste your secret bot token here (MTk4MDUz...)"
                  className="w-full bg-slate-950 border border-purple-500/15 rounded-2xl py-4 pl-4 pr-12 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/50 transition-all focus:ring-1 focus:ring-purple-500/10"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                >
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Module Routing Matrix (Checkboxes) */}
            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block flex items-center gap-2">
                <Sliders className="w-4 h-4 text-purple-400" />
                Module Routing Matrix
              </label>

              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                {MODULES_LIST.map((mod) => {
                  const owners = getModuleOwners(mod.id);
                  const isChecked = selectedModules.includes(mod.id);

                  return (
                    <div 
                      key={mod.id}
                      onClick={() => handleToggleModule(mod.id)}
                      className={`p-3.5 rounded-2xl border transition-all text-left flex items-start gap-3.5 select-none ${
                        isChecked ? 'bg-purple-950/15 border-purple-500/30 cursor-pointer' :
                        'bg-slate-950/40 border-purple-500/5 hover:border-purple-500/15 cursor-pointer'
                      }`}
                    >
                      {/* Checkbox box */}
                      <div className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-all ${
                        isChecked ? 'bg-purple-500 border-purple-400 text-white' :
                        'bg-slate-950 border-purple-500/10'
                      }`}>
                        {isChecked && <Check className="w-3.5 h-3.5 font-black" />}
                      </div>

                      {/* Title & Description */}
                      <div className="space-y-1">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5">
                          <span className="text-xs font-bold text-white">{mod.name}</span>
                          {owners.length > 0 && (
                            <span className="text-[9px] font-mono font-bold bg-purple-500/10 border border-purple-500/20 text-purple-300 px-2 py-0.5 rounded-md uppercase tracking-wider">
                              Active on: {owners.map(o => o.username).join(", ")}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 leading-relaxed font-sans">{mod.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-purple-500/10">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-5 py-3 bg-slate-950 hover:bg-slate-900 border border-purple-500/10 hover:border-purple-500/20 text-xs font-bold text-slate-300 hover:text-white rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleActivate}
                disabled={isActivating || selectedModules.length === 0}
                className="px-6 py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-md active:scale-98 cursor-pointer"
              >
                {isActivating ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Deploying...
                  </>
                ) : (
                  <>
                    <Bot className="w-3.5 h-3.5" />
                    Deploy Instance
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
