import React, { useState, useRef, useEffect } from "react";
import { Guild } from "../types";
import { Sparkles, Shield, AlertOctagon, HelpCircle, Send, CheckCircle2, Lock } from "lucide-react";

interface AiModPanelProps {
  guild: Guild;
}

export default function AiModPanel({ guild }: AiModPanelProps) {
  const [messages, setMessages] = useState<Array<{ sender: 'user' | 'bot'; text: string; timestamp: string }>>([
    { sender: 'bot', text: `🌸 **DarkFlower Admin AI Core Activated.**\n\nWelcome back, Administrator. I have authenticated your Server Administrator roles. You can prompt me to analyze current safety parameters, recommend rules configurations, or draft webhook announcements.`, timestamp: "Just now" }
  ]);
  const [inputPrompt, setInputPrompt] = useState("");
  const [querying, setQuerying] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendPrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputPrompt.trim()) return;

    const userMsg = inputPrompt.trim();
    setInputPrompt("");
    
    setMessages((prev) => [...prev, { sender: 'user', text: userMsg, timestamp: "Just now" }]);
    setQuerying(true);

    try {
      const response = await fetch("/api/moderation/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: userMsg,
          guildId: guild.id,
          isAdmin: true
        })
      });

      const data = await response.json();
      
      if (response.ok) {
        setMessages((prev) => [...prev, { sender: 'bot', text: data.text, timestamp: "Just now" }]);
      } else {
        setMessages((prev) => [...prev, { sender: 'bot', text: data.message || `❌ **Error**: ${data.error || "Failed to contact DarkFlower AI core."}`, timestamp: "Just now" }]);
      }

    } catch (err) {
      console.error(err);
      setMessages((prev) => [...prev, { sender: 'bot', text: `❌ **Communication Error**: Failed to dispatch secure administrative routing packet.`, timestamp: "Just now" }]);
    } finally {
      setQuerying(false);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 animate-fade-in">
      
      {/* Admin Verification Sidebar settings */}
      <div className="xl:col-span-1 space-y-6">
        <div className="glass-panel p-5 rounded-2xl border border-purple-500/10 space-y-4 shadow-xl">
          <div className="flex items-center gap-2 border-b border-purple-500/10 pb-3">
            <Shield className="w-5 h-5 text-purple-400" />
            <h4 className="text-sm font-bold text-white font-display">Security Gate Settings</h4>
          </div>

          <div className="space-y-4">
            <div className="p-3.5 rounded-xl bg-slate-950/40 border border-purple-500/10 flex flex-col gap-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Administrative Status</span>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-green-400 font-bold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                  Authorized Admin
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Security Credentials Checks</span>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between text-slate-400">
                  <span>Guild Owner Role</span>
                  <span className="text-green-400 font-medium flex items-center gap-1">Verified <CheckCircle2 className="w-3.5 h-3.5" /></span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span>Manage Guild Perms</span>
                  <span className="text-green-400 font-medium flex items-center gap-1">Granted <CheckCircle2 className="w-3.5 h-3.5" /></span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-purple-500/5 border border-purple-500/10 p-4 rounded-xl text-xs space-y-2 text-slate-400">
          <p className="font-semibold text-white flex items-center gap-1"><Sparkles className="w-3.5 h-3.5 text-purple-400" /> Prompts to try:</p>
          <ul className="list-disc pl-4 space-y-1">
            <li className="hover:text-purple-300 cursor-pointer" onClick={() => setInputPrompt("Draft server announcement for the new rules we setup")}>"Draft server rules announcements"</li>
            <li className="hover:text-purple-300 cursor-pointer" onClick={() => setInputPrompt("Propose bad words we should blacklist for automod")}>"Propose bad words list"</li>
            <li className="hover:text-purple-300 cursor-pointer" onClick={() => setInputPrompt("Explain safety recommendations for large groups")}>"Safety guidelines recommendation"</li>
          </ul>
        </div>
      </div>

      {/* Main Secure AI Chat Terminal Box */}
      <div className="xl:col-span-3 space-y-6">
        
        <div className="glass-panel rounded-2xl border border-purple-500/15 flex flex-col h-[530px] overflow-hidden shadow-2xl relative bg-gradient-to-br from-[#0c0a12] via-[#0f0b1a] to-[#07050d]">
          {/* Background floating floral logo watermark */}
          <div className="absolute inset-0 flex items-center justify-center opacity-5 pointer-events-none">
            <svg viewBox="0 0 100 100" className="w-72 h-72 text-purple-500">
              <path fill="currentColor" d="M50 15 C45 35 30 45 15 50 C30 55 45 65 50 85 C55 65 70 55 85 50 C70 45 55 35 50 15 Z" />
            </svg>
          </div>

            {/* Chat Header */}
            <div className="bg-[#0c0919] p-4 border-b border-purple-500/10 flex items-center justify-between relative z-10">
              <div className="flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse"></div>
                <div>
                  <h4 className="text-sm font-bold text-white font-display flex items-center gap-1.5">
                    DarkFlower Admin AI Agent Core
                  </h4>
                  <p className="text-[10px] text-slate-400">Restricted secure administrative portal for {guild.name}</p>
                </div>
              </div>
              <span className="text-xs bg-purple-500/25 border border-purple-500/40 text-purple-300 px-2.5 py-0.5 rounded-full font-bold">Admin Active</span>
            </div>

            {/* Chats Feed */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin relative z-10 text-xs text-slate-100">
              {messages.map((m, idx) => (
                <div key={idx} className={`flex gap-3 leading-relaxed max-w-[85%] ${m.sender === 'user' ? "ml-auto flex-row-reverse" : ""}`}>
                  <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center font-bold font-display border ${
                    m.sender === 'bot' 
                      ? "bg-purple-950 border-purple-500/30 text-purple-400" 
                      : "bg-slate-800 border-purple-500/10 text-slate-200"
                  }`}>
                    {m.sender === 'bot' ? "DF" : "AD"}
                  </div>
                  
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-white">{m.sender === 'bot' ? "DarkFlower AI" : "Administrator"}</span>
                      {m.sender === 'bot' && <span className="bg-purple-600/35 text-[#c084fc] border border-purple-500/35 text-[9px] px-1 py-0.5 rounded font-semibold uppercase leading-none">CORE AI</span>}
                      <span className="text-[9px] text-slate-500">{m.timestamp}</span>
                    </div>

                    <div className={`p-3 rounded-2xl whitespace-pre-wrap ${
                      m.sender === 'bot'
                        ? "bg-purple-950/20 border border-purple-500/15 text-purple-100 rounded-tl-none leading-relaxed"
                        : "bg-slate-950/60 border border-purple-500/5 text-slate-100 rounded-tr-none"
                    }`}>
                      {m.text}
                    </div>
                  </div>
                </div>
              ))}

              {querying && (
                <div className="flex gap-3 leading-relaxed max-w-[85%]">
                  <div className="w-8 h-8 rounded-full bg-purple-950 border border-purple-500/30 text-purple-400 shrink-0 flex items-center justify-center font-bold font-display animate-pulse">
                    DF
                  </div>
                  <div className="space-y-1">
                    <span className="font-bold text-white">DarkFlower AI</span>
                    <div className="p-3 rounded-2xl bg-purple-950/20 border border-purple-500/15 rounded-tl-none flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></span>
                      <span className="w-1.5 h-1.5 bg-purple-300 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></span>
                      <span className="w-1.5 h-1.5 bg-[#ff73fa] rounded-full animate-bounce" style={{ animationDelay: '0.5s' }}></span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Chat Footer Box */}
            <form onSubmit={handleSendPrompt} className="p-4 border-t border-purple-500/10 bg-[#0c0a12]/60 relative z-10 flex gap-2">
              <input
                type="text"
                placeholder="Ask DarkFlower AI to check rules configurations, recommendations, logs analysis..."
                value={inputPrompt}
                onChange={(e) => setInputPrompt(e.target.value)}
                disabled={querying}
                className="w-full bg-slate-950 border border-purple-500/15 focus:border-purple-500/60 rounded-xl px-4 py-2 text-xs text-white placeholder-slate-500 outline-none transition"
              />
              <button
                type="submit"
                disabled={querying || !inputPrompt.trim()}
                className="bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 disabled:text-slate-500 text-white p-2.5 rounded-xl transition cursor-pointer shadow"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>

      </div>
    );
  }
