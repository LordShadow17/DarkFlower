import React, { useState } from "react";
import { Guild, Ticket } from "../types";
import { MessageSquare, PlusCircle, CheckCircle, FileText, Send, Lock, User } from "lucide-react";

interface TicketPanelProps {
  guild: Guild;
  onUpdateConfig: (config: any) => void;
  onOpenTicket: () => Promise<Ticket>;
  onSendMessage: (ticketId: string, text: string, sender?: string) => Promise<any>;
  onCloseTicket: (ticketId: string) => Promise<any>;
}

export default function TicketPanel({ guild, onUpdateConfig, onOpenTicket, onSendMessage, onCloseTicket }: TicketPanelProps) {
  const { config, tickets } = guild;

  // Local settings states
  const [ticketLabel, setTicketLabel] = useState(config.ticketLabel || "Open Support Ticket");
  const [supportRole, setSupportRole] = useState(config.supportRole || "Staff");
  const [ticketEnabled, setTicketEnabled] = useState(config.ticketEnabled ?? true);

  // Autosave states
  const [autosave, setAutosave] = useState(true);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  const triggerAutosave = (updatedFields: any) => {
    if (!autosave) return;
    setSaveStatus("saving");
    onUpdateConfig({
      ticketLabel,
      supportRole,
      ticketEnabled,
      ...updatedFields
    });
    setTimeout(() => {
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 1500);
    }, 400);
  };

  // Active ticket threads
  const [activeTicketId, setActiveTicketId] = useState<string | null>(tickets.length ? tickets[0].id : null);
  const [chatInput, setChatInput] = useState("");
  const [generatingTranscript, setGeneratingTranscript] = useState(false);
  const [viewTranscript, setViewTranscript] = useState<string | null>(null);

  // Active ticket object lookup
  const activeTicket = tickets.find(t => t.id === activeTicketId);

  const handleSaveSettings = () => {
    onUpdateConfig({
      ticketLabel,
      supportRole,
      ticketEnabled
    });
    alert("Ticket settings updated successfully!");
  };

  const handleOpenNewSupportTicket = async () => {
    try {
      const newTkt = await onOpenTicket();
      setActiveTicketId(newTkt.id);
      setViewTranscript(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !activeTicketId) return;

    try {
      await onSendMessage(activeTicketId, chatInput.trim());
      setChatInput("");
    } catch (err) {
      console.error(err);
    }
  };

  const handleCloseSupportTicket = async () => {
    if (!activeTicketId) return;
    if (confirm("Are you sure you want to close this ticket and lock the channel?")) {
      try {
        await onCloseTicket(activeTicketId);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const generateTranscriptText = () => {
    if (!activeTicket) return;
    setGeneratingTranscript(true);
    setTimeout(() => {
      let log = `=== DARKFLOWER TRANSCRIPTION UTILITY ===\n`;
      log += `Guild: ${guild.name}\n`;
      log += `Ticket Reference: ${activeTicket.id}\n`;
      log += `Channel: #${activeTicket.channelName}\n`;
      log += `Created By: ${activeTicket.user}\n`;
      log += `Status: ${activeTicket.status.toUpperCase()}\n`;
      log += `Generated On: ${new Date().toLocaleString()}\n`;
      log += `========================================\n\n`;

      activeTicket.messages.forEach(m => {
        log += `[${m.timestamp}] ${m.sender}: ${m.text}\n`;
      });

      log += `\n=== End of Support Transcript ===`;
      setViewTranscript(log);
      setGeneratingTranscript(false);
    }, 1000);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 animate-fade-in">
      
      {/* Left Column: Config Panel & Controls */}
      <div className="space-y-6">
        <div className="glass-panel p-5 rounded-2xl border border-purple-500/10 space-y-4 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-purple-500/10 pb-3 gap-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-purple-400" />
              <h4 className="text-base font-bold text-white font-display">Ticket Builder Setup</h4>
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
                <label className="text-xs font-semibold text-slate-300 block">Ticket System Enabled</label>
                <span className="text-[10px] text-slate-500">Allow members to generate button-based ticket threads.</span>
              </div>
              <input
                type="checkbox"
                checked={ticketEnabled}
                onChange={(e) => {
                  const val = e.target.checked;
                  setTicketEnabled(val);
                  triggerAutosave({ ticketEnabled: val });
                }}
                className="w-4 h-4 accent-purple-500 cursor-pointer"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1">Interactive Button Label</label>
              <input
                type="text"
                value={ticketLabel}
                onChange={(e) => {
                  const val = e.target.value;
                  setTicketLabel(val);
                  triggerAutosave({ ticketLabel: val });
                }}
                placeholder="e.g. Open Support Ticket"
                className="w-full bg-slate-950 border border-purple-500/20 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-purple-500/40"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1">Responsible Support Role</label>
              <input
                type="text"
                value={supportRole}
                onChange={(e) => {
                  const val = e.target.value;
                  setSupportRole(val);
                  triggerAutosave({ supportRole: val });
                }}
                placeholder="e.g. Moderator / Helper"
                className="w-full bg-slate-950 border border-purple-500/20 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-purple-500/40"
              />
            </div>

            <button
              type="button"
              disabled={autosave}
              onClick={handleSaveSettings}
              className={`w-full py-2 rounded-xl text-xs font-semibold shadow transition ${autosave ? "bg-slate-900 border border-purple-500/25 text-purple-300 opacity-60 cursor-default" : "bg-purple-600 hover:bg-purple-500 text-white cursor-pointer"}`}
            >
              {autosave ? "✓ Autosave Enabled" : "Update Ticket Setup"}
            </button>
          </div>
        </div>

        {/* Create Ticket Launcher */}
        <div className="bg-gradient-to-br from-[#120e24] to-[#1e133c] p-5 rounded-2xl border border-purple-500/20 shadow-xl space-y-4">
          <div className="space-y-1">
            <h5 className="text-sm font-bold text-white font-display">Ticket Embedded Launcher</h5>
            <p className="text-xs text-purple-300">Test clicking the button below to generate a new active support channel.</p>
          </div>

          <div className="bg-[#1e1f22] p-4 rounded-xl border border-[#2b2d31] shadow-md flex flex-col gap-2.5">
            <div className="text-purple-400 font-bold font-display text-xs">🌸 DarkFlower HelpDesk</div>
            <p className="text-xs text-slate-300 leading-relaxed">Need custom role claims, store refund support, or have moderation queries? Click below to establish a private channel with our server administrators.</p>
            <button
              type="button"
              disabled={!ticketEnabled}
              onClick={handleOpenNewSupportTicket}
              className="bg-[#248046] hover:bg-[#1a6535] disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-semibold py-2 rounded-lg text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow"
            >
              <PlusCircle className="w-4 h-4" /> {ticketLabel}
            </button>
          </div>
        </div>
      </div>

      {/* Right Column (2 spans): Active Ticket Threads inbox */}
      <div className="xl:col-span-2 space-y-6">
        <div className="glass-panel rounded-2xl border border-purple-500/10 flex flex-col h-[530px] overflow-hidden shadow-2xl">
          {/* Thread header */}
          <div className="bg-[#0e0a1b] p-4 border-b border-purple-500/10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></span>
              <div>
                <h4 className="text-sm font-bold text-white font-display flex items-center gap-1.5">
                  Ticket Inbox Dashboard
                </h4>
                <p className="text-[10px] text-slate-400">Total active threads inside {guild.name}</p>
              </div>
            </div>

            {/* Selector list */}
            <div className="flex gap-1.5 overflow-x-auto max-w-[180px] sm:max-w-xs md:max-w-md scrollbar-thin">
              {tickets.length ? (
                tickets.map(t => (
                  <button
                    key={t.id}
                    onClick={() => { setActiveTicketId(t.id); setViewTranscript(null); }}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider shrink-0 border transition ${
                      activeTicketId === t.id
                        ? "bg-purple-600/25 border-purple-500/40 text-purple-300"
                        : "bg-slate-950/40 border-purple-500/5 text-slate-400 hover:text-slate-300"
                    }`}
                  >
                    #{t.id}
                  </button>
                ))
              ) : (
                <span className="text-[10px] text-slate-500 italic">No tickets active</span>
              )}
            </div>
          </div>

          {/* Thread body */}
          {activeTicket ? (
            <div className="flex-1 flex flex-col min-h-0 bg-slate-950/20">
              
              {/* Message Streams */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3.5 scrollbar-thin">
                <div className="text-center py-2">
                  <span className="text-[10px] font-mono bg-purple-950/40 border border-purple-500/10 text-purple-400 px-3 py-1 rounded-full">
                    🔒 Channel established: #{activeTicket.channelName} - visible only to Creator and {supportRole}
                  </span>
                </div>

                {activeTicket.messages.map((m, idx) => {
                  const isStaff = m.sender.includes("(Staff)");
                  const isBot = m.sender === "DarkFlower Bot";
                  
                  return (
                    <div key={idx} className={`flex gap-3 text-xs leading-relaxed max-w-[85%] ${isStaff ? "ml-auto flex-row-reverse" : ""}`}>
                      <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center font-bold font-display ${
                        isBot ? "bg-purple-950 border border-purple-500/30 text-purple-400" :
                        isStaff ? "bg-purple-600 text-white" : "bg-slate-800 text-slate-200"
                      }`}>
                        {isBot ? "DF" : isStaff ? "ST" : <User className="w-4 h-4" />}
                      </div>

                      <div className="space-y-1">
                        <div className={`flex items-center gap-1.5 ${isStaff ? "justify-end" : ""}`}>
                          <span className="font-bold text-white">{m.sender}</span>
                          {isBot && <span className="bg-[#5865f2] text-[9px] text-white px-1 py-0.5 rounded font-semibold uppercase leading-none">BOT</span>}
                          {isStaff && <span className="bg-purple-500/20 text-[#c084fc] text-[9px] px-1 py-0.5 rounded font-semibold uppercase border border-purple-500/30">STAFF</span>}
                          <span className="text-[9px] text-slate-500">{m.timestamp}</span>
                        </div>

                        <div className={`p-3 rounded-2xl ${
                          isBot ? "bg-[#1e1f22] border border-[#2b2d31] rounded-tl-none" :
                          isStaff ? "bg-purple-600/15 border border-purple-500/25 text-purple-100 rounded-tr-none" :
                          "bg-slate-950/50 border border-purple-500/5 text-slate-100 rounded-tl-none"
                        }`}>
                          <p>{m.text}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Chat footer actions */}
              <div className="p-4 border-t border-purple-500/10 bg-[#0c0a12]/60">
                {activeTicket.status === "open" ? (
                  <form onSubmit={handleSendChat} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Type response to member..."
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      className="w-full bg-slate-950 border border-purple-500/15 hover:border-purple-500/30 focus:border-purple-500/60 rounded-xl px-4 py-2 text-xs text-white placeholder-slate-500 outline-none transition"
                    />
                    <button
                      type="submit"
                      className="bg-purple-600 hover:bg-purple-500 text-white p-2.5 rounded-xl transition cursor-pointer shadow"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={handleCloseSupportTicket}
                      className="bg-red-900/40 hover:bg-red-900/60 border border-red-500/30 text-red-300 text-xs px-3 py-2 rounded-xl transition flex items-center gap-1 cursor-pointer"
                      title="Lock & Close ticket"
                    >
                      <Lock className="w-3.5 h-3.5" /> Close
                    </button>
                  </form>
                ) : (
                  <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-red-950/10 border border-red-500/15 p-3 rounded-xl">
                    <span className="text-xs text-red-300 italic">This support ticket thread has been closed.</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={generatingTranscript}
                        onClick={generateTranscriptText}
                        className="bg-purple-600 hover:bg-purple-500 text-white font-semibold px-4 py-1.5 rounded-xl text-xs transition cursor-pointer flex items-center gap-1"
                      >
                        <FileText className="w-3.5 h-3.5" /> {generatingTranscript ? "Transcribing..." : "Generate Transcript"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500">
              <MessageSquare className="w-12 h-12 text-purple-500/20 mb-3" />
              <p className="text-sm">Select an active ticket from the list or click the launcher button on the left to initiate a support chat thread.</p>
            </div>
          )}
        </div>

        {/* Transcript Viewer Modal overlay popup */}
        {viewTranscript && (
          <div className="glass-panel p-5 rounded-2xl border border-purple-500/25 space-y-3 shadow-xl relative overflow-hidden">
            <div className="flex items-center justify-between border-b border-purple-500/15 pb-2">
              <h5 className="text-xs font-bold font-mono text-purple-400">📝 Support Transcription Log Generated</h5>
              <button onClick={() => setViewTranscript(null)} className="text-slate-400 hover:text-white font-bold text-sm">Close ×</button>
            </div>
            <pre className="bg-slate-950 p-4 rounded-xl text-[10px] font-mono text-green-400 overflow-x-auto max-h-48 whitespace-pre-wrap select-all">
              {viewTranscript}
            </pre>
            <p className="text-[10px] text-slate-400 italic">💡 Click inside block to select and copy transcription file.</p>
          </div>
        )}

      </div>
    </div>
  );
}
