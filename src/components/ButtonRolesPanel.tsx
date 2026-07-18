import React, { useState } from "react";
import { Guild, ButtonRoleMapping, ButtonRolesMessageConfig } from "../types";
import { Shield, PlusCircle, Trash2, Send, Sliders, Palette, Check, AlertTriangle, HelpCircle } from "lucide-react";
import { showToast } from "../utils/toast";

interface ButtonRolesPanelProps {
  guild: Guild;
  onUpdateGuild: (updatedGuild: Guild) => void;
}

const STYLE_OPTIONS = [
  { value: "primary", label: "Primary (Blue)", colorClass: "bg-[#5865F2] text-white hover:bg-[#4752C4]" },
  { value: "success", label: "Success (Green)", colorClass: "bg-[#248046] text-white hover:bg-[#1a6535]" },
  { value: "danger", label: "Danger (Red)", colorClass: "bg-[#DA373C] text-white hover:bg-[#a92b2f]" },
  { value: "secondary", label: "Secondary (Grey)", colorClass: "bg-[#4F545C] text-white hover:bg-[#3f4248]" }
];

const PRESET_EMOJIS = ["📢", "🎉", "🎮", "💬", "🎨", "🔔", "⭐", "🎵", "👾", "🏆", "🌸", "💍"];

export default function ButtonRolesPanel({ guild, onUpdateGuild }: ButtonRolesPanelProps) {
  const { config } = guild;
  const existingMessages = config.buttonRolesMessages || [];

  // Message Form States
  const [targetChannel, setTargetChannel] = useState(guild.channels[0] || "#general");
  const [messageText, setMessageText] = useState("Greetings! Select your server roles below to toggle access to relevant channels and updates.");
  const [useEmbed, setUseEmbed] = useState(true);
  const [embedTitle, setEmbedTitle] = useState("🌸 Select Server Roles");
  const [embedDescription, setEmbedDescription] = useState("Click on the buttons below to instantly claim your server roles. You can toggle them on or off at any time!");
  const [embedColor, setEmbedColor] = useState("#8b5cf6");
  const [roleMode, setRoleMode] = useState<"single" | "multiple">("multiple");

  // Dynamic Button Rows
  const [buttons, setButtons] = useState<ButtonRoleMapping[]>([
    { id: "btn-1", label: "Announcements", role: "Announcements", style: "primary", emoji: "📢" },
    { id: "btn-2", label: "Events", role: "Events", style: "success", emoji: "🎉" }
  ]);

  const [submitting, setSubmitting] = useState(false);

  // Use real guild roles if available, otherwise fall back to mock default ones
  const availableRoles = guild.roles && guild.roles.length > 0 
    ? guild.roles 
    : Array.from(new Set([
        "Announcements",
        "Events",
        "Update Squad",
        "Bronze Bud",
        "Violet Petal",
        "DarkFlower Elder",
        "VIP",
        "Moderator",
        "Staff",
        "Admin",
        guild.config.supportRole || "Staff"
      ].filter(Boolean)));

  const handleAddButton = () => {
    if (buttons.length >= 25) {
      showToast("You have reached the maximum limit of 25 buttons (5 rows of 5).", "error");
      return;
    }
    const newId = `btn-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const nextRole = availableRoles[buttons.length % availableRoles.length] || "Member";
    
    setButtons([
      ...buttons,
      {
        id: newId,
        label: nextRole,
        role: nextRole,
        style: "secondary",
        emoji: PRESET_EMOJIS[buttons.length % PRESET_EMOJIS.length]
      }
    ]);
    showToast("Added a new button role row!", "info");
  };

  const handleRemoveButton = (id: string) => {
    if (buttons.length <= 1) {
      showToast("You must keep at least one button for the role claim card.", "warning");
      return;
    }
    setButtons(buttons.filter(b => b.id !== id));
  };

  const handleUpdateButtonField = (id: string, field: keyof ButtonRoleMapping, value: any) => {
    setButtons(
      buttons.map(b => (b.id === id ? { ...b, [field]: value } : b))
    );
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim() && (!useEmbed || !embedDescription.trim())) {
      showToast("Please provide message body or embed description content.", "warning");
      return;
    }

    // Verify all buttons have role and label
    const invalidButton = buttons.find(b => !b.label.trim() || !b.role.trim());
    if (invalidButton) {
      showToast("All button rows must have a valid Button Label and Role selected.", "error");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/guilds/${guild.id}/button-roles/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetChannel,
          messageText: messageText.trim(),
          useEmbed,
          embedTitle: useEmbed ? embedTitle.trim() : "",
          embedDescription: useEmbed ? embedDescription.trim() : "",
          embedColor: useEmbed ? embedColor : "",
          roleMode,
          buttons
        })
      });

      if (response.ok) {
        const data = await response.json();
        onUpdateGuild(data.guild);
        
        if (data.warning) {
          showToast(data.warning, "warning");
        } else {
          showToast("Button Roles configuration sent successfully to live Discord server!", "success");
        }
        
        // Reset or scroll
        setMessageText("Greetings! Select your server roles below to toggle access to relevant channels and updates.");
      } else {
        const err = await response.json();
        showToast(err.error || "Failed to publish button roles.", "error");
      }
    } catch (err: any) {
      console.error(err);
      showToast("Network error. Saved mapping simulation instead.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteConfig = async (configId: string) => {
    try {
      const response = await fetch(`/api/guilds/${guild.id}/button-roles/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configId })
      });

      if (response.ok) {
        const data = await response.json();
        onUpdateGuild(data.guild);
        showToast("Button Role configuration removed from logs.", "success");
      } else {
        showToast("Failed to delete button role configuration.", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error deleting configuration.", "error");
    }
  };

  return (
    <div className="space-y-8 animate-fade-in" id="button_roles_manager_root">
      
      {/* Upper Grid: Builder Panel & Discord Mock Preview */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        
        {/* Left Form Column (Builder) */}
        <div className="xl:col-span-7 space-y-6">
          <form onSubmit={handleSendMessage} className="space-y-6">
            
            {/* 1. Message Creation & Target Card */}
            <div className="glass-panel p-5 rounded-2xl border border-purple-500/10 space-y-5 shadow-xl bg-slate-950/45">
              <div className="flex items-center justify-between border-b border-purple-500/10 pb-3">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-purple-400" />
                  <h4 className="text-base font-bold text-white font-display">Button Roles Manager</h4>
                </div>
                <span className="text-[10px] bg-purple-500/15 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider font-mono">Module</span>
              </div>

              {/* Server & Channel Selectors */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1.5">Target Guild</label>
                  <input
                    type="text"
                    disabled
                    value={guild.name}
                    className="w-full bg-slate-900 border border-purple-500/15 rounded-xl px-3.5 py-2.5 text-xs text-slate-400 font-medium outline-none opacity-80"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1.5">Target Text Channel</label>
                  <select
                    value={targetChannel}
                    onChange={(e) => setTargetChannel(e.target.value)}
                    className="w-full bg-slate-950 border border-purple-500/20 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none cursor-pointer focus:border-purple-500/40"
                  >
                    {guild.channels.map(chan => (
                      <option key={chan} value={chan}>{chan}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Message Content Fields */}
              <div className="space-y-4 pt-2">
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-xs font-semibold text-slate-300 block">Message Body Announcement</label>
                    <span className="text-[10px] text-slate-500 font-mono">Standard markdown</span>
                  </div>
                  <textarea
                    rows={2}
                    placeholder="e.g. Please claim your notification roles below..."
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    className="w-full bg-slate-950 border border-purple-500/20 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 outline-none focus:border-purple-500/40 font-sans resize-none"
                  />
                </div>

                {/* Embed Toggler & Embed Options */}
                <div className="border border-purple-500/10 rounded-xl p-4 bg-purple-950/5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold text-white block">Use Embed Message</span>
                      <span className="text-[10px] text-slate-400 block">Wrap message inside a gorgeous Discord rich embed card</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setUseEmbed(!useEmbed)}
                      className={`relative inline-flex h-5.5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        useEmbed ? "bg-purple-600" : "bg-slate-800"
                      }`}
                    >
                      <span className={`pointer-events-none inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        useEmbed ? "translate-x-4.5" : "translate-x-0"
                      }`} />
                    </button>
                  </div>

                  {useEmbed && (
                    <div className="space-y-4 pt-2 border-t border-purple-500/10 animate-fade-in">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="md:col-span-2">
                          <label className="text-xs font-semibold text-slate-400 block mb-1">Embed Title</label>
                          <input
                            type="text"
                            placeholder="Embed Title"
                            value={embedTitle}
                            onChange={(e) => setEmbedTitle(e.target.value)}
                            className="w-full bg-slate-950 border border-purple-500/20 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-purple-500/40"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-slate-400 block mb-1">Embed Color</label>
                          <div className="flex gap-2">
                            <input
                              type="color"
                              value={embedColor}
                              onChange={(e) => setEmbedColor(e.target.value)}
                              className="w-8 h-8 rounded border border-purple-500/20 bg-transparent cursor-pointer shrink-0"
                            />
                            <input
                              type="text"
                              value={embedColor}
                              onChange={(e) => setEmbedColor(e.target.value)}
                              className="w-full bg-slate-950 border border-purple-500/20 rounded-xl px-2 py-1.5 text-xs text-white outline-none font-mono text-center"
                            />
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-semibold text-slate-400 block mb-1">Embed Description</label>
                        <textarea
                          rows={3}
                          placeholder="Embed Description content..."
                          value={embedDescription}
                          onChange={(e) => setEmbedDescription(e.target.value)}
                          className="w-full bg-slate-950 border border-purple-500/20 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-purple-500/40 font-sans resize-none"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Role Mode Selector */}
                <div className="pt-2">
                  <label className="text-xs font-semibold text-slate-400 block mb-2">Role Assignment Mode</label>
                  <div className="grid grid-cols-2 gap-3 bg-slate-950 p-1 rounded-xl border border-purple-500/10">
                    <button
                      type="button"
                      onClick={() => setRoleMode("single")}
                      className={`py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                        roleMode === "single"
                          ? "bg-purple-600 text-white shadow-md"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      <Sliders className="w-3.5 h-3.5" /> Single Choice (Radio)
                    </button>
                    <button
                      type="button"
                      onClick={() => setRoleMode("multiple")}
                      className={`py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                        roleMode === "multiple"
                          ? "bg-purple-600 text-white shadow-md"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" /> Multiple Choice (Toggle)
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-2 italic px-1">
                    {roleMode === "single" 
                      ? "ℹ️ Users can only claim one role from this list. Picking a new role automatically strips previous role." 
                      : "ℹ️ Users can select/toggle multiple roles at once by clicking separate buttons."}
                  </p>
                </div>

              </div>
            </div>

            {/* 2. Button Configuration Card */}
            <div className="glass-panel p-5 rounded-2xl border border-purple-500/10 space-y-4 shadow-xl bg-slate-950/45">
              <div className="flex items-center justify-between border-b border-purple-500/10 pb-3">
                <div className="flex items-center gap-2">
                  <Palette className="w-5 h-5 text-purple-400" />
                  <h4 className="text-base font-bold text-white font-display">Button Configurations</h4>
                </div>
                <span className="text-xs text-purple-400 font-bold font-mono">{buttons.length} / 25</span>
              </div>

              {/* Dynamic Rows list */}
              <div className="space-y-3.5 max-h-[400px] overflow-y-auto pr-1">
                {buttons.map((btn, index) => (
                  <div
                    key={btn.id}
                    className="p-3.5 rounded-xl border border-purple-500/10 bg-slate-900/60 flex flex-col md:flex-row items-stretch md:items-center gap-3 relative"
                  >
                    {/* Index marker */}
                    <span className="absolute -left-2 top-1/2 -translate-y-1/2 bg-purple-900/40 border border-purple-500/20 text-purple-300 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold font-mono">
                      {index + 1}
                    </span>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-2 flex-1 pl-4 md:pl-2">
                      {/* Label Input */}
                      <div className="md:col-span-3">
                        <label className="text-[10px] font-semibold text-slate-500 block mb-1">Button Label</label>
                        <input
                          type="text"
                          placeholder="Announcements"
                          value={btn.label}
                          onChange={(e) => handleUpdateButtonField(btn.id, "label", e.target.value)}
                          maxLength={32}
                          className="w-full bg-slate-950 border border-purple-500/15 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-600 outline-none focus:border-purple-500/35"
                        />
                      </div>

                      {/* Role Dropdown */}
                      <div className="md:col-span-3">
                        <label className="text-[10px] font-semibold text-slate-500 block mb-1">Assigns Role</label>
                        <select
                          value={btn.role}
                          onChange={(e) => handleUpdateButtonField(btn.id, "role", e.target.value)}
                          className="w-full bg-slate-950 border border-purple-500/15 rounded-lg px-2 py-1.5 text-xs text-white outline-none cursor-pointer"
                        >
                          {availableRoles.map(r => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      </div>

                      {/* Visual Style */}
                      <div className="md:col-span-3">
                        <label className="text-[10px] font-semibold text-slate-500 block mb-1">Style</label>
                        <select
                          value={btn.style}
                          onChange={(e) => handleUpdateButtonField(btn.id, "style", e.target.value)}
                          className="w-full bg-slate-950 border border-purple-500/15 rounded-lg px-2 py-1.5 text-xs text-white outline-none cursor-pointer"
                        >
                          {STYLE_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>

                      {/* Emoji Selector */}
                      <div className="md:col-span-3">
                        <label className="text-[10px] font-semibold text-slate-500 block mb-1">Emoji (Optional)</label>
                        <div className="flex gap-1">
                          <input
                            type="text"
                            placeholder="🎉"
                            value={btn.emoji || ""}
                            onChange={(e) => handleUpdateButtonField(btn.id, "emoji", e.target.value)}
                            maxLength={8}
                            className="w-full bg-slate-950 border border-purple-500/15 rounded-lg px-2 py-1.5 text-xs text-white placeholder-slate-600 outline-none focus:border-purple-500/35 text-center font-mono"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Delete Icon */}
                    <button
                      type="button"
                      onClick={() => handleRemoveButton(btn.id)}
                      className="text-slate-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/5 transition cursor-pointer self-end md:self-center shrink-0"
                      title="Remove Button"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Action Button: Add Another Button */}
              <button
                type="button"
                onClick={handleAddButton}
                className="w-full bg-[#1b152d]/80 hover:bg-[#251e3e] text-purple-300 font-bold py-2.5 rounded-xl text-xs transition border border-purple-500/20 flex items-center justify-center gap-1.5 cursor-pointer hover:scale-[1.01]"
              >
                <PlusCircle className="w-4 h-4" /> + Add Another Button Row
              </button>
            </div>

            {/* Execution Submit Button */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-purple-600 hover:bg-purple-500 text-white font-extrabold py-3.5 rounded-2xl text-xs transition shadow-lg shadow-purple-600/15 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Send className="w-4.5 h-4.5" /> {submitting ? "Sending Announcement..." : "Send Message to Server"}
            </button>

          </form>
        </div>

        {/* Right Preview Column (Discord Message Mockup) */}
        <div className="xl:col-span-5 space-y-6">
          
          {/* Mock Preview Window */}
          <div className="glass-panel p-5 rounded-2xl border border-purple-500/10 space-y-3 shadow-xl bg-slate-950/45 sticky top-6">
            <div className="flex items-center gap-2 border-b border-purple-500/10 pb-2.5 mb-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <h5 className="text-xs font-bold uppercase tracking-wider text-slate-300">Live Discord Layout Preview</h5>
            </div>

            {/* Discord UI Shell Container */}
            <div className="bg-[#313338] rounded-xl p-4 text-slate-100 font-sans text-[13px] border border-black/40 shadow-inner leading-relaxed select-none">
              <div className="flex gap-3">
                {/* Bot Avatar */}
                <img
                  src="https://api.dicebear.com/7.x/pixel-art/svg?seed=DarkFlower"
                  className="w-10 h-10 rounded-full bg-purple-950 border border-purple-500/20 shrink-0"
                  alt="Bot Avatar"
                />

                {/* Message Body */}
                <div className="space-y-2.5 min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-white text-[14px]">DarkFlower</span>
                    <span className="bg-[#5865F2] text-white text-[9px] font-extrabold px-1 py-0.5 rounded uppercase tracking-wider">BOT</span>
                    <span className="text-[10px] text-slate-400 font-medium">Today at {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>

                  {/* Message plain text if any */}
                  {messageText.trim() && (
                    <div className="text-[#dbdee1] whitespace-pre-wrap">{messageText}</div>
                  )}

                  {/* Embed Design */}
                  {useEmbed && (
                    <div
                      className="border-l-4 rounded bg-[#2b2d31] p-3.5 space-y-2 max-w-full"
                      style={{ borderLeftColor: embedColor || "#8b5cf6" }}
                    >
                      {embedTitle.trim() && (
                        <div className="font-bold text-white text-[15px]">{embedTitle}</div>
                      )}
                      {embedDescription.trim() && (
                        <div className="text-[#dbdee1] text-[13px] whitespace-pre-wrap">{embedDescription}</div>
                      )}
                    </div>
                  )}

                  {/* Button Components Layout Grid */}
                  {buttons.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-2">
                      {buttons.map((btn) => {
                        const styleOpt = STYLE_OPTIONS.find(opt => opt.value === btn.style) || STYLE_OPTIONS[3];
                        return (
                          <div
                            key={btn.id}
                            className={`px-4 py-1.5 rounded-sm font-semibold text-[13px] flex items-center gap-1.5 select-none transition shadow-sm ${styleOpt.colorClass}`}
                          >
                            {btn.emoji && <span className="font-mono">{btn.emoji}</span>}
                            <span>{btn.label || "Unnamed"}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                </div>
              </div>
            </div>

            <div className="text-[10px] text-slate-500 flex items-center gap-1.5 bg-purple-950/20 p-2.5 rounded-lg border border-purple-500/5 mt-1.5">
              <HelpCircle className="w-4 h-4 text-purple-400 shrink-0" />
              <span>Roles will be dynamically assigned/toggled ephemerally on live click, powered by our native Gateway websocket sync.</span>
            </div>
          </div>

        </div>

      </div>

      {/* Lower Card: Active Button Roles Configurations Log */}
      <div className="glass-panel p-5 rounded-2xl border border-purple-500/10 space-y-4 shadow-xl bg-slate-950/45">
        <div className="flex items-center gap-2 border-b border-purple-500/10 pb-3">
          <Shield className="w-5 h-5 text-purple-400" />
          <h4 className="text-base font-bold text-white font-display">Active Button Roles Placed</h4>
        </div>

        {existingMessages.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {existingMessages.map((msg: ButtonRolesMessageConfig) => (
              <div
                key={msg.id}
                className="p-4 rounded-xl border border-purple-500/10 bg-slate-900/40 space-y-3 relative overflow-hidden"
              >
                <button
                  onClick={() => handleDeleteConfig(msg.id)}
                  className="absolute top-3.5 right-3.5 text-slate-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/5 transition cursor-pointer"
                  title="Remove Configuration Log"
                >
                  <Trash2 className="w-4 h-4" />
                </button>

                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white">
                      {msg.useEmbed ? msg.embedTitle : "Plain Announcement"}
                    </span>
                    <span className="text-[9px] bg-purple-950/60 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded-full font-mono">
                      {msg.targetChannel}
                    </span>
                  </div>
                  <span className="text-[9px] text-slate-500 font-mono block">ID: {msg.id}</span>
                </div>

                <p className="text-[11px] text-slate-400 line-clamp-2 italic leading-relaxed">
                  "{msg.useEmbed ? msg.embedDescription : msg.messageText}"
                </p>

                <div className="pt-2 border-t border-purple-500/5 flex items-center justify-between">
                  <div className="flex flex-wrap gap-1 max-w-[70%]">
                    {msg.buttons.map(b => (
                      <span
                        key={b.id}
                        className="text-[9px] bg-slate-950 text-purple-300 border border-purple-500/10 px-2 py-0.5 rounded font-mono font-medium"
                      >
                        {b.emoji ? `${b.emoji} ` : ""}{b.label} ({b.role})
                      </span>
                    ))}
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono font-bold capitalize">
                    Mode: {msg.roleMode}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center space-y-2">
            <AlertTriangle className="w-8 h-8 text-purple-400/40 mx-auto" />
            <p className="text-xs text-slate-400 italic">No Button Roles configurations sent yet in this server. Use the builder above to deploy your first button role announcer!</p>
          </div>
        )}
      </div>

    </div>
  );
}
