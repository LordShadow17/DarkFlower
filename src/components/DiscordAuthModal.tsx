import React, { useState, useEffect } from "react";
import { Shield, Sparkles, HelpCircle, CheckCircle } from "lucide-react";

interface DiscordAuthModalProps {
  onLogin: () => void;
}

export default function DiscordAuthModal({ onLogin }: DiscordAuthModalProps) {
  const [authorizing, setAuthorizing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [botStatus, setBotStatus] = useState<{
    connected: boolean;
    username: string;
    avatar: string;
    id: string;
    hasToken: boolean;
    clientId: string;
    hasClientSecret?: boolean;
  } | null>(null);

  useEffect(() => {
    // Fetch bot status on mount to check if live credentials exist
    fetch("/api/bot/status")
      .then((res) => {
        if (res.ok) return res.json();
      })
      .then((data) => {
        if (data) setBotStatus(data);
      })
      .catch((err) => console.error("Error fetching bot status in modal:", err));
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Listen for authentication success from the popup window
      if (event.data?.type === "OAUTH_AUTH_SUCCESS") {
        onLogin();
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onLogin]);

  const isMobile = () => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  };

  const startOfflineInspection = () => {
    setTimeout(async () => {
      try {
        const response = await fetch("/api/auth/discord", { method: "POST" });
        if (response.ok) {
          onLogin();
        }
      } catch (err) {
        console.error(err);
        setErrorMessage("Failed to initiate offline inspection.");
      } finally {
        setAuthorizing(false);
      }
    }, 1000);
  };

  const handleAuthorize = async () => {
    setErrorMessage(null);
    setAuthorizing(true);

    const hasRealOAuth = botStatus?.clientId && botStatus?.hasClientSecret;

    if (hasRealOAuth) {
      try {
        const response = await fetch("/api/auth/discord/url");
        if (!response.ok) {
          throw new Error("Failed to generate Discord OAuth URL.");
        }
        const { url } = await response.json();

        // 1. Direct redirect for mobile/tablet devices (always works perfectly)
        if (isMobile()) {
          setErrorMessage("Redirecting you to Discord...");
          window.location.href = url;
          return;
        }

        // 2. Desktop devices: try to open a popup
        const width = 580;
        const height = 750;
        const left = window.screen.width / 2 - width / 2;
        const top = window.screen.height / 2 - height / 2;

        const authWindow = window.open(
          url,
          "discord_oauth_popup",
          `width=${width},height=${height},top=${top},left=${left},resizable=yes,scrollbars=yes`
        );

        if (!authWindow) {
          setErrorMessage("Popup blocker active! Redirecting you to complete authorization...");
          setTimeout(() => {
            window.location.href = url;
          }, 1200);
        }
      } catch (err: any) {
        console.error("Failed to initiate live Discord OAuth:", err);
        setErrorMessage("Could not start live authentication. Falling back to offline inspection mode...");
        startOfflineInspection();
      }
    } else {
      startOfflineInspection();
    }
  };

  const handleAuthorizeDirect = async () => {
    setErrorMessage(null);
    setAuthorizing(true);

    const hasRealOAuth = botStatus?.clientId && botStatus?.hasClientSecret;

    if (hasRealOAuth) {
      try {
        const response = await fetch("/api/auth/discord/url");
        if (!response.ok) {
          throw new Error("Failed to generate Discord OAuth URL.");
        }
        const { url } = await response.json();
        window.location.href = url;
      } catch (err: any) {
        console.error("Failed to initiate direct Discord OAuth:", err);
        setErrorMessage("Could not start direct authentication. Falling back to offline inspection mode...");
        startOfflineInspection();
      }
    } else {
      startOfflineInspection();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#050409]/90 p-4 font-sans overflow-y-auto">
      <div className="w-full max-w-lg bg-[#111214] rounded-lg border border-[#2b2d31] shadow-2xl overflow-hidden animate-fade-in my-8">
        {/* Discord OAuth Header Banner */}
        <div className="bg-[#5865F2] p-6 text-white relative">
          <div className="absolute top-4 right-4 flex items-center gap-1 text-xs bg-black/25 px-2.5 py-1 rounded-full font-medium">
            <Shield className="w-3.5 h-3.5 text-green-400" />
            Verified Application
          </div>
          <div className="flex items-center gap-4 mt-2">
            <div className="w-16 h-16 rounded-full bg-[#1e1f22] border-4 border-[#111214] overflow-hidden flex items-center justify-center">
              {/* Custom SVG logo mimicking the DarkFlower Lotus in purple */}
              <svg viewBox="0 0 100 100" className="w-12 h-12 text-[#9a66ff]">
                <path fill="currentColor" d="M50 15 C45 35 30 45 15 50 C30 55 45 65 50 85 C55 65 70 55 85 50 C70 45 55 35 50 15 Z" />
                <path fill="#5c3db3" d="M50 30 C47 42 38 48 30 50 C38 52 47 58 50 70 C53 58 62 52 70 50 C62 48 53 42 50 30 Z" />
                <circle cx="50" cy="50" r="5" fill="#e9d8fd" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold font-display tracking-tight flex items-center gap-2">
                DarkFlower
                <span className="text-xs bg-[#248046] text-white px-2 py-0.5 rounded font-bold uppercase tracking-wider">Bot</span>
              </h2>
              <p className="text-sm text-slate-100 opacity-90 mt-0.5">wants to access your Discord Account</p>
            </div>
          </div>
        </div>

        {/* OAuth Scopes Request List */}
        <div className="p-6 space-y-5 text-[#dbdee1] text-sm">
          <div className="text-xs font-bold text-[#949ba4] uppercase tracking-wider">
            This will allow the developer of DarkFlower to:
          </div>

          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-[#248046] shrink-0 mt-0.5" />
              <div>
                <strong className="text-white block font-medium">Access your username, avatar, and banner</strong>
                <span className="text-[#949ba4] text-xs">Knows your online name and profile graphics.</span>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-[#248046] shrink-0 mt-0.5" />
              <div>
                <strong className="text-white block font-medium">Know what servers you are in</strong>
                <span className="text-[#949ba4] text-xs">Used to identify which of your servers currently run the DarkFlower Bot.</span>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-[#248046] shrink-0 mt-0.5" />
              <div>
                <strong className="text-white block font-medium">Manage server-specific webhook automations</strong>
                <span className="text-[#949ba4] text-xs">Allows sending of custom, rich administrative embeds automatically.</span>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-[#248046] shrink-0 mt-0.5" />
              <div>
                <strong className="text-white block font-medium">Manage ticket channels and bot permissions</strong>
                <span className="text-[#949ba4] text-xs">Enables dynamic channel generation for your button-based ticket system.</span>
              </div>
            </div>
          </div>

          <div className="border-t border-[#2b2d31] pt-4 space-y-3">
            <div className="flex items-center gap-2 text-[#949ba4] text-xs">
              <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />
              <span>DarkFlower is highly secure and does not record personal logs. Read our privacy documentation for details.</span>
            </div>

            {botStatus?.clientId && botStatus?.hasClientSecret ? (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-xs text-emerald-400 flex items-start gap-2.5 animate-fade-in">
                <span className="relative flex h-2 w-2 shrink-0 mt-1">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <div className="flex-1">
                  <strong className="text-white block font-medium mb-0.5">Live Connection Configured</strong>
                  Clicking Authorize will open a secure Discord login popup window. You will authorize with your own live Discord account.
                  <div className="mt-2.5 pt-2 border-t border-emerald-500/15 text-[11px] text-emerald-300">
                    💡 <strong>On mobile/tablet or having popup issues?</strong><br />
                    <button
                      type="button"
                      onClick={handleAuthorizeDirect}
                      className="underline text-[#ff73fa] hover:text-[#9a66ff] font-semibold mt-1 transition-colors cursor-pointer block text-left"
                    >
                      Click here to Authorize with Direct Page Redirect
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-xs text-amber-300 flex items-start gap-2">
                <span className="font-bold shrink-0 text-[9px] bg-amber-500/15 border border-amber-500/20 px-1.5 py-0.5 rounded text-amber-400 mt-0.5">OFFLINE</span>
                <div>
                  <strong className="text-amber-300 block font-medium mb-0.5">Offline Inspection Mode</strong>
                  No client secret configured. Proceeding will enter local offline inspection mode. Configure <code className="text-amber-300 font-mono font-semibold px-1 py-0.5 bg-slate-900 rounded text-[10px]">DISCORD_CLIENT_SECRET</code> and <code className="text-amber-300 font-mono font-semibold px-1 py-0.5 bg-slate-900 rounded text-[10px]">DISCORD_CLIENT_ID</code> in Secrets to enable real secure OAuth.
                </div>
              </div>
            )}

            {errorMessage && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-xs text-red-400 animate-pulse">
                {errorMessage}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="bg-[#2b2d31]/40 -mx-6 -mb-6 p-4 mt-6 flex justify-between items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-[#949ba4] cursor-help">
              <HelpCircle className="w-4 h-4" />
              <span>How does this work?</span>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="px-5 py-2 rounded text-white font-medium hover:underline text-sm hover:bg-[#35363c] transition-all"
                onClick={() => alert("Authentication is required to view your personalized servers dashboard.")}
              >
                Cancel
              </button>
              
              <button
                type="button"
                disabled={authorizing}
                onClick={handleAuthorize}
                className="bg-[#5865F2] hover:bg-[#4752C4] disabled:bg-[#5865F2]/50 active:bg-[#3c45a3] text-white px-7 py-2 rounded font-medium transition-all text-sm flex items-center gap-2 cursor-pointer relative overflow-hidden"
              >
                {authorizing ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    {botStatus?.clientId && botStatus?.hasClientSecret ? "Authorizing..." : "Connecting..."}
                  </>
                ) : (
                  botStatus?.clientId && botStatus?.hasClientSecret ? "Authorize" : "Enter Offline Inspection"
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
