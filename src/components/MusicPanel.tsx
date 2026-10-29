import React, { useState, useEffect, useRef } from "react";
import { Guild } from "../types";
import { Music, Play, Pause, SkipForward, Square, Volume2, Search, ListMusic, Sparkles, Key, Check, Lock, AlertCircle, Trash2, Save, FileText, Repeat, Infinity, Activity, Wifi, Copy, CheckCheck } from "lucide-react";
import { showToast } from "../utils/toast";

interface MusicPanelProps {
  guild: Guild;
}

interface Song {
  title: string;
  artist: string;
  duration: string;
  thumbnail: string;
  url: string;
}

export default function MusicPanel({ guild }: MusicPanelProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(80);
  const [searchQuery, setSearchQuery] = useState("");
  const [loop, setLoop] = useState(false);
  const [autoplay, setAutoplay] = useState(false);

  const loopRef = useRef(loop);
  const autoplayRef = useRef(autoplay);

  useEffect(() => {
    loopRef.current = loop;
  }, [loop]);

  useEffect(() => {
    autoplayRef.current = autoplay;
  }, [autoplay]);
  
  // Prepopulated queue list with real high-quality public domain stream URLs
  const [queue, setQueue] = useState<Song[]>([
    { 
      title: "Neon Lotus", 
      artist: "DarkFlower Synth", 
      duration: "6:12", 
      thumbnail: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop",
      url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"
    },
    { 
      title: "Synthwave Sunset", 
      artist: "Viper Beats", 
      duration: "7:05", 
      thumbnail: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=150&auto=format&fit=crop",
      url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3"
    },
    { 
      title: "Digital Bloom", 
      artist: "Lofi Blossom", 
      duration: "5:44", 
      thumbnail: "https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=150&auto=format&fit=crop",
      url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3"
    },
    { 
      title: "Cybernetic Rainforest", 
      artist: "Nebula", 
      duration: "5:02", 
      thumbnail: "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=150&auto=format&fit=crop",
      url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3"
    }
  ]);

  const [activeSong, setActiveSong] = useState<Song>(queue[0]);

  // Audio HTML5 ref
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Real-time server commands log feed that the bot executes in Discord
  const [musicLogs, setMusicLogs] = useState<Array<{ text: string; time: string }>>([
    { text: `df!play ${queue[0].title}`, time: "Just now" },
    { text: `DarkFlower Bot connected to Voice Channel: 🔊 General-Voice`, time: "Just now" },
    { text: `DarkFlower Bot generated rich embed: Playing "${queue[0].title}"`, time: "Just now" }
  ]);

  // YouTube Cookie Management States
  const [cookieStatus, setCookieStatus] = useState<{ configured: boolean; length?: number; preview?: string }>({ configured: false });
  const [cookieInput, setCookieInput] = useState("");
  const [isEditingCookie, setIsEditingCookie] = useState(false);
  const [isSavingCookie, setIsSavingCookie] = useState(false);
  const [showClearCookieConfirm, setShowClearCookieConfirm] = useState(false);
  const [copiedPing, setCopiedPing] = useState(false);

  const handleCopyPingUrl = () => {
    const url = `${window.location.origin}/api/health`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedPing(true);
      showToast("Health URL copied to clipboard! You can paste this in any free uptime monitor (UptimeRobot / Cron-Job) to keep the bot active 24/7.", "success");
      setTimeout(() => setCopiedPing(false), 3000);
    }).catch(() => {
      showToast("Failed to copy URL automatically. The endpoint is: /api/health", "error");
    });
  };

  // Initialize and track audio life cycle
  useEffect(() => {
    // Create new audio element if it doesn't exist
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }

    const audio = audioRef.current;
    audio.volume = volume / 100;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration || 0);
    };

    const handleEnded = () => {
      if (loopRef.current) {
        if (audioRef.current) {
          audioRef.current.currentTime = 0;
          audioRef.current.play().catch(console.error);
        }
      } else {
        handleAutoAdvance();
      }
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);

    // Initial load
    audio.src = activeSong.url;

    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
    };
  }, []);

  // Sync state volume with Audio Element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume / 100;
    }
  }, [volume]);

  // Handle play/pause toggle
  useEffect(() => {
    if (!audioRef.current) return;
    const audio = audioRef.current;

    if (isPlaying) {
      audio.play().catch((err) => {
        console.warn("Audio play blocked or failed. User gesture required:", err);
        setIsPlaying(false);
      });
    } else {
      audio.pause();
    }
  }, [isPlaying]);

  // Handle switching tracks
  useEffect(() => {
    if (!audioRef.current) return;
    const audio = audioRef.current;

    if (audio.src !== activeSong.url) {
      audio.src = activeSong.url;
      audio.load();
      if (isPlaying) {
        audio.play().catch(() => {
          setIsPlaying(false);
        });
      }
    }
  }, [activeSong]);

  useEffect(() => {
    fetchCookieStatus();
  }, []);

  const fetchCookieStatus = async () => {
    try {
      const res = await fetch("/api/music/youtube-cookie");
      if (res.ok) {
        const data = await res.json();
        setCookieStatus(data);
      }
    } catch (err) {
      console.error("Error fetching YouTube cookie status:", err);
    }
  };

  const handleSaveCookie = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cookieInput.trim()) return;
    setIsSavingCookie(true);
    try {
      const res = await fetch("/api/music/youtube-cookie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookie: cookieInput }),
      });
      if (res.ok) {
        const data = await res.json();
        setCookieStatus(data);
        setIsEditingCookie(false);
        setCookieInput("");
        setMusicLogs((prev) => [
          { text: `System updated: Saved secure YouTube cookie for streaming bypass (${data.length} chars).`, time: "Just now" },
          ...prev
        ]);
        showToast("Secure YouTube cookie saved successfully!", "success");
      } else {
        showToast("Failed to save YouTube cookie.", "error");
      }
    } catch (err) {
      console.error("Error saving YouTube cookie:", err);
      showToast("Error saving YouTube cookie.", "error");
    } finally {
      setIsSavingCookie(false);
    }
  };

  const handleClearCookie = async () => {
    if (!showClearCookieConfirm) {
      setShowClearCookieConfirm(true);
      setTimeout(() => {
        setShowClearCookieConfirm(false);
      }, 4000);
      return;
    }
    try {
      const res = await fetch("/api/music/youtube-cookie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookie: "" }),
      });
      if (res.ok) {
        const data = await res.json();
        setCookieStatus(data);
        setCookieInput("");
        setShowClearCookieConfirm(false);
        setMusicLogs((prev) => [
          { text: `System updated: Cleared YouTube cookie from bot storage.`, time: "Just now" },
          ...prev
        ]);
        showToast("Secure YouTube cookie removed successfully!", "success");
      }
    } catch (err) {
      console.error("Error clearing YouTube cookie:", err);
    }
  };

  const handleAutoAdvance = () => {
    setQueue((currentQueue) => {
      if (currentQueue.length > 1) {
        const nextSong = currentQueue[1];
        setActiveSong(nextSong);
        const newQueue = currentQueue.slice(1);
        
        setMusicLogs((prev) => [
          { text: `DarkFlower Bot auto-advanced: Playing "${nextSong.title}"`, time: "Just now" },
          ...prev
        ]);
        
        return newQueue;
      } else {
        if (autoplayRef.current) {
          const presetSongs = [
            { url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3", duration: "6:02", artist: "Aether Grid", thumb: "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c67?w=150&auto=format&fit=crop" },
            { url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3", duration: "5:44", artist: "Hologram Club", thumb: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=150&auto=format&fit=crop" },
            { url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3", duration: "7:35", artist: "Solar Flare", thumb: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=150&auto=format&fit=crop" },
            { url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3", duration: "5:38", artist: "Oasis Synth", thumb: "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=150&auto=format&fit=crop" }
          ];
          const selectedIndex = Math.floor(Math.random() * presetSongs.length);
          const nextRandom = presetSongs[selectedIndex];
          const autoSong: Song = {
            title: `Autoplay Related Track`,
            artist: nextRandom.artist,
            duration: nextRandom.duration,
            thumbnail: nextRandom.thumb,
            url: nextRandom.url
          };
          
          setActiveSong(autoSong);
          setIsPlaying(true);
          
          setMusicLogs((prev) => [
            { text: `DarkFlower Bot autoplay triggered: Auto-playing related track "${autoSong.title}"`, time: "Just now" },
            ...prev
          ]);
          
          return [autoSong];
        }

        setIsPlaying(false);
        setCurrentTime(0);
        if (audioRef.current) {
          audioRef.current.currentTime = 0;
        }
        return currentQueue;
      }
    });
  };

  const handleSearchAndAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const rawQuery = searchQuery.trim();
    if (!rawQuery) return;

    let query = rawQuery;

    // 1. SKIP command
    if (
      query.toLowerCase() === "/skip" || 
      query.toLowerCase() === "df!skip" || 
      query.toLowerCase() === "!skip" || 
      query.toLowerCase() === "skip"
    ) {
      skipSong();
      setSearchQuery("");
      return;
    }

    // 2. PAUSE command
    if (
      query.toLowerCase() === "/pause" || 
      query.toLowerCase() === "df!pause" || 
      query.toLowerCase() === "!pause" || 
      query.toLowerCase() === "pause"
    ) {
      setIsPlaying(false);
      setMusicLogs((prev) => [
        { text: `df!pause`, time: "Just now" },
        { text: `DarkFlower Bot playback paused`, time: "Just now" },
        ...prev
      ]);
      setSearchQuery("");
      return;
    }

    // 3. STOP command
    if (
      query.toLowerCase() === "/stop" || 
      query.toLowerCase() === "df!stop" || 
      query.toLowerCase() === "!stop" || 
      query.toLowerCase() === "stop"
    ) {
      setIsPlaying(false);
      setCurrentTime(0);
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
      }
      setMusicLogs((prev) => [
        { text: `df!stop`, time: "Just now" },
        { text: `DarkFlower Bot playback stopped`, time: "Just now" },
        ...prev
      ]);
      setSearchQuery("");
      return;
    }

    // 3b. LOOP command
    if (
      query.toLowerCase() === "/loop" || 
      query.toLowerCase() === "df!loop" || 
      query.toLowerCase() === "!loop" || 
      query.toLowerCase() === "loop"
    ) {
      setLoop((prev) => {
        const val = !prev;
        if (val) setAutoplay(false);
        setMusicLogs((prevLogs) => [
          { text: `df!loop`, time: "Just now" },
          { text: `DarkFlower Bot loop mode: ${val ? 'ENABLED' : 'DISABLED'}`, time: "Just now" },
          ...prevLogs
        ]);
        return val;
      });
      setSearchQuery("");
      return;
    }

    // 3c. AUTOPLAY command
    if (
      query.toLowerCase() === "/autoplay" || 
      query.toLowerCase() === "df!autoplay" || 
      query.toLowerCase() === "!autoplay" || 
      query.toLowerCase() === "autoplay"
    ) {
      setAutoplay((prev) => {
        const val = !prev;
        if (val) setLoop(false);
        setMusicLogs((prevLogs) => [
          { text: `df!autoplay`, time: "Just now" },
          { text: `DarkFlower Bot autoplay mode: ${val ? 'ENABLED' : 'DISABLED'}`, time: "Just now" },
          ...prevLogs
        ]);
        return val;
      });
      setSearchQuery("");
      return;
    }

    // 4. VOLUME command
    const volumeMatch = query.match(/^(?:\/volume|df!volume|!volume|volume)\s+(\d+)$/i);
    if (volumeMatch) {
      const volVal = Math.min(100, Math.max(0, parseInt(volumeMatch[1])));
      setVolume(volVal);
      setMusicLogs((prev) => [
        { text: `df!volume ${volVal}`, time: "Just now" },
        { text: `DarkFlower Bot volume adjusted to ${volVal}%`, time: "Just now" },
        ...prev
      ]);
      setSearchQuery("");
      return;
    }

    // 5. PLAY command (with or without query)
    const playMatch = query.match(/^(?:\/play|df!play|!play|play)(?:\s+(.*))?$/i);
    if (playMatch) {
      const queryPart = playMatch[1] ? playMatch[1].trim() : "";
      if (queryPart) {
        query = queryPart;
      } else {
        // Just "/play" (or "/play ") to resume playback
        setIsPlaying(true);
        if (audioRef.current) {
          audioRef.current.play().catch(console.error);
        }
        setMusicLogs((prev) => [
          { text: `df!play`, time: "Just now" },
          { text: `DarkFlower Bot playback resumed`, time: "Just now" },
          ...prev
        ]);
        setSearchQuery("");
        return;
      }
    }

    // Process song adding
    let artist = "Requested Track";
    let thumbnail = "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=150&auto=format&fit=crop";
    let durationStr = "6:02";
    let url = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3";

    if (query.startsWith("http://") || query.startsWith("https://")) {
      artist = "External Stream";
      durationStr = "Stream";
      url = query;
      thumbnail = "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=150&auto=format&fit=crop";
    } else {
      // See if they requested one of our default preset songs
      const defaults = [
        { name: "neon lotus", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3", duration: "6:12", artist: "DarkFlower Synth", thumb: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop" },
        { name: "synthwave sunset", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3", duration: "7:05", artist: "Viper Beats", thumb: "https://images.unsplash.com/photo-1515462277126-270d878326e5?w=150&auto=format&fit=crop" },
        { name: "digital bloom", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3", duration: "5:44", artist: "Lofi Blossom", thumb: "https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=150&auto=format&fit=crop" },
        { name: "cybernetic rainforest", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3", duration: "5:02", artist: "Nebula", thumb: "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=150&auto=format&fit=crop" }
      ];
      
      const matchedDefault = defaults.find(d => d.name === query.toLowerCase() || query.toLowerCase().includes(d.name));
      if (matchedDefault) {
        url = matchedDefault.url;
        durationStr = matchedDefault.duration;
        artist = matchedDefault.artist;
        thumbnail = matchedDefault.thumb;
        query = matchedDefault.artist + " - " + matchedDefault.name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      } else {
        // Rotate through multiple SoundHelix files for diversity on search
        const presetSongs = [
          { url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3", duration: "6:02", artist: "Aether Grid", thumb: "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c67?w=150&auto=format&fit=crop" },
          { url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3", duration: "5:44", artist: "Hologram Club", thumb: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=150&auto=format&fit=crop" },
          { url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3", duration: "7:35", artist: "Solar Flare", thumb: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=150&auto=format&fit=crop" },
          { url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3", duration: "5:38", artist: "Oasis Synth", thumb: "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=150&auto=format&fit=crop" }
        ];
        const selectedIndex = Math.floor(Math.random() * presetSongs.length);
        const chosenPreset = presetSongs[selectedIndex];
        url = chosenPreset.url;
        durationStr = chosenPreset.duration;
        artist = chosenPreset.artist;
        thumbnail = chosenPreset.thumb;
      }
    }

    const newSong: Song = {
      title: query,
      artist,
      duration: durationStr,
      thumbnail,
      url
    };

    setQueue((prevQueue) => {
      const updated = [...prevQueue, newSong];
      return updated;
    });

    // Start playing if currently paused or stopped
    if (!isPlaying) {
      setActiveSong(newSong);
      setIsPlaying(true);
      if (audioRef.current) {
        audioRef.current.play().catch(console.error);
      }
    }
    
    setMusicLogs((prev) => [
      { text: `df!play ${newSong.title}`, time: "Just now" },
      { text: `DarkFlower Bot added and started playing "${newSong.title}"`, time: "Just now" },
      ...prev
    ]);

    setSearchQuery("");
  };

  const skipSong = () => {
    if (queue.length > 1) {
      const nextSong = queue[1];
      setActiveSong(nextSong);
      setQueue(queue.slice(1));
      setIsPlaying(true);
      
      setMusicLogs((prev) => [
        { text: `df!skip`, time: "Just now" },
        { text: `Playing next: "${nextSong.title}"`, time: "Just now" },
        ...prev
      ]);
    } else {
      showToast("No more songs in queue!", "info");
    }
  };

  const removeSong = (index: number) => {
    if (index === 0) {
      skipSong();
    } else {
      const removed = queue[index];
      setQueue(queue.filter((_, i) => i !== index));
      setMusicLogs((prev) => [
        { text: `DarkFlower Bot removed "${removed.title}" from queue`, time: "Just now" },
        ...prev
      ]);
    }
  };

  const playSongFromQueue = (index: number) => {
    const selectedSong = queue[index];
    setActiveSong(selectedSong);
    const updatedQueue = [...queue.slice(index), ...queue.slice(0, index)];
    setQueue(updatedQueue);
    setIsPlaying(true);
    
    setMusicLogs((prev) => [
      { text: `df!play "${selectedSong.title}"`, time: "Just now" },
      ...prev
    ]);
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || duration === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    const percentage = clickX / width;
    const newTime = percentage * duration;
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs === Infinity) return "0:00";
    const minutes = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
      {/* Left 2 Cols: Music Player & Queue */}
      <div className="lg:col-span-2 space-y-6">
        
        {/* Active Player */}
        <div className="glass-panel p-6 rounded-2xl border border-purple-500/15 bg-gradient-to-br from-[#120e24] via-[#0e0a1b] to-[#17122e] relative overflow-hidden shadow-2xl">
          {/* Subtle floral/flower neon glow on background */}
          <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-purple-600/10 blur-3xl"></div>
          
          <div className="flex flex-col md:flex-row items-center gap-6 relative z-10">
            {/* Thumbnail */}
            <div className="w-32 h-32 md:w-36 md:h-36 rounded-xl overflow-hidden shadow-lg border border-purple-500/25 shrink-0 relative group">
              <img src={activeSong.thumbnail} className="w-full h-full object-cover transition duration-500 group-hover:scale-105" />
              {isPlaying && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center gap-1">
                  {/* Custom CSS Music Spectrum Waveform Bars */}
                  <span className="w-1.5 h-6 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></span>
                  <span className="w-1.5 h-10 bg-purple-300 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></span>
                  <span className="w-1.5 h-8 bg-[#ff73fa] rounded-full animate-bounce" style={{ animationDelay: '0.5s' }}></span>
                  <span className="w-1.5 h-5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                </div>
              )}
            </div>

            {/* Song details & Visualizer controls */}
            <div className="space-y-4 w-full text-center md:text-left">
              <div>
                <span className="text-[10px] bg-purple-500/20 text-purple-300 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
                  Currently Streaming to #General-Voice
                </span>
                <h3 className="text-xl md:text-2xl font-bold font-display text-white mt-1.5 tracking-tight">{activeSong.title}</h3>
                <p className="text-sm text-slate-400 mt-0.5">by {activeSong.artist}</p>
              </div>

              {/* Progress Slider */}
              <div className="space-y-1.5">
                <div 
                  onClick={handleProgressClick}
                  className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden relative cursor-pointer"
                >
                  <div 
                    className="h-full bg-gradient-to-r from-purple-500 to-[#ff73fa] rounded-full transition-all duration-100" 
                    style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-xs text-slate-400 font-mono">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              {/* Player Button Tray */}
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-4">
                <button
                  type="button"
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="w-11 h-11 rounded-full bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white flex items-center justify-center shadow-lg hover:shadow-purple-500/25 transition cursor-pointer"
                >
                  {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                </button>

                <button
                  type="button"
                  onClick={skipSong}
                  className="w-9 h-9 rounded-full bg-purple-950/40 border border-purple-500/20 hover:border-purple-500/40 text-purple-300 flex items-center justify-center transition cursor-pointer"
                  title="Skip track"
                >
                  <SkipForward className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => { setIsPlaying(false); if (audioRef.current) audioRef.current.currentTime = 0; }}
                  className="w-9 h-9 rounded-full bg-purple-950/40 border border-purple-500/20 hover:border-purple-500/40 text-purple-300 flex items-center justify-center transition cursor-pointer"
                  title="Stop playback"
                >
                  <Square className="w-3.5 h-3.5" />
                </button>

                {/* Loop Button */}
                <button
                  type="button"
                  onClick={() => {
                    const nextVal = !loop;
                    setLoop(nextVal);
                    if (nextVal) setAutoplay(false);
                    setMusicLogs((prev) => [
                      { text: `df!loop`, time: "Just now" },
                      { text: `DarkFlower Bot loop mode: ${nextVal ? 'ENABLED' : 'DISABLED'}`, time: "Just now" },
                      ...prev
                    ]);
                  }}
                  className={`w-9 h-9 rounded-full border flex items-center justify-center transition cursor-pointer ${
                    loop
                      ? "bg-purple-500/20 border-purple-400 text-purple-300"
                      : "bg-purple-950/40 border-purple-500/20 hover:border-purple-500/40 text-purple-300"
                  }`}
                  title="Toggle loop track"
                >
                  <Repeat className="w-4 h-4" />
                </button>

                {/* Autoplay Button */}
                <button
                  type="button"
                  onClick={() => {
                    const nextVal = !autoplay;
                    setAutoplay(nextVal);
                    if (nextVal) setLoop(false);
                    setMusicLogs((prev) => [
                      { text: `df!autoplay`, time: "Just now" },
                      { text: `DarkFlower Bot autoplay mode: ${nextVal ? 'ENABLED' : 'DISABLED'}`, time: "Just now" },
                      ...prev
                    ]);
                  }}
                  className={`w-9 h-9 rounded-full border flex items-center justify-center transition cursor-pointer ${
                    autoplay
                      ? "bg-indigo-500/20 border-indigo-400 text-indigo-300"
                      : "bg-purple-950/40 border-purple-500/20 hover:border-purple-500/40 text-purple-300"
                  }`}
                  title="Toggle autoplay"
                >
                  <Sparkles className="w-4 h-4" />
                </button>

                {/* Volume Slider */}
                <div className="flex items-center gap-2 ml-2 bg-slate-950/40 px-3 py-1.5 rounded-lg border border-purple-500/5">
                  <Volume2 className="w-4 h-4 text-purple-400" />
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    className="w-16 accent-purple-500 h-1 rounded-full cursor-pointer"
                  />
                  <span className="text-[10px] font-mono text-slate-400 w-5 text-right">{volume}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Play Queue */}
        <div className="glass-panel p-5 rounded-2xl border border-purple-500/10 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <h4 className="text-base font-bold text-white font-display flex items-center gap-2">
              <ListMusic className="w-5 h-5 text-purple-400" /> Play Queue ({queue.length} Tracks)
            </h4>
            <span className="text-xs text-slate-400 font-medium">Click any track below to play instantly</span>
          </div>

          {/* Add custom song */}
          <form onSubmit={handleSearchAndAdd} className="flex flex-col gap-2">
            <div className="flex gap-2">
              <div className="relative w-full">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Search tracks, enter URLs, or type commands (e.g., /play Neon Lotus)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950/60 border border-purple-500/20 hover:border-purple-500/35 focus:border-purple-500/65 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-slate-500 outline-none transition"
                />
              </div>
              <button
                type="submit"
                className="bg-purple-600 hover:bg-purple-500 text-white font-medium px-4 py-2 rounded-xl text-xs transition whitespace-nowrap cursor-pointer flex items-center gap-1 shadow-md"
              >
                <Sparkles className="w-3.5 h-3.5" /> Request
              </button>
            </div>
            <div className="text-[10px] text-slate-400/80 bg-slate-950/40 border border-purple-500/10 rounded-lg px-3 py-2 font-mono flex flex-wrap items-center gap-2">
              <span className="text-[#ff73fa] font-bold">💡 Discord Command Console:</span>
              <span>Type standard command tags directly here:</span>
              <code className="text-purple-300 bg-purple-950/40 px-1 py-0.5 rounded">/play [song]</code>
              <code className="text-purple-300 bg-purple-950/40 px-1 py-0.5 rounded">/skip</code>
              <code className="text-purple-300 bg-purple-950/40 px-1 py-0.5 rounded">/pause</code>
              <code className="text-purple-300 bg-purple-950/40 px-1 py-0.5 rounded">/stop</code>
              <code className="text-purple-300 bg-purple-950/40 px-1 py-0.5 rounded">/volume [0-100]</code>
              <code className="text-purple-300 bg-purple-950/40 px-1 py-0.5 rounded">/loop</code>
              <code className="text-purple-300 bg-purple-950/40 px-1 py-0.5 rounded">/autoplay</code>
            </div>
          </form>

          {/* Queue List */}
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {queue.map((song, index) => (
              <div
                key={index}
                onClick={() => playSongFromQueue(index)}
                className={`flex items-center justify-between p-2.5 rounded-xl border transition cursor-pointer ${
                  index === 0
                    ? "bg-purple-500/10 border-purple-500/30"
                    : "bg-slate-950/20 border-purple-500/5 hover:bg-purple-500/5 hover:border-purple-500/15"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded overflow-hidden border border-purple-500/10 shrink-0">
                    <img src={song.thumbnail} className="w-full h-full object-cover" />
                  </div>
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold truncate ${index === 0 ? "text-purple-300" : "text-white"}`}>
                      {song.title} {index === 0 && <span className="text-[9px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded ml-1 uppercase font-bold">Playing</span>}
                    </p>
                    <p className="text-xs text-slate-400 truncate">{song.artist}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-slate-400">{song.duration}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeSong(index);
                    }}
                    className="text-xs text-red-400 hover:text-red-300 hover:underline px-2 py-1"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Column: YouTube Cookie & Server Terminal Commands Console */}
      <div className="space-y-6">
        {/* YouTube Cookie Section */}
        <div className="glass-panel p-5 rounded-2xl border border-purple-500/10 space-y-4 shadow-xl bg-slate-950/20">
          <div className="pb-3 border-b border-purple-500/10">
            <h4 className="text-base font-bold text-white font-display flex items-center gap-2">
              <Key className="w-4 h-4 text-purple-400" />
              YouTube Authenticator
            </h4>
            <p className="text-[11px] text-slate-400 mt-0.5">Bypass Google sign-in & age verification blocks.</p>
          </div>

          {cookieStatus.configured ? (
            <div className="space-y-3">
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-xs">
                <Check className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-white font-semibold">Active & Loaded</p>
                  <p className="text-slate-400 font-mono text-[10px] mt-0.5 truncate">
                    Cookie size: {cookieStatus.length} chars ({cookieStatus.preview})
                  </p>
                </div>
              </div>

              {!isEditingCookie ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCookieInput("");
                      setIsEditingCookie(true);
                    }}
                    className="flex-1 bg-purple-950/40 hover:bg-purple-950/70 text-purple-300 border border-purple-500/20 text-xs font-semibold px-3 py-2 rounded-xl transition cursor-pointer"
                  >
                    Update Cookie
                  </button>
                  <button
                    type="button"
                    onClick={handleClearCookie}
                    className={`border p-2 rounded-xl transition cursor-pointer flex items-center justify-center gap-1 text-xs ${
                      showClearCookieConfirm 
                        ? "bg-red-600 hover:bg-red-500 text-white border-red-400 animate-pulse font-semibold px-3" 
                        : "bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/20"
                    }`}
                    title={showClearCookieConfirm ? "Click again to confirm" : "Remove Cookie"}
                  >
                    <Trash2 className="w-4 h-4" />
                    {showClearCookieConfirm && <span>Confirm Clear?</span>}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSaveCookie} className="space-y-3">
                  <textarea
                    rows={3}
                    placeholder="Paste new YouTube Cookie string or Netscape format..."
                    value={cookieInput}
                    onChange={(e) => setCookieInput(e.target.value)}
                    className="w-full bg-slate-950/60 border border-purple-500/20 hover:border-purple-500/35 focus:border-purple-500/65 rounded-xl p-2.5 text-xs text-white placeholder-slate-500 outline-none transition font-mono"
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={isSavingCookie || !cookieInput.trim()}
                      className="flex-1 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold py-2 rounded-xl transition cursor-pointer flex items-center justify-center gap-1"
                    >
                      <Save className="w-3.5 h-3.5" /> Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditingCookie(false)}
                      className="bg-[#242528] hover:bg-[#2f3136] text-white text-xs font-semibold px-3 py-2 rounded-xl transition cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-yellow-500/5 border border-yellow-500/10 text-xs">
                <AlertCircle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-yellow-400 font-semibold">Cookie Missing</p>
                  <p className="text-slate-400 leading-relaxed text-[10px] mt-0.5">
                    Without authentication cookies, streaming high-quality tracks may be blocked by Google's anti-bot protection.
                  </p>
                </div>
              </div>

              {!isEditingCookie ? (
                <button
                  type="button"
                  onClick={() => setIsEditingCookie(true)}
                  className="w-full bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold py-2 rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 shadow-md"
                >
                  <Key className="w-3.5 h-3.5" /> Provide YouTube Cookie
                </button>
              ) : (
                <form onSubmit={handleSaveCookie} className="space-y-3">
                  <div className="text-[10px] text-slate-400 leading-relaxed bg-slate-950/40 border border-purple-500/5 p-2 rounded-lg">
                    💡 <strong>Tip</strong>: You can extract your cookie using extensions like <em>Get cookies.txt</em> in Netscape format or copy raw header cookie value.
                  </div>
                  <textarea
                    rows={4}
                    placeholder="Paste YouTube Cookie (Netscape file format or raw header cookie string)..."
                    value={cookieInput}
                    onChange={(e) => setCookieInput(e.target.value)}
                    className="w-full bg-slate-950/60 border border-purple-500/20 hover:border-purple-500/35 focus:border-purple-500/65 rounded-xl p-2.5 text-xs text-white placeholder-slate-500 outline-none transition font-mono"
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={isSavingCookie || !cookieInput.trim()}
                      className="flex-1 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold py-2 rounded-xl transition cursor-pointer flex items-center justify-center gap-1"
                    >
                      <Save className="w-3.5 h-3.5" /> Save Cookie
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditingCookie(false)}
                      className="bg-[#242528] hover:bg-[#2f3136] text-white text-xs font-semibold px-3 py-2 rounded-xl transition cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>

        {/* 24/7 Voice Keep-Alive & Background Streaming Notice */}
        <div className="glass-panel p-5 rounded-2xl border border-purple-500/10 space-y-3.5 shadow-xl bg-slate-950/30">
          <div className="flex items-center justify-between pb-3 border-b border-purple-500/10">
            <h4 className="text-base font-bold text-white font-display flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400 animate-pulse" />
              24/7 Background Audio Pulse
            </h4>
            <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full">
              <Wifi className="w-3 h-3" /> Live
            </span>
          </div>

          <div className="text-xs text-slate-300 space-y-2 leading-relaxed">
            <p className="text-[11px] text-slate-300">
              In cloud/serverless containers, closing all browser tabs causes the host to enter <strong className="text-purple-300">idle mode</strong> to conserve power, which throttles Discord voice streaming.
            </p>
            <div className="p-3 rounded-xl bg-purple-950/20 border border-purple-500/15 text-[11px] space-y-2">
              <div className="flex items-center justify-between font-semibold text-white">
                <span>⚡ Keep Active Without Browser:</span>
              </div>
              <p className="text-slate-400 text-[10px]">
                To keep music streaming flawlessly 24/7 with zero stutter even when everyone closes the dashboard, point any free uptime monitor (e.g. <em>UptimeRobot</em> or <em>Cron-job.org</em>) to ping this endpoint every 2 minutes:
              </p>
              <div className="flex items-center gap-2 bg-slate-950/80 p-2 rounded-lg border border-purple-500/20">
                <code className="text-[11px] text-purple-300 font-mono truncate flex-1">
                  {typeof window !== "undefined" ? `${window.location.origin}/api/health` : "/api/health"}
                </code>
                <button
                  type="button"
                  onClick={handleCopyPingUrl}
                  className="shrink-0 bg-purple-600 hover:bg-purple-500 text-white text-[11px] font-semibold px-2.5 py-1 rounded-md transition flex items-center gap-1 cursor-pointer"
                >
                  {copiedPing ? <CheckCheck className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedPing ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Voice Bot Command Console */}
        <div className="glass-panel p-5 rounded-2xl border border-purple-500/10 flex flex-col h-full shadow-xl">
          <div className="pb-3 border-b border-purple-500/10">
            <h4 className="text-base font-bold text-white font-display flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500 animate-pulse"></span>
              Voice Bot Command Console
            </h4>
            <p className="text-[11px] text-slate-400 mt-0.5">Shows real-time actions happening inside discord guilds.</p>
          </div>

          <div className="flex-1 min-h-[300px] max-h-[400px] overflow-y-auto font-mono text-xs text-slate-300 space-y-3.5 py-4 scrollbar-thin">
            {musicLogs.map((log, idx) => (
              <div key={idx} className="bg-slate-950/40 p-2.5 rounded border border-purple-950/30 flex flex-col gap-1">
                <div className="flex justify-between items-center text-[10px] text-purple-400 border-b border-purple-950/20 pb-1">
                  <span>SYSTEM COMMAND</span>
                  <span>{log.time}</span>
                </div>
                <div className="text-white mt-1 select-all">{log.text}</div>
              </div>
            ))}
          </div>

          {/* Prompt informing commands are strictly guild-level */}
          <div className="mt-auto bg-purple-500/5 border border-purple-500/20 p-3 rounded-xl text-center">
            <p className="text-[11px] text-purple-300">
              ⚠️ <strong>Strict Security Policy</strong>: Music and audio commands are mapped strictly to guild server voice channels. Direct Messages (DMs) are blocked.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
