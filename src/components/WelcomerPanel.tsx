import React, { useState } from "react";
import { Guild } from "../types";
import { Image, Volume2, Sparkles, AlertCircle } from "lucide-react";
import { showToast } from "../utils/toast";

interface WelcomerPanelProps {
  guild: Guild;
  onUpdateConfig: (config: any) => void;
}

export default function WelcomerPanel({ guild, onUpdateConfig }: WelcomerPanelProps) {
  const { config } = guild;

  // Local settings states
  const [welcomeChannel, setWelcomeChannel] = useState(config.welcomeChannel || "#welcome");
  const [welcomeMessage, setWelcomeMessage] = useState(config.welcomeMessage || "Welcome to our server, {user}! Have a blast! 🌸");
  const [cardBg, setCardBg] = useState(config.welcomeCard || "cosmic");

  // Autosave states
  const [autosave, setAutosave] = useState(true);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  const triggerAutosave = (updatedFields: any) => {
    if (!autosave) return;
    setSaveStatus("saving");
    onUpdateConfig({
      welcomeChannel,
      welcomeMessage,
      welcomeCard: cardBg,
      ...updatedFields
    });
    setTimeout(() => {
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 1500);
    }, 400);
  };

  // Parser for server tags
  const getParsedWelcomeMessage = () => {
    return welcomeMessage
      .replace(/{user}/g, "@PressTV")
      .replace(/{server}/g, guild.name);
  };

  const handleSaveSettings = () => {
    onUpdateConfig({
      welcomeChannel,
      welcomeMessage,
      welcomeCard: cardBg
    });
    showToast("Welcomer banner configurations and routes saved!", "success");
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 animate-fade-in">
      
      {/* Left Configuration Column */}
      <div className="space-y-6">
        <div className="glass-panel p-5 rounded-2xl border border-purple-500/10 space-y-4 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-purple-500/10 pb-3 gap-3">
            <div className="flex items-center gap-2">
              <Volume2 className="w-5 h-5 text-purple-400" />
              <h4 className="text-base font-bold text-white font-display">Welcomer Engine</h4>
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
            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1">Target Welcomer Channel</label>
              <select
                value={welcomeChannel}
                onChange={(e) => {
                  const val = e.target.value;
                  setWelcomeChannel(val);
                  triggerAutosave({ welcomeChannel: val });
                }}
                className="w-full bg-slate-950 border border-purple-500/20 rounded-xl px-3 py-2 text-xs text-white outline-none"
              >
                {guild.channels.map((chan) => (
                  <option key={chan} value={chan}>{chan}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1">Greeting Text Pattern</label>
              <textarea
                rows={4}
                value={welcomeMessage}
                onChange={(e) => {
                  const val = e.target.value;
                  setWelcomeMessage(val);
                  triggerAutosave({ welcomeMessage: val });
                }}
                placeholder="Type greeting pattern here..."
                className="w-full bg-slate-950 border border-purple-500/20 rounded-xl px-3 py-2 text-xs text-white outline-none transition focus:border-purple-500/40"
              />
              <div className="mt-1.5 flex flex-wrap gap-1">
                <span className="text-[9px] bg-purple-950/40 border border-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded font-mono cursor-pointer" onClick={() => {
                  const updated = welcomeMessage + " {user}";
                  setWelcomeMessage(updated);
                  triggerAutosave({ welcomeMessage: updated });
                }}>&#123;user&#125;</span>
                <span className="text-[9px] bg-purple-950/40 border border-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded font-mono cursor-pointer" onClick={() => {
                  const updated = welcomeMessage + " {server}";
                  setWelcomeMessage(updated);
                  triggerAutosave({ welcomeMessage: updated });
                }}>&#123;server&#125;</span>
                <span className="text-[9px] bg-purple-950/40 border border-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded font-mono cursor-pointer" onClick={() => {
                  const updated = welcomeMessage + " {count}";
                  setWelcomeMessage(updated);
                  triggerAutosave({ welcomeMessage: updated });
                }}>&#123;count&#125;</span>
                <span className="text-[9px] bg-purple-950/40 border border-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded font-mono cursor-pointer" onClick={() => {
                  const updated = welcomeMessage + " {avatar}";
                  setWelcomeMessage(updated);
                  triggerAutosave({ welcomeMessage: updated });
                }}>&#123;avatar&#125;</span>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1">Background Banner Style</label>
              <select
                value={cardBg.startsWith("http") ? "custom" : cardBg}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val !== "custom") {
                    setCardBg(val);
                    triggerAutosave({ welcomeCard: val });
                  }
                }}
                className="w-full bg-slate-950 border border-purple-500/20 rounded-xl px-3 py-2 text-xs text-white outline-none"
              >
                <option value="cosmic">Cosmic Dusk (Dark Purple)</option>
                <option value="neon">Neon Grid (Cyber Lotus)</option>
                <option value="floral">Midnight Flora (Dark Flower)</option>
                <option value="custom">Custom Banner Image URL</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1">Custom Banner Image URL</label>
              <input
                type="text"
                placeholder="https://images.unsplash.com/... or other image URL"
                value={cardBg.startsWith("http") ? cardBg : ""}
                onChange={(e) => {
                  const val = e.target.value;
                  setCardBg(val || "cosmic");
                  triggerAutosave({ welcomeCard: val || "cosmic" });
                }}
                className="w-full bg-slate-950 border border-purple-500/20 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 outline-none focus:border-purple-500/40"
              />
              <span className="text-[9px] text-slate-500 block mt-1">If provided, this image URL will override the selected design preset.</span>
            </div>

            <button
              type="button"
              disabled={autosave}
              onClick={handleSaveSettings}
              className={`w-full py-2 rounded-xl text-xs font-semibold shadow transition ${autosave ? "bg-slate-900 border border-purple-500/25 text-purple-300 opacity-60 cursor-default" : "bg-purple-600 hover:bg-purple-500 text-white cursor-pointer"}`}
            >
              {autosave ? "✓ Autosave Enabled" : "Save Welcomer Panel"}
            </button>
          </div>
        </div>

        <div className="bg-purple-500/5 border border-purple-500/10 rounded-2xl p-4 flex gap-3 text-xs leading-relaxed">
          <AlertCircle className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
          <div className="text-slate-400 space-y-1">
            <p className="font-semibold text-white">Dynamic Tags Explanation</p>
            <p>Your bot automatically parses tag placeholders before dispatching messages. <code className="text-purple-300 font-mono">&#123;user&#125;</code> tags mention the newcomer, while <code className="text-purple-300 font-mono">&#123;server&#125;</code> inserts your server name.</p>
          </div>
        </div>
      </div>

      {/* Right Column (2 spans): Interactive Banner Visualizer card */}
      <div className="xl:col-span-2 space-y-6">
        <div className="glass-panel p-6 rounded-2xl border border-purple-500/10 shadow-2xl space-y-5">
          <div>
            <h4 className="text-base font-bold text-white font-display flex items-center gap-2">
              <Image className="w-5 h-5 text-purple-400" /> Interactive Banner Visualizer
            </h4>
            <p className="text-xs text-slate-400 mt-0.5">Real-time preview of the graphic welcome banner rendered by the DarkFlower bot inside Discord.</p>
          </div>

          {/* Graphical Welcomer Banner Preview */}
          <div 
            className={`w-full h-56 rounded-2xl relative overflow-hidden flex flex-col items-center justify-center p-6 border border-purple-500/25 shadow-xl transition-all duration-500 ${
              cardBg === "cosmic" ? "bg-gradient-to-br from-[#120c1f] via-[#24133c] to-[#0a0512]" :
              cardBg === "neon" ? "bg-gradient-to-br from-[#1b0826] via-[#100720] to-[#25103c] bg-[linear-gradient(rgba(139,92,246,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(139,92,246,0.05)_1px,transparent_1px)] bg-[size:16px_16px]" :
              cardBg === "floral" ? "bg-gradient-to-br from-[#0c051a] via-[#1c082c] to-[#120418]" : ""
            }`}
            style={cardBg.startsWith("http") ? { backgroundImage: `url(${cardBg})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
          >
            {/* Background elements */}
            {!cardBg.startsWith("http") && (
              <div className="absolute top-0 left-0 w-full h-full opacity-10">
                {/* Overlay abstract patterns */}
                <div className="absolute top-1/4 left-1/4 w-32 h-32 rounded-full border border-purple-500"></div>
                <div className="absolute bottom-1/4 right-1/4 w-44 h-44 rounded-full border border-purple-500"></div>
              </div>
            )}

            {/* Member Avatar overlay */}
            <div className="w-20 h-20 rounded-full border-4 border-purple-500 shadow-lg darkflower-glow overflow-hidden relative z-10 shrink-0">
              <img src="https://api.dicebear.com/7.x/pixel-art/svg?seed=PressTV" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            </div>

            {/* Greeting Headers */}
            <div className="text-center mt-3 relative z-10">
              <h5 className="text-2xl font-bold font-display text-white tracking-wider uppercase flex items-center justify-center gap-1.5 darkflower-text-glow">
                <Sparkles className="w-5 h-5 text-purple-400 animate-spin" style={{ animationDuration: '4s' }} />
                WELCOME TO THE GUILD
              </h5>
              <p className="text-slate-300 font-bold text-sm mt-0.5 uppercase tracking-wide">PressTV Joined the server</p>
              <p className="text-purple-300 font-mono text-[10px] mt-1">MEMBER #{guild.memberCount + 1}</p>
            </div>
          </div>

          {/* Interactive Chat Log Output Preview */}
          <div className="bg-[#111214] p-4 rounded-xl border border-[#2b2d31] shadow-lg">
            <span className="text-[10px] text-[#949ba4] uppercase font-bold tracking-wider block border-b border-[#2b2d31] pb-2 mb-2.5">Discord Channel View: {welcomeChannel}</span>
            <div className="flex gap-3 text-xs">
              <div className="w-8 h-8 rounded-full bg-purple-950 border border-purple-500/30 text-purple-400 shrink-0 flex items-center justify-center font-bold font-display">
                DF
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-white">DarkFlower Bot</span>
                  <span className="bg-[#5865f2] text-[9px] text-white px-1 py-0.5 rounded font-semibold uppercase leading-none">BOT</span>
                  <span className="text-[9px] text-[#949ba4]">Today at {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className="text-[#dbdee1] leading-relaxed">
                  {getParsedWelcomeMessage()}
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

    </div>
  );
}
