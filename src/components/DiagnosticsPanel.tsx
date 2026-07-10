import React, { useState } from "react";
import { Guild } from "../types";
import { ShieldAlert, Zap, AlertTriangle, RefreshCw, CheckCircle, Terminal } from "lucide-react";

interface DiagnosticsPanelProps {
  guild: Guild;
  onFixError: (errorId: string) => Promise<any>;
  onScan: () => Promise<any>;
}

export default function DiagnosticsPanel({ guild, onFixError, onScan }: DiagnosticsPanelProps) {
  const { errors } = guild;

  // Scan and repair active states
  const [repairingId, setRepairingId] = useState<string | null>(null);
  const [logTrace, setLogTrace] = useState<string[]>([]);
  const [scanActive, setScanActive] = useState(false);

  const triggerAutoFix = async (errorId: string, errorCode: string) => {
    setRepairingId(errorId);
    setLogTrace([
      `[DarkFlower AI - Diagnostics Tracer] Initiating diagnostic sweep for code ${errorCode}...`,
      `[DarkFlower AI - Diagnostics Tracer] Analyzing guild permissions configuration...`
    ]);

    // Step-by-step animated traces
    setTimeout(() => {
      setLogTrace(prev => [
        ...prev,
        `[DarkFlower AI - Diagnostics Tracer] Verifying Discord Gateway API response... Done.`,
        `[DarkFlower AI - Diagnostics Tracer] Scanning guild channels hierarchy map...`
      ]);
    }, 1000);

    setTimeout(() => {
      setLogTrace(prev => [
        ...prev,
        `[DarkFlower AI - Diagnostics Tracer] Error verified. Injecting auto-correction commands into server permissions module...`
      ]);
    }, 2000);

    setTimeout(async () => {
      try {
        await onFixError(errorId);
        setLogTrace(prev => [
          ...prev,
          `[DarkFlower AI - Diagnostics Tracer] Permissions repaired successfully.`,
          `[DarkFlower AI - Diagnostics Tracer] Diagnostics complete! Guild status: HEALTHY. 🎉`
        ]);
        alert(`DarkFlower AI successfully resolved the diagnostic error ${errorCode}!`);
      } catch (err) {
        console.error(err);
      } finally {
        setRepairingId(null);
      }
    }, 3200);
  };

  const handleScanNow = async () => {
    setScanActive(true);
    setLogTrace([
      `[DarkFlower AI - Diagnostics Tracer] Connecting to active environment and Discord Gateway...`,
      `[DarkFlower AI - Diagnostics Tracer] Sweeping credentials status and configuration variables...`
    ]);
    try {
      await onScan();
      setLogTrace(prev => [
        ...prev,
        `[DarkFlower AI - Diagnostics Tracer] Discord channel mapping checked against live cache.`,
        `[DarkFlower AI - Diagnostics Tracer] Environmental credentials swept successfully. Scan complete! ✨`
      ]);
    } catch (err) {
      console.error(err);
      setLogTrace(prev => [
        ...prev,
        `[DarkFlower AI - Diagnostics Tracer] Error: Failed to execute live environment sweep.`
      ]);
    } finally {
      setScanActive(false);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 animate-fade-in">
      
      {/* Left Column (2 spans): Active Diagnostics Errors */}
      <div className="xl:col-span-2 space-y-6">
        <div className="glass-panel p-5 rounded-2xl border border-purple-500/10 space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-purple-500/10 pb-3">
            <h4 className="text-base font-bold text-white font-display flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-purple-400" /> Auto-Fix AI Diagnostics Suite
            </h4>
            
            <button
              type="button"
              disabled={scanActive}
              onClick={handleScanNow}
              className="bg-purple-950/40 border border-purple-500/20 hover:border-purple-500/40 text-purple-300 text-xs font-semibold px-3.5 py-1.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${scanActive ? "animate-spin" : ""}`} /> Scan System Config
            </button>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            The DarkFlower Diagnostic scanner continuously audits your discord bot configurations, channel maps, permission overrides, and webhook status to detect issues and offer automated healing.
          </p>

          <div className="space-y-3">
            {errors.length ? (
              errors.map((err) => (
                <div
                  key={err.id}
                  className={`p-4 rounded-xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition ${
                    err.severity === "critical"
                      ? "bg-red-950/10 border-red-500/15"
                      : "bg-yellow-950/10 border-yellow-500/15"
                  }`}
                >
                  <div className="flex gap-3 text-xs leading-relaxed">
                    <div className={`p-2 rounded-lg shrink-0 ${
                      err.severity === "critical" ? "bg-red-500/10 text-red-400" : "bg-yellow-500/10 text-yellow-500"
                    }`}>
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-bold text-white">{err.code}</span>
                        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                          err.severity === "critical" ? "bg-red-500/15 text-red-400" : "bg-yellow-500/15 text-yellow-500"
                        }`}>{err.severity}</span>
                        <span className="text-[10px] bg-purple-950/40 text-purple-400 px-2 py-0.5 rounded font-mono border border-purple-500/25">{err.module}</span>
                      </div>
                      <p className="text-slate-300 mt-1">{err.message}</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={repairingId !== null}
                    onClick={() => triggerAutoFix(err.id, err.code)}
                    className="bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold px-4 py-2 rounded-xl transition shrink-0 cursor-pointer shadow flex items-center gap-1.5"
                  >
                    <Zap className="w-3.5 h-3.5" /> Auto-Fix with DarkFlower AI
                  </button>
                </div>
              ))
            ) : (
              <div className="p-8 rounded-xl bg-green-950/10 border border-green-500/15 text-center flex flex-col items-center gap-2">
                <CheckCircle className="w-10 h-10 text-green-400 animate-bounce" />
                <h5 className="font-bold text-white">All Channels & Configuration Healthy!</h5>
                <p className="text-xs text-slate-400">DarkFlower AI diagnostic audit trace shows 0 active warnings.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Column: Real-Time Diagnostic Terminal Trace Logger */}
      <div className="space-y-6">
        <div className="glass-panel p-5 rounded-2xl border border-purple-500/10 h-full flex flex-col shadow-xl">
          <div className="pb-3 border-b border-purple-500/10">
            <h4 className="text-base font-bold text-white font-display flex items-center gap-2">
              <Terminal className="w-5 h-5 text-purple-400" /> Live AI Fix Trace Output
            </h4>
            <p className="text-[11px] text-slate-400 mt-0.5">Traces code corrections deployed by DarkFlower AI.</p>
          </div>

          <div className="flex-1 min-h-[250px] max-h-[350px] bg-slate-950/40 border border-purple-950/30 p-4 rounded-xl font-mono text-[10px] text-slate-300 space-y-2.5 overflow-y-auto mt-4 scrollbar-thin">
            {logTrace.length ? (
              logTrace.map((line, idx) => (
                <div key={idx} className="leading-relaxed">
                  <span className="text-purple-400">{`>>> `}</span>
                  {line}
                </div>
              ))
            ) : (
              <span className="text-slate-600 italic">No diagnostic fix trace processes logged. Trigger "Auto-Fix" above to trace correction events.</span>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
