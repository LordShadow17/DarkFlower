import React, { useState } from "react";
import { Guild } from "../types";
import { Share2, PlusCircle, Send, CheckCircle, Sliders, Play, User, Image, MessageSquare, ToggleLeft, ToggleRight } from "lucide-react";
import { showToast } from "../utils/toast";

interface WebhookPanelProps {
  guild: Guild;
  onUpdateConfig: (config: any) => void;
  onSendWebhookEmbed: (webhookId: string, embed: any) => Promise<any>;
}

const PRESET_AVATARS = [
  { name: "Default Violet", url: "https://api.dicebear.com/7.x/bottts/svg?seed=DarkFlower" },
  { name: "Cyberpunk", url: "https://api.dicebear.com/7.x/bottts-neutral/svg?seed=Cyber" },
  { name: "Wumpus", url: "https://api.dicebear.com/7.x/pixel-art/svg?seed=wumpus" },
  { name: "Neon Skull", url: "https://api.dicebear.com/7.x/identicon/svg?seed=skull" },
  { name: "Cat Admin", url: "https://api.dicebear.com/7.x/pixel-art/svg?seed=kitty" }
];

export default function WebhookPanel({ guild, onUpdateConfig, onSendWebhookEmbed }: WebhookPanelProps) {
  const { config } = guild;

  // New Webhook creation states
  const [newWhName, setNewWhName] = useState("");
  const [newWhChannel, setNewWhChannel] = useState(guild.channels[0] || "#general");

  // Active customizer states
  const [selectedWebhookId, setSelectedWebhookId] = useState(config.webhooks.length ? config.webhooks[0].id : "");
  
  // Custom sender and message states
  const [customName, setCustomName] = useState("");
  const [customAvatar, setCustomAvatar] = useState("");
  const [content, setContent] = useState("Greetings from our custom webhook! 🌸 You can modify my name, avatar, and message content live.");
  const [enableEmbed, setEnableEmbed] = useState(true);

  // Embed specific states
  const [embedTitle, setEmbedTitle] = useState("🚀 Automatic Server Alert");
  const [embedDesc, setEmbedDesc] = useState("A new patch deployment has completed successfully on the main server branch. All routes online!");
  const [embedColor, setEmbedColor] = useState("#8b5cf6");
  const [footerText, setFooterText] = useState("Powered by DarkFlower Webhook Automation Engine");
  const [fieldName, setFieldName] = useState("Deploy Status");
  const [fieldValue, setFieldValue] = useState("✅ Healthy (100% operational)");

  const [loading, setLoading] = useState(false);

  const selectedWebhook = config.webhooks.find(w => w.id === selectedWebhookId);

  const handleCreateWebhook = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWhName.trim()) return;

    const newWh = {
      id: `wh-${Date.now()}`,
      name: newWhName.trim(),
      url: `https://discord.com/api/webhooks/${Math.floor(Math.random() * 900000)}/generated_secret`,
      channel: newWhChannel
    };

    onUpdateConfig({
      webhooks: [...config.webhooks, newWh]
    });

    setNewWhName("");
    setSelectedWebhookId(newWh.id);
    showToast(`Webhook "${newWh.name}" successfully generated in ${newWh.channel}!`, "success");
  };

  const handleSendWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWebhookId) {
      showToast("Please create or select a webhook first.", "warning");
      return;
    }
    setLoading(true);

    const payload = {
      webhookId: selectedWebhookId,
      customName: customName.trim() || selectedWebhook?.name || "DarkFlower Webhook",
      customAvatar: customAvatar.trim() || "https://api.dicebear.com/7.x/bottts/svg?seed=DarkFlower",
      content: content.trim(),
      title: enableEmbed ? embedTitle : "",
      description: enableEmbed ? embedDesc : "",
      color: enableEmbed ? embedColor : "",
      fields: enableEmbed ? [{ name: fieldName, value: fieldValue }] : [],
      footer: enableEmbed ? footerText : ""
    };

    try {
      await onSendWebhookEmbed(selectedWebhookId, payload);
      showToast(`Customized webhook sent successfully to ${selectedWebhook?.channel}! Check Server Logs Feed to see transaction.`, "success");
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Derived preview values
  const previewSenderName = customName.trim() || selectedWebhook?.name || "DarkFlower Webhook";
  const previewAvatarUrl = customAvatar.trim() || "https://api.dicebear.com/7.x/bottts/svg?seed=DarkFlower";

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 animate-fade-in" id="webhook_panel_root">
      
      {/* Left Column: List Webhooks & Create Form */}
      <div className="space-y-6">
        
        {/* Create Webhook Form */}
        <div className="glass-panel p-5 rounded-2xl border border-purple-500/10 space-y-4 shadow-xl" id="create_webhook_panel">
          <div className="flex items-center gap-2 border-b border-purple-500/10 pb-3">
            <Share2 className="w-5 h-5 text-purple-400" />
            <h4 className="text-base font-bold text-white font-display">Webhook Integrations</h4>
          </div>

          <form onSubmit={handleCreateWebhook} className="space-y-3.5">
            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1">Webhook Name</label>
              <input
                type="text"
                placeholder="e.g. GitHub Alert, Backup Status"
                value={newWhName}
                onChange={(e) => setNewWhName(e.target.value)}
                className="w-full bg-slate-950 border border-purple-500/20 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-purple-500/40"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1">Route to Channel</label>
              <select
                value={newWhChannel}
                onChange={(e) => setNewWhChannel(e.target.value)}
                className="w-full bg-slate-950 border border-purple-500/20 rounded-xl px-3 py-2 text-xs text-white outline-none cursor-pointer"
              >
                {guild.channels.map(chan => (
                  <option key={chan} value={chan}>{chan}</option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              className="w-full bg-purple-600 hover:bg-purple-500 text-white font-semibold py-2 rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1 shadow"
            >
              <PlusCircle className="w-4 h-4" /> Create Automated Webhook
            </button>
          </form>
        </div>

        {/* Existing Webhooks List */}
        <div className="glass-panel p-5 rounded-2xl border border-purple-500/10 space-y-3 shadow-xl" id="existing_webhooks_panel">
          <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400">Active Server Webhooks</h5>
          
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {config.webhooks.length ? (
              config.webhooks.map((wh) => (
                <div
                  key={wh.id}
                  onClick={() => setSelectedWebhookId(wh.id)}
                  className={`p-3 rounded-xl border cursor-pointer transition ${
                    selectedWebhookId === wh.id
                      ? "bg-purple-500/10 border-purple-500/35"
                      : "bg-slate-950/20 border-purple-500/5 hover:bg-purple-500/5 hover:border-purple-500/15"
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-white">{wh.name}</span>
                    <span className="text-[10px] bg-purple-950/40 text-purple-400 border border-purple-500/25 px-2 py-0.5 rounded-full font-mono">{wh.channel}</span>
                  </div>
                  <span className="text-[9px] font-mono text-slate-500 truncate block mt-1">{wh.url}</span>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-500 italic p-1">No custom webhooks generated yet.</p>
            )}
          </div>
        </div>
      </div>

      {/* Right Column (2 spans): Customizer & Real-time Preview */}
      <div className="xl:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6" id="webhook_designer_section">
        
        {/* Webhook Customizer fields */}
        <div className="space-y-6">
          
          {/* Sender Settings & Text Content */}
          <div className="glass-panel p-5 rounded-2xl border border-purple-500/10 space-y-4 shadow-xl" id="sender_profile_customizer">
            <div className="flex items-center gap-2 border-b border-purple-500/10 pb-3">
              <User className="w-5 h-5 text-purple-400" />
              <h4 className="text-base font-bold text-white font-display">Sender Profile & Message</h4>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">Target Webhook</label>
                <select
                  value={selectedWebhookId}
                  onChange={(e) => setSelectedWebhookId(e.target.value)}
                  className="w-full bg-slate-950 border border-purple-500/20 rounded-xl px-3 py-2 text-xs text-white outline-none cursor-pointer"
                >
                  <option value="">-- Select Webhook --</option>
                  {config.webhooks.map(w => (
                    <option key={w.id} value={w.id}>{w.name} ({w.channel})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">Custom Display Name</label>
                  <input
                    type="text"
                    placeholder={selectedWebhook ? `${selectedWebhook.name} (Default)` : "e.g. GitBot"}
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    className="w-full bg-slate-950 border border-purple-500/15 focus:border-purple-500/40 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none transition"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">Custom Avatar URL</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="https://example.com/avatar.png"
                      value={customAvatar}
                      onChange={(e) => setCustomAvatar(e.target.value)}
                      className="flex-1 bg-slate-950 border border-purple-500/15 focus:border-purple-500/40 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none transition"
                    />
                    {customAvatar && (
                      <button
                        type="button"
                        onClick={() => setCustomAvatar("")}
                        className="text-xs bg-slate-800 text-slate-300 px-2.5 py-1 rounded-xl hover:bg-slate-700 transition"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Avatar presets selector */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">Avatar Quick Presets</label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_AVATARS.map((p, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setCustomAvatar(p.url)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] transition ${
                        customAvatar === p.url
                          ? "bg-purple-500/25 border-purple-500 text-white"
                          : "bg-slate-950/40 border-purple-500/5 text-slate-400 hover:bg-slate-950 hover:border-purple-500/20"
                      }`}
                    >
                      <img
                        src={p.url}
                        alt={p.name}
                        className="w-4.5 h-4.5 rounded-full object-cover bg-slate-900 border border-white/10"
                        referrerPolicy="no-referrer"
                      />
                      <span>{p.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">Message Body Content</label>
                <textarea
                  rows={3}
                  placeholder="Enter the main text message to be sent..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full bg-slate-950 border border-purple-500/15 focus:border-purple-500/40 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 outline-none transition resize-none"
                />
              </div>

              {/* Toggle Embed Option */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/20 border border-purple-500/5">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-purple-400" />
                  <div>
                    <span className="text-xs font-semibold text-white block">Attach Rich Embed Card</span>
                    <span className="text-[10px] text-slate-500">Enable to attach a stylized Discord embed block.</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEnableEmbed(!enableEmbed)}
                  className="text-purple-400 hover:text-purple-300 transition"
                >
                  {enableEmbed ? (
                    <ToggleRight className="w-8 h-8 text-purple-500" />
                  ) : (
                    <ToggleLeft className="w-8 h-8 text-slate-600" />
                  )}
                </button>
              </div>

            </div>
          </div>

          {/* Optional Rich Embed Designer fields */}
          {enableEmbed && (
            <div className="glass-panel p-5 rounded-2xl border border-purple-500/10 space-y-4 shadow-xl animate-fade-in" id="rich_embed_designer">
              <div className="flex items-center gap-2 border-b border-purple-500/10 pb-3">
                <Sliders className="w-5 h-5 text-purple-400" />
                <h4 className="text-base font-bold text-white font-display">Rich Embed Customization</h4>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-semibold text-slate-400 block mb-1">Embed Title</label>
                    <input
                      type="text"
                      value={embedTitle}
                      onChange={(e) => setEmbedTitle(e.target.value)}
                      className="w-full bg-slate-950 border border-purple-500/15 focus:border-purple-500/40 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none transition"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-400 block mb-1">Border Accent Color</label>
                    <input
                      type="color"
                      value={embedColor}
                      onChange={(e) => setEmbedColor(e.target.value)}
                      className="w-full h-8 bg-slate-950 border border-purple-500/15 rounded-xl px-2 py-0.5 outline-none cursor-pointer"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">Embed Description</label>
                  <textarea
                    rows={2}
                    value={embedDesc}
                    onChange={(e) => setEmbedDesc(e.target.value)}
                    className="w-full bg-slate-950 border border-purple-500/15 focus:border-purple-500/40 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none transition resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-semibold text-slate-400 block mb-1">Field Key</label>
                    <input
                      type="text"
                      value={fieldName}
                      onChange={(e) => setFieldName(e.target.value)}
                      className="w-full bg-slate-950 border border-purple-500/15 focus:border-purple-500/40 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none transition"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-400 block mb-1">Field Value</label>
                    <input
                      type="text"
                      value={fieldValue}
                      onChange={(e) => setFieldValue(e.target.value)}
                      className="w-full bg-slate-950 border border-purple-500/15 focus:border-purple-500/40 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">Embed Footer Text</label>
                  <input
                    type="text"
                    value={footerText}
                    onChange={(e) => setFooterText(e.target.value)}
                    className="w-full bg-slate-950 border border-purple-500/15 focus:border-purple-500/40 rounded-xl px-3 py-1.5 text-xs text-[#949ba4] placeholder-slate-500 outline-none transition"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Send Webhook Button */}
          <button
            type="button"
            onClick={handleSendWebhook}
            disabled={loading || !selectedWebhookId || (!content.trim() && !enableEmbed)}
            className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold py-3 rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-xl"
          >
            <Send className="w-4 h-4" /> {loading ? "Dispersing Payload..." : "Send Custom Webhook Message"}
          </button>

        </div>

        {/* Discord Chat Style Live Preview */}
        <div className="bg-[#111214] p-5 rounded-2xl border border-[#2b2d31] shadow-2xl space-y-4 flex flex-col justify-start h-fit" id="discord_chat_preview">
          <div className="flex items-center justify-between text-[#949ba4] text-[9px] font-bold font-mono border-b border-[#2b2d31] pb-2">
            <span>DISCORD WEBHOOK SIMULATOR PREVIEW</span>
            <span className="text-purple-400">DESTINATION: {selectedWebhook ? selectedWebhook.channel : "#general"}</span>
          </div>

          {/* Discord Message Shell */}
          <div className="flex gap-4 items-start py-1">
            
            {/* Avatar */}
            <div className="relative shrink-0">
              <img
                src={previewAvatarUrl}
                alt={previewSenderName}
                className="w-10 h-10 rounded-full object-cover bg-slate-800 border border-white/5 shadow"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  // Fallback avatar if url is broken
                  e.currentTarget.src = "https://api.dicebear.com/7.x/bottts/svg?seed=fallback";
                }}
              />
            </div>

            {/* Message Right Panel */}
            <div className="flex-1 space-y-1 overflow-hidden">
              <div className="flex items-center gap-2">
                <span className="text-white text-sm font-semibold hover:underline cursor-pointer">
                  {previewSenderName}
                </span>
                <span className="text-[9px] bg-[#5865f2] text-white px-1 py-0.5 rounded font-bold uppercase tracking-wider font-sans leading-none flex items-center">
                  BOT
                </span>
                <span className="text-[10px] text-[#949ba4] font-medium ml-1">
                  Today at {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              {/* Message Content Body */}
              {content.trim() ? (
                <p className="text-[#dbdee1] text-[13px] whitespace-pre-wrap leading-relaxed break-words font-sans">
                  {content}
                </p>
              ) : (
                <p className="text-[#949ba4] text-[12px] italic">
                  No text body message.
                </p>
              )}

              {/* Embed preview nested under the message */}
              {enableEmbed && (
                <div 
                  className="bg-[#1e1f22] p-4 rounded-lg border-l-4 shadow-md flex flex-col gap-2 mt-2 transition-all max-w-[520px]" 
                  style={{ borderLeftColor: embedColor }}
                >
                  <span className="text-[#c2c5c9] text-[10px] font-bold uppercase tracking-wider">
                    {previewSenderName} Integration
                  </span>
                  {embedTitle && (
                    <h5 className="text-white text-sm font-bold font-display">{embedTitle}</h5>
                  )}
                  {embedDesc && (
                    <p className="text-[#dbdee1] text-xs leading-relaxed whitespace-pre-wrap">{embedDesc}</p>
                  )}

                  {(fieldName || fieldValue) && (
                    <div className="text-xs mt-1 bg-slate-950/20 p-2 rounded border border-white/5">
                      {fieldName && (
                        <span className="text-[#949ba4] block font-semibold text-[11px] mb-0.5">{fieldName}</span>
                      )}
                      {fieldValue && (
                        <span className="text-[#dbdee1] font-mono text-[11px]">{fieldValue}</span>
                      )}
                    </div>
                  )}

                  {footerText && (
                    <span className="text-[10px] text-[#949ba4] border-t border-[#2b2d31] pt-1.5 mt-1.5 block">
                      {footerText}
                    </span>
                  )}
                </div>
              )}
            </div>

          </div>
        </div>

      </div>

    </div>
  );
}
