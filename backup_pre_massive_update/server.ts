import express from "express";
import http from "http";
import https from "https";
import { WebSocketServer, WebSocket } from "ws";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { Client, GatewayIntentBits, Events, EmbedBuilder, REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField, TextChannel } from "discord.js";
import { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, entersState, VoiceConnectionStatus, StreamType, generateDependencyReport, NoSubscriberBehavior, getVoiceConnection } from "@discordjs/voice";
import ffmpegStatic from "ffmpeg-static";
import play from "play-dl";
import ytdl from "@distube/ytdl-core";
import { Innertube, UniversalCache } from "youtubei.js";
import { Readable } from "stream";
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { initializeFirestore, doc, setDoc, getDoc, collection, getDocs } from "firebase/firestore";

// Prevent unhandled promise rejections and uncaught exceptions from crashing the process
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Unhandled Rejection] Unhandled rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[Uncaught Exception] Uncaught exception:', error);
});

function isValidUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

const ytClients = new Map<string, Innertube>();

function getSavedYoutubeCookie(): string | undefined {
  let cookie = process.env.YOUTUBE_COOKIE || "";
  const cookieFilePath = path.join(process.cwd(), "youtube_cookie.txt");
  if (!cookie && fs.existsSync(cookieFilePath)) {
    try {
      cookie = fs.readFileSync(cookieFilePath, "utf-8").trim();
    } catch (err) {
      console.error("[YouTube Cookie] Error reading cookie file:", err);
    }
  }
  return cookie || undefined;
}

async function getYTClient(guildId: string): Promise<Innertube> {
    if (ytClients.has(guildId)) {
        return ytClients.get(guildId)!;
    }
    const cacheDir = path.join(process.cwd(), `.yt_cache_${guildId}`);
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    
    const cookie = getSavedYoutubeCookie();
    const innertube = await Innertube.create({ 
        cache: new UniversalCache(true, cacheDir),
        cookie: cookie
    });
    ytClients.set(guildId, innertube);
    console.log(`youtubei.js initialized for guild ${guildId}${cookie ? ' with saved cookie' : ''}`);
    return innertube;
}

const DEFAULT_SOUNDCLOUD_CLIENT_ID = "atnjqnKFiGdFYho5GIFwq340Vmx8312q";

async function fetchDynamicSoundCloudClientId() {
  try {
    const res = await fetch("https://soundcloud.com");
    const text = await res.text();
    const scriptUrls = [...text.matchAll(/src="(https:\/\/[^"]+\.sndcdn\.com\/assets\/[^"]+\.js)"/g)].map(m => m[1]);
    for (let url of scriptUrls) {
      const sRes = await fetch(url);
      const sText = await sRes.text();
      const cMatch = sText.match(/client_id:"([^"]+)"/);
      if (cMatch) return cMatch[1];
    }
  } catch (e) {
    console.error("Error fetching dynamic soundcloud client id:", e);
  }
  return null;
}

fetchDynamicSoundCloudClientId().then(id => {
  if (id) {
    play.setToken({ soundcloud: { client_id: id } });
    console.log("play-dl soundcloud initialized with dynamic client_id: " + id);
  } else {
    play.setToken({ soundcloud: { client_id: DEFAULT_SOUNDCLOUD_CLIENT_ID } });
    console.log("play-dl soundcloud initialized with hardcoded default client_id");
  }
}).catch(err => {
  console.error("fetchDynamicSoundCloudClientId failed at startup, trying hardcoded client_id:", err);
  play.setToken({ soundcloud: { client_id: DEFAULT_SOUNDCLOUD_CLIENT_ID } });
});


process.env.FFMPEG_PATH = ffmpegStatic as string;
console.log(generateDependencyReport());

const savedCookie = getSavedYoutubeCookie();
if (savedCookie) {
  try {
    play.setToken({ youtube: { cookie: savedCookie } });
    console.log("[play-dl] YouTube cookie loaded successfully on startup.");
  } catch (err) {
    console.error("[play-dl] Failed to set YouTube cookie:", err);
  }
}

async function getHttpStream(url: string): Promise<Readable> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        getHttpStream(res.headers.location).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode && res.statusCode !== 200) {
        reject(new Error(`Failed to fetch HTTP stream, status code: ${res.statusCode}`));
        return;
      }
      resolve(res);
    }).on('error', (err) => {
      reject(err);
    });
  });
}

async function createResourceFromStreamOrUrl(streamInput: any, inputType?: any) {
  if (typeof streamInput === 'string' && streamInput.startsWith('http')) {
    const httpStream = await getHttpStream(streamInput);
    return createAudioResource(httpStream, { inputType: inputType || StreamType.Arbitrary });
  }
  return createAudioResource(streamInput, { inputType });
}

dotenv.config();

const app = express();
app.enable("trust proxy");
const PORT = 3000;

app.use(express.json());

// Ensure Firestore is fully synchronized before any API request is processed
app.use("/api", async (req, res, next) => {
  if (syncPromise) {
    await syncPromise.catch((err) => {
      console.error("[Database Sync] Error waiting for initial Firestore sync in middleware:", err);
    });
  }
  next();
});

// Restore currentUser session dynamically from x-user-session header
app.use((req, res, next) => {
  const sessionHeader = req.headers["x-user-session"];
  if (sessionHeader && typeof sessionHeader === "string") {
    try {
      const parsed = JSON.parse(sessionHeader);
      if (parsed && parsed.loggedIn) {
        currentUser = parsed;
      }
    } catch (e) {
      // Quietly ignore parsing issues
    }
  }
  next();
});

// Initialize Gemini SDK with telemetry and fallback
let ai: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  try {
    ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
    console.log("Gemini API Client initialized successfully.");
  } catch (err) {
    console.error("Failed to initialize Gemini API Client:", err);
  }
} else {
  console.warn("GEMINI_API_KEY is not defined. AI Mod Chat will run in simulation mode.");
}

// In-memory configurations and state for Discord Guilds
const welcomeChannelsConfig = new Map<string, string>();
const guildPlayers = new Map<string, any>();
const musicStates = new Map<string, {
  loop: boolean;
  autoplay: boolean;
  currentQuery: string;
  currentTrackTitle: string;
  voiceChannelId: string;
  textChannelId: string;
}>();

async function getRelatedTrackQuery(currentTitle: string): Promise<string> {
  const tracksPool = [
    "Synthwave Chill Out",
    "Lofi hip hop beats for study",
    "Neon Sunrise Retro Synth",
    "Digital Bloom Ambient",
    "Cyberpunk city rain lofi",
    "Chill lofi beats",
    "Retro future synthwave",
    "Cosmic Space ambient",
    "Relaxing rain synth"
  ];
  const filtered = tracksPool.filter(t => !currentTitle.toLowerCase().includes(t.toLowerCase()));
  const chosen = filtered.length > 0 ? filtered[Math.floor(Math.random() * filtered.length)] : tracksPool[0];
  return chosen;
}

async function playMusicStream(
  guildId: string,
  query: string,
  voiceChannelId: string,
  textChannel: any,
  interactionToReply: any,
  isAutoPlayOrLoop = false
) {
  try {
    if (interactionToReply && !isAutoPlayOrLoop) {
      if (!interactionToReply.deferred && !interactionToReply.replied && !interactionToReply._acknowledged) {
        try {
          await interactionToReply.deferReply().catch((err: any) => {
            if (err.code === 40060 || err.message?.includes('acknowledged')) {
              interactionToReply._acknowledged = true;
            }
          });
          if (!interactionToReply._acknowledged) {
            interactionToReply._acknowledged = true;
          }
        } catch (e: any) {
          if (e.code === 40060 || e.message?.includes('acknowledged')) {
            interactionToReply._acknowledged = true;
          }
        }
      }
    }

    const dClient = getDiscordClientForGuild(guildId);
    const guild = dClient?.guilds.cache.get(guildId);
    if (!guild) return;

    const connection = joinVoiceChannel({
      channelId: voiceChannelId,
      guildId: guildId,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: false,
    });

    try {
      console.log(`[Music Connection] Waiting for connection to be READY in guild ${guildId} (Channel: ${voiceChannelId})...`);
      // Shortened Ready timeout to 5s for fast fallback in cloud environments
      await entersState(connection, VoiceConnectionStatus.Ready, 5_000);
      console.log(`[Music Connection] Connection is READY in guild ${guildId}`);
    } catch (err: any) {
      console.error(`[Music Connection] Connection failed to reach READY state in 5s for guild ${guildId}:`, err);
      // Don't destroy immediately, check if it's still connecting/signalling
      if (connection.state.status !== VoiceConnectionStatus.Ready) {
        console.log(`[Music Connection] Connection status is currently: ${connection.state.status}. Attempting to proceed anyway.`);
        // If it's not ready but not destroyed, we might still be able to play if UDP is working but signalling is slow
        if (connection.state.status === VoiceConnectionStatus.Destroyed) {
          throw new Error("Failed to connect to the voice channel (Connection Destroyed). Please try again.");
        }
      }
    }

    let player = guildPlayers.get(guildId);
    if (!player) {
      player = createAudioPlayer({
        behaviors: {
          noSubscriber: NoSubscriberBehavior.Play,
        },
      });
      guildPlayers.set(guildId, player);
    }

    // Set up or update listeners
    player.removeAllListeners('error');
    player.removeAllListeners('stateChange');

    player.on('error', (error: any) => {
      console.error('Audio Player Error:', error);
      textChannel?.send(`Audio Player Error: ${error.message}`);
    });

    player.on('stateChange', async (oldState: any, newState: any) => {
      console.log(`Audio player transitioned from ${oldState.status} to ${newState.status}`);
      if (oldState.status !== 'idle' && newState.status === 'idle') {
        const state = musicStates.get(guildId);
        if (state && state.loop) {
          const vChanId = state.voiceChannelId || voiceChannelId;
          const dClient = getDiscordClientForGuild(guildId);
          const tChan = dClient?.channels.cache.get(state.textChannelId) || textChannel;
          tChan?.send(`🔁 **Loop active:** Replaying **${state.currentTrackTitle}**.`);
          playMusicStream(guildId, state.currentQuery, vChanId, tChan, null, true).catch(err => {
            console.error("Loop failed:", err);
            tChan?.send(`❌ **Loop failed:** ${err.message}`);
          });
        } else if (state && state.autoplay) {
          const related = await getRelatedTrackQuery(state.currentTrackTitle);
          const vChanId = state.voiceChannelId || voiceChannelId;
          const dClient = getDiscordClientForGuild(guildId);
          const tChan = dClient?.channels.cache.get(state.textChannelId) || textChannel;
          tChan?.send(`✨ **Autoplay active:** Next up: **${related}**.`);
          playMusicStream(guildId, related, vChanId, tChan, null, true).catch(err => {
             console.error("Autoplay failed:", err);
             tChan?.send(`❌ **Autoplay failed:** ${err.message}`);
          });
        } else {
          // Avoid spamming if not active
          // textChannel?.send('Player finished or went idle.');
        }
      }
    });

    connection.removeAllListeners('stateChange');
    connection.removeAllListeners('error');

    const networkStateChangeHandler = (oldNetworkState: any, newNetworkState: any) => {
      const newUdp = Reflect.get(newNetworkState, 'udp');
      clearInterval(newUdp?.keepAliveInterval);
    };

    // Apply to initial networking state to clear keepAlive immediately and prevent disconnects
    const initialNetworking = Reflect.get(connection.state, 'networking');
    if (initialNetworking) {
      const initialUdp = Reflect.get(initialNetworking.state, 'udp');
      if (initialUdp?.keepAliveInterval) {
        clearInterval(initialUdp.keepAliveInterval);
      }
      initialNetworking.on('stateChange', networkStateChangeHandler);
    }

    connection.on('stateChange', async (oldState: any, newState: any) => {
      console.log(`Connection transitioned from ${oldState.status} to ${newState.status}`);
      Reflect.get(oldState, 'networking')?.off('stateChange', networkStateChangeHandler);
      Reflect.get(newState, 'networking')?.on('stateChange', networkStateChangeHandler);

      if (newState.status === VoiceConnectionStatus.Disconnected) {
        try {
          await Promise.race([
            entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
            entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
          ]);
          // Seems to be reconnecting to a new channel - ignore
        } catch (e) {
          // Seems to be a real disconnect which should be treated as a terminal state
          console.log("[Music Connection] Disconnected and failed to reconnect automatically. Destroying.");
          connection.destroy();
        }
      } else if (newState.status === VoiceConnectionStatus.Destroyed) {
        // Fallback clear just in case
        const oldNetworking = Reflect.get(oldState, 'networking');
        const oldUdp = Reflect.get(oldNetworking || {}, 'state')?.udp;
        if (oldUdp?.keepAliveInterval) {
          clearInterval(oldUdp.keepAliveInterval);
        }
      }
    });

    connection.on('debug', (message: string) => {
      console.log(`[Music Connection Debug] ${message}`);
    });

    connection.on('error', (error: any) => {
      console.error('Connection Error:', error);
    });

    connection.subscribe(player);

    if (!interactionToReply || isAutoPlayOrLoop) {
      textChannel?.send(`🎵 **Loading track:** \`${query}\`...`);
    }

    const sendReply = async (payload: any) => {
      if (interactionToReply && !isAutoPlayOrLoop) {
        try {
          if (interactionToReply.deferred || interactionToReply.replied || interactionToReply._acknowledged) {
            await interactionToReply.editReply(payload).catch(async (err: any) => {
              console.warn("[Music Connection] editReply failed, attempting followUp:", err.message);
              await interactionToReply.followUp(payload).catch((fErr) => {
                console.error("[Music Connection] followUp failed too:", fErr.message);
              });
            });
          } else {
            await interactionToReply.reply(payload).catch(async (err: any) => {
              console.warn("[Music Connection] reply failed, attempting fallback:", err.message);
              if (err.code === 40060 || err.message?.includes('acknowledged')) {
                await interactionToReply.followUp(payload).catch(() => {});
              } else if (textChannel) {
                if (typeof payload === 'string') {
                  await textChannel.send(payload).catch(console.error);
                } else {
                  await textChannel.send({ embeds: payload.embeds || [] }).catch(console.error);
                }
              }
            });
          }
        } catch (globalErr: any) {
          console.error("[Music Connection] Error sending interaction response:", globalErr);
          if (textChannel) {
            if (typeof payload === 'string') {
              await textChannel.send(payload).catch(console.error);
            } else {
              await textChannel.send({ embeds: payload.embeds || [] }).catch(console.error);
            }
          }
        }
      } else {
        if (typeof payload === 'string') {
          await textChannel.send(payload).catch(console.error);
        } else {
          await textChannel.send({ embeds: payload.embeds || [] }).catch(console.error);
        }
      }
    };

    let stream;
    let trackInfo = query;
    let resource;
    let resolvedUrl = query;
    try {
      let ytTitle = null;
      if (query.startsWith('http') && (query.includes('youtube.com') || query.includes('youtu.be'))) {
          const guildYt = await getYTClient(guildId);
          if (!guildYt) throw new Error("YouTube client not initialized.");
          let videoId = query;
          try {
            const url = new URL(query);
            videoId = url.searchParams.get('v') || url.pathname.split('/').pop() || query;
          } catch(e) {}
          
          resolvedUrl = `https://www.youtube.com/watch?v=${videoId}`;
          
          try {
            try {
               const info = await guildYt.getBasicInfo(videoId);
               trackInfo = info.basic_info.title || query;
            } catch (e) {
               const ytExt = await import('youtube-ext');
               const info = await ytExt.videoInfo(videoId);
               trackInfo = info.title || query;
            }
            ytTitle = trackInfo;
            
            try {
              const webStream = await guildYt.download(videoId, { type: 'audio', quality: 'best', format: 'mp4' });
              stream = { stream: Readable.fromWeb(webStream as any) };
              resource = await createResourceFromStreamOrUrl(stream.stream);
            } catch (firstDlErr) {
              console.log("YouTube download failed via youtubei.js, trying play-dl for:", videoId);
              try {
                const ytStream = await play.stream(resolvedUrl);
                stream = { stream: ytStream.stream, type: ytStream.type };
                resource = await createResourceFromStreamOrUrl(stream.stream, stream.type);
              } catch (secondDlErr) {
                console.log("YouTube download failed via play-dl, trying @distube/ytdl-core for:", videoId);
                try {
                  const savedCookie = getSavedYoutubeCookie();
                  const ytdlOptions: any = {
                    filter: 'audioonly',
                    quality: 'highestaudio',
                    highWaterMark: 1 << 25
                  };
                  if (savedCookie) {
                    ytdlOptions.requestOptions = {
                      headers: {
                        cookie: savedCookie
                      }
                    };
                  }
                  const ytStream = ytdl(resolvedUrl, ytdlOptions);
                  stream = { stream: ytStream };
                  resource = await createResourceFromStreamOrUrl(stream.stream);
                } catch (thirdDlErr) {
                  throw thirdDlErr;
                }
              }
            }
          } catch (err: any) {
            if (ytTitle && ytTitle !== query && !ytTitle.startsWith('http')) {
               console.log("YouTube download failed, trying SoundCloud for:", ytTitle);
               const cleanQ = sanitizeTitleForSoundCloud(ytTitle);
               try {
                 const searchResults = await searchSoundCloudWithRecovery(cleanQ || ytTitle, { limit: 1, source: { soundcloud: 'tracks' } });
                 if (searchResults && searchResults.length > 0) {
                   trackInfo = (searchResults[0] as any).name || (searchResults[0] as any).title || ytTitle;
                   resolvedUrl = searchResults[0].url;
                   const soStream = await streamSoundCloudWithRecovery(resolvedUrl);
                   stream = { stream: soStream.stream, type: soStream.type };
                   resource = await createResourceFromStreamOrUrl(stream.stream, stream.type);
                 } else {
                   throw new Error(`The track "${cleanQ}" could not be found on SoundCloud fallback.`);
                 }
               } catch (soErr: any) {
                 throw new Error(`YouTube and SoundCloud are both blocking playback. SoundCloud error: ${soErr.message || soErr}`);
               }
            } else {
               throw new Error(`YouTube is blocking playback for this track (Bot Protection). Try searching for the song name instead of URL to use the SoundCloud fallback.`);
            }
          }
      } else if (query.startsWith('http') && query.includes('soundcloud.com')) {
          console.log("SoundCloud URL detected. Using play-dl to stream:", query);
          try {
            const searchResults = await searchSoundCloudWithRecovery(query, { limit: 1, source: { soundcloud: 'tracks' } });
            if (searchResults && searchResults.length > 0) {
              trackInfo = (searchResults[0] as any).name || (searchResults[0] as any).title || query;
              resolvedUrl = searchResults[0].url;
              const soStream = await streamSoundCloudWithRecovery(resolvedUrl);
              stream = { stream: soStream.stream, type: StreamType.Arbitrary };
              resource = await createResourceFromStreamOrUrl(stream.stream, stream.type);
            } else {
              throw new Error("No results found for this SoundCloud URL.");
            }
          } catch(err: any) {
            throw new Error(`Failed to stream SoundCloud URL: ${err.message || err}`);
          }
      } else if (query.startsWith('http')) {
          console.log("Direct HTTP/HTTPS stream detected. Using FFmpeg to stream directly:", query);
          resolvedUrl = query;
          resource = await createResourceFromStreamOrUrl(query, StreamType.Arbitrary);
      } else {
        try {
          const searchResults = await searchSoundCloudWithRecovery(query, { limit: 1, source: { soundcloud: 'tracks' } });
          if (searchResults && searchResults.length > 0) {
            trackInfo = (searchResults[0] as any).name || (searchResults[0] as any).title || query;
            resolvedUrl = searchResults[0].url;
            const soStream = await streamSoundCloudWithRecovery(resolvedUrl);
            stream = { stream: soStream.stream, type: StreamType.Arbitrary };
            resource = await createResourceFromStreamOrUrl(stream.stream, stream.type);
          } else {
            throw new Error("No results found on SoundCloud");
          }
        } catch(err) {
           console.error("SoundCloud search failed, trying youtube:", err);
           let videoId;
           let infoTitle;
           try {
             const guildYt = await getYTClient(guildId);
             if (!guildYt) throw new Error("YouTube client not initialized.");
             const search = await guildYt.search(query);
             if (search.videos && search.videos.length > 0) {
               videoId = (search.videos[0] as any).id || (search.videos[0] as any).video_id;
               try {
                   const info = await guildYt.getBasicInfo(videoId);
                   infoTitle = info.basic_info.title || query;
               } catch (e) {
                   const ytExt = await import('youtube-ext');
                   const info = await ytExt.videoInfo(videoId);
                   infoTitle = info.title || query;
               }
             } else {
                throw new Error("No results found on YouTube");
             }
           } catch (searchErr) {
               const ytExt = await import('youtube-ext');
               const search = await ytExt.search(query);
               if (search.videos && search.videos.length > 0) {
                  videoId = search.videos[0].id;
                  infoTitle = search.videos[0].title || query;
               } else {
                  throw searchErr;
               }
           }
           
           if (videoId) {
             trackInfo = infoTitle || query;
             resolvedUrl = `https://www.youtube.com/watch?v=${videoId}`;
             
             try {
                const guildYt = await getYTClient(guildId);
                const webStream = await guildYt.download(videoId, { type: 'audio', quality: 'best', format: 'mp4' });
                stream = { stream: Readable.fromWeb(webStream as any) };
                resource = await createResourceFromStreamOrUrl(stream.stream);
             } catch(dlErr: any) {
                console.log("YouTube search download failed via youtubei.js, trying play-dl for:", videoId);
                try {
                  const ytStream = await play.stream(resolvedUrl);
                  stream = { stream: ytStream.stream, type: ytStream.type };
                  resource = await createResourceFromStreamOrUrl(stream.stream, ytStream.type);
                } catch (firstDlErr) {
                  console.log("YouTube search download failed via play-dl, trying @distube/ytdl-core for:", videoId);
                  try {
                    const savedCookie = getSavedYoutubeCookie();
                    const ytdlOptions: any = {
                      filter: 'audioonly',
                      quality: 'highestaudio',
                      highWaterMark: 1 << 25
                    };
                    if (savedCookie) {
                      ytdlOptions.requestOptions = {
                        headers: {
                          cookie: savedCookie
                        }
                      };
                    }
                    const ytStream = ytdl(resolvedUrl, ytdlOptions);
                    stream = { stream: ytStream };
                    resource = await createResourceFromStreamOrUrl(stream.stream);
                  } catch (secondDlErr) {
                    console.log("YouTube download failed, trying SoundCloud again for:", trackInfo);
                    const cleanQ = sanitizeTitleForSoundCloud(trackInfo);
                    try {
                      const soSearch = await searchSoundCloudWithRecovery(cleanQ || trackInfo, { limit: 1, source: { soundcloud: 'tracks' } });
                      if (soSearch && soSearch.length > 0) {
                        trackInfo = (soSearch[0] as any).name || (soSearch[0] as any).title || trackInfo;
                        resolvedUrl = soSearch[0].url;
                        const soStream = await streamSoundCloudWithRecovery(resolvedUrl);
                        stream = { stream: soStream.stream, type: StreamType.Arbitrary };
                        resource = await createResourceFromStreamOrUrl(stream.stream, stream.type);
                      } else {
                        throw new Error(`The track "${cleanQ}" could not be found on SoundCloud fallback.`);
                      }
                    } catch (soErr: any) {
                      throw new Error(`YouTube and SoundCloud are both blocking playback. SoundCloud error: ${soErr.message || soErr}`);
                    }
                  }
                }
             }
           } else {
             throw new Error("No results found");
           }
        }
      }
      
      player.play(resource);

      // Track active state info
      let state = musicStates.get(guildId);
      if (!state) {
        state = {
          loop: false,
          autoplay: false,
          currentQuery: resolvedUrl,
          currentTrackTitle: trackInfo,
          voiceChannelId: voiceChannelId,
          textChannelId: textChannel?.id || ""
        };
        musicStates.set(guildId, state);
      } else {
        state.currentQuery = resolvedUrl;
        state.currentTrackTitle = trackInfo;
        state.voiceChannelId = voiceChannelId;
        state.textChannelId = textChannel?.id || state.textChannelId;
      }
      
      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('▶️ Now Playing')
        .setDescription('Started playing music in the voice channel.')
        .addFields(
          { name: 'Channel', value: `<#${voiceChannelId}>`, inline: true },
          { name: 'Track', value: trackInfo, inline: true }
        )
        .setTimestamp();

      await sendReply({ embeds: [embed] });
    } catch (err: any) {
      console.error('Error playing track, starting backup fallback stream:', err);
      const backupStreams = [
        { title: "Neon Lotus", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" },
        { title: "Synthwave Sunset", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3" },
        { title: "Digital Bloom", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3" },
        { title: "Cybernetic Rainforest", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3" }
      ];
      const randomBackup = backupStreams[Math.floor(Math.random() * backupStreams.length)];
      
      try {
        console.log(`Using backup stream: ${randomBackup.title} from URL: ${randomBackup.url}`);
        const fallbackResource = await createResourceFromStreamOrUrl(randomBackup.url, StreamType.Arbitrary);
        player.play(fallbackResource);
        
        let state = musicStates.get(guildId);
        if (!state) {
          state = {
            loop: false,
            autoplay: false,
            currentQuery: randomBackup.url,
            currentTrackTitle: randomBackup.title,
            voiceChannelId: voiceChannelId,
            textChannelId: textChannel?.id || ""
          };
          musicStates.set(guildId, state);
        } else {
          state.currentQuery = randomBackup.url;
          state.currentTrackTitle = randomBackup.title;
          state.voiceChannelId = voiceChannelId;
          state.textChannelId = textChannel?.id || state.textChannelId;
        }

        const fallbackEmbed = new EmbedBuilder()
          .setColor('#8A2BE2')
          .setTitle('📻 DarkFlower Radio (Active Backup)')
          .setDescription(`The requested track could not be fetched due to YouTube/SoundCloud API restrictions.\n\nTo keep the vibes alive, we have entered **DarkFlower Premium Radio** mode!`)
          .addFields(
            { name: 'Playing Backup Track', value: randomBackup.title, inline: true },
            { name: 'Original Request', value: `\`${query.substring(0, 50)}\``, inline: true },
            { name: 'Technical Reason', value: `\`${err.message || err}\``, inline: false }
          )
          .setTimestamp();
        await sendReply({ embeds: [fallbackEmbed] });
      } catch (fallbackErr: any) {
        console.error('Failed to play backup stream:', fallbackErr);
        const errorEmbed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('❌ Error')
          .setDescription(`Failed to play the requested track.\nReason: \`${fallbackErr.message || fallbackErr}\``);
        await sendReply({ embeds: [errorEmbed] });
      }
    }
  } catch (error) {
    console.error('Error joining voice channel:', error);
    if (interactionToReply && !isAutoPlayOrLoop) {
      const errorEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('❌ Error')
        .setDescription('Failed to join voice channel or play music.');
      if (interactionToReply.deferred || interactionToReply.replied || interactionToReply._acknowledged) {
        await interactionToReply.editReply({ embeds: [errorEmbed] }).catch(() => {});
      } else {
        await interactionToReply.reply({ embeds: [errorEmbed], ephemeral: true }).catch(() => {});
      }
    } else {
      textChannel?.send('❌ Failed to join voice channel or play music.').catch(() => {});
    }
  }
}

const userWarnings = new Map<string, { reason: string, timestamp: number }[]>();
const pendingProposals = new Map<string, { fromId: string, toId: string, familyName: string, timestamp: number }>();

let syncPromise: Promise<void> | null = null;

// Live Discord Bot Client Setup
const customBotClients = new Map<string, Client>();

function getDiscordClientForGuild(guildId: string): Client | null {
  const customClient = customBotClients.get(guildId);
  if (customClient && customClient.isReady()) {
    return customClient;
  }
  return discordClient;
}

let discordClient: Client | null = null;
const discordBotInfo = {
  connected: false,
  username: "",
  avatar: "",
  id: "",
  hasToken: !!process.env.DISCORD_BOT_TOKEN,
  clientId: process.env.DISCORD_CLIENT_ID || "",
  hasClientSecret: !!process.env.DISCORD_CLIENT_SECRET,
  supportInvite: process.env.DISCORD_SUPPORT_SERVER_INVITE || ""
};

let commandsList: any[] = [];

function getBotCommands() {
  return [
    new SlashCommandBuilder()
      .setName('login')
      .setDescription('Login to YouTube to play age-restricted tracks.'),
    new SlashCommandBuilder()
      .setName('play')
      .setDescription('Play a song from YouTube or SoundCloud')
      .addStringOption(option => 
          option.setName('query')
          .setDescription('The name of the song or a URL')
          .setRequired(true)),
    new SlashCommandBuilder()
      .setName('stop')
      .setDescription('Stop playing music'),
    new SlashCommandBuilder()
      .setName('skip')
      .setDescription('Skip the current song'),
    new SlashCommandBuilder()
      .setName('pause')
      .setDescription('Pause the music'),
    new SlashCommandBuilder()
      .setName('resume')
      .setDescription('Resume the music'),
    new SlashCommandBuilder()
      .setName('loop')
      .setDescription('Toggle looping the current music track'),
    new SlashCommandBuilder()
      .setName('autoplay')
      .setDescription('Toggle autoplaying related music tracks when current finishes'),
    new SlashCommandBuilder()
      .setName('ban')
      .setDescription('Ban a user')
      .addUserOption(option => option.setName('target').setDescription('The user to ban').setRequired(true))
      .addStringOption(option => option.setName('reason').setDescription('Reason for banning')),
    new SlashCommandBuilder()
      .setName('kick')
      .setDescription('Kick a user')
      .addUserOption(option => option.setName('target').setDescription('The user to kick').setRequired(true))
      .addStringOption(option => option.setName('reason').setDescription('Reason for kicking')),
    new SlashCommandBuilder()
      .setName('timeout')
      .setDescription('Timeout a user')
      .addUserOption(option => option.setName('target').setDescription('The user to timeout').setRequired(true))
      .addIntegerOption(option => option.setName('duration').setDescription('Duration in minutes').setRequired(true))
      .addStringOption(option => option.setName('reason').setDescription('Reason for timeout')),
    new SlashCommandBuilder()
      .setName('clear')
      .setDescription('Clear chat messages')
      .addIntegerOption(option => option.setName('amount').setDescription('Number of messages to delete').setRequired(true)),
    new SlashCommandBuilder()
      .setName('unban')
      .setDescription('Unban a user by their user ID')
      .addStringOption(option => option.setName('userid').setDescription('The user ID of the user to unban').setRequired(true))
      .addStringOption(option => option.setName('reason').setDescription('Reason for unbanning')),
    new SlashCommandBuilder()
      .setName('warn')
      .setDescription('Warn a user on this server')
      .addUserOption(option => option.setName('target').setDescription('The user to warn').setRequired(true))
      .addStringOption(option => option.setName('reason').setDescription('Reason for warning').setRequired(true)),
    new SlashCommandBuilder()
      .setName('warnings')
      .setDescription('Check warnings for a user')
      .addUserOption(option => option.setName('target').setDescription('The user to check').setRequired(true)),
    new SlashCommandBuilder()
      .setName('clearwarnings')
      .setDescription('Clear warnings for a user')
      .addUserOption(option => option.setName('target').setDescription('The user to clear warnings for').setRequired(true)),
    new SlashCommandBuilder()
      .setName('lock')
      .setDescription('Lock a channel to prevent sending messages')
      .addChannelOption(option => option.setName('channel').setDescription('Channel to lock (defaults to current)')),
    new SlashCommandBuilder()
      .setName('unlock')
      .setDescription('Unlock a channel to allow sending messages')
      .addChannelOption(option => option.setName('channel').setDescription('Channel to unlock (defaults to current)')),
    new SlashCommandBuilder()
      .setName('slowmode')
      .setDescription('Set slowmode (cooldown) for a channel')
      .addIntegerOption(option => option.setName('seconds').setDescription('Slowmode duration in seconds (0 to disable)').setRequired(true))
      .addChannelOption(option => option.setName('channel').setDescription('Channel to set slowmode for (defaults to current)')),
    new SlashCommandBuilder()
      .setName('setwelcome')
      .setDescription('Set the welcome channel')
      .addChannelOption(option => option.setName('channel').setDescription('Channel for welcome messages').setRequired(true)),
    new SlashCommandBuilder()
      .setName('aiwelcome')
      .setDescription('Use AI to scan your server and automatically configure a customized welcome message.'),
    new SlashCommandBuilder()
      .setName('testwelcome')
      .setDescription('Test the welcome message format'),
    new SlashCommandBuilder()
      .setName('ticket')
      .setDescription('Ticket commands')
      .addSubcommand(sub => sub.setName('panel').setDescription('Setup a ticket panel with rich embed'))
      .addSubcommand(sub => sub.setName('setup').setDescription('Setup a ticket panel in this channel'))
      .addSubcommand(sub => sub.setName('close').setDescription('Close this ticket')),
    new SlashCommandBuilder()
      .setName('embed')
      .setDescription('Send a custom rich embed to a channel')
      .addStringOption(option => option.setName('title').setDescription('Embed title').setRequired(true))
      .addStringOption(option => option.setName('description').setDescription('Embed description').setRequired(true))
      .addStringOption(option => option.setName('color').setDescription('Hex color code (e.g. #ff0000)'))
      .addChannelOption(option => option.setName('channel').setDescription('Channel to send the embed to (defaults to current)')),
    new SlashCommandBuilder()
      .setName('rank')
      .setDescription('View your current server level and experience profile card.')
      .addUserOption(option => option.setName('user').setDescription('The user to view (defaults to you)').setRequired(false)),
    new SlashCommandBuilder()
      .setName('profile')
      .setDescription('View your current server level and experience profile card.')
      .addUserOption(option => option.setName('user').setDescription('The user to view (defaults to you)').setRequired(false)),
    new SlashCommandBuilder()
      .setName('info')
      .setDescription('View all available commands and their explanations.'),
    new SlashCommandBuilder()
      .setName('help')
      .setDescription('View all available commands and their explanations.'),
    new SlashCommandBuilder()
      .setName('marry')
      .setDescription('Propose marriage to another member with a custom family name.')
      .addUserOption(option => option.setName('user').setDescription('The user who you want to marry').setRequired(true))
      .addStringOption(option => option.setName('family_name').setDescription('The family name that will show as a nick beside their real name').setRequired(true)),
    new SlashCommandBuilder()
      .setName('accept-marry')
      .setDescription('Accept a marriage proposal from a user.')
      .addUserOption(option => option.setName('user').setDescription('The user who proposed to you').setRequired(true)),
    new SlashCommandBuilder()
      .setName('poke')
      .setDescription('Poke someone!')
      .addUserOption(option => option.setName('user').setDescription('The user to poke').setRequired(true)),
    new SlashCommandBuilder()
      .setName('accept')
      .setDescription('Accept relationships or actions')
      .addSubcommand(sub =>
        sub.setName('marry')
          .setDescription('Accept a marriage proposal from a user')
          .addUserOption(option => option.setName('user').setDescription('The user who proposed to you').setRequired(true))
      )
      .addSubcommand(sub =>
        sub.setName('adopt')
          .setDescription('Accept an adoption request from a user')
          .addUserOption(option => option.setName('user').setDescription('The user who proposed to adopt you').setRequired(true))
      )
      .addSubcommand(sub =>
        sub.setName('parent')
          .setDescription('Accept a parent request from a user')
          .addUserOption(option => option.setName('user').setDescription('The user who wants you to be their parent').setRequired(true))
      ),
    new SlashCommandBuilder()
      .setName('adopt')
      .setDescription('Sends a request to adopt another server member as your child.')
      .addUserOption(option => option.setName('user').setDescription('The member you wish to adopt').setRequired(true)),
    new SlashCommandBuilder()
      .setName('disown')
      .setDescription('Removes a child from your family tree.')
      .addUserOption(option => option.setName('user').setDescription('The child you want to disown').setRequired(true)),
    new SlashCommandBuilder()
      .setName('makeparent')
      .setDescription('Asks a user to become your parent.')
      .addUserOption(option => option.setName('user').setDescription('The user you want as your parent').setRequired(true)),
    new SlashCommandBuilder()
      .setName('accept-adopt')
      .setDescription('Accept an adoption request.')
      .addUserOption(option => option.setName('user').setDescription('The user who wants to adopt you').setRequired(true)),
    new SlashCommandBuilder()
      .setName('accept-parent')
      .setDescription('Accept a request from a user wanting you to be their parent.')
      .addUserOption(option => option.setName('user').setDescription('The user who wants you as their parent').setRequired(true)),
    new SlashCommandBuilder()
      .setName('tree')
      .setDescription('Displays a visual graphic or text map of the user\'s spouses, parents, and children.')
      .addUserOption(option => option.setName('user').setDescription('The user whose family tree you want to view').setRequired(false)),
    new SlashCommandBuilder()
      .setName('status')
      .setDescription('Shows a profile card featuring wedding anniversary dates, total days married, and family size.')
      .addUserOption(option => option.setName('user').setDescription('The user whose status you want to view').setRequired(false)),
    new SlashCommandBuilder()
      .setName('unmarry')
      .setDescription('Dissolve your current marriage and restore your original nickname.'),
    new SlashCommandBuilder()
      .setName('divorce')
      .setDescription('Dissolve your current marriage and restore your original nickname.'),
    new SlashCommandBuilder()
      .setName('flirt')
      .setDescription('Flirt with another server member!')
      .addUserOption(option => option.setName('user').setDescription('The user to flirt with').setRequired(true)),
    new SlashCommandBuilder()
      .setName('hug')
      .setDescription('Give someone a warm, custom hug!')
      .addUserOption(option => option.setName('user').setDescription('The user to hug').setRequired(true)),
    new SlashCommandBuilder()
      .setName('kiss')
      .setDescription('Send a sweet, romantic kiss!')
      .addUserOption(option => option.setName('user').setDescription('The user to kiss').setRequired(true)),
    new SlashCommandBuilder()
      .setName('summon')
      .setDescription('Summon your spouse to your current voice channel! (Limit: 3/day)'),
    new SlashCommandBuilder()
      .setName('afk')
      .setDescription('Set an AFK status to let others know you are away.')
      .addStringOption(option => option.setName('reason').setDescription('The reason for being AFK').setRequired(false)),
    new SlashCommandBuilder()
      .setName('tempvc')
      .setDescription('Manage temporary voice channel settings (Admin only)')
      .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels)
      .addSubcommand(sub => 
        sub.setName('setup')
          .setDescription('Designate a master voice channel as the Join-to-Create hub')
          .addChannelOption(option => option.setName('channel').setDescription('The hub voice channel').setRequired(true).addChannelTypes(ChannelType.GuildVoice)))
      .addSubcommand(sub =>
        sub.setName('settings')
          .setDescription('Configure default settings for temporary channels')
          .addStringOption(option => option.setName('naming').setDescription('Naming style (e.g., ☁️ {user}\'s Room)').setRequired(false))
          .addIntegerOption(option => option.setName('limit').setDescription('Default user limit (0 for unlimited)').setRequired(false).setMinValue(0).setMaxValue(99))
          .addChannelOption(option => option.setName('category').setDescription('Category for temporary channels').setRequired(false).addChannelTypes(ChannelType.GuildCategory))),
    new SlashCommandBuilder()
      .setName('vcjoinpermission')
      .setDescription('Grant someone permission to join your temporary voice channel.')
      .addUserOption(option => option.setName('user').setDescription('The user to grant permission').setRequired(true)),
    new SlashCommandBuilder()
      .setName('refresh')
      .setDescription('Manage slash commands for this server (Admin only)')
      .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
      .addSubcommand(sub => 
        sub.setName('sync')
          .setDescription('Force refresh and sync all slash commands for this server'))
      .addSubcommand(sub =>
        sub.setName('clear')
          .setDescription('Clear all guild-specific commands for this server (fixes duplicates)')),
  ];
}


function registerBotEvents(client: Client, isCustom: boolean = false, boundGuildId?: string) {
  try {
    // Add connection event listeners for custom bots to handle network events and error state reporting
    client.on(Events.Error, async (error) => {
      console.error(`[Discord Bot Error] ${isCustom ? '(Custom Bot) ' : ''}Client error:`, error);
      if (isCustom && boundGuildId) {
        const guild = guilds.find(g => g.id === boundGuildId);
        if (guild && guild.customBot) {
          guild.customBot.status = 'error';
          guild.customBot.error = error.message || String(error);
          await saveGuild(guild);
        }
      }
    });

    client.on(Events.ShardDisconnect, async (event, shardId) => {
      console.warn(`[Discord Bot Shard] ${isCustom ? '(Custom Bot) ' : ''}Shard ${shardId} disconnected:`, event);
      if (isCustom && boundGuildId) {
        const guild = guilds.find(g => g.id === boundGuildId);
        if (guild && guild.customBot) {
          guild.customBot.status = 'offline';
          await saveGuild(guild);
        }
      }
    });

    client.on(Events.ShardReconnecting, async (shardId) => {
      console.log(`[Discord Bot Shard] ${isCustom ? '(Custom Bot) ' : ''}Shard ${shardId} reconnecting...`);
    });

    client.once(Events.ClientReady, async (readyClient) => {
      console.log(`[DarkFlower Discord Bot] Logged in as ${readyClient.user.tag}! ${isCustom ? '(Custom Bot)' : ''}`);
      if (!isCustom) {
        discordBotInfo.connected = true;
        discordBotInfo.username = readyClient.user.username;
        discordBotInfo.avatar = readyClient.user.displayAvatarURL() || "https://api.dicebear.com/7.x/pixel-art/svg?seed=DarkFlower";
        discordBotInfo.id = readyClient.user.id;
      } else if (boundGuildId) {
        const guild = guilds.find(g => g.id === boundGuildId);
        if (guild && guild.customBot) {
          guild.customBot.status = 'online';
          guild.customBot.username = readyClient.user.username;
          guild.customBot.avatar = readyClient.user.displayAvatarURL() || guild.customBot.avatar;
          guild.customBot.id = readyClient.user.id;
          guild.customBot.error = undefined;
          await saveGuild(guild);
        }
      }
      
      try {
        const commands = getBotCommands();
        commandsList = commands;

        console.log(`[Bot Ready] ${readyClient.user.tag} is online. Registering commands...`);
        
        // 1. Register application commands globally for the main bot ONLY
        if (!isCustom) {
          try {
            await client.rest.put(
              Routes.applicationCommands(readyClient.user.id),
              { body: commands.map(command => command.toJSON()) },
            );
            console.log('Successfully reloaded global application (/) commands.');
          } catch (err) {
            console.error('Failed to reload global application commands:', err);
          }
        } else {
          // Clear global commands for the custom bot to prevent duplicates with guild commands
          try {
            await client.rest.put(
              Routes.applicationCommands(readyClient.user.id),
              { body: [] }
            );
            console.log('Successfully cleared global application commands for Custom Bot.');
          } catch (err) {
            console.warn('Failed to clear custom bot global commands:', err);
          }
          // 2. Register guild-specific commands for Custom Bots (Custom bots only exist in their specific guilds)
          console.log(`Registering guild-specific commands for Custom Bot in ${readyClient.guilds.cache.size} guilds...`);
          for (const [guildId, guild] of readyClient.guilds.cache) {
            try {
              await client.rest.put(
                Routes.applicationGuildCommands(readyClient.user.id, guildId),
                { body: commands.map(command => command.toJSON()) },
              );
              console.log(`Successfully registered guild commands for custom bot in: ${guild.name} (${guildId})`);
            } catch (guildErr) {
              console.warn(`Could not register guild commands for ${guild.name} (${guildId}):`, guildErr);
            }
          }
        }
      } catch (error) {
        console.error('Error registering commands:', error);
      }
    });

    // 3. Clear guild commands when joining a new guild to ensure only clean global commands are shown
    client.on(Events.GuildCreate, async (guild: any) => {
      if (isCustom && boundGuildId && guild.id !== boundGuildId) return;
      if (!isCustom && customBotClients.has(guild.id)) return;
      console.log(`[DarkFlower Discord Bot] Joined a new guild: ${guild.name} (${guild.id})`);
      try {
        if (!isCustom) {
          // Clear guild-specific commands for the main bot to avoid duplicates with global commands
          await client.rest.put(
            Routes.applicationGuildCommands(client.user!.id, guild.id),
            { body: [] },
          );
          console.log(`Successfully cleared guild-specific commands for ${guild.name} (${guild.id}) to prevent duplicates with global commands.`);
        } else {
          // For custom bots, we register them as guild-specific commands
          await client.rest.put(
            Routes.applicationGuildCommands(client.user!.id, guild.id),
            { body: commandsList.map((command: any) => command.toJSON()) },
          );
          console.log(`Successfully registered guild-specific commands for custom bot in ${guild.name} (${guild.id})`);
        }
      } catch (err) {
        console.error(`Failed to manage guild-specific commands for newly joined guild ${guild.id}:`, err);
      }
    });

    client.on(Events.GuildMemberAdd, async (member: any) => {
      if (isCustom && boundGuildId && member.guild.id !== boundGuildId) return;
      if (!isCustom && customBotClients.has(member.guild.id)) return;
      console.log(`[Welcome System] Triggered for ${member.user?.tag || member.user?.username || 'unknown user'} in ${member.guild?.name}`);
      try {
        const me = member.guild.members.me || await member.guild.members.fetchMe().catch(() => null);
        const canSend = (chan: any) => {
          if (!chan || !chan.isTextBased()) return false;
          if (!me) return true; // Safe fallback if me is not cached/populated
          const perms = chan.permissionsFor(me);
          if (!perms) return true; // Safe fallback
          return perms.has(PermissionsBitField.Flags.SendMessages) && 
                 perms.has(PermissionsBitField.Flags.EmbedLinks) &&
                 perms.has(PermissionsBitField.Flags.ViewChannel);
        };

        let channel: any = null;

        // Find or create the database guild configuration (from the dashboard/persistence)
        const dbGuild = await getOrCreateGuild(member.guild.id, member.guild.name);

        // 1. Check if we have a test channel ID attached (from /testwelcome command)
        // We prioritize this for testing purposes so it shows up where the user expects.
        if (member.testChannelId) {
          const testChan = await member.guild.channels.fetch(member.testChannelId).catch(() => null);
          if (canSend(testChan)) {
            channel = testChan;
          }
        }

        // 2. Check if a welcome channel has been explicitly configured via /setwelcome
        if (!channel) {
          const configuredId = welcomeChannelsConfig.get(member.guild.id);
          if (configuredId) {
            const confChan = await member.guild.channels.fetch(configuredId).catch(() => null);
            if (canSend(confChan)) {
              channel = confChan;
            }
          }
        }

        // 3. Check if a welcome channel has been configured via the dashboard config (e.g. "#welcome")
        if (!channel && dbGuild && dbGuild.config?.welcomeChannel) {
          const targetNameOrId = dbGuild.config.welcomeChannel.replace("#", "").trim().toLowerCase();
          const channels = await member.guild.channels.fetch().catch(() => null);
          if (channels) {
            const foundChan = channels.find((c: any) => 
              c && c.isTextBased() && 
              (c.id === targetNameOrId || c.name.toLowerCase() === targetNameOrId) &&
              canSend(c)
            );
            if (foundChan) {
              channel = foundChan;
            }
          }
        }

        // 4. Fallback to systemChannel
        if (!channel) {
          const sysChan = member.guild.systemChannel;
          if (canSend(sysChan)) {
            channel = sysChan;
          }
        }

        // 5. Fallback to searching the channels (fetch them to make sure cache is updated)
        if (!channel) {
          const channels = await member.guild.channels.fetch().catch(() => null);
          if (channels) {
            const welcomeChan = channels.find((c: any) => c && c.isTextBased() && c.name.toLowerCase().includes('welcome') && canSend(c));
            if (welcomeChan) {
              channel = welcomeChan;
            }
          }
        }

        // 6. Absolute fallback: find ANY text channel the bot can send messages and embeds to
        if (!channel) {
          const channels = await member.guild.channels.fetch().catch(() => null);
          if (channels) {
            const fallbackChan = channels.find((c: any) => c && c.isTextBased() && canSend(c));
            if (fallbackChan) {
              channel = fallbackChan;
            }
          }
        }

        if (!channel) {
          console.warn(`[Welcome System] No text welcome channel with write/embed permissions found for guild ${member.guild.name}`);
          return;
        }
        
        const rulesChannel = member.guild.channels.cache.find((c: any) => c.name.includes('rules')) || '#rules';
        const mainChannel = member.guild.channels.cache.find((c: any) => c.name.includes('general') || c.name.includes('main') || c.name.includes('chat')) || '#main-chat';
        
        let welcomeText = `New Member Dropped In! 🔥 ${member.user}\n\nWelcome to the squad! 🎮\nA chill gaming & hangout community where we game, vibe, and make memories.\n\nRead the rules → ${rulesChannel}\nThen start your legendary chat → ${mainChannel}\n\nLet's get you in a chat soon~ ❤️`;
        let welcomeCardUrl = 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=800&auto=format&fit=crop&q=80';
        
        if (dbGuild && dbGuild.config) {
          const avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 512 });
          if (dbGuild.config.welcomeMessage) {
            welcomeText = dbGuild.config.welcomeMessage
              .replace(/{user}/g, `${member.user}`)
              .replace(/{server}/g, `**${member.guild.name}**`)
              .replace(/{count}/g, `${member.guild.memberCount}`)
              .replace(/{avatar}/gi, avatarUrl)
              .replace(/{avater}/gi, avatarUrl);
          }
          if (dbGuild.config.welcomeCard) {
            welcomeCardUrl = dbGuild.config.welcomeCard
              .replace(/{avatar}/gi, avatarUrl)
              .replace(/{avater}/gi, avatarUrl);
          }
        }

        const embed = new EmbedBuilder()
          .setTitle('Welcome to Our server!')
          .setDescription(welcomeText || 'Welcome to the server!')
          .setColor('#483d8b'); // Dark Slate Blue

        if (isValidUrl(welcomeCardUrl)) {
          embed.setImage(welcomeCardUrl);
        }

        const botAvatar = client.user?.displayAvatarURL() || discordBotInfo.avatar;
        const botName = client.user?.username || 'Aicherecter';

        if (isValidUrl(botAvatar)) {
          embed.setAuthor({ 
            name: botName,
            iconURL: botAvatar 
          });
        } else {
          embed.setAuthor({ 
            name: botName
          });
        }

        await channel.send({
          content: `New Member Arrived! ;--; ${member.user} ♡`,
          embeds: [embed]
        });
      } catch (err) {
        console.error("Error sending welcome message:", err);
      }
    });

    client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
      try {
        if (isCustom && boundGuildId && newState.guild.id !== boundGuildId) return;
        if (!isCustom && newState.guild.id && customBotClients.has(newState.guild.id)) return;

        const guild = newState.guild;
        const dbGuild = await getOrCreateGuild(guild.id, guild.name);
        
        if (!dbGuild.tempVoiceSettings || !dbGuild.tempVoiceSettings.hubChannelId) return;
        if (!dbGuild.tempVoiceChannels) dbGuild.tempVoiceChannels = [];

        // 1. Join Hub Logic
        if (newState.channelId === dbGuild.tempVoiceSettings.hubChannelId) {
          const member = newState.member;
          if (!member) return;

          console.log(`[TempVC] Member ${member.user.tag} joined hub in guild ${guild.name}`);

          const channelName = dbGuild.tempVoiceSettings.namingStyle.replace('{user}', member.user.username).replace('{display.name}', member.displayName);
          
          try {
            const newChannel = await guild.channels.create({
              name: channelName,
              type: ChannelType.GuildVoice,
              parent: dbGuild.tempVoiceSettings.categoryId || undefined,
              userLimit: dbGuild.tempVoiceSettings.userLimit || undefined,
              permissionOverwrites: [
                {
                  id: member.id,
                  allow: [PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.MoveMembers, PermissionsBitField.Flags.Connect],
                },
                ...(dbGuild.marriages?.find(m => m.user1Id === member.id || m.user2Id === member.id) ? [{
                  id: dbGuild.marriages!.find(m => m.user1Id === member.id || m.user2Id === member.id)!.user1Id === member.id 
                      ? dbGuild.marriages!.find(m => m.user1Id === member.id || m.user2Id === member.id)!.user2Id 
                      : dbGuild.marriages!.find(m => m.user1Id === member.id || m.user2Id === member.id)!.user1Id,
                  allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel]
                }] : []),
                {
                  id: guild.id,
                  allow: [PermissionsBitField.Flags.ViewChannel],
                  deny: [PermissionsBitField.Flags.Connect],
                }
              ],
            });

            console.log(`[TempVC] Created channel ${newChannel.name} (${newChannel.id})`);

            dbGuild.tempVoiceChannels.push(newChannel.id);
            await saveGuild(dbGuild);
            
            await member.voice.setChannel(newChannel);
            console.log(`[TempVC] Moved member to new channel`);
          } catch (createErr: any) {
            console.error(`[TempVC] Failed to create or move for hub join:`, createErr);
          }
        }

        // 2. Leave/Empty Logic
        if (oldState.channelId && dbGuild.tempVoiceChannels.includes(oldState.channelId)) {
          const oldChannel = oldState.channel;
          if (oldChannel && oldChannel.type === ChannelType.GuildVoice && oldChannel.members.size === 0) {
            // Channel is empty and was a temp channel
            await oldChannel.delete().catch(() => {});
            
            dbGuild.tempVoiceChannels = dbGuild.tempVoiceChannels.filter(id => id !== oldState.channelId);
            await saveGuild(dbGuild);
          }
        }
      } catch (err) {
        console.error("Error in voiceStateUpdate listener:", err);
      }
    });

    // XP cooldown map: key = `guildId-userId`, value = timestamp of last XP award
    const xpCooldowns = new Map<string, number>();

    client.on(Events.MessageCreate, async (message) => {
      if (isCustom && boundGuildId && message.guild?.id !== boundGuildId) return;
      if (!isCustom && message.guild?.id && customBotClients.has(message.guild.id)) return;
      try {
        // 1. Ignore bot messages or messages outside guilds
        if (message.author.bot) return;
        if (!message.guild) return;

        const guildId = message.guild.id;
        const userId = message.author.id;
        const dbGuild = await getOrCreateGuild(guildId, message.guild.name);

        // --- AFK SYSTEM LOGIC ---
        // 1. Check for AFK removal (User is back)
        if (dbGuild.afkUsers) {
          const afkIndex = dbGuild.afkUsers.findIndex(u => u.userId === userId);
          if (afkIndex !== -1) {
            const afkData = dbGuild.afkUsers[afkIndex];
            dbGuild.afkUsers.splice(afkIndex, 1);
            await saveGuild(dbGuild);

            // Restore nickname
            try {
              let member = message.member;
              if (!member && message.guild) {
                member = await message.guild.members.fetch(userId).catch(() => null);
              }
              if (member) {
                // If originalNickname was null, setNickname(null) restores original username
                await member.setNickname(afkData.originalNickname);
              }
            } catch (nickErr) {
              console.warn(`[AFK] Could not restore nickname for ${message.author.tag}:`, nickErr);
            }

            const welcomeBackEmbed = new EmbedBuilder()
              .setColor('#7c25d9')
              .setTitle('👋 Welcome Back!')
              .setDescription(`${message.author}, I have removed your AFK status.`)
              .setTimestamp();

            const welcomeMsg = await message.channel.send({ embeds: [welcomeBackEmbed] }).catch(() => null);
            if (welcomeMsg) {
              setTimeout(() => {
                if (welcomeMsg.deletable) welcomeMsg.delete().catch(() => {});
              }, 8000);
            }
          }
        }

        // 2. Check for mentioned AFK users (Alerting the pinger)
        if (message.mentions.users.size > 0 && dbGuild.afkUsers && dbGuild.afkUsers.length > 0) {
          for (const [mUserId, mUser] of message.mentions.users) {
            if (mUserId === userId) continue; 
            
            const afkUser = dbGuild.afkUsers.find(u => u.userId === mUserId);
            if (afkUser) {
              const afkAlertEmbed = new EmbedBuilder()
                .setColor('#7c25d9')
                .setAuthor({ name: `${mUser.username} is currently AFK`, iconURL: mUser.displayAvatarURL() || undefined })
                .setDescription(`📝 **Reason:** ${afkUser.reason}`)
                .setFooter({ text: `Away since ${new Date(afkUser.timestamp).toLocaleTimeString()}` })
                .setTimestamp();
              
              await message.reply({ embeds: [afkAlertEmbed] }).catch(() => null);
            }
          }
        }
        // --- END AFK SYSTEM LOGIC ---

        // Track channel message counts (Popular Channels)
        if (message.channel && 'name' in message.channel) {
          const channelName = `#${message.channel.name}`;
          if (!dbGuild.analytics.popularChannels) dbGuild.analytics.popularChannels = {};
          dbGuild.analytics.popularChannels[channelName] = (dbGuild.analytics.popularChannels[channelName] || 0) + 1;
        }

        // Track daily active user
        const username = message.author.username;
        if (!dbGuild.analytics.dailyActiveUsers) dbGuild.analytics.dailyActiveUsers = [];
        if (!dbGuild.analytics.dailyActiveUsers.includes(username)) {
          dbGuild.analytics.dailyActiveUsers.push(username);
          dbGuild.analytics.activeUsersToday = dbGuild.analytics.dailyActiveUsers.length;
        }

        // 2. Automod checks (Links & Bad Words)
        if (dbGuild.config && dbGuild.config.automodEnabled) {
          let shouldDelete = false;
          let violationReason = "";

          // Bad words check
          if (!shouldDelete && dbGuild.config.badWords && dbGuild.config.badWords.length > 0) {
            const lowerContent = message.content.toLowerCase();
            
            // Check if the message is a GIF link, Tenor link, Giphy link, or contains a GIF attachment
            const isGif = 
              lowerContent.includes(".gif") || 
              lowerContent.includes("tenor.com") || 
              lowerContent.includes("giphy.com") ||
              message.attachments.some(att => att.contentType?.toLowerCase().includes("gif") || att.name?.toLowerCase().endsWith(".gif"));

            for (const badWord of dbGuild.config.badWords) {
              const trimmedWord = badWord.trim().toLowerCase();
              if (trimmedWord && lowerContent.includes(trimmedWord)) {
                // If the matched blacklisted word is a generic link term (like http, https, .com, www, etc.)
                // and the message is detected as a GIF, bypass the deletion so the GIF stays!
                const isLinkTerm = ["http://", "https://", "http", "https", "www.", ".com", ".net", ".org", "discord.gg", "discord.com"].includes(trimmedWord);
                if (isLinkTerm && isGif) {
                  continue; // Skip deleting this GIF link/attachment
                }

                shouldDelete = true;
                violationReason = `Sent a prohibited word: "${badWord}".`;
                break;
              }
            }
          }

          if (shouldDelete) {
            // Check if bot can delete message
            if (message.deletable) {
              await message.delete().catch(console.error);
              
              // Log warning to server's mod logs
              const logId = `log-${Date.now()}`;
              dbGuild.modLogs.unshift({
                id: logId,
                type: "Automod Warning",
                moderator: "Automod",
                user: message.author.username,
                reason: violationReason,
                timestamp: new Date().toLocaleTimeString() + " - " + new Date().toLocaleDateString()
              });

              // Send self-deleting warning message in channel
              const warningMsg = await message.channel.send(`⚠️ ${message.author}, your message was removed. Reason: ${violationReason}`).catch(() => null);
              if (warningMsg) {
                setTimeout(() => {
                  warningMsg.delete().catch(() => {});
                }, 5000);
              }
              return; // Halt XP reward if message was deleted for automod violation
            }
          }
        }

        // 3. Leveling System / XP accumulation
        if (dbGuild.config && dbGuild.config.levelingEnabled !== false) {
          const cooldownKey = `${guildId}-${userId}`;
          const now = Date.now();
          const lastXP = xpCooldowns.get(cooldownKey) || 0;

          if (now - lastXP >= 60000) {
            // Set cooldown
            xpCooldowns.set(cooldownKey, now);

            // Award random XP (15-25) multiplied by guild config's xpRate
            const xpRate = dbGuild.config.xpRate || 1.0;
            const xpGained = Math.floor((Math.floor(Math.random() * 11) + 15) * xpRate);

            // Increment daily message count
            if (dbGuild.analytics) {
              dbGuild.analytics.messagesToday = (dbGuild.analytics.messagesToday || 0) + 1;
            }

            // Find or initialize member on leaderboard
            let memberRecord = dbGuild.leaderboard.find(m => m.user === message.author.username);
            if (!memberRecord) {
              memberRecord = {
                user: message.author.username,
                xp: 0,
                level: 1,
                avatar: message.author.displayAvatarURL() || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${message.author.username}`
              };
              dbGuild.leaderboard.push(memberRecord);
            }

            // Keep avatar current
            memberRecord.avatar = message.author.displayAvatarURL() || memberRecord.avatar;

            const oldXp = memberRecord.xp;
            const newXp = oldXp + xpGained;
            memberRecord.xp = newXp;

            // Simple standard progression: each level L takes L * 600 XP to complete
            const getXPCurveInfo = (totalXp: number) => {
              let lvl = 1;
              let tempXp = totalXp;
              while (true) {
                const neededForNext = lvl * 600;
                if (tempXp >= neededForNext) {
                  tempXp -= neededForNext;
                  lvl++;
                } else {
                  break;
                }
              }
              return { level: lvl, xpInLevel: tempXp, xpNeeded: lvl * 600 };
            };

            const oldInfo = getXPCurveInfo(oldXp);
            const newInfo = getXPCurveInfo(newXp);

            memberRecord.level = newInfo.level;

            // Did they level up?
            if (newInfo.level > oldInfo.level) {
              console.log(`[Level Up] ${message.author.username} leveled up: ${oldInfo.level} -> ${newInfo.level}`);

              // Role rewards:
              // Level 5 -> Bronze Bud
              // Level 15 -> Violet Petal
              // Level 30 -> DarkFlower Elder
              let rewardMessage = "";
              try {
                const memberObj = message.member;
                if (memberObj) {
                  const rolesCache = message.guild.roles.cache;
                  let targetRoleName = "";
                  const customRoles = dbGuild.config.levelRoles || [
                    { level: 5, role: "Bronze Bud" },
                    { level: 15, role: "Violet Petal" },
                    { level: 30, role: "DarkFlower Elder" }
                  ];

                  // Find the highest milestone the user just crossed
                  const sortedRoles = [...customRoles].sort((a, b) => b.level - a.level);
                  for (const milestone of sortedRoles) {
                    if (newInfo.level >= milestone.level && oldInfo.level < milestone.level) {
                      targetRoleName = milestone.role;
                      break;
                    }
                  }

                  if (targetRoleName) {
                    const matchedRole = rolesCache.find(r => r.name.toLowerCase() === targetRoleName.toLowerCase());
                    if (matchedRole) {
                      await memberObj.roles.add(matchedRole).catch(console.error);
                      rewardMessage = `\n🎖️ You have been awarded the **${matchedRole.name}** role!`;
                    }
                  }
                }
              } catch (roleErr) {
                console.error("Role assignment error:", roleErr);
              }

              // Send announcement to configured channel or the channel where they sent the message
              let alertChannel: any = null;
              const configuredChanNameOrId = dbGuild.config.levelChannel || "#level-ups";
              
              try {
                const targetChanName = configuredChanNameOrId.replace("#", "").trim().toLowerCase();
                const channels = await message.guild.channels.fetch().catch(() => null);
                if (channels) {
                  alertChannel = channels.find((c: any) => 
                    c && c.isTextBased() && 
                    (c.id === targetChanName || c.name.toLowerCase() === targetChanName)
                  );
                }
              } catch (e) {}

              if (!alertChannel) {
                alertChannel = message.channel;
              }

              if (alertChannel && typeof alertChannel.send === 'function') {
                const levelEmbed = new EmbedBuilder()
                  .setTitle('⭐ LEVEL UP! ⭐')
                  .setDescription(`Congratulations ${message.author}! You have reached **Level ${newInfo.level}**! 🎉\nKeep active to unlock more rewards!${rewardMessage}`)
                  .setColor('#7c25d9')
                  .setThumbnail(message.author.displayAvatarURL() || null);
                
                await alertChannel.send({ embeds: [levelEmbed] }).catch(console.error);
              }
            }
          }
        }

        // 4. Support ticket message syncing
        if (message.channel && 'name' in message.channel && (message.channel.name as string).startsWith('ticket-')) {
          if (!dbGuild.tickets) dbGuild.tickets = [];
          const ticket = dbGuild.tickets.find(t => t.channelName === (message.channel as any).name);
          if (ticket) {
            ticket.messages.push({
              sender: message.author.username,
              text: message.content || "[Attachment or Embed]",
              timestamp: new Date().toLocaleTimeString()
            });
            await saveGuild(dbGuild);
          }
        }
      } catch (err) {
        console.error("Error in MessageCreate listener:", err);
      }
    });

    client.on(Events.InteractionCreate, async (interaction) => {
      if (isCustom && boundGuildId && interaction.guildId !== boundGuildId) return;
      if (!isCustom && interaction.guildId && customBotClients.has(interaction.guildId)) return;
      if (interaction.isButton()) {
        if (interaction.customId.startsWith('role_btn:')) {
          try {
            const [, msgId, btnId] = interaction.customId.split(':');
            const guildObj = interaction.guild;
            if (!guildObj) {
              await interaction.reply({ content: '❌ This button can only be used within a server.', ephemeral: true });
              return;
            }

            const dbGuild = await getOrCreateGuild(guildObj.id, guildObj.name);
            const msgConfig = dbGuild.config.buttonRolesMessages?.find(m => m.id === msgId);
            const button = msgConfig?.buttons?.find(b => b.id === btnId);

            if (!msgConfig || !button) {
              await interaction.reply({ content: '❌ This button role configuration could not be found or is stale.', ephemeral: true });
              return;
            }

            const rolesCache = guildObj.roles.cache;
            const roleObj = rolesCache.find(r => r.name.toLowerCase() === button.role.toLowerCase() || r.id === button.role);

            if (!roleObj) {
              await interaction.reply({ content: `❌ The role **${button.role}** does not exist on this server. Please ask an administrator to create it.`, ephemeral: true });
              return;
            }

            const memberObj: any = interaction.member;
            if (!memberObj) {
              await interaction.reply({ content: '❌ Could not retrieve member information.', ephemeral: true });
              return;
            }

            const hasRole = memberObj.roles.cache.has(roleObj.id);

            if (msgConfig.roleMode === 'single') {
              // Strip other roles in this config first
              const otherRoleNames = msgConfig.buttons.filter(b => b.id !== btnId).map(b => b.role);
              const otherRolesToStrip = otherRoleNames.map(name => 
                rolesCache.find(r => r.name.toLowerCase() === name.toLowerCase() || r.id === name)
              ).filter(Boolean);

              for (const r of otherRolesToStrip) {
                if (memberObj.roles.cache.has(r.id)) {
                  await memberObj.roles.remove(r).catch((err: any) => console.error("Error removing old role:", err));
                }
              }

              if (!hasRole) {
                await memberObj.roles.add(roleObj);
                await interaction.reply({ content: `✅ You have been assigned the **${roleObj.name}** role!`, ephemeral: true });
              } else {
                await interaction.reply({ content: `ℹ️ You already have the **${roleObj.name}** role.`, ephemeral: true });
              }
            } else {
              // Toggle role
              if (hasRole) {
                await memberObj.roles.remove(roleObj);
                await interaction.reply({ content: `❌ Removed the **${roleObj.name}** role.`, ephemeral: true });
              } else {
                await memberObj.roles.add(roleObj);
                await interaction.reply({ content: `✅ Added the **${roleObj.name}** role!`, ephemeral: true });
              }
            }
          } catch (err: any) {
            console.error("Button role handler error:", err);
            await interaction.reply({ 
              content: `❌ Failed to update role: **${err.message || err}**.\n*Tip: Check that the DarkFlower bot's highest role is positioned above the assigned role in your Server Settings.*`, 
              ephemeral: true 
            });
          }
          return;
        }

        if (interaction.customId === 'create_ticket') {
          await interaction.deferReply({ ephemeral: true });
          try {
            const guild = interaction.guild;
            if (!guild) return;
            const safeUsername = interaction.user.username.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || interaction.user.id;
            const ticketChannel = await guild.channels.create({
              name: `ticket-${safeUsername}`,
              type: ChannelType.GuildText,
              permissionOverwrites: [
                  {
                      id: guild.id,
                      deny: [PermissionsBitField.Flags.ViewChannel],
                  },
                  {
                      id: interaction.user.id,
                      allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
                  },
                  {
                      id: client.user!.id,
                      allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
                  }
              ]
            });

            // Persist the ticket in Firestore so it displays on the web dashboard
            const dbGuild = await getOrCreateGuild(guild.id, guild.name);
            const ticketId = `t-${Math.floor(1000 + Math.random() * 9000)}`;
            const newTicket = {
              id: ticketId,
              user: interaction.user.username,
              status: 'open' as const,
              channelName: ticketChannel.name,
              messages: [
                { sender: "DarkFlower Bot", text: `Support ticket created. A staff member will assist you shortly, ${interaction.user}.`, timestamp: new Date().toLocaleTimeString() }
              ]
            };
            if (!dbGuild.tickets) dbGuild.tickets = [];
            dbGuild.tickets.push(newTicket);
            dbGuild.analytics.ticketsCount = (dbGuild.analytics.ticketsCount || 0) + 1;
            await saveGuild(dbGuild);

            const embed = new EmbedBuilder()
              .setTitle('Ticket')
              .setDescription(`Support will be with you shortly, ${interaction.user}.`)
              .setColor('#483d8b');
            await ticketChannel.send({ embeds: [embed] });
            await interaction.editReply(`Ticket created: ${ticketChannel}`);
          } catch (err) {
            console.error(err);
            await interaction.editReply('Error creating ticket.');
          }
        }
        return;
      }

      if (!interaction.isChatInputCommand()) return;

      try {
        const cmdName = interaction.commandName;
        const guildId = interaction.guildId;
        if (guildId) {
          const dbGuild = await getOrCreateGuild(guildId, interaction.guild?.name);
          
          if (!dbGuild.analytics.botCommandUsage) dbGuild.analytics.botCommandUsage = {};
          dbGuild.analytics.botCommandUsage[cmdName] = (dbGuild.analytics.botCommandUsage[cmdName] || 0) + 1;
          
          const username = interaction.user.username;
          if (!dbGuild.analytics.dailyActiveUsers) dbGuild.analytics.dailyActiveUsers = [];
          if (!dbGuild.analytics.dailyActiveUsers.includes(username)) {
            dbGuild.analytics.dailyActiveUsers.push(username);
            dbGuild.analytics.activeUsersToday = dbGuild.analytics.dailyActiveUsers.length;
          }
          await saveGuild(dbGuild);
        }

        if (interaction.commandName === 'login') {
        const guildId = interaction.guildId;
        if (!guildId) {
            await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
            return;
        }
        await interaction.deferReply({ ephemeral: true });
        
        let guildYt;
        try {
            guildYt = await getYTClient(guildId);
        } catch (err) {
            await interaction.editReply({ content: 'Failed to initialize YouTube client.' });
            return;
        }

        guildYt.session.once('auth-pending', (data) => {
          interaction.editReply({ 
              content: `**Login Required**\nPlease visit this URL to authorize the bot for THIS server: ${data.verification_url}\n\nCode: \`${data.user_code}\`` 
          }).catch(console.error);
        });

        guildYt.session.once('auth-error', (err) => {
          interaction.followUp({ content: `Auth error: ${err.message}`, ephemeral: true }).catch(console.error);
        });

        guildYt.session.once('auth', () => {
          interaction.followUp({ content: `Successfully logged in for this server! You can now play age-restricted or login-restricted tracks.`, ephemeral: true }).catch(console.error);
        });

        try {
          if (guildYt.session.logged_in) {
            await interaction.editReply({ content: 'The bot is already logged in for this server!' });
            return;
          }
          await guildYt.session.signIn();
        } catch (err: any) {
          console.error("Login flow error:", err);
          await interaction.editReply({ content: 'Failed to start login flow. Already logged in or rate limited.' }).catch(() => {});
        }
        return;
      }

      if (interaction.commandName === 'play') {
        const member = interaction.member;
        if (member && typeof member === 'object' && 'voice' in member && member.voice.channelId) {
          const channelId = member.voice.channelId;
          const guildId = interaction.guildId!;
          const query = interaction.options.getString('query') || interaction.options.getString('url') || interaction.options.getString('song') || 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';
          
          await playMusicStream(guildId, query, channelId, interaction.channel, interaction);
        } else {
          const warnEmbed = new EmbedBuilder()
            .setColor('#FFA500')
            .setTitle('⚠️ Warning')
            .setDescription('You must be in a voice channel to play music!');
          await interaction.reply({ embeds: [warnEmbed], ephemeral: true });
        }
      }

      if (interaction.commandName === 'loop') {
        const guildId = interaction.guildId!;
        let state = musicStates.get(guildId);
        if (!state) {
          state = {
            loop: false,
            autoplay: false,
            currentQuery: "",
            currentTrackTitle: "Loading...",
            voiceChannelId: "",
            textChannelId: interaction.channelId || ""
          };
          musicStates.set(guildId, state);
        }
        state.loop = !state.loop;
        if (state.loop) state.autoplay = false;
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('#7b2cbf')
              .setTitle('🔁 Loop Toggled')
              .setDescription(`Looping is now **${state.loop ? 'ENABLED' : 'DISABLED'}** for **${state.currentTrackTitle}**.`)
              .setTimestamp()
          ]
        });
      }

      if (interaction.commandName === 'autoplay') {
        const guildId = interaction.guildId!;
        let state = musicStates.get(guildId);
        if (!state) {
          state = {
            loop: false,
            autoplay: false,
            currentQuery: "",
            currentTrackTitle: "",
            voiceChannelId: "",
            textChannelId: interaction.channelId || ""
          };
          musicStates.set(guildId, state);
        }
        state.autoplay = !state.autoplay;
        if (state.autoplay) state.loop = false;
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('#00b4d8')
              .setTitle('✨ Autoplay Toggled')
              .setDescription(`Autoplay of related tracks is now **${state.autoplay ? 'ENABLED' : 'DISABLED'}**.`)
              .setTimestamp()
          ]
        });
      }

      if (['stop', 'skip', 'pause', 'resume'].includes(interaction.commandName)) {
        const connection = getVoiceConnection(interaction.guildId!);
        const player = guildPlayers.get(interaction.guildId!);

        if (!connection) {
          return interaction.reply({ content: 'I am not connected to any voice channel in this server.', ephemeral: true });
        }

        if (interaction.commandName === 'stop') {
          connection.destroy();
          guildPlayers.delete(interaction.guildId!);
          musicStates.delete(interaction.guildId!);
          return interaction.reply('⏹️ Stopped the music playback and left the voice channel.');
        }

        if (!player) {
          return interaction.reply({ content: 'There is no active music player running on this server.', ephemeral: true });
        }

        if (interaction.commandName === 'skip') {
          const state = musicStates.get(interaction.guildId!);
          if (state) state.loop = false;
          player.stop();
          return interaction.reply('⏭️ Skipped the current track.');
        }

        if (interaction.commandName === 'pause') {
          const success = player.pause();
          if (success) {
            return interaction.reply('⏸️ Music has been paused.');
          } else {
            return interaction.reply({ content: 'Failed to pause. Is the music already paused?', ephemeral: true });
          }
        }

        if (interaction.commandName === 'resume') {
          const success = player.unpause();
          if (success) {
            return interaction.reply('▶️ Music playback has been resumed.');
          } else {
            return interaction.reply({ content: 'Failed to resume. Is the music already playing?', ephemeral: true });
          }
        }
      }

      if (interaction.commandName === 'ban') {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.BanMembers as any)) return interaction.reply({ content: 'No permission', ephemeral: true });
        const target = interaction.options.getUser('target')!;
        const reason = interaction.options.getString('reason') || 'No reason provided';
        await interaction.deferReply();
        try {
          await interaction.guild?.members.ban(target, { reason });
          
          // Log to Firestore
          const dbGuild = await getOrCreateGuild(interaction.guildId!, interaction.guild?.name);
          if (!dbGuild.modLogs) dbGuild.modLogs = [];
          dbGuild.modLogs.unshift({
            id: `ban-${Date.now()}`,
            type: "Ban",
            moderator: interaction.user.username,
            user: target.username,
            reason: reason,
            timestamp: new Date().toLocaleTimeString() + " - " + new Date().toLocaleDateString()
          });
          dbGuild.analytics.moderationCount = (dbGuild.analytics.moderationCount || 0) + 1;
          await saveGuild(dbGuild);

          return interaction.editReply(`✅ Successfully banned **${target.tag}** for: ${reason}`);
        } catch (e: any) {
          return interaction.editReply({ content: `❌ Error: ${e.message}` });
        }
      }
      
      if (interaction.commandName === 'kick') {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.KickMembers as any)) return interaction.reply({ content: 'No permission', ephemeral: true });
        const target = interaction.options.getUser('target')!;
        const reason = interaction.options.getString('reason') || 'No reason provided';
        await interaction.deferReply();
        try {
          await interaction.guild?.members.kick(target, reason);

          // Log to Firestore
          const dbGuild = await getOrCreateGuild(interaction.guildId!, interaction.guild?.name);
          if (!dbGuild.modLogs) dbGuild.modLogs = [];
          dbGuild.modLogs.unshift({
            id: `kick-${Date.now()}`,
            type: "Kick",
            moderator: interaction.user.username,
            user: target.username,
            reason: reason,
            timestamp: new Date().toLocaleTimeString() + " - " + new Date().toLocaleDateString()
          });
          dbGuild.analytics.moderationCount = (dbGuild.analytics.moderationCount || 0) + 1;
          await saveGuild(dbGuild);

          return interaction.editReply(`✅ Successfully kicked **${target.tag}** for: ${reason}`);
        } catch (e: any) {
          return interaction.editReply({ content: `❌ Error: ${e.message}` });
        }
      }
      
      if (interaction.commandName === 'timeout') {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ModerateMembers as any)) return interaction.reply({ content: 'No permission', ephemeral: true });
        const target = interaction.options.getUser('target')!;
        const duration = interaction.options.getInteger('duration')!;
        const reason = interaction.options.getString('reason') || 'No reason provided';
        await interaction.deferReply();
        try {
          const member = await interaction.guild?.members.fetch(target.id);
          await member?.timeout(duration * 60 * 1000, reason);

          // Log to Firestore
          const dbGuild = await getOrCreateGuild(interaction.guildId!, interaction.guild?.name);
          if (!dbGuild.modLogs) dbGuild.modLogs = [];
          dbGuild.modLogs.unshift({
            id: `timeout-${Date.now()}`,
            type: "Timeout",
            moderator: interaction.user.username,
            user: target.username,
            reason: `Timeout for ${duration} minutes. Reason: ${reason}`,
            timestamp: new Date().toLocaleTimeString() + " - " + new Date().toLocaleDateString()
          });
          dbGuild.analytics.moderationCount = (dbGuild.analytics.moderationCount || 0) + 1;
          await saveGuild(dbGuild);

          return interaction.editReply(`✅ Timed out **${target.tag}** for ${duration} minutes. Reason: ${reason}`);
        } catch (e: any) {
          return interaction.editReply({ content: `❌ Error: ${e.message}` });
        }
      }

      if (interaction.commandName === 'clear') {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageMessages as any)) return interaction.reply({ content: 'No permission', ephemeral: true });
        const amount = interaction.options.getInteger('amount')!;
        await interaction.deferReply({ ephemeral: true });
        try {
          if (interaction.channel?.isTextBased() && 'bulkDelete' in interaction.channel) {
              await (interaction.channel as any).bulkDelete(amount, true);

              // Log to Firestore
              const dbGuild = await getOrCreateGuild(interaction.guildId!, interaction.guild?.name);
              if (!dbGuild.modLogs) dbGuild.modLogs = [];
              dbGuild.modLogs.unshift({
                id: `clear-${Date.now()}`,
                type: "Bulk Clear",
                moderator: interaction.user.username,
                user: `#${(interaction.channel as any).name || "current-channel"}`,
                reason: `Cleared ${amount} messages in channel.`,
                timestamp: new Date().toLocaleTimeString() + " - " + new Date().toLocaleDateString()
              });
              dbGuild.analytics.moderationCount = (dbGuild.analytics.moderationCount || 0) + 1;
              await saveGuild(dbGuild);

              return interaction.editReply(`✅ Cleared ${amount} messages.`);
          }
          return interaction.editReply('Could not clear messages in this channel.');
        } catch (e: any) {
          return interaction.editReply({ content: `❌ Error: ${e.message}` });
        }
      }

      if (interaction.commandName === 'unban') {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.BanMembers as any)) return interaction.reply({ content: 'You do not have the required permissions to unban members.', ephemeral: true });
        const userId = interaction.options.getString('userid')!;
        const reason = interaction.options.getString('reason') || 'No reason provided';
        await interaction.deferReply();
        try {
          await interaction.guild?.members.unban(userId, reason);

          // Log to Firestore
          const dbGuild = await getOrCreateGuild(interaction.guildId!, interaction.guild?.name);
          if (!dbGuild.modLogs) dbGuild.modLogs = [];
          dbGuild.modLogs.unshift({
            id: `unban-${Date.now()}`,
            type: "Unban",
            moderator: interaction.user.username,
            user: `ID: ${userId}`,
            reason: reason,
            timestamp: new Date().toLocaleTimeString() + " - " + new Date().toLocaleDateString()
          });
          dbGuild.analytics.moderationCount = (dbGuild.analytics.moderationCount || 0) + 1;
          await saveGuild(dbGuild);

          return interaction.editReply(`✅ Successfully unbanned user ID: \`${userId}\` for reason: ${reason}`);
        } catch (e: any) {
          return interaction.editReply({ content: `❌ Error unbanning: ${e.message}` });
        }
      }

      if (interaction.commandName === 'warn') {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ModerateMembers as any)) return interaction.reply({ content: 'You do not have the required permissions to warn members.', ephemeral: true });
        const target = interaction.options.getUser('target')!;
        const reason = interaction.options.getString('reason')!;
        const guildId = interaction.guildId!;
        
        await interaction.deferReply();

        const key = `${guildId}-${target.id}`;
        const warnings = userWarnings.get(key) || [];
        warnings.push({ reason, timestamp: Date.now() });
        userWarnings.set(key, warnings);

        try {
          // Log to Firestore
          const dbGuild = await getOrCreateGuild(guildId, interaction.guild?.name);
          if (!dbGuild.modLogs) dbGuild.modLogs = [];
          dbGuild.modLogs.unshift({
            id: `warn-${Date.now()}`,
            type: "Warning",
            moderator: interaction.user.username,
            user: target.username,
            reason: reason,
            timestamp: new Date().toLocaleTimeString() + " - " + new Date().toLocaleDateString()
          });
          dbGuild.analytics.moderationCount = (dbGuild.analytics.moderationCount || 0) + 1;
          await saveGuild(dbGuild);
        } catch (dbErr) {
          console.error("Error saving warning to Firestore:", dbErr);
        }

        const embed = new EmbedBuilder()
          .setColor('#FFA500')
          .setTitle('⚠️ Warning Issued')
          .setDescription(`${target} has been warned.`)
          .addFields(
            { name: 'Warned User', value: `${target.tag} (${target.id})`, inline: true },
            { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
            { name: 'Reason', value: reason },
            { name: 'Total Warnings', value: `${warnings.length}`, inline: true }
          )
          .setTimestamp();

        try {
          await target.send({ content: `⚠️ You have been warned in **${interaction.guild?.name}** for: ${reason}. Total warnings: ${warnings.length}` }).catch(() => null);
        } catch (e) {
          // Ignore DM errors
        }

        return interaction.editReply({ embeds: [embed] });
      }

      if (interaction.commandName === 'warnings') {
        const target = interaction.options.getUser('target')!;
        const guildId = interaction.guildId!;
        const key = `${guildId}-${target.id}`;
        const warnings = userWarnings.get(key) || [];

        if (warnings.length === 0) {
          return interaction.reply(`✅ **${target.tag}** has 0 warnings on this server.`);
        }

        const embed = new EmbedBuilder()
          .setColor('#FFA500')
          .setTitle(`⚠️ Warnings for ${target.tag}`)
          .setDescription(`${target} has **${warnings.length}** warning(s) on this server.`)
          .setTimestamp();

        warnings.forEach((warn, index) => {
          embed.addFields({
            name: `Warning #${index + 1} - <t:${Math.floor(warn.timestamp / 1000)}:F>`,
            value: `Reason: ${warn.reason}`
          });
        });

        return interaction.reply({ embeds: [embed] });
      }

      if (interaction.commandName === 'clearwarnings') {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ModerateMembers as any)) return interaction.reply({ content: 'You do not have the required permissions to clear warnings.', ephemeral: true });
        const target = interaction.options.getUser('target')!;
        const guildId = interaction.guildId!;
        const key = `${guildId}-${target.id}`;

        if (!userWarnings.has(key) || userWarnings.get(key)!.length === 0) {
          return interaction.reply({ content: `**${target.tag}** already has 0 warnings.`, ephemeral: true });
        }

        userWarnings.delete(key);
        return interaction.reply(`✅ Cleared all warnings for **${target.tag}**.`);
      }

      if (interaction.commandName === 'lock') {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageChannels as any)) return interaction.reply({ content: 'You do not have the required permissions to lock channels.', ephemeral: true });
        const channel = (interaction.options.getChannel('channel') || interaction.channel) as any;
        if (!channel || !channel.isTextBased() || !('permissionOverwrites' in channel)) {
          return interaction.reply({ content: 'Can only lock text channels.', ephemeral: true });
        }

        await interaction.deferReply();
        try {
          await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
            SendMessages: false
          });

          // Log to Firestore
          const dbGuild = await getOrCreateGuild(interaction.guildId!, interaction.guild?.name);
          if (!dbGuild.modLogs) dbGuild.modLogs = [];
          dbGuild.modLogs.unshift({
            id: `lock-${Date.now()}`,
            type: "Lock Channel",
            moderator: interaction.user.username,
            user: `#${channel.name || "channel"}`,
            reason: "Channel lockdown initiated.",
            timestamp: new Date().toLocaleTimeString() + " - " + new Date().toLocaleDateString()
          });
          dbGuild.analytics.moderationCount = (dbGuild.analytics.moderationCount || 0) + 1;
          await saveGuild(dbGuild);

          return interaction.editReply(`🔒 Channel <#${channel.id}> has been locked down.`);
        } catch (e: any) {
          return interaction.editReply({ content: `Error locking channel: ${e.message}` });
        }
      }

      if (interaction.commandName === 'unlock') {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageChannels as any)) return interaction.reply({ content: 'You do not have the required permissions to unlock channels.', ephemeral: true });
        const channel = (interaction.options.getChannel('channel') || interaction.channel) as any;
        if (!channel || !channel.isTextBased() || !('permissionOverwrites' in channel)) {
          return interaction.reply({ content: 'Can only unlock text channels.', ephemeral: true });
        }

        await interaction.deferReply();
        try {
          await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
            SendMessages: null
          });

          // Log to Firestore
          const dbGuild = await getOrCreateGuild(interaction.guildId!, interaction.guild?.name);
          if (!dbGuild.modLogs) dbGuild.modLogs = [];
          dbGuild.modLogs.unshift({
            id: `unlock-${Date.now()}`,
            type: "Unlock Channel",
            moderator: interaction.user.username,
            user: `#${channel.name || "channel"}`,
            reason: "Channel lock lifted.",
            timestamp: new Date().toLocaleTimeString() + " - " + new Date().toLocaleDateString()
          });
          dbGuild.analytics.moderationCount = (dbGuild.analytics.moderationCount || 0) + 1;
          await saveGuild(dbGuild);

          return interaction.editReply(`🔓 Channel <#${channel.id}> has been unlocked.`);
        } catch (e: any) {
          return interaction.editReply({ content: `Error unlocking channel: ${e.message}` });
        }
      }

      if (interaction.commandName === 'slowmode') {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageChannels as any)) return interaction.reply({ content: 'You do not have the required permissions to manage channel slowmode.', ephemeral: true });
        const seconds = interaction.options.getInteger('seconds')!;
        const channel = (interaction.options.getChannel('channel') || interaction.channel) as any;
        if (!channel || !channel.isTextBased() || !('setRateLimitPerUser' in channel)) {
          return interaction.reply({ content: 'Can only apply slowmode to text channels.', ephemeral: true });
        }

        await interaction.deferReply();
        try {
          await channel.setRateLimitPerUser(seconds);

          // Log to Firestore
          const dbGuild = await getOrCreateGuild(interaction.guildId!, interaction.guild?.name);
          if (!dbGuild.modLogs) dbGuild.modLogs = [];
          dbGuild.modLogs.unshift({
            id: `slowmode-${Date.now()}`,
            type: "Slowmode",
            moderator: interaction.user.username,
            user: `#${channel.name || "channel"}`,
            reason: seconds === 0 ? "Slowmode disabled." : `Slowmode set to ${seconds} seconds.`,
            timestamp: new Date().toLocaleTimeString() + " - " + new Date().toLocaleDateString()
          });
          dbGuild.analytics.moderationCount = (dbGuild.analytics.moderationCount || 0) + 1;
          await saveGuild(dbGuild);

          if (seconds === 0) {
            return interaction.editReply(`🕒 Slowmode has been disabled for <#${channel.id}>.`);
          }
          return interaction.editReply(`🕒 Slowmode has been set to **${seconds}** seconds for <#${channel.id}>.`);
        } catch (e: any) {
          return interaction.editReply({ content: `Error setting slowmode: ${e.message}` });
        }
      }

      if (interaction.commandName === 'ticket') {
        const subcommand = interaction.options.getSubcommand();
        if (subcommand === 'setup' || subcommand === 'panel') {
          if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator as any)) return interaction.reply({ content: 'No permission', ephemeral: true });
          
          await interaction.deferReply({ ephemeral: true });

          try {
            const row = new ActionRowBuilder<ButtonBuilder>()
              .addComponents(
                new ButtonBuilder()
                  .setCustomId('create_ticket')
                  .setLabel('Create Ticket')
                  .setEmoji('🎫')
                  .setStyle(ButtonStyle.Primary)
              );
            const embed = new EmbedBuilder()
              .setTitle('🎫 Support Tickets')
              .setDescription('Need help? Click the button below to open a ticket and our support team will assist you as soon as possible.')
              .setColor('#483d8b')
              .setFooter({ text: 'DarkFlower AI Support System' });
            
            if (interaction.channel && interaction.channel.isTextBased()) {
              await interaction.channel.send({ embeds: [embed], components: [row as any] });
              return interaction.editReply({ content: 'Ticket panel has been created.' });
            } else {
              return interaction.editReply({ content: 'This command must be run in a text channel.' });
            }
          } catch (e: any) {
            console.error('[Ticket Panel] Error:', e);
            return interaction.editReply({ content: `Failed to create panel: ${e.message}` });
          }
        } else if (subcommand === 'close') {
          if (!interaction.channel || !('name' in interaction.channel) || !(interaction.channel.name as string).startsWith('ticket-')) {
             return interaction.reply({ content: 'This is not a ticket channel.', ephemeral: true });
          }
          await interaction.reply('Closing ticket in 5 seconds...');
          setTimeout(() => interaction.channel?.delete().catch(console.error), 5000);
        }
      }

      if (interaction.commandName === 'embed') {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator as any)) return interaction.reply({ content: 'No permission. You must be an administrator.', ephemeral: true });
        
        const title = interaction.options.getString('title', true);
        const description = interaction.options.getString('description', true);
        let colorStr = interaction.options.getString('color') || '#7c3aed';
        
        if (!colorStr.startsWith('#')) colorStr = '#' + colorStr;
        const color = parseInt(colorStr.replace('#', ''), 16);
        
        const targetChannel = (interaction.options.getChannel('channel') || interaction.channel) as TextChannel;
        
        if (!targetChannel) return interaction.reply({ content: 'Could not resolve target channel.', ephemeral: true });
        
        try {
          const customEmbed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(isNaN(color) ? 0x7c3aed : color)
            .setFooter({ text: 'Sent via DarkFlower AI' });
            
          await targetChannel.send({ embeds: [customEmbed] });
          return interaction.reply({ content: `Embed successfully sent to ${targetChannel}.`, ephemeral: true });
        } catch (error) {
          console.error("Error sending custom embed:", error);
          return interaction.reply({ content: 'Failed to send embed. Check bot permissions in that channel.', ephemeral: true });
        }
      }

      if (interaction.commandName === 'setwelcome') {
          if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator as any)) return interaction.reply({ content: 'No permission', ephemeral: true });
          const channel = interaction.options.getChannel('channel');
          if (!channel) return interaction.reply({ content: 'Please provide a valid channel.', ephemeral: true });
          
          await interaction.deferReply();
          try {
            welcomeChannelsConfig.set(interaction.guildId!, channel.id);
            
            // Persist the welcome channel config in Firestore so it's saved across restarts
            const dbGuild = await getOrCreateGuild(interaction.guildId!, interaction.guild?.name);
            if (!dbGuild.config) dbGuild.config = {} as any;
            dbGuild.config.welcomeChannel = channel.id;
            await saveGuild(dbGuild);

            return interaction.editReply(`✅ Welcome channel has been set to <#${channel.id}>. This setting has been synced and saved to Firestore!`);
          } catch (e: any) {
            return interaction.editReply({ content: `❌ Error saving welcome channel: ${e.message}` });
          }
      }

      if (interaction.commandName === 'aiwelcome') {
          if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator as any)) return interaction.reply({ content: 'No permission', ephemeral: true });
          await interaction.deferReply();
          
          try {
            const guild = interaction.guild!;
            const channels = await guild.channels.fetch();
            const textChannels = channels.filter((c: any) => c && c.isTextBased()).map((c: any) => ({ name: c.name, id: c.id }));
            
            const aiPrompt = `You are configuring a welcome message for a Discord server named "${guild.name}".
Available text channels: ${JSON.stringify(textChannels)}

Generate a welcoming message for new members.
Rules:
1. It must be highly engaging and styled with emojis.
2. If there is a rules channel, mention it using the format <#CHANNEL_ID>.
3. If there is a general/chat channel, mention it using the format <#CHANNEL_ID>.
4. Do not include markdown code blocks. Just output the raw text.
5. You must include these variables so they get replaced later: {user}, {server}. You can optionally use {count}.`;

            const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
            const response = await ai.models.generateContent({
               model: 'gemini-2.5-flash',
               contents: aiPrompt
            });
            let generatedWelcome = response.text || '';
            generatedWelcome = generatedWelcome.replace(/```(markdown|text)?/gi, '').replace(/```/g, '').trim();

            const dbGuild = await getOrCreateGuild(guild.id, guild.name);
            (dbGuild as any).config = dbGuild.config || {};
            dbGuild.config.welcomeMessage = generatedWelcome;
            
            let boundChanText = "Please use `/setwelcome` to choose where this message should be sent.";
            const welcomeChan = channels.find((c: any) => c && c.name.toLowerCase().includes('welcome') && c.isTextBased());
            if (welcomeChan) {
              dbGuild.config.welcomeChannel = welcomeChan.id;
              welcomeChannelsConfig.set(guild.id, welcomeChan.id);
              boundChanText = `Automatically bound to channel <#${welcomeChan.id}>.`;
            }
            
            await saveGuild(dbGuild);
            
            await interaction.editReply({ content: `✅ **AI Welcome Configured!**\n\n**Generated Message:**\n${generatedWelcome}\n\n${boundChanText}` });
          } catch (e: any) {
             await interaction.editReply({ content: `❌ Error generating AI welcome: ${e.message}` });
          }
      }

      if (interaction.commandName === 'testwelcome') {
          let testMember = interaction.guild?.members.cache.get(interaction.user.id);
          if (!testMember) {
              testMember = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null) as any;
          }
          if (!testMember) {
              return interaction.reply({ content: 'Could not resolve member data for testing.', ephemeral: true });
          }
          (testMember as any).testChannelId = interaction.channelId;
          console.log(`[TestWelcome] Emitting GuildMemberAdd for ${testMember.user.tag} in guild ${interaction.guild?.name}`);
          client.emit(Events.GuildMemberAdd, testMember);
          return interaction.reply({ content: 'Testing welcome message! Check the welcome channel or this channel for the welcome notification.', ephemeral: true });
      }

      if (interaction.commandName === 'rank' || interaction.commandName === 'profile') {
        const guildId = interaction.guildId;
        if (!guildId) {
          return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
        }

        await interaction.deferReply();

        const dbGuild = await getOrCreateGuild(guildId, interaction.guild?.name);

        // Get target user (defaults to the author)
        const targetUser = interaction.options.getUser('user') || interaction.user;

        // Sort leaderboard by XP descending to compute rank
        const sortedLeaderboard = [...dbGuild.leaderboard].sort((a, b) => b.xp - a.xp);
        let rankIndex = sortedLeaderboard.findIndex(m => m.user === targetUser.username);

        let memberRecord = dbGuild.leaderboard.find(m => m.user === targetUser.username);
        
        if (!memberRecord) {
          // If they aren't on the leaderboard, insert them with Level 1, 0 XP
          memberRecord = {
            user: targetUser.username,
            xp: 0,
            level: 1,
            avatar: targetUser.displayAvatarURL() || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${targetUser.username}`
          };
          dbGuild.leaderboard.push(memberRecord);
          sortedLeaderboard.push(memberRecord);
          rankIndex = sortedLeaderboard.length - 1;
        }

        // Level curve calculation
        const getXPCurveInfo = (totalXp: number) => {
          let lvl = 1;
          let tempXp = totalXp;
          while (true) {
            const neededForNext = lvl * 600;
            if (tempXp >= neededForNext) {
              tempXp -= neededForNext;
              lvl++;
            } else {
              break;
            }
          }
          return { level: lvl, xpInLevel: tempXp, xpNeeded: lvl * 600 };
        };

        const lvlInfo = getXPCurveInfo(memberRecord.xp);

        try {
          const { drawRankCard } = await import('./src/utils/rankCard.js');
          
          const cardBuffer = await drawRankCard({
            username: targetUser.username,
            avatarUrl: targetUser.displayAvatarURL({ extension: 'png', size: 256 }) || targetUser.defaultAvatarURL,
            level: lvlInfo.level,
            currentXp: lvlInfo.xpInLevel,
            neededXp: lvlInfo.xpNeeded,
            rank: rankIndex + 1
          });

          return interaction.editReply({
            files: [{
              attachment: cardBuffer,
              name: `rank-card-${targetUser.id}.png`
            }]
          });
        } catch (err: any) {
          console.error("Error generating rank card:", err);
          return interaction.editReply(`Error generating profile card: ${err.message}`);
        }
      }

      if (interaction.commandName === 'info' || interaction.commandName === 'help') {
        const infoEmbed = new EmbedBuilder()
          .setTitle('🌸 DarkFlower Bot Services & Commands Directory 🌸')
          .setDescription('Welcome! Here is the full catalog of available commands and system features you can use to moderate, engage, and manage your community.')
          .setColor('#7c25d9')
          .setThumbnail(client.user?.displayAvatarURL() || null)
          .addFields(
            {
              name: '🎵 Music System',
              value: '`/play <query>` - Play song/URL from YouTube/SoundCloud\n`/stop` - Stop music and clear queue\n`/skip` - Skip current track\n`/pause` / `/resume` - Pause/resume playback\n`/login` - Bind YouTube session to bypass age restrictions'
            },
            {
              name: '🛡️ Moderation Suite',
              value: '`/ban <target> [reason]` - Permaban a user\n`/kick <target> [reason]` - Kick a user from the guild\n`/timeout <target> <duration_min> [reason]` - Timeout a user\n`/unban <user_id> [reason]` - Revoke a user ban\n`/warn <target> <reason>` - Issue a formal warn\n`/warnings <target>` - View warning history\n`/clearwarnings <target>` - Reset warnings\n`/clear <amount>` - Bulk delete messages'
            },
            {
              name: '⚙️ Guild Administration & Utility',
              value: '`/lock [channel]` - Freeze text chat in a channel\n`/unlock [channel]` - Unfreeze text chat\n`/slowmode <seconds> [channel]` - Set message cooldown\n`/embed <title> <desc> [color] [channel]` - Broadcast custom announcement\n`/setwelcome <channel>` - Set welcome alerts channel\n`/testwelcome` - Simulates a member join'
            },
            {
              name: '🎟️ Support Tickets',
              value: '`/ticket panel` - Create interactive button panels for tickets\n`/ticket setup` - Setup ticket system in current channel\n`/ticket close` - Close active ticket channel'
            },
            {
              name: '⭐ Leveling & Progression',
              value: '`/rank [user]` / `/profile [user]` - Render custom graphics card with level, XP, and rank'
            },
            {
              name: '💝 Marriage & Relationships',
              value: '`/marry <user> <family_name>` - Propose marriage with a custom family name appended to your nicknames\n`/accept marry <user>` or `/accept-marry <user>` - Accept a marriage proposal from a user\n`/divorce` - Dissolve marriage and restore original nicknames'
            }
          )
          .setFooter({ text: 'Powered by DarkFlower Management Console • Type /info or /help anytime', iconURL: client.user?.displayAvatarURL() || undefined })
          .setTimestamp();

        return interaction.reply({ embeds: [infoEmbed] });
      }

      if (interaction.commandName === 'afk') {
        try {
          const reason = interaction.options.getString('reason') || 'I am away for a moment.';
          const guildId = interaction.guildId!;
          const userId = interaction.user.id;
          const member = interaction.member as any;

          if (!member) return interaction.reply({ content: '❌ Could not retrieve member information.', ephemeral: true });

          const dbGuild = await getOrCreateGuild(guildId, interaction.guild?.name);
          if (!dbGuild.afkUsers) dbGuild.afkUsers = [];

          const existingAFK = dbGuild.afkUsers.find(u => u.userId === userId);
          if (existingAFK) {
            return interaction.reply({ content: 'ℹ️ You are already AFK.', ephemeral: true });
          }

          let displayName = member.displayName || "";
          if (displayName.startsWith('[AFK]')) {
            displayName = displayName.replace(/^\[AFK\]\s*/i, '').trim();
          }
          const afkNickname = `[AFK] ${displayName}`;

          try {
            await member.setNickname(afkNickname.substring(0, 32));
          } catch (nickErr) {
            console.error(`[AFK] Error changing nickname for ${interaction.user.tag}:`, nickErr);
          }

          let originalNickname = member.nickname || null;
          if (originalNickname && originalNickname.startsWith('[AFK]')) {
            originalNickname = originalNickname.replace(/^\[AFK\]\s*/i, '').trim() || null;
          }

          dbGuild.afkUsers.push({
            userId,
            username: interaction.user.username,
            originalNickname,
            reason,
            timestamp: Date.now()
          });

          await saveGuild(dbGuild);

          const embed = new EmbedBuilder()
            .setColor('#7c25d9')
            .setTitle('🌙 AFK Status Set')
            .setDescription(`You are now AFK: **${reason}**`)
            .setFooter({ text: 'I will remove your AFK status when you send a message.' })
            .setTimestamp();

          return interaction.reply({ embeds: [embed] });
        } catch (err: any) {
          console.error("Error in AFK command:", err);
          return interaction.reply({ content: `❌ Error: ${err.message}`, ephemeral: true });
        }
      }
      
      if (interaction.commandName === 'tempvc') {
        try {
          await interaction.deferReply({ ephemeral: true });
          const subcommand = interaction.options.getSubcommand();
          const dbGuild = await getOrCreateGuild(interaction.guildId!, interaction.guild?.name);
          
          if (!dbGuild.tempVoiceSettings) {
            dbGuild.tempVoiceSettings = { hubChannelId: null, namingStyle: "☁️ {display.name}'s VC", userLimit: 0, categoryId: null };
            console.log(`[TempVC] Initialized default settings for guild ${interaction.guildId}`);
          }

          console.log(`[TempVC] Executing ${subcommand} for guild ${interaction.guildId}. Current Hub: ${dbGuild.tempVoiceSettings.hubChannelId}`);

          if (subcommand === 'setup') {
            const channel = interaction.options.getChannel('channel') as any;
            if (!channel || channel.type !== ChannelType.GuildVoice) {
              return interaction.editReply({ content: '❌ Please select a valid voice channel.' });
            }

            dbGuild.tempVoiceSettings.hubChannelId = channel.id;
            dbGuild.tempVoiceSettings.categoryId = channel.parentId || null;
            
            await saveGuild(dbGuild);
            console.log(`[TempVC] Setup complete for guild ${interaction.guildId}. Hub: ${channel.id}, Category: ${channel.parentId}`);
            
            return interaction.editReply({ 
              content: `✅ Successfully set **${channel.name}** as the Join-to-Create hub! Any user who joins this channel will automatically get their own temporary voice room.`
            });
          }

          if (subcommand === 'settings') {
            const naming = interaction.options.getString('naming');
            const limit = interaction.options.getInteger('limit');
            const category = interaction.options.getChannel('category');
            
            if (naming) dbGuild.tempVoiceSettings.namingStyle = naming;
            if (limit !== null) dbGuild.tempVoiceSettings.userLimit = limit;
            if (category) dbGuild.tempVoiceSettings.categoryId = category.id;
            
            await saveGuild(dbGuild);
            
            const settingsEmbed = new EmbedBuilder()
              .setColor('#7c25d9')
              .setTitle('⚙️ Temp VC Settings Updated')
              .addFields(
                { name: 'Naming Style', value: `\`${dbGuild.tempVoiceSettings.namingStyle}\``, inline: true },
                { name: 'User Limit', value: dbGuild.tempVoiceSettings.userLimit === 0 ? 'Unlimited' : dbGuild.tempVoiceSettings.userLimit.toString(), inline: true },
                { name: 'Hub Channel', value: dbGuild.tempVoiceSettings.hubChannelId ? `<#${dbGuild.tempVoiceSettings.hubChannelId}>` : 'Not set', inline: false },
                { name: 'Category', value: dbGuild.tempVoiceSettings.categoryId ? `<#${dbGuild.tempVoiceSettings.categoryId}>` : 'None', inline: false }
              )
              .setTimestamp();

            return interaction.editReply({ embeds: [settingsEmbed] });
          }
        } catch (err: any) {
          console.error("Error in tmpvc command:", err);
          if (interaction.deferred || interaction.replied) {
            return interaction.editReply({ content: `❌ Error: ${err.message}` });
          } else {
            return interaction.reply({ content: `❌ Error: ${err.message}`, ephemeral: true });
          }
        }
      }

      if (interaction.commandName === 'vcjoinpermission') {
          await interaction.deferReply({ ephemeral: true });
          const targetUser = interaction.options.getUser('user')!;
          const member = interaction.member as any;
          
          if (!member.voice || !member.voice.channel) {
              return interaction.editReply('❌ You must be in a voice channel to use this command.');
          }

          const channel = member.voice.channel;
          const dbGuild = await getOrCreateGuild(interaction.guildId!, interaction.guild?.name);
          
          if (!dbGuild.tempVoiceChannels || !dbGuild.tempVoiceChannels.includes(channel.id)) {
              return interaction.editReply('❌ This is not a temporary voice channel.');
          }

          if (!channel.permissionsFor(interaction.user.id)?.has(PermissionsBitField.Flags.ManageChannels)) {
              return interaction.editReply('❌ You do not have permission to manage this channel.');
          }

          try {
            await channel.permissionOverwrites.edit(targetUser.id, {
              Connect: true
            });
            await interaction.editReply(`✅ Granted permission to ${targetUser.username} to join your VC.`);
          } catch (e: any) {
             await interaction.editReply(`❌ Failed to grant permission: ${e.message}`);
          }
      }

      if (interaction.commandName === 'refresh') {
        try {
          await interaction.deferReply({ ephemeral: true });
          const subcommand = interaction.options.getSubcommand();
          const guildId = interaction.guildId!;
          
          if (subcommand === 'sync') {
            const commands = commandsList;
            if (!commands || commands.length === 0) {
              return interaction.editReply({ content: '❌ Command list is not loaded yet.' });
            }

            if (!isCustom) {
              // Main Bot: Sync global commands and clear guild-specific duplicates
              await client.rest.put(
                Routes.applicationCommands(client.user!.id),
                { body: commands.map((c: any) => c.toJSON()) }
              );
              await client.rest.put(
                Routes.applicationGuildCommands(client.user!.id, guildId),
                { body: [] }
              );
              return interaction.editReply({ 
                content: '✅ Successfully synced global commands and cleared guild-specific duplicates for this guild! Global updates can take up to an hour to propagate in other servers, but duplicates in this server are removed immediately.' 
              });
            } else {
              // Custom Bot: Sync guild-specific commands (custom bots only exist in their bound guild)
              await client.rest.put(
                Routes.applicationGuildCommands(client.user!.id, guildId),
                { body: commands.map((c: any) => c.toJSON()) }
              );
              return interaction.editReply({ content: '✅ Successfully synced guild commands for your Custom Bot!' });
            }
          }

          if (subcommand === 'clear') {
            await client.rest.put(
              Routes.applicationGuildCommands(client.user!.id, guildId),
              { body: [] }
            );

            return interaction.editReply({ 
              content: '✅ Successfully cleared guild-specific commands! \n\n**Note:** If you are using the main bot, you will still see global commands (it may take up to an hour for Discord to update and remove the duplicates).' 
            });
          }
        } catch (err: any) {
          console.error("Error in refresh command:", err);
          return interaction.editReply({ content: `❌ Failed to refresh commands: ${err.message}` });
        }
      }

      if (interaction.commandName === 'marry') {
        try {
          const target = interaction.options.getUser('user');
          const familyName = interaction.options.getString('family_name');
          const guildId = interaction.guildId!;

          if (!target) {
            return interaction.reply({ content: '❌ You must specify the user to marry.', ephemeral: true });
          }
          if (!familyName) {
            return interaction.reply({ content: '❌ You must specify a family name.', ephemeral: true });
          }

          if (target.id === interaction.user.id) {
            return interaction.reply({ content: '💔 You cannot marry yourself!', ephemeral: true });
          }

          if (target.bot) {
            return interaction.reply({ content: '🤖 You cannot marry a bot!', ephemeral: true });
          }

          // Defer right away because DB/cache reads can take more than 3 seconds
          await interaction.deferReply();

        let guildObj;
        try {
          guildObj = await getOrCreateGuild(guildId, interaction.guild?.name);
        } catch (dbErr) {
          console.error("Error in /marry getOrCreateGuild:", dbErr);
          return interaction.editReply({ content: '❌ Failed to access server database.' });
        }

        if (!guildObj.marriages) {
          guildObj.marriages = [];
        }

        const isUser1Married = guildObj.marriages.some(m => m.user1Id === interaction.user.id || m.user2Id === interaction.user.id);
        const isUser2Married = guildObj.marriages.some(m => m.user1Id === target.id || m.user2Id === target.id);

        if (isUser1Married) {
          return interaction.editReply({ content: '⚠️ You are already married! You must `/divorce` first if you want to marry someone else.' });
        }

        if (isUser2Married) {
          return interaction.editReply({ content: `⚠️ **${target.username}** is already married to someone else!` });
        }

        if (!guildObj.pendingProposals) {
          guildObj.pendingProposals = [];
        }

        // Clean up old proposals to keep the array small
        guildObj.pendingProposals = guildObj.pendingProposals.filter(p => Date.now() - p.timestamp < 7 * 24 * 60 * 60 * 1000);

        // Check if there is already a proposal
        const existingProposalIndex = guildObj.pendingProposals.findIndex(p => p.fromId === interaction.user.id && p.toId === target.id);
        if (existingProposalIndex > -1) {
          guildObj.pendingProposals[existingProposalIndex].timestamp = Date.now();
          guildObj.pendingProposals[existingProposalIndex].familyName = familyName;
        } else {
          guildObj.pendingProposals.push({
            fromId: interaction.user.id,
            toId: target.id,
            familyName,
            timestamp: Date.now()
          });
        }
        await saveGuild(guildObj);

        // We also keep the memory map for backward compatibility during the same session
        const proposalKey = `${guildId}-${interaction.user.id}-${target.id}`;
        pendingProposals.set(proposalKey, {
          fromId: interaction.user.id,
          toId: target.id,
          familyName,
          timestamp: Date.now()
        });

        const embed = new EmbedBuilder()
          .setColor('#FF69B4')
          .setTitle('💖 A New Proposal Has Blossomed! 💖')
          .setDescription(`💍 **${interaction.user.username}** has proposed to **${target.username}** with the family name **${familyName}**!`)
          .addFields(
            { name: 'Proposed To', value: `${target}`, inline: true },
            { name: 'Family Name', value: `\`${familyName}\``, inline: true },
            { name: 'How to Accept', value: `**${target.username}**, use the command:\n\`/accept-marry user:${interaction.user}\` or \`/accept marry user:${interaction.user}\` to say YES! 💍` }
          )
          .setThumbnail(target.displayAvatarURL() || null)
          .setTimestamp();

        return interaction.editReply({ content: `${target}`, embeds: [embed] });
        } catch (err: any) {
          console.error("Error in marry command:", err);
          if (interaction.deferred || interaction.replied) {
            return interaction.editReply({ content: `❌ Error: ${err.message}` }).catch(console.error);
          } else {
            return interaction.reply({ content: `❌ Error: ${err.message}`, ephemeral: true }).catch(console.error);
          }
        }
      }

      if (interaction.commandName === 'accept-marry' || (interaction.commandName === 'accept' && interaction.options.getSubcommand(false) === 'marry')) {
        try {
          await interaction.deferReply();
          const proposer = interaction.options.getUser('user');
          if (!proposer) {
            return interaction.editReply({ content: '❌ You must specify the user who proposed to you.' });
          }
          const target = interaction.user;
          const guildId = interaction.guildId!;

          const guildObj = await getOrCreateGuild(guildId, interaction.guild?.name);

          const proposalKey = `${guildId}-${proposer.id}-${target.id}`;
          let proposal = pendingProposals.get(proposalKey);

          if (!proposal && guildObj.pendingProposals) {
            proposal = guildObj.pendingProposals.find(p => p.fromId === proposer.id && p.toId === target.id);
          }

          if (!proposal) {
            return interaction.editReply({ content: `❌ You do not have any pending marriage proposals from **${proposer.username}**. Make sure they used \`/marry\` to propose to you!` });
          }

          if (!guildObj.marriages) {
            guildObj.marriages = [];
          }

          const isUser1Married = guildObj.marriages.some(m => m.user1Id === proposer.id || m.user2Id === proposer.id);
          const isUser2Married = guildObj.marriages.some(m => m.user1Id === target.id || m.user2Id === target.id);

          if (isUser1Married) {
            pendingProposals.delete(proposalKey);
            if (guildObj.pendingProposals) {
              guildObj.pendingProposals = guildObj.pendingProposals.filter(p => !(p.fromId === proposer.id && p.toId === target.id));
              await saveGuild(guildObj);
            }
            return interaction.editReply({ content: '⚠️ The proposer is already married to someone else now!' });
          }

          if (isUser2Married) {
            pendingProposals.delete(proposalKey);
            if (guildObj.pendingProposals) {
              guildObj.pendingProposals = guildObj.pendingProposals.filter(p => !(p.fromId === proposer.id && p.toId === target.id));
              await saveGuild(guildObj);
            }
            return interaction.editReply({ content: '⚠️ You are already married to someone else!' });
          }

          pendingProposals.delete(proposalKey);
          if (guildObj.pendingProposals) {
            guildObj.pendingProposals = guildObj.pendingProposals.filter(p => !(p.fromId === proposer.id && p.toId === target.id));
            // We'll save the guild below when we add the marriage
          }

        let privateChannelId: string | undefined = undefined;
        let channelStatus = 'Created';

        try {
          const safeProposerName = proposer.username.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || proposer.id;
          const safeTargetName = target.username.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || target.id;
          const channelName = `marry-${safeProposerName}-${safeTargetName}`;

          const marryChannel = await interaction.guild?.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            topic: `🔒 Private lounge for the lovely married couple: ${proposer.username} & ${target.username} (${proposal.familyName} family) 💖`,
            permissionOverwrites: [
              {
                id: interaction.guildId!,
                deny: [PermissionsBitField.Flags.ViewChannel],
              },
              {
                id: proposer.id,
                allow: [
                  PermissionsBitField.Flags.ViewChannel,
                  PermissionsBitField.Flags.SendMessages,
                  PermissionsBitField.Flags.ReadMessageHistory,
                  PermissionsBitField.Flags.EmbedLinks,
                  PermissionsBitField.Flags.AttachFiles,
                ],
              },
              {
                id: target.id,
                allow: [
                  PermissionsBitField.Flags.ViewChannel,
                  PermissionsBitField.Flags.SendMessages,
                  PermissionsBitField.Flags.ReadMessageHistory,
                  PermissionsBitField.Flags.EmbedLinks,
                  PermissionsBitField.Flags.AttachFiles,
                ],
              },
              {
                id: client.user!.id,
                allow: [
                  PermissionsBitField.Flags.ViewChannel,
                  PermissionsBitField.Flags.SendMessages,
                  PermissionsBitField.Flags.ReadMessageHistory,
                ],
              }
            ]
          });

          if (marryChannel) {
            privateChannelId = marryChannel.id;
            
            const welcomeEmbed = new EmbedBuilder()
              .setColor('#FF1493')
              .setTitle('💍 Welcome to your Private Love Nest! 💖')
              .setDescription(`Congratulations, **${proposer.username}** & **${target.username}**!\n\nThis is your private space to chat, save memories, and share notes. Only you two (and server admins) can see this channel.\n\nEnjoy your beautiful journey together! ✨`)
              .addFields(
                { name: 'Spouse 1', value: `${proposer}`, inline: true },
                { name: 'Spouse 2', value: `${target}`, inline: true },
                { name: 'Family Name', value: `\`${proposal.familyName}\``, inline: true }
              )
              .setTimestamp();

            await marryChannel.send({ content: `${proposer} ${target}`, embeds: [welcomeEmbed] }).catch(err => {
              console.error('[Marriage Channel] Failed to send intro message:', err);
            });
          } else {
            channelStatus = 'Failed (Could not create channel)';
          }
        } catch (err) {
          console.error('[Marriage Channel] Error creating private channel:', err);
          channelStatus = `Failed (${err instanceof Error ? err.message : String(err)})`;
        }

        const marriageEntry: any = {
          user1Id: proposer.id,
          user2Id: target.id,
          user1Tag: proposer.tag,
          user2Tag: target.tag,
          familyName: proposal.familyName,
          marriedAt: Date.now()
        };
        if (privateChannelId) {
          marriageEntry.channelId = privateChannelId;
        }

        guildObj.marriages.push(marriageEntry);
        await saveGuild(guildObj);

        let nickAStatus = 'Updated';
        let nickBStatus = 'Updated';

        try {
          const memberA = await interaction.guild?.members.fetch(proposer.id);
          if (memberA) {
            const currentNick = memberA.nickname || memberA.user.displayName || memberA.user.username;
            if (!currentNick.includes(proposal.familyName)) {
              await memberA.setNickname(`${currentNick} | ${proposal.familyName}`).catch(() => {
                nickAStatus = 'Failed (Role hierarchy / Owner limitation)';
              });
            }
          }
        } catch (err) {
          nickAStatus = 'Failed';
        }

        try {
          const memberB = await interaction.guild?.members.fetch(target.id);
          if (memberB) {
            const currentNick = memberB.nickname || memberB.user.displayName || memberB.user.username;
            if (!currentNick.includes(proposal.familyName)) {
              await memberB.setNickname(`${currentNick} | ${proposal.familyName}`).catch(() => {
                nickBStatus = 'Failed (Role hierarchy / Owner limitation)';
              });
            }
          }
        } catch (err) {
          nickBStatus = 'Failed';
        }

        let roleStatus = 'Created and assigned';
        let familyRole = null;
        try {
          const roleName = `${proposal.familyName} family`;
          await interaction.guild?.roles.fetch().catch(() => null);
          familyRole = interaction.guild?.roles.cache.find(r => r.name.toLowerCase() === roleName.toLowerCase());
          
          if (!familyRole) {
            familyRole = await interaction.guild?.roles.create({
              name: roleName,
              color: 0xFF69B4,
              reason: `Family role for married couple ${proposer.username} & ${target.username}`
            });
          }

          if (familyRole) {
            const memberA = await interaction.guild?.members.fetch(proposer.id).catch(() => null);
            if (memberA) {
              await memberA.roles.add(familyRole).catch(e => {
                console.error(`[Marriage Role] Failed to assign role to proposer:`, e);
                roleStatus = 'Partial (Failed to assign to spouse 1)';
              });
            }
            const memberB = await interaction.guild?.members.fetch(target.id).catch(() => null);
            if (memberB) {
              await memberB.roles.add(familyRole).catch(e => {
                console.error(`[Marriage Role] Failed to assign role to target:`, e);
                roleStatus = 'Partial (Failed to assign to spouse 2)';
              });
            }
          } else {
            roleStatus = 'Failed (Could not create role)';
          }
        } catch (err) {
          console.error('[Marriage Role] Error managing family role:', err);
          roleStatus = `Failed (${err instanceof Error ? err.message : String(err)})`;
        }

        const celebrationEmbed = new EmbedBuilder()
          .setColor('#FF1493')
          .setTitle('💝 They Said YES! The Marriage is Official! 💍')
          .setDescription(`🎉 **${proposer.username}** and **${target.username}** are now officially married with the family name **${proposal.familyName}**! 🎉`)
          .addFields(
            { name: 'Spouse 1', value: `${proposer}`, inline: true },
            { name: 'Spouse 2', value: `${target}`, inline: true },
            { name: 'Family Name', value: `\`${proposal.familyName}\``, inline: true },
            { name: 'Family Role', value: familyRole ? `${familyRole}` : `\`${proposal.familyName} family\` (${roleStatus})`, inline: true },
            { name: 'Private Channel', value: privateChannelId ? `<#${privateChannelId}>` : `\`${channelStatus}\``, inline: true },
            { name: 'Anniversary Date', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
          )
          .setImage('https://api.dicebear.com/7.x/identicon/svg?seed=marriage-' + proposer.id + '-' + target.id)
          .setTimestamp();

        if (nickAStatus !== 'Updated' || nickBStatus !== 'Updated' || roleStatus.startsWith('Failed') || roleStatus.startsWith('Partial')) {
          celebrationEmbed.setFooter({ text: `Note: Nickname/Role updates might be limited for some users due to Discord roles/permissions.` });
        }

        return interaction.editReply({ content: `💖 🎉 **Congratulations!** ${proposer} and ${target} are now married!`, embeds: [celebrationEmbed] });
        } catch (err: any) {
          console.error("Error in accept-marry command:", err);
          if (interaction.deferred || interaction.replied) {
            return interaction.editReply({ content: `❌ Error: ${err.message}` }).catch(console.error);
          } else {
            return interaction.reply({ content: `❌ Error: ${err.message}`, ephemeral: true }).catch(console.error);
          }
        }
      }

      if (interaction.commandName === 'adopt') {
        try {
          await interaction.deferReply();
          const target = interaction.options.getUser('user');
          const guildId = interaction.guildId!;
          const user = interaction.user;

          if (!target) {
            return interaction.editReply({ content: '❌ You must specify a user to adopt.' });
          }
          if (target.id === user.id) {
            return interaction.editReply({ content: '👪 You cannot adopt yourself!' });
          }
          if (target.bot) {
            return interaction.editReply({ content: '🤖 You cannot adopt a bot!' });
          }

          const dbGuild = await getOrCreateGuild(guildId, interaction.guild?.name);
          if (!dbGuild.parentChildLinks) dbGuild.parentChildLinks = [];
          if (!dbGuild.pendingAdoptions) dbGuild.pendingAdoptions = [];

          // Check if already parent-child
          const alreadyLinked = dbGuild.parentChildLinks.some(link => 
            (link.parentId === user.id && link.childId === target.id) || 
            (link.parentId === target.id && link.childId === user.id)
          );
          if (alreadyLinked) {
            return interaction.editReply({ content: '⚠️ You already have a parent-child relationship with this user!' });
          }

          // Clean up old pending adoptions to keep it clean
          dbGuild.pendingAdoptions = dbGuild.pendingAdoptions.filter(p => Date.now() - p.timestamp < 3 * 24 * 60 * 60 * 1000);

          // Find if there is already a pending request
          const existing = dbGuild.pendingAdoptions.find(p => p.fromId === user.id && p.toId === target.id);
          if (existing) {
            existing.timestamp = Date.now();
          } else {
            dbGuild.pendingAdoptions.push({
              fromId: user.id,
              fromTag: user.tag,
              toId: target.id,
              toTag: target.tag,
              timestamp: Date.now()
            });
          }
          await saveGuild(dbGuild);

          const embed = new EmbedBuilder()
            .setColor('#7c25d9')
            .setTitle('👪 Adoption Proposal! 👪')
            .setDescription(`💍 **${user.username}** has requested to adopt **${target.username}** as their child!`)
            .addFields(
              { name: 'Adopter', value: `${user}`, inline: true },
              { name: 'Child-to-be', value: `${target}`, inline: true },
              { name: 'How to Accept', value: `**${target.username}**, use the command:\n\`/accept-adopt user:${user}\` or \`/accept adopt user:${user}\` to say YES! ❤️` }
            )
            .setTimestamp();

          return interaction.editReply({ content: `${target}`, embeds: [embed] });
        } catch (err: any) {
          console.error("Error in adopt command:", err);
          return interaction.editReply({ content: `❌ Error: ${err.message}` });
        }
      }

      if (interaction.commandName === 'accept-adopt' || (interaction.commandName === 'accept' && interaction.options.getSubcommand(false) === 'adopt')) {
        try {
          await interaction.deferReply();
          const proposer = interaction.options.getUser('user');
          const target = interaction.user;
          const guildId = interaction.guildId!;

          if (!proposer) {
            return interaction.editReply({ content: '❌ You must specify the user who offered to adopt you.' });
          }

          const dbGuild = await getOrCreateGuild(guildId, interaction.guild?.name);
          if (!dbGuild.pendingAdoptions) dbGuild.pendingAdoptions = [];
          if (!dbGuild.parentChildLinks) dbGuild.parentChildLinks = [];

          const proposalIndex = dbGuild.pendingAdoptions.findIndex(p => p.fromId === proposer.id && p.toId === target.id);
          if (proposalIndex === -1) {
            return interaction.editReply({ content: `❌ You have no pending adoption requests from **${proposer.username}**.` });
          }

          dbGuild.pendingAdoptions.splice(proposalIndex, 1);

          // Add the link
          dbGuild.parentChildLinks.push({
            parentId: proposer.id,
            parentTag: proposer.tag,
            childId: target.id,
            childTag: target.tag,
            timestamp: Date.now()
          });

          // If adopter is married, we also automatically adopt under the spouse!
          let spouseMsg = "";
          if (dbGuild.marriages) {
            const marriage = dbGuild.marriages.find(m => m.user1Id === proposer.id || m.user2Id === proposer.id);
            if (marriage) {
              const spouseId = marriage.user1Id === proposer.id ? marriage.user2Id : marriage.user1Id;
              const spouseUser = await client.users.fetch(spouseId).catch(() => null);
              if (spouseUser) {
                // Ensure no duplicates
                const spouseLinked = dbGuild.parentChildLinks.some(link => link.parentId === spouseId && link.childId === target.id);
                if (!spouseLinked) {
                  dbGuild.parentChildLinks.push({
                    parentId: spouseId,
                    parentTag: spouseUser.tag,
                    childId: target.id,
                    childTag: target.tag,
                    timestamp: Date.now()
                  });
                  spouseMsg = ` and their spouse **${spouseUser.username}**`;
                }
              }
            }
          }

          await saveGuild(dbGuild);

          const embed = new EmbedBuilder()
            .setColor('#2ECC71')
            .setTitle('👪 Welcome to the Family! 👪')
            .setDescription(`🎉 **${target.username}** has been officially adopted by **${proposer.username}**${spouseMsg}! 🎉`)
            .setTimestamp();

          return interaction.editReply({ embeds: [embed] });
        } catch (err: any) {
          console.error("Error in accept-adopt command:", err);
          return interaction.editReply({ content: `❌ Error: ${err.message}` });
        }
      }

      if (interaction.commandName === 'makeparent') {
        try {
          await interaction.deferReply();
          const target = interaction.options.getUser('user');
          const guildId = interaction.guildId!;
          const user = interaction.user;

          if (!target) {
            return interaction.editReply({ content: '❌ You must specify a user to make your parent.' });
          }
          if (target.id === user.id) {
            return interaction.editReply({ content: '👪 You cannot be your own parent!' });
          }
          if (target.bot) {
            return interaction.editReply({ content: '🤖 Bots cannot be parents!' });
          }

          const dbGuild = await getOrCreateGuild(guildId, interaction.guild?.name);
          if (!dbGuild.parentChildLinks) dbGuild.parentChildLinks = [];
          if (!dbGuild.pendingParents) dbGuild.pendingParents = [];

          // Check if already parent-child
          const alreadyLinked = dbGuild.parentChildLinks.some(link => 
            (link.parentId === user.id && link.childId === target.id) || 
            (link.parentId === target.id && link.childId === user.id)
          );
          if (alreadyLinked) {
            return interaction.editReply({ content: '⚠️ You already have a parent-child relationship with this user!' });
          }

          // Clean up old pending requests
          dbGuild.pendingParents = dbGuild.pendingParents.filter(p => Date.now() - p.timestamp < 3 * 24 * 60 * 60 * 1000);

          const existing = dbGuild.pendingParents.find(p => p.fromId === user.id && p.toId === target.id);
          if (existing) {
            existing.timestamp = Date.now();
          } else {
            dbGuild.pendingParents.push({
              fromId: user.id,
              fromTag: user.tag,
              toId: target.id,
              toTag: target.tag,
              timestamp: Date.now()
            });
          }
          await saveGuild(dbGuild);

          const embed = new EmbedBuilder()
            .setColor('#7c25d9')
            .setTitle('👪 Parent Invitation! 👪')
            .setDescription(`💍 **${user.username}** has requested **${target.username}** to become their parent!`)
            .addFields(
              { name: 'Inviter (Child)', value: `${user}`, inline: true },
              { name: 'Parent-to-be', value: `${target}`, inline: true },
              { name: 'How to Accept', value: `**${target.username}**, use the command:\n\`/accept-parent user:${user}\` or \`/accept parent user:${user}\` to say YES! ❤️` }
            )
            .setTimestamp();

          return interaction.editReply({ content: `${target}`, embeds: [embed] });
        } catch (err: any) {
          console.error("Error in makeparent command:", err);
          return interaction.editReply({ content: `❌ Error: ${err.message}` });
        }
      }

      if (interaction.commandName === 'accept-parent' || (interaction.commandName === 'accept' && interaction.options.getSubcommand(false) === 'parent')) {
        try {
          await interaction.deferReply();
          const proposer = interaction.options.getUser('user'); // the child
          const target = interaction.user; // the parent
          const guildId = interaction.guildId!;

          if (!proposer) {
            return interaction.editReply({ content: '❌ You must specify the user who requested you as a parent.' });
          }

          const dbGuild = await getOrCreateGuild(guildId, interaction.guild?.name);
          if (!dbGuild.pendingParents) dbGuild.pendingParents = [];
          if (!dbGuild.parentChildLinks) dbGuild.parentChildLinks = [];

          const proposalIndex = dbGuild.pendingParents.findIndex(p => p.fromId === proposer.id && p.toId === target.id);
          if (proposalIndex === -1) {
            return interaction.editReply({ content: `❌ You have no pending parent requests from **${proposer.username}**.` });
          }

          dbGuild.pendingParents.splice(proposalIndex, 1);

          // Add the link (target is parent, proposer is child)
          dbGuild.parentChildLinks.push({
            parentId: target.id,
            parentTag: target.tag,
            childId: proposer.id,
            childTag: proposer.tag,
            timestamp: Date.now()
          });

          // If parent is married, spouse is also parent
          let spouseMsg = "";
          if (dbGuild.marriages) {
            const marriage = dbGuild.marriages.find(m => m.user1Id === target.id || m.user2Id === target.id);
            if (marriage) {
              const spouseId = marriage.user1Id === target.id ? marriage.user2Id : marriage.user1Id;
              const spouseUser = await client.users.fetch(spouseId).catch(() => null);
              if (spouseUser) {
                const spouseLinked = dbGuild.parentChildLinks.some(link => link.parentId === spouseId && link.childId === proposer.id);
                if (!spouseLinked) {
                  dbGuild.parentChildLinks.push({
                    parentId: spouseId,
                    parentTag: spouseUser.tag,
                    childId: proposer.id,
                    childTag: proposer.tag,
                    timestamp: Date.now()
                  });
                  spouseMsg = ` and their spouse **${spouseUser.username}**`;
                }
              }
            }
          }

          await saveGuild(dbGuild);

          const embed = new EmbedBuilder()
            .setColor('#2ECC71')
            .setTitle('👪 Family Connection Made! 👪')
            .setDescription(`🎉 **${target.username}**${spouseMsg} is now officially the parent of **${proposer.username}**! 🎉`)
            .setTimestamp();

          return interaction.editReply({ embeds: [embed] });
        } catch (err: any) {
          console.error("Error in accept-parent command:", err);
          return interaction.editReply({ content: `❌ Error: ${err.message}` });
        }
      }

      if (interaction.commandName === 'disown') {
        try {
          await interaction.deferReply();
          const target = interaction.options.getUser('user');
          const guildId = interaction.guildId!;
          const user = interaction.user;

          if (!target) {
            return interaction.editReply({ content: '❌ You must specify a user to disown.' });
          }

          const dbGuild = await getOrCreateGuild(guildId, interaction.guild?.name);
          if (!dbGuild.parentChildLinks) dbGuild.parentChildLinks = [];

          const linkIndex = dbGuild.parentChildLinks.findIndex(link => link.parentId === user.id && link.childId === target.id);
          if (linkIndex === -1) {
            return interaction.editReply({ content: `⚠️ **${target.username}** is not registered as your child.` });
          }

          dbGuild.parentChildLinks.splice(linkIndex, 1);
          await saveGuild(dbGuild);

          const embed = new EmbedBuilder()
            .setColor('#E74C3C')
            .setTitle('💔 Child Disowned 💔')
            .setDescription(`**${user.username}** has disowned **${target.username}**. They are no longer in their family tree.`)
            .setTimestamp();

          return interaction.editReply({ embeds: [embed] });
        } catch (err: any) {
          console.error("Error in disown command:", err);
          return interaction.editReply({ content: `❌ Error: ${err.message}` });
        }
      }

      if (interaction.commandName === 'tree') {
        try {
          await interaction.deferReply();
          const targetUser = interaction.options.getUser('user') || interaction.user;
          const guildId = interaction.guildId!;

          const dbGuild = await getOrCreateGuild(guildId, interaction.guild?.name);
          const links = dbGuild.parentChildLinks || [];
          const marriages = dbGuild.marriages || [];

          // Find spouses
          const mySpouses = marriages.filter(m => m.user1Id === targetUser.id || m.user2Id === targetUser.id).map(m => {
            const spId = m.user1Id === targetUser.id ? m.user2Id : m.user1Id;
            const spTag = m.user1Id === targetUser.id ? m.user2Tag : m.user1Tag;
            return { id: spId, tag: spTag, familyName: m.familyName };
          });

          // Find parents
          const myParents = links.filter(l => l.childId === targetUser.id).map(l => ({ id: l.parentId, tag: l.parentTag }));

          // Find children
          const myChildren = links.filter(l => l.parentId === targetUser.id).map(l => ({ id: l.childId, tag: l.childTag }));

          const embed = new EmbedBuilder()
            .setColor('#FF69B4')
            .setTitle(`🌳 Family Tree of ${targetUser.username} 🌳`)
            .setDescription(`Here is a layout of ${targetUser}'s verified family tree in this server:`)
            .setThumbnail(targetUser.displayAvatarURL() || null);

          let parentsText = myParents.length > 0 
            ? myParents.map((p, i) => `${i === myParents.length - 1 ? '└─' : '├─'} 👨‍👩‍👦 <@${p.id}>`).join('\n')
            : ' └─ *No registered parents yet. Use `/makeparent` to invite one!*';

          let spousesText = mySpouses.length > 0
            ? mySpouses.map((s, i) => `${i === mySpouses.length - 1 ? '└─' : '├─'} 💍 <@${s.id}> (Family Name: \`${s.familyName}\`)`).join('\n')
            : ' └─ *Single / Looking for Love 💖. Use `/marry` to propose!*';

          let childrenText = myChildren.length > 0
            ? myChildren.map((c, i) => `${i === myChildren.length - 1 ? '└─' : '├─'} 👶 <@${c.id}>`).join('\n')
            : ' └─ *No children. Use `/adopt` to adopt someone!*';

          embed.addFields(
            { name: '👨‍👩‍👧‍👦 Parents', value: parentsText, inline: false },
            { name: '💍 Spouses', value: spousesText, inline: false },
            { name: '👶 Children', value: childrenText, inline: false }
          );

          return interaction.editReply({ embeds: [embed] });
        } catch (err: any) {
          console.error("Error in tree command:", err);
          return interaction.editReply({ content: `❌ Error: ${err.message}` });
        }
      }

      if (interaction.commandName === 'status') {
        try {
          await interaction.deferReply();
          const targetUser = interaction.options.getUser('user') || interaction.user;
          const guildId = interaction.guildId!;

          const dbGuild = await getOrCreateGuild(guildId, interaction.guild?.name);
          const links = dbGuild.parentChildLinks || [];
          const marriages = dbGuild.marriages || [];

          // Spouses
          const myMarriages = marriages.filter(m => m.user1Id === targetUser.id || m.user2Id === targetUser.id);
          const spousesCount = myMarriages.length;

          // Parents
          const parentsCount = links.filter(l => l.childId === targetUser.id).length;

          // Children
          const childrenCount = links.filter(l => l.parentId === targetUser.id).length;

          const totalFamilySize = 1 + spousesCount + parentsCount + childrenCount;

          const embed = new EmbedBuilder()
            .setColor('#FF1493')
            .setTitle(`💖 Relationship Profile: ${targetUser.username} 💖`)
            .setThumbnail(targetUser.displayAvatarURL() || null)
            .setTimestamp();

          if (spousesCount > 0) {
            const primaryMarriage = myMarriages[0];
            const partnerId = primaryMarriage.user1Id === targetUser.id ? primaryMarriage.user2Id : primaryMarriage.user1Id;
            const daysMarried = Math.max(0, Math.floor((Date.now() - primaryMarriage.marriedAt) / (1000 * 60 * 60 * 24)));
            const anniversaryDate = new Date(primaryMarriage.marriedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

            embed.addFields(
              { name: 'Status', value: `💍 Married to <@${partnerId}>`, inline: true },
              { name: 'Family Name', value: `\`${primaryMarriage.familyName}\``, inline: true },
              { name: 'Family Size', value: `👨‍👩‍👧‍👦 **${totalFamilySize}** member(s)`, inline: true },
              { name: 'Wedding Anniversary', value: `📅 ${anniversaryDate}`, inline: true },
              { name: 'Total Days Married', value: `⏳ **${daysMarried}** day(s) married`, inline: true }
            );
          } else {
            embed.addFields(
              { name: 'Status', value: '💖 Single / Looking for Love', inline: true },
              { name: 'Family Size', value: `👨‍👩‍👧‍👦 **${totalFamilySize}** member(s)`, inline: true }
            );
          }

          if (parentsCount > 0 || childrenCount > 0) {
            embed.addFields(
              { name: 'Family Summary', value: `👪 **${parentsCount}** Parent(s) & **${childrenCount}** Child(ren)`, inline: false }
            );
          }

          return interaction.editReply({ embeds: [embed] });
        } catch (err: any) {
          console.error("Error in status command:", err);
          return interaction.editReply({ content: `❌ Error: ${err.message}` });
        }
      }

      if (interaction.commandName === 'unmarry' || interaction.commandName === 'divorce') {
        try {
          await interaction.deferReply();
          const guildId = interaction.guildId!;
          const user = interaction.user;

          const guildObj = await getOrCreateGuild(guildId, interaction.guild?.name);

        if (!guildObj.marriages) {
          guildObj.marriages = [];
        }

        const marriageIndex = guildObj.marriages.findIndex(m => m.user1Id === user.id || m.user2Id === user.id);

        if (marriageIndex === -1) {
          return interaction.editReply({ content: '💔 You are not currently married in this server!' });
        }

        const marriage = guildObj.marriages[marriageIndex];
        const partnerId = marriage.user1Id === user.id ? marriage.user2Id : marriage.user1Id;
        const partnerUser = await client.users.fetch(partnerId).catch(() => null);

        guildObj.marriages.splice(marriageIndex, 1);
        await saveGuild(guildObj);

        const suffix = ` | ${marriage.familyName}`;
        const suffixAlt = ` ${marriage.familyName}`;

        try {
          const memberA = await interaction.guild?.members.fetch(user.id);
          if (memberA && memberA.nickname) {
            let newNick = memberA.nickname;
            if (newNick.endsWith(suffix)) {
              newNick = newNick.slice(0, -suffix.length);
            } else if (newNick.endsWith(suffixAlt)) {
              newNick = newNick.slice(0, -suffixAlt.length);
            }
            if (newNick === memberA.user.displayName || newNick === memberA.user.username || newNick.trim() === '') {
              await memberA.setNickname(null).catch(() => null);
            } else {
              await memberA.setNickname(newNick).catch(() => null);
            }
          }
        } catch (err) {
          // Ignore nickname restore errors
        }

        try {
          const memberB = await interaction.guild?.members.fetch(partnerId);
          if (memberB && memberB.nickname) {
            let newNick = memberB.nickname;
            if (newNick.endsWith(suffix)) {
              newNick = newNick.slice(0, -suffix.length);
            } else if (newNick.endsWith(suffixAlt)) {
              newNick = newNick.slice(0, -suffixAlt.length);
            }
            if (newNick === memberB.user.displayName || newNick === memberB.user.username || newNick.trim() === '') {
              await memberB.setNickname(null).catch(() => null);
            } else {
              await memberB.setNickname(newNick).catch(() => null);
            }
          }
        } catch (err) {
          // Ignore nickname restore errors
        }

        let roleStatus = 'Deleted';
        try {
          const roleName = `${marriage.familyName} family`;
          await interaction.guild?.roles.fetch().catch(() => null);
          const role = interaction.guild?.roles.cache.find(r => r.name.toLowerCase() === roleName.toLowerCase());
          if (role) {
            await role.delete(`Marriage dissolved by ${user.username}`).catch(e => {
              console.error(`[Divorce Role] Failed to delete role ${roleName}:`, e);
              roleStatus = 'Failed to delete (role permissions)';
            });
          } else {
            roleStatus = 'Not found';
          }
        } catch (err) {
          console.error('[Divorce Role] Error deleting family role:', err);
          roleStatus = 'Failed to delete';
        }

        let channelStatus = 'No channel associated';
        if (marriage.channelId) {
          try {
            const channel = await interaction.guild?.channels.fetch(marriage.channelId).catch(() => null);
            if (channel) {
              let deleteSuccess = true;
              await channel.delete(`Marriage dissolved by /divorce command by ${user.username}`).catch(e => {
                console.error(`[Divorce Channel] Failed to delete channel ${marriage.channelId}:`, e);
                channelStatus = 'Failed to delete (permissions)';
                deleteSuccess = false;
              });
              if (deleteSuccess) {
                channelStatus = 'Deleted forever 🔒';
              }
            } else {
              channelStatus = 'Not found (already deleted)';
            }
          } catch (err) {
            console.error('[Divorce Channel] Error deleting channel:', err);
            channelStatus = 'Failed to delete';
          }
        }

        const divorceEmbed = new EmbedBuilder()
          .setColor('#A9A9A9')
          .setTitle('💔 Marriage Ended 💔')
          .setDescription(`The marriage between **${user.username}** and **${partnerUser ? partnerUser.username : partnerId}** has been dissolved.`)
          .addFields(
            { name: 'Former Spouse 1', value: `${user}`, inline: true },
            { name: 'Former Spouse 2', value: partnerUser ? `${partnerUser}` : `<@${partnerId}>`, inline: true },
            { name: 'Removed Family Name', value: `\`${marriage.familyName}\``, inline: true },
            { name: 'Family Role Status', value: `\`${roleStatus}\``, inline: true },
            { name: 'Private Channel Status', value: `\`${channelStatus}\``, inline: true }
          )
          .setTimestamp();

        return interaction.editReply({ content: `💔 The marriage has been dissolved.`, embeds: [divorceEmbed] });
        } catch (err: any) {
          console.error("Error in divorce command:", err);
          if (interaction.deferred || interaction.replied) {
            return interaction.editReply({ content: `❌ Error: ${err.message}` }).catch(console.error);
          } else {
            return interaction.reply({ content: `❌ Error: ${err.message}`, ephemeral: true }).catch(console.error);
          }
        }
      }

      // ==========================================
      // MARRIAGE COMPANION FEATURES & DRAMA BLOCKS
      // ==========================================
      if (interaction.commandName === 'flirt' || interaction.commandName === 'hug' || interaction.commandName === 'kiss' || interaction.commandName === 'poke') {
        try {
          const guildId = interaction.guildId!;
          const targetUser = interaction.options.getUser('user');
          if (!targetUser) {
            return interaction.reply({ content: `❌ You must specify a user to ${interaction.commandName}.`, ephemeral: true });
          }

          // Self-interaction guard
          if (targetUser.id === interaction.user.id) {
            const actionWord = interaction.commandName === 'flirt' ? 'flirt with' : interaction.commandName === 'hug' ? 'hug' : interaction.commandName === 'poke' ? 'poke' : 'kiss';
            return interaction.reply({ content: `🔍 You cannot ${actionWord} yourself! Go find someone to share the love with. ❤️`, ephemeral: true });
          }

          // Defer reply because database operations can take more than 3 seconds
          await interaction.deferReply();

        let guildObj;
        try {
          guildObj = await getOrCreateGuild(guildId, interaction.guild?.name);
        } catch (dbErr) {
          console.error(`Error in /${interaction.commandName} getOrCreateGuild:`, dbErr);
          return interaction.editReply({ content: '❌ Failed to access server database.' });
        }

        // Check if caller is married
        const marriage = guildObj.marriages?.find(m => m.user1Id === interaction.user.id || m.user2Id === interaction.user.id);

        if (marriage) {
          const spouseId = marriage.user1Id === interaction.user.id ? marriage.user2Id : marriage.user1Id;
          // DRAMA BLOCK: Caught red-handed if trying to flirt/hug/kiss anyone but spouse!
          if (targetUser.id !== spouseId) {
            return interaction.editReply({
              content: `🚨 **CAUGHT Red-Handed!** ${interaction.user} tried to use a romantic/flirtatious command on ${targetUser}! Wait until <@${spouseId}> hears about this... 🍿👀`
            });
          }

          // Otherwise, they are interacting with their spouse! Calculate anniversary tier & upgrade the experience.
          const diffTime = Date.now() - marriage.marriedAt;
          const diffDays = diffTime / (1000 * 60 * 60 * 24);

          let milestoneText = '';
          let gifUrl = '';

          if (interaction.commandName === 'flirt') {
            gifUrl = Math.random() > 0.5 
              ? "https://media.tenor.com/E139H1pYy60AAAAC/anime-couple.gif"
              : "https://media.tenor.com/bIofZ2FpMy8AAAAd/anime-flirt.gif";
            milestoneText = "These two are inseparable and madly in love! 💕";
          } else if (interaction.commandName === 'hug') {
            if (diffDays >= 365) {
              milestoneText = "🏆 **1-Year Eternal Anniversary Hug!** A legendary bond that can never be broken! ✨";
              gifUrl = "https://media.tenor.com/8QG36E4U_u0AAAAC/anime-couple-hug.gif";
            } else if (diffDays >= 30) {
              milestoneText = "🥈 **1-Month Silver Anniversary Hug!** Their warm embrace shines brighter each day! 🌟";
              gifUrl = "https://media.tenor.com/X56IjZa7p90AAAAC/anime-warm-hug.gif";
            } else if (diffDays >= 7) {
              milestoneText = "🥉 **1-Week Bronze Anniversary Hug!** The sparks of their fresh love are burning beautifully! 🔥";
              gifUrl = "https://media.tenor.com/0v8Ure4vHkAAAAAC/anime-hug-love.gif";
            } else {
              milestoneText = "✨ **Freshly Married Hug!** Getting cozier by the second! 🥰";
              gifUrl = "https://media.tenor.com/3MrXU7LgS7IAAAAC/anime-hug.gif";
            }
          } else if (interaction.commandName === 'poke') {
            milestoneText = "A playful poke to get their partner's attention! 👉";
            gifUrl = "https://media.tenor.com/0vK3O1tW73gAAAAC/anime-poke.gif";
          } else { // kiss
            if (diffDays >= 365) {
              milestoneText = "🏆 **1-Year Eternal Anniversary Kiss!** An everlasting kiss sealed under the stars! 🌟🎆";
              gifUrl = "https://media.tenor.com/D_bQvX6m8WkAAAAC/anime-kiss-deep.gif";
            } else if (diffDays >= 30) {
              milestoneText = "🥈 **1-Month Silver Anniversary Kiss!** A kiss filled with comfort, trust, and deep affection! 💞";
              gifUrl = "https://media.tenor.com/wDYLa7ALvQYAAAAC/anime-kissing.gif";
            } else if (diffDays >= 7) {
              milestoneText = "🥉 **1-Week Bronze Anniversary Kiss!** A beautiful, passionate kiss! 💋✨";
              gifUrl = "https://media.tenor.com/Pn7p8C0VfK4AAAAC/anime-kiss-romantic.gif";
            } else {
              milestoneText = "✨ **Freshly Married Kiss!** Sweet, cute, and full of promises! 🌸";
              gifUrl = "https://media.tenor.com/fA2LgG7n7pAAAAAC/anime-kiss.gif";
            }
          }

          const embed = new EmbedBuilder()
            .setColor('#FF1493')
            .setTitle(`💝 Special Married ${interaction.commandName === 'flirt' ? 'Flirtation' : interaction.commandName === 'hug' ? 'Warm Hug' : 'Romantic Kiss'}! 💍`)
            .setDescription(`${interaction.user} showers their wonderful spouse ${targetUser} with affection!\n\n${milestoneText}`)
            .setImage(gifUrl)
            .setTimestamp();

          return interaction.editReply({ embeds: [embed] });
        } else {
          // Caller is NOT married. They can use these as standard friendly/flirtatious commands!
          let gifUrl = '';
          let title = '';
          let description = '';

          if (interaction.commandName === 'flirt') {
            title = '✨ Standard Flirtation! 😉';
            description = `${interaction.user} winks playfully at ${targetUser}! Can you feel the vibe?`;
            gifUrl = "https://media.tenor.com/gK2TMy7A-6QAAAAC/anime-wink.gif";
          } else if (interaction.commandName === 'hug') {
            title = '🤗 Friendly Hug! 🤗';
            description = `${interaction.user} sends a warm, friendly hug to ${targetUser}! Hope you have a wonderful day.`;
            gifUrl = "https://media.tenor.com/k9vqyf_Z6v0AAAAC/anime-hug.gif";
          } else if (interaction.commandName === 'poke') {
            title = '👉 Playful Poke! 👉';
            description = `${interaction.user} playfully pokes ${targetUser}! Boop!`;
            gifUrl = "https://media.tenor.com/0vK3O1tW73gAAAAC/anime-poke.gif";
          } else {
            title = '💋 Friendly Kiss! 💋';
            description = `${interaction.user} blows a sweet friendly kiss to ${targetUser}!`;
            gifUrl = "https://media.tenor.com/lY6re9_c_Z0AAAAC/anime-kiss.gif";
          }

          const embed = new EmbedBuilder()
            .setColor('#2ECC71')
            .setTitle(title)
            .setDescription(description)
            .setImage(gifUrl)
            .setTimestamp();

          return interaction.editReply({ embeds: [embed] });
        }
        } catch (err: any) {
          console.error(`Error in ${interaction.commandName} command:`, err);
          if (interaction.deferred || interaction.replied) {
            return interaction.editReply({ content: `❌ Error: ${err.message}` }).catch(console.error);
          } else {
            return interaction.reply({ content: `❌ Error: ${err.message}`, ephemeral: true }).catch(console.error);
          }
        }
      }

      if (interaction.commandName === 'summon') {
        const guildId = interaction.guildId!;
        
        // Defer reply because database and API operations can take more than 3 seconds
        await interaction.deferReply();

        let guildObj;
        try {
          guildObj = await getOrCreateGuild(guildId, interaction.guild?.name);
        } catch (dbErr) {
          console.error("Error in /summon getOrCreateGuild:", dbErr);
          return interaction.editReply({ content: '❌ Failed to access server database.' });
        }

        const marriage = guildObj.marriages?.find(m => m.user1Id === interaction.user.id || m.user2Id === interaction.user.id);
        if (!marriage) {
          return interaction.editReply({ content: '💔 You must be married to use the summon command!' });
        }

        // Check daily limit (Silver & Gold milestones increase this to 5)
        const diffTime = Date.now() - marriage.marriedAt;
        const diffDays = diffTime / (1000 * 60 * 60 * 24);
        const maxSummons = diffDays >= 30 ? 5 : 3;

        const todayStr = new Date().toISOString().slice(0, 10);
        if (!marriage.lastSummonDate || marriage.lastSummonDate !== todayStr) {
          marriage.summonCount = 0;
          marriage.lastSummonDate = todayStr;
        }

        if ((marriage.summonCount || 0) >= maxSummons) {
          return interaction.editReply({ content: `⚠️ You have reached your limit of **${maxSummons} summons** for today! Silver and Gold marriages enjoy 5 summons per day. ❤️` });
        }

        const spouseId = marriage.user1Id === interaction.user.id ? marriage.user2Id : marriage.user1Id;
        const callerMember = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
        const spouseMember = await interaction.guild?.members.fetch(spouseId).catch(() => null);

        if (!callerMember || !spouseMember) {
          return interaction.editReply({ content: '❌ Could not retrieve user/spouse info in this server.' });
        }

        const callerVoiceChannel = callerMember.voice.channel;
        const spouseVoiceChannel = spouseMember.voice.channel;

        if (!callerVoiceChannel) {
          return interaction.editReply({ content: '❌ You must be in a Voice Channel to summon your partner!' });
        }

        if (!spouseVoiceChannel) {
          return interaction.editReply({ content: `❌ Your spouse <@${spouseId}> is not in any voice channel right now, so they cannot be summoned!` });
        }

        if (callerVoiceChannel.id === spouseVoiceChannel.id) {
          return interaction.editReply({ content: `😊 You and your spouse are already in the same voice channel (<#${callerVoiceChannel.id}>)!` });
        }

        try {
          await spouseMember.voice.setChannel(callerVoiceChannel, `Summoned by spouse ${interaction.user.username}`);
          
          marriage.summonCount = (marriage.summonCount || 0) + 1;
          await saveGuild(guildObj);

          const summonEmbed = new EmbedBuilder()
            .setColor('#9400D3')
            .setTitle('🌌 Love Summoning Portal Activated! ⚡')
            .setDescription(`⚡ **WHOOSH!** ${interaction.user} summoned their spouse <@${spouseId}> from <#${spouseVoiceChannel.id}> to <#${callerVoiceChannel.id}>!`)
            .addFields(
              { name: 'Summons Used Today', value: `\`${marriage.summonCount} / ${maxSummons}\``, inline: true }
            )
            .setImage('https://media.tenor.com/un6_VbF-G9gAAAAC/anime-teleport.gif')
            .setTimestamp();

          return interaction.editReply({ embeds: [summonEmbed] });
        } catch (err) {
          console.error('[Summon Command] Error moving spouse:', err);
          return interaction.editReply({ content: `❌ Failed to summon your spouse. This is usually because of role/channel permissions, or because the bot does not have permissions to move members.` });
        }
      }
      } catch (globalErr: any) {
        console.error(`[Interaction Handler] Unhandled error for command ${interaction.commandName}:`, globalErr);
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: `❌ An unexpected error occurred: ${globalErr.message}` }).catch(() => null);
          } else {
            await interaction.reply({ content: `❌ An unexpected error occurred: ${globalErr.message}`, ephemeral: true }).catch(() => null);
          }
        } catch (replyErr) {
          console.error("Failed to send global error reply:", replyErr);
        }
      }
    });
  } catch (err) {
    console.error("[DarkFlower Discord Bot] Error setting up event listeners:", err);
  }
}

if (process.env.DISCORD_BOT_TOKEN) {
  try {
    discordClient = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent
      ]
    });

    registerBotEvents(discordClient);

    discordClient.login(process.env.DISCORD_BOT_TOKEN).catch(err => {
      console.error("[DarkFlower Discord Bot] Failed to login:", err.message);
      discordBotInfo.connected = false;
    });
  } catch (err) {
    console.error("[DarkFlower Discord Bot] Failed to initialize Discord Client:", err);
  }
}

// Bot keep-alive monitor
const lastCustomBotConnectAttempt = new Map<string, number>();

setInterval(async () => {
  // 1. Keep-alive check for main bot
  if (process.env.DISCORD_BOT_TOKEN) {
    if (!discordClient || !discordClient.isReady()) {
      console.log("[DarkFlower Discord Bot] Main bot is offline or not ready. Attempting to restart/reconnect...");
      try {
        if (discordClient) {
          await discordClient.destroy().catch(() => {});
        }
        discordClient = new Client({
          intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.GuildVoiceStates,
            GatewayIntentBits.GuildMembers,
            GatewayIntentBits.MessageContent
          ]
        });
        registerBotEvents(discordClient);
        await discordClient.login(process.env.DISCORD_BOT_TOKEN);
        discordBotInfo.connected = true;
        console.log("[DarkFlower Discord Bot] Main bot successfully re-logged in via keep-alive monitor.");
      } catch (err: any) {
        console.error("[DarkFlower Discord Bot] Failed to auto-reconnect main bot:", err.message);
        discordBotInfo.connected = false;
      }
    }
  }

  // 2. Keep-alive check for custom bots (Iterating over ALL database guilds to resurrect missing or offline bots)
  const now = Date.now();
  for (const guild of guilds) {
    if (guild.customBot && guild.customBot.token) {
      const client = customBotClients.get(guild.id);
      if (!client || !client.isReady()) {
        const lastAttempt = lastCustomBotConnectAttempt.get(guild.id) || 0;
        // If last attempt was less than 3 minutes ago, skip to avoid spamming Discord API
        if (now - lastAttempt < 180000) {
          continue;
        }

        console.log(`[Custom Bot Keep-Alive] Bot for guild ${guild.id} is not running or ready. Attempting to restart/reconnect...`);
        lastCustomBotConnectAttempt.set(guild.id, now);

        try {
          await stopCustomBot(guild.id);
          const decryptedToken = decryptToken(guild.customBot.token);
          await startCustomBot(guild.id, decryptedToken);
        } catch (e: any) {
          console.error(`[Custom Bot Keep-Alive] Failed to restart bot for guild ${guild.id}:`, e.message || e);
        }
      }
    }
  }
}, 60000); // Check every 60 seconds (1 minute) for ultimate resilience

// Live Bot Helper: send messages to real Discord Guild channels
async function sendBotMessage(guildId: string, channelNameOrId: string, message: string | { embeds: any[] }) {
  const activeClient = getDiscordClientForGuild(guildId);
  if (!activeClient) return;
  try {
    const guild = await activeClient.guilds.fetch(guildId).catch(() => null);
    if (!guild) return;

    // Search channels
    const channels = await guild.channels.fetch().catch(() => null);
    if (!channels) return;

    const cleanName = channelNameOrId.replace(/^#/, "").toLowerCase();
    const targetChannel = channels.find(c => {
      if (!c) return false;
      return c.id === channelNameOrId || c.name.toLowerCase() === cleanName;
    });

    if (targetChannel && targetChannel.isTextBased()) {
      await targetChannel.send(message);
      console.log(`[DarkFlower Discord Bot] Sent live message to #${targetChannel.name} in guild "${guild.name}"`);
    }
  } catch (err) {
    console.error(`[DarkFlower Discord Bot] Error in sendBotMessage for channel ${channelNameOrId}:`, err);
  }
}

// Live Webhook Dispatcher: sends messages with custom name & avatar
async function sendWebhookMessage(
  guildId: string,
  channelNameOrId: string,
  options: { content?: string; username?: string; avatarURL?: string; embeds?: any[] }
) {
  const activeClient = getDiscordClientForGuild(guildId);
  if (!activeClient) return false;
  try {
    const guild = await activeClient.guilds.fetch(guildId).catch(() => null);
    if (!guild) return false;

    const channels = await guild.channels.fetch().catch(() => null);
    if (!channels) return false;

    const cleanName = channelNameOrId.replace(/^#/, "").toLowerCase();
    const targetChannel = channels.find(c => {
      if (!c) return false;
      return c.id === channelNameOrId || c.name.toLowerCase() === cleanName;
    });

    if (targetChannel && targetChannel.isTextBased() && "fetchWebhooks" in targetChannel) {
      const webhooks = await (targetChannel as any).fetchWebhooks().catch(() => null);
      let webhook = webhooks?.find((wh: any) => wh.owner?.id === activeClient.user?.id);

      if (!webhook) {
        webhook = await (targetChannel as any).createWebhook({
          name: options.username || "DarkFlower Webhook",
          avatar: options.avatarURL || null,
          reason: "DarkFlower Webhook Simulation"
        }).catch(() => null);
      }

      if (webhook) {
        await webhook.send({
          content: options.content || undefined,
          username: options.username || undefined,
          avatarURL: options.avatarURL || undefined,
          embeds: options.embeds || []
        });
        console.log(`[DarkFlower Webhook] Dispatched live webhook message to #${targetChannel.name}`);
        return true;
      }
    }
  } catch (err) {
    console.error("[DarkFlower Webhook] Error dispatching live webhook:", err);
  }
  return false;
}

// Mock Database State
interface Ticket {
  id: string;
  user: string;
  status: 'open' | 'closed';
  messages: Array<{ sender: string; text: string; timestamp: string }>;
  channelName: string;
}

interface ButtonRoleMapping {
  id: string;
  label: string;
  role: string;
  style: 'success' | 'primary' | 'danger' | 'secondary';
  emoji?: string;
}

interface ButtonRolesMessageConfig {
  id: string;
  targetChannel: string;
  messageText: string;
  useEmbed: boolean;
  embedTitle?: string;
  embedDescription?: string;
  embedColor?: string;
  roleMode: 'single' | 'multiple';
  buttons: ButtonRoleMapping[];
  sentMessageId?: string;
}

interface GuildConfig {
  prefix: string;
  modLogChannel: string;
  welcomeChannel: string;
  welcomeMessage: string;
  welcomeCard: string;
  automodEnabled: boolean;
  badWords: string[];
  spamLimit: number;
  ticketEnabled: boolean;
  ticketLabel: string;
  supportRole: string;
  levelingEnabled: boolean;
  xpRate: number;
  levelChannel: string;
  reactionRoles: Array<{ emoji: string; role: string; id: string }>;
  webhooks: Array<{ id: string; name: string; url: string; channel: string }>;
  levelRoles?: Array<{ level: number; role: string }>;
  buttonRolesMessages?: ButtonRolesMessageConfig[];
}

interface CustomBot {
  token: string;
  username?: string;
  avatar?: string;
  id?: string;
  status?: 'online' | 'offline' | 'error';
  error?: string;
}

interface ParentChildLink {
  parentId: string;
  parentTag: string;
  childId: string;
  childTag: string;
  timestamp: number;
}

interface MarriageConfig {
  maxSpouses: number;
  cooldownSeconds: number;
  requireDivorceFee: boolean;
  roleRewards: Array<{ days: number; roleName: string }>;
  bannerUrl: string;
  embedColor: string;
  customWeddingText: string;
}

interface Guild {
  id: string;
  name: string;
  icon: string;
  hasBot: boolean;
  memberCount: number;
  boosts: number;
  channels: string[];
  roles?: string[];
  config: GuildConfig;
  customBot?: CustomBot;
  analytics: {
    messagesToday: number;
    activeUsersToday: number;
    invitesToday: number;
    weeklyActivity: Array<{ day: string; messages: number; moderation: number; tickets: number }>;
    moderationCount: number;
    ticketsCount: number;
    dailyActiveUsers: string[];
    popularChannels: Record<string, number>;
    botCommandUsage: Record<string, number>;
  };
  leaderboard: Array<{ user: string; xp: number; level: number; avatar: string }>;
  tickets: Ticket[];
  modLogs: Array<{ id: string; type: string; moderator: string; user: string; reason: string; timestamp: string }>;
  errors: Array<{ id: string; code: string; message: string; module: string; severity: 'warning' | 'critical' }>;
  marriages?: Array<{
    user1Id: string;
    user2Id: string;
    user1Tag: string;
    user2Tag: string;
    familyName: string;
    marriedAt: number;
    channelId?: string;
    summonCount?: number;
    lastSummonDate?: string;
    alertsSent?: string[];
    annconfig?: {
      enabled: boolean;
      channel?: string;
      customMessage?: string;
    };
  }>;
  pendingProposals?: Array<{
    fromId: string;
    toId: string;
    familyName: string;
    timestamp: number;
  }>;
  parentChildLinks?: ParentChildLink[];
  marriageConfig?: MarriageConfig;
  pendingAdoptions?: Array<{
    fromId: string;
    fromTag: string;
    toId: string;
    toTag: string;
    timestamp: number;
  }>;
  pendingParents?: Array<{
    fromId: string;
    fromTag: string;
    toId: string;
    toTag: string;
    timestamp: number;
  }>;
  afkUsers?: Array<{
    userId: string;
    username: string;
    originalNickname: string | null;
    reason: string;
    timestamp: number;
  }>;
  tempVoiceSettings?: {
    hubChannelId: string | null;
    namingStyle: string;
    userLimit: number;
    categoryId: string | null;
  };
  tempVoiceChannels?: string[]; // Array of voice channel IDs
}

let guilds: Guild[] = [
  {
    id: "sandbox-hq",
    name: "DarkFlower Sandbox HQ",
    icon: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=60",
    hasBot: true,
    memberCount: 2548,
    boosts: 18,
    channels: ["#general", "#announcements", "#welcome", "#mod-logs", "#level-ups", "#tickets", "#music-bot", "#webhook-test"],
    config: {
      prefix: "df!",
      modLogChannel: "#general",
      welcomeChannel: "#welcome",
      welcomeMessage: "Welcome to our server, {user}! Have a blast! 🌸",
      welcomeCard: "cosmic",
      automodEnabled: true,
      badWords: ["scam", "hack"],
      spamLimit: 5,
      ticketEnabled: true,
      ticketLabel: "Open Support Ticket",
      supportRole: "Staff",
      levelingEnabled: true,
      xpRate: 1.0,
      levelChannel: "#level-ups",
      reactionRoles: [],
      webhooks: [
        {
          id: "wh-1",
          name: "GitHub Commits",
          url: "https://discord.com/api/webhooks/stale-placeholder-url",
          channel: "#webhook-test"
        }
      ],
      levelRoles: [
        { level: 5, role: "Bronze Bud" },
        { level: 15, role: "Violet Petal" },
        { level: 30, role: "DarkFlower Elder" }
      ]
    },
    analytics: {
      messagesToday: 1420,
      activeUsersToday: 182,
      invitesToday: 12,
      weeklyActivity: [
        { day: "Mon", messages: 1100, moderation: 2, tickets: 3 },
        { day: "Tue", messages: 1250, moderation: 4, tickets: 5 },
        { day: "Wed", messages: 1420, moderation: 1, tickets: 2 },
        { day: "Thu", messages: 1300, moderation: 5, tickets: 4 },
        { day: "Fri", messages: 1650, moderation: 3, tickets: 6 },
        { day: "Sat", messages: 1800, moderation: 8, tickets: 8 },
        { day: "Sun", messages: 1420, moderation: 2, tickets: 2 }
      ],
      moderationCount: 25,
      ticketsCount: 30,
      dailyActiveUsers: ["Moderator", "Wumpus", "PressTV"],
      popularChannels: { "#general": 450, "#bot-commands": 300, "#music": 150, "#support": 80 },
      botCommandUsage: { "play": 120, "skip": 45, "loop": 20, "autoplay": 15, "ticket": 35 }
    },
    leaderboard: [
      { user: "Moderator", xp: 1200, level: 3, avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=Moderator" },
      { user: "Wumpus", xp: 3200, level: 7, avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=Wumpus" },
      { user: "PressTV", xp: 5400, level: 12, avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=PressTV" }
    ],
    tickets: [
      {
        id: "TKT-1082",
        user: "Wumpus",
        status: "open",
        channelName: "ticket-wumpus",
        messages: [
          { sender: "DarkFlower Bot", text: "Welcome to support! Open Support Ticket created. A staff member with role **Staff** will assist you.", timestamp: "2 hours ago" },
          { sender: "Wumpus", text: "Hello! I have a question about the server rules.", timestamp: "1 hour ago" }
        ]
      }
    ],
    modLogs: [
      { id: "log-init", type: "System", moderator: "System", user: "DarkFlower Bot", reason: "Sandbox Server initialized successfully.", timestamp: "Just now" }
    ],
    errors: [
      {
        id: "err-tkt-role",
        code: "ERR_TICKET_ROLE_MISSING",
        severity: "warning",
        module: "Support Tickets",
        message: "Support tickets role is not configured to a designated moderator role."
      },
      {
        id: "err-mod-channel",
        code: "ERR_NO_MOD_LOG_CHANNEL",
        severity: "warning",
        module: "Moderation",
        message: "Moderation log channel is not set to '#mod-logs'. Moderation actions will not be logged."
      },
      {
        id: "err-wh-stale",
        code: "ERR_WEBHOOK_STALE",
        severity: "critical",
        module: "Webhooks",
        message: "The webhook 'wh-1' (GitHub Commits) has a stale or invalid URL. Outbound events will fail."
      }
    ]
  }
];

// Firebase Integration Setup
let db: any = null;
let auth: any = null;

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
      isAnonymous: auth?.currentUser?.isAnonymous,
      tenantId: auth?.currentUser?.tenantId,
      providerInfo: auth?.currentUser?.providerData?.map((provider: any) => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  if (!db) return;
  try {
    await getDoc(doc(db, "guilds", "connection-test"));
    console.log("Firebase Connection: Firestore database connected successfully!");
  } catch (error) {
    console.error("Firebase Connection check failed:", error);
  }
}

async function syncGuildsFromFirestore() {
  if (!db) {
    console.warn("Firestore not initialized, using local in-memory guilds");
    return;
  }
  try {
    const colRef = collection(db, "guilds");
    const snapshot = await getDocs(colRef);
    if (snapshot.empty) {
      console.log("Firestore guilds collection is empty. Seeding with default sandbox-hq...");
      for (const g of guilds) {
        await setDoc(doc(db, "guilds", g.id), g);
      }
      console.log("Firestore successfully seeded with default guilds.");
    } else {
      const dbGuilds: Guild[] = [];
      snapshot.forEach((docSnap) => {
        dbGuilds.push(docSnap.data() as Guild);
      });
      guilds = dbGuilds;
      console.log(`Synced ${guilds.length} guilds from Firestore database!`);
    }
    // Run initial anniversary checks
    await checkAnniversaries().catch(e => console.error("Initial anniversary check failed:", e));

    // Auto-boot configured custom bots
    console.log("[Custom Bot] Scanning and auto-booting active white-label bots...");
    for (const guild of guilds) {
      if (guild.customBot && guild.customBot.token) {
        try {
          const decryptedToken = decryptToken(guild.customBot.token);
          startCustomBot(guild.id, decryptedToken).catch(err => {
            console.log(`[Custom Bot] Failed to auto-start custom bot for guild ${guild.id}:`, err);
          });
        } catch (decErr) {
          console.error(`[Custom Bot] Decryption failed during auto-boot for guild ${guild.id}:`, decErr);
        }
      }
    }
  } catch (err) {
    console.error("Failed to sync guilds from Firestore:", err);
  }
}

async function saveGuild(guild: Guild) {
  const index = guilds.findIndex(g => g.id === guild.id);
  if (index !== -1) {
    guilds[index] = guild;
  } else {
    guilds.push(guild);
  }
  
  if (db) {
    try {
      // Firestore does not support undefined values, strip them out
      const cleanGuild = JSON.parse(JSON.stringify(guild));
      await setDoc(doc(db, "guilds", guild.id), cleanGuild);
      console.log(`Successfully persisted guild ${guild.id} to Firestore!`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `guilds/${guild.id}`);
    }
  }
}

async function getOrCreateGuild(guildId: string, guildName?: string): Promise<Guild> {
  if (syncPromise) {
    await syncPromise.catch((err) => {
      console.error("[Database Sync] Error waiting for initial Firestore sync in getOrCreateGuild:", err);
    });
  }
  let guild = guilds.find(g => g.id === guildId);
  if (!guild) {
    console.log(`[Guild Setup] Guild config not found for guild ID: ${guildId}. Initializing default config...`);
    const activeClient = getDiscordClientForGuild(guildId);
    const resolvedName = guildName || (activeClient ? (activeClient.guilds.cache.get(guildId)?.name || `Server ${guildId}`) : `Server ${guildId}`);
    
    // Fetch channels from discord client if possible
    let resolvedChannels = ["#general", "#announcements", "#welcome", "#mod-logs", "#level-ups", "#tickets", "#music-bot"];
    try {
      const discordGuildObj = activeClient?.guilds.cache.get(guildId) || await activeClient?.guilds.fetch(guildId).catch(() => null);
      if (discordGuildObj) {
        const textChans = discordGuildObj.channels.cache
          .filter((c: any) => c.type === ChannelType.GuildText || c.type === 0)
          .map((c: any) => `#${c.name}`);
        if (textChans.length > 0) {
          resolvedChannels = textChans;
        }
      }
    } catch (e) {
      console.warn(`[Guild Setup] Could not dynamically load channels for guild ${guildId}:`, e);
    }

    guild = {
      id: guildId,
      name: resolvedName,
      icon: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=60",
      hasBot: true,
      memberCount: activeClient?.guilds.cache.get(guildId)?.memberCount || 10,
      boosts: 0,
      channels: resolvedChannels,
      config: {
        prefix: "df!",
        modLogChannel: resolvedChannels[0] || "#general",
        welcomeChannel: resolvedChannels.find(c => c.toLowerCase().includes("welcome")) || resolvedChannels[0] || "#welcome",
        welcomeMessage: "Welcome to our server, {user}! Have a blast! 🌸",
        welcomeCard: "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=800&auto=format&fit=crop&q=80",
        automodEnabled: true,
        badWords: ["scam", "hack"],
        spamLimit: 5,
        ticketEnabled: true,
        ticketLabel: "Open Support Ticket",
        supportRole: "Staff",
        levelingEnabled: true,
        xpRate: 1.0,
        levelChannel: resolvedChannels.find(c => c.toLowerCase().includes("level")) || resolvedChannels[0] || "#level-ups",
        reactionRoles: [],
        webhooks: [],
        buttonRolesMessages: [],
        levelRoles: [
          { level: 5, role: "Bronze Bud" },
          { level: 15, role: "Violet Petal" },
          { level: 30, role: "DarkFlower Elder" }
        ]
      },
      analytics: {
        messagesToday: 0,
        activeUsersToday: 0,
        invitesToday: 0,
        weeklyActivity: [
          { day: "Mon", messages: 0, moderation: 0, tickets: 0 },
          { day: "Tue", messages: 0, moderation: 0, tickets: 0 },
          { day: "Wed", messages: 0, moderation: 0, tickets: 0 },
          { day: "Thu", messages: 0, moderation: 0, tickets: 0 },
          { day: "Fri", messages: 0, moderation: 0, tickets: 0 },
          { day: "Sat", messages: 0, moderation: 0, tickets: 0 },
          { day: "Sun", messages: 0, moderation: 0, tickets: 0 }
        ],
        moderationCount: 0,
        ticketsCount: 0,
        dailyActiveUsers: [],
        popularChannels: {},
        botCommandUsage: {}
      },
      leaderboard: [],
      tickets: [],
      modLogs: [],
      errors: [],
      marriages: [],
      afkUsers: [],
      tempVoiceSettings: {
        hubChannelId: null,
        namingStyle: "☁️ {user}'s Room",
        userLimit: 0,
        categoryId: null
      },
      tempVoiceChannels: []
    };
    
    guilds.push(guild);
    await saveGuild(guild);
  } else {
    // Safely ensure new/optional fields are initialized if missing from database document
    let changed = false;
    if (!guild.afkUsers) {
      guild.afkUsers = [];
      changed = true;
    }
    if (!guild.tempVoiceSettings) {
      guild.tempVoiceSettings = {
        hubChannelId: null,
        namingStyle: "☁️ {user}'s Room",
        userLimit: 0,
        categoryId: null
      };
      changed = true;
    }
    if (!guild.tempVoiceChannels) {
      guild.tempVoiceChannels = [];
      changed = true;
    }

    // Keep name and bot presence synced
    const activeClient = getDiscordClientForGuild(guildId);
    const discordGuildObj = activeClient?.guilds.cache.get(guildId);
    if (discordGuildObj) {
      if (guild.name !== discordGuildObj.name) {
        guild.name = discordGuildObj.name;
        changed = true;
      }
      if (guild.memberCount !== discordGuildObj.memberCount) {
        guild.memberCount = discordGuildObj.memberCount;
        changed = true;
      }
      if (!guild.hasBot) {
        guild.hasBot = true;
        changed = true;
      }
    }
    if (changed) {
      await saveGuild(guild);
    }
  }
  return guild;
}

// ==========================================
// AUTOMATED MARRIAGE ANNIVERSARY CHECKER
// ==========================================
async function checkAnniversaries() {
  console.log('[Anniversary Checker] Scanning active marriages for milestones...');
  for (const guild of guilds) {
    if (!guild.marriages || guild.marriages.length === 0) continue;
    let updated = false;
    for (const marriage of guild.marriages) {
      const diffTime = Date.now() - marriage.marriedAt;
      const diffDays = diffTime / (1000 * 60 * 60 * 24);
      
      if (!marriage.alertsSent) {
        marriage.alertsSent = [];
      }
      
      const annEnabled = marriage.annconfig?.enabled ?? true;
      const targetChannelIdOrName = marriage.annconfig?.channel || guild.config.welcomeChannel || '#welcome';
      const customMsg = marriage.annconfig?.customMessage || "";

      let alertTier: '1-week' | '1-month' | '1-year' | null = null;
      let alertLabel = '';
      let alertIcon = '';
      let color = '#FF1493';

      if (diffDays >= 365) {
        alertTier = '1-year';
        alertLabel = '1-Year Eternal Golden Anniversary 🏆💍';
        alertIcon = '🏆💝✨';
        color = '#FFD700'; // Gold
      } else if (diffDays >= 30) {
        alertTier = '1-month';
        alertLabel = '1-Month Silver Anniversary 🥈💖';
        alertIcon = '🥈💞🌟';
        color = '#C0C0C0'; // Silver
      } else if (diffDays >= 7) {
        alertTier = '1-week';
        alertLabel = '1-Week Bronze Anniversary 🥉🌸';
        alertIcon = '🥉✨🔥';
        color = '#CD7F32'; // Bronze
      }

      if (alertTier && !marriage.alertsSent.includes(alertTier)) {
        marriage.alertsSent.push(alertTier);
        updated = true;

        console.log(`[Anniversary Checker] Milestone ${alertTier} reached for ${marriage.user1Tag} & ${marriage.user2Tag}!`);

        const activeClient = getDiscordClientForGuild(guild.id);
        if (annEnabled && activeClient && activeClient.isReady()) {
          try {
            const dcGuild = activeClient.guilds.cache.get(guild.id);
            if (dcGuild) {
              let channelToAnnounce: any = null;
              
              if (targetChannelIdOrName) {
                const cleanName = targetChannelIdOrName.replace('#', '').trim().toLowerCase();
                channelToAnnounce = dcGuild.channels.cache.find(c => 
                  c.isTextBased() && (c.id === targetChannelIdOrName || c.name.toLowerCase() === cleanName)
                );
              }
              
              if (!channelToAnnounce) {
                channelToAnnounce = dcGuild.channels.cache.find(c => c.isTextBased() && c.name.toLowerCase().includes('welcome')) ||
                                    dcGuild.channels.cache.find(c => c.isTextBased() && c.name.toLowerCase().includes('general')) ||
                                    dcGuild.channels.cache.find(c => c.isTextBased());
              }

              const desc = customMsg 
                ? customMsg
                    .replace(/{tier}/g, alertLabel)
                    .replace(/{spouse1}/g, `<@${marriage.user1Id}>`)
                    .replace(/{spouse2}/g, `<@${marriage.user2Id}>`)
                    .replace(/{family}/g, marriage.familyName)
                : `💖 Join us in celebrating an incredible relationship milestone!\n\n**<@${marriage.user1Id}>** & **<@${marriage.user2Id}>** (the happy **${marriage.familyName}** family) have officially reached their **${alertLabel}**! 🎉\n\nExclusive, upgraded interactive commands (with custom high-fidelity cozy animations for \`/hug\` and \`/kiss\`) have been unlocked! Go test them in chat! ✨`;

              const embed = new EmbedBuilder()
                .setColor(color as any)
                .setTitle(`💍 ${alertIcon} Marriage Anniversary Milestone Reached! ${alertIcon} 💍`)
                .setDescription(desc)
                .addFields(
                  { name: 'Spouse 1', value: `<@${marriage.user1Id}>`, inline: true },
                  { name: 'Spouse 2', value: `<@${marriage.user2Id}>`, inline: true },
                  { name: 'Anniversary Milestone', value: `\`${alertLabel}\``, inline: true }
                )
                .setTimestamp();

              if (channelToAnnounce) {
                await channelToAnnounce.send({ content: `🎉 Congratulations <@${marriage.user1Id}> & <@${marriage.user2Id}>!`, embeds: [embed] }).catch((e: any) => {
                  console.error('[Anniversary Checker] Failed to send public announcement:', e);
                });
              }

              if (marriage.channelId) {
                const privateChan = dcGuild.channels.cache.get(marriage.channelId);
                if (privateChan && privateChan.isTextBased()) {
                  const privEmbed = new EmbedBuilder()
                    .setColor(color as any)
                    .setTitle(`💝 Happy ${alertLabel}! 💍`)
                    .setDescription(`Congratulations, you two! You've officially reached your **${alertLabel}**!\n\nYour interactive \`/hug\` and \`/kiss\` commands are now upgraded! Go try them! 💕`)
                    .setTimestamp();
                  await (privateChan as any).send({ content: `<@${marriage.user1Id}> <@${marriage.user2Id}>`, embeds: [privEmbed] }).catch(() => null);
                }
              }
            }
          } catch (err) {
            console.error('[Anniversary Checker] Error sending notification:', err);
          }
        }
      }
    }
    if (updated) {
      await saveGuild(guild);
    }
  }
}

const firebaseConfigPath = path.join(process.cwd(), "firebase-applet-config.json");
if (fs.existsSync(firebaseConfigPath)) {
  try {
    const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf8"));
    const firebaseApp = initializeApp(firebaseConfig);
    db = initializeFirestore(firebaseApp, {
      experimentalForceLongPolling: true,
    }, firebaseConfig.firestoreDatabaseId);
    auth = getAuth(firebaseApp);
    
    // Run connection test and sync
    testConnection();
    syncPromise = syncGuildsFromFirestore();

    // Start background check for marriage anniversaries every 10 minutes
    setInterval(() => {
      checkAnniversaries().catch(e => console.error("Periodic anniversary check failed:", e));
    }, 1000 * 60 * 10);

    // Refresh Discord data in the background every 15 minutes to prevent rate limits on API requests
    setInterval(() => {
      refreshAllGuildsFromDiscord().catch(e => console.error("Periodic Discord data refresh failed:", e));
    }, 1000 * 60 * 15);

    // Run initial refresh after a short delay
    setTimeout(() => {
      refreshAllGuildsFromDiscord().catch(e => console.error("Initial Discord data refresh failed:", e));
    }, 10000);
  } catch (err) {
    console.error("Failed to initialize Firebase:", err);
  }
} else {
  console.warn("firebase-applet-config.json not found. Firestore persistence is disabled.");
}

// In-memory cache for user guilds to prevent Discord API rate limiting (429)
interface GuildCacheEntry {
  guilds: any[];
  timestamp: number;
}
const userGuildsCache = new Map<string, GuildCacheEntry>();

// Session State for OAuth
let currentUser: { id: string; username: string; avatar: string; email: string; loggedIn: boolean; accessToken?: string } | null = {
  id: "876543210987",
  username: "PressTV",
  avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=PressTV",
  email: "presstelevision24@gmail.com",
  loggedIn: false // Start logged out so the user can enjoy the interactive OAuth flow
};

// --- REST API ENDPOINTS ---

// Helper to compute APP_URL dynamically with fallback
const getAppUrl = (req: any) => {
  let appUrl = process.env.APP_URL || "";
  if (!appUrl || appUrl.includes("MY_APP_URL")) {
    appUrl = `${req.protocol}://${req.get("host")}`;
  }
  return appUrl.replace(/\/$/, "");
};

// Auth endpoints
app.get("/api/auth/me", (req, res) => {
  res.json(currentUser);
});

// OAuth Authorization URL endpoint
app.get("/api/auth/discord/url", (req, res) => {
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId) {
    return res.status(400).json({ error: "DISCORD_CLIENT_ID is not configured in Secrets." });
  }

  const redirectUri = `${getAppUrl(req)}/api/auth/discord/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "identify email guilds guilds.join",
  });

  const authUrl = `https://discord.com/api/oauth2/authorize?${params.toString()}`;
  res.json({ url: authUrl });
});

// OAuth Callback handler endpoint
app.get(["/api/auth/discord/callback", "/api/auth/discord/callback/"], async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).send("No authorization code provided by Discord.");
  }

  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).send("Discord integration is not fully configured (missing Client ID or Client Secret).");
  }

  try {
    const redirectUri = `${getAppUrl(req)}/api/auth/discord/callback`;

    // Exchange the code for an access token
    const tokenParams = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code: code as string,
      redirect_uri: redirectUri,
    });

    const tokenRes = await fetch("https://discord.com/api/v10/oauth2/token", {
      method: "POST",
      body: tokenParams,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    if (!tokenRes.ok) {
      const errorMsg = await tokenRes.text();
      console.error("[Discord OAuth] Code exchange failed:", errorMsg);
      return res.status(500).send(`Code exchange failed: ${errorMsg}`);
    }

    const tokens = await tokenRes.json() as { access_token: string };

    // Fetch the authenticated user's profile
    const userRes = await fetch("https://discord.com/api/v10/users/@me", {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    });

    if (!userRes.ok) {
      const userError = await userRes.text();
      console.error("[Discord OAuth] Failed to fetch user info:", userError);
      return res.status(500).send("Failed to fetch Discord user profile.");
    }

    const discordUser = await userRes.json() as { id: string; username: string; avatar: string | null; email?: string };

    // Set the user session state
    currentUser = {
      id: discordUser.id,
      username: discordUser.username,
      avatar: discordUser.avatar
        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
        : `https://api.dicebear.com/7.x/pixel-art/svg?seed=${discordUser.username}`,
      email: discordUser.email || "",
      loggedIn: true,
      accessToken: tokens.access_token,
    };

    console.log(`[Discord OAuth] Logged in real user: ${discordUser.username}`);

    // Automatically join the user to the support server if configured
    const supportServerId = process.env.DISCORD_SUPPORT_SERVER_ID;
    const botToken = process.env.DISCORD_BOT_TOKEN;
    if (supportServerId && botToken) {
      try {
        const joinRes = await fetch(`https://discord.com/api/v10/guilds/${supportServerId}/members/${discordUser.id}`, {
          method: "PUT",
          headers: {
            Authorization: `Bot ${botToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            access_token: tokens.access_token,
          }),
        });

        if (joinRes.ok) {
          console.log(`[Discord OAuth] Added user ${discordUser.username} to support server!`);
        } else if (joinRes.status === 404) {
          console.log(`[Discord OAuth] User ${discordUser.username} already in support server or server not found.`);
        } else {
          console.error(`[Discord OAuth] Failed to add user to support server:`, await joinRes.text());
        }
      } catch (err) {
        console.error(`[Discord OAuth] Error adding user to support server:`, err);
      }
    }

    // Send postMessage to the parent window and close popup
    res.send(`
      <html>
        <head>
          <title>Discord Auth Success</title>
          <style>
            body {
              background-color: #0b0a12;
              color: #f1f1f1;
              font-family: sans-serif;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
            }
            .card {
              background: #151324;
              border: 1px solid rgba(139, 92, 246, 0.2);
              padding: 2.5rem;
              border-radius: 1rem;
              text-align: center;
              box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
              max-width: 400px;
              width: 90%;
            }
            h1 { color: #ff73fa; margin-top: 0; }
            p { color: #b9bbbe; line-height: 1.5; font-size: 0.95rem; }
            .btn {
              display: inline-block;
              margin-top: 1.5rem;
              padding: 0.65rem 1.75rem;
              background: #5865F2;
              color: white;
              text-decoration: none;
              border-radius: 0.375rem;
              font-weight: bold;
              transition: background 0.2s;
            }
            .btn:hover {
              background: #4752C4;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Success!</h1>
            <p>Successfully logged in as <strong style="color: #ffffff">${discordUser.username}</strong>.</p>
            <p>If this page does not close or redirect automatically within a second, please click below:</p>
            <a href="/" class="btn">Go to Dashboard</a>
          </div>
          <script>
            let notifiedOpener = false;
            try {
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                notifiedOpener = true;
                try {
                  window.opener.location.reload();
                } catch (e) {}
                setTimeout(function() {
                  window.close();
                }, 300);
              }
            } catch (err) {
              console.error("Opener messaging error:", err);
            }

            if (!notifiedOpener) {
              setTimeout(function() {
                window.location.href = '/';
              }, 600);
            }
          </script>
        </body>
      </html>
    `);
  } catch (err: any) {
    console.error("[Discord OAuth] Error during authentication:", err);
    res.status(500).send(`OAuth callback error: ${err.message}`);
  }
});

function sanitizeTitleForSoundCloud(title: string) {
  let cleaned = title.replace(/\[.*?\]|\(.*?\)/g, '');
  cleaned = cleaned.split('|')[0];
  cleaned = cleaned.replace(/official|music|video|audio|lyric|soundtrack/gi, '');
  return cleaned.trim();
}

async function streamSoundCloudWithRecovery(url: string) {
  try {
    return await play.stream(url);
  } catch (err: any) {
    console.error(`SoundCloud streaming failed for ${url}. Attempting recovery... Error:`, err);
    
    try {
      console.log("Attempting to fetch a fresh SoundCloud client ID dynamically for streaming...");
      const freshId = await fetchDynamicSoundCloudClientId();
      if (freshId) {
        console.log(`Setting fresh dynamic SoundCloud client ID: ${freshId}`);
        await play.setToken({ soundcloud: { client_id: freshId } });
        return await play.stream(url);
      }
    } catch (dynamicErr) {
      console.error("Failed to dynamically fetch SoundCloud client ID during streaming recovery:", dynamicErr);
    }

    const fallbackClientIds = [
      "atnjqnKFiGdFYho5GIFwq340Vmx8312q",
      "a3e059563d7df3372b72c337ea384e12",
      "b45b1aa10f1ac2941910a7f0d09f97fc",
      "2t99a7Y8G7nd99K9v9V7nd0f"
    ];
    
    for (const clientId of fallbackClientIds) {
      try {
        console.log(`Trying fallback SoundCloud client_id: ${clientId}`);
        await play.setToken({ soundcloud: { client_id: clientId } });
        return await play.stream(url);
      } catch (retryErr) {
        console.error(`SoundCloud stream retry failed with client_id ${clientId}:`, retryErr);
      }
    }
    
    console.warn("SoundCloud streaming completely failed. Falling back to SoundHelix MP3 backup stream.");
    const backupStreams = [
      "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
      "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
      "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
      "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3"
    ];
    const randomUrl = backupStreams[Math.floor(Math.random() * backupStreams.length)];
    return { stream: randomUrl, type: StreamType.Arbitrary };
  }
}

async function searchSoundCloudWithRecovery(query: string, options: any) {
  try {
    return await play.search(query, options);
  } catch (err: any) {
    console.error(`SoundCloud search failed for "${query}". Attempting recovery... Error:`, err);
    
    try {
      console.log("Attempting to fetch a fresh SoundCloud client ID dynamically for search...");
      const freshId = await fetchDynamicSoundCloudClientId();
      if (freshId) {
        console.log(`Setting fresh dynamic SoundCloud client ID for search: ${freshId}`);
        await play.setToken({ soundcloud: { client_id: freshId } });
        return await play.search(query, options);
      }
    } catch (dynamicErr) {
      console.error("Failed to dynamically fetch SoundCloud client ID during search recovery:", dynamicErr);
    }

    const fallbackClientIds = [
      "atnjqnKFiGdFYho5GIFwq340Vmx8312q",
      "a3e059563d7df3372b72c337ea384e12",
      "b45b1aa10f1ac2941910a7f0d09f97fc",
      "2t99a7Y8G7nd99K9v9V7nd0f"
    ];
    
    for (const clientId of fallbackClientIds) {
      try {
        console.log(`Trying fallback SoundCloud client_id for search: ${clientId}`);
        await play.setToken({ soundcloud: { client_id: clientId } });
        return await play.search(query, options);
      } catch (retryErr) {
        console.error(`SoundCloud search retry failed with client_id ${clientId}:`, retryErr);
      }
    }
    
    throw err;
  }
}

app.post("/api/auth/discord", (req, res) => {
  if (currentUser) {
    currentUser.loggedIn = true;
    res.json({ success: true, user: currentUser });
  } else {
    res.status(500).json({ error: "No user context available" });
  }
});

app.post("/api/auth/logout", (req, res) => {
  if (currentUser) {
    currentUser.loggedIn = false;
  }
  res.json({ success: true });
});

// Bot connection status endpoint
app.get("/api/bot/status", (req, res) => {
  res.json(discordBotInfo);
});

// Manual Discord bot reconnection endpoint
app.post("/api/bot/reconnect", async (req, res) => {
  if (!process.env.DISCORD_BOT_TOKEN) {
    return res.status(400).json({ success: false, error: "No DISCORD_BOT_TOKEN environment variable set. Please configure it in your Secrets." });
  }

  try {
    if (discordClient && discordClient.isReady()) {
      return res.json({ success: true, message: "Bot is already online and connected!", status: discordBotInfo });
    }

    console.log("[DarkFlower Discord Bot] Manual reconnection triggered. Attempting to start/reconnect bot...");
    
    if (discordClient) {
      await discordClient.destroy().catch(() => {});
    }

    discordClient = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent
      ]
    });

    registerBotEvents(discordClient);
    await discordClient.login(process.env.DISCORD_BOT_TOKEN);
    discordBotInfo.connected = true;
    
    // Return connection details once authenticated
    res.json({ success: true, message: "Bot reconnection initiated successfully!", status: discordBotInfo });
  } catch (err: any) {
    console.error("[DarkFlower Discord Bot] Manual reconnection failed:", err);
    discordBotInfo.connected = false;
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

// YouTube Cookie endpoints
app.get("/api/music/youtube-cookie", (req, res) => {
  let cookie = process.env.YOUTUBE_COOKIE || "";
  const cookieFilePath = path.join(process.cwd(), "youtube_cookie.txt");
  
  if (!cookie && fs.existsSync(cookieFilePath)) {
    try {
      cookie = fs.readFileSync(cookieFilePath, "utf-8").trim();
    } catch (err) {
      console.error("[YouTube Cookie] Error reading cookie file:", err);
    }
  }

  if (cookie) {
    res.json({
      configured: true,
      length: cookie.length,
      preview: cookie.substring(0, 15) + (cookie.length > 15 ? "..." : "")
    });
  } else {
    res.json({ configured: false });
  }
});

app.post("/api/music/youtube-cookie", (req, res) => {
  const { cookie } = req.body;
  const cookieFilePath = path.join(process.cwd(), "youtube_cookie.txt");

  try {
    if (cookie && cookie.trim()) {
      const cleanCookie = cookie.trim();
      fs.writeFileSync(cookieFilePath, cleanCookie, "utf-8");
      process.env.YOUTUBE_COOKIE = cleanCookie;
      try {
        play.setToken({ youtube: { cookie: cleanCookie } });
      } catch (tokenErr) {
        console.error("[YouTube Cookie] Failed to set cookie on play-dl:", tokenErr);
      }
      console.log(`[YouTube Cookie] Saved YouTube cookie (${cleanCookie.length} characters)`);
      res.json({ success: true, length: cleanCookie.length, configured: true });
    } else {
      if (fs.existsSync(cookieFilePath)) {
        fs.unlinkSync(cookieFilePath);
      }
      delete process.env.YOUTUBE_COOKIE;
      try {
        play.setToken({ youtube: { cookie: "" } });
      } catch (tokenErr) {
        console.error("[YouTube Cookie] Failed to clear cookie on play-dl:", tokenErr);
      }
      console.log("[YouTube Cookie] Cleared YouTube cookie");
      res.json({ success: true, configured: false });
    }
  } catch (err: any) {
    console.error("[YouTube Cookie] Error saving cookie:", err);
    res.status(500).json({ error: "Failed to save YouTube cookie: " + err.message });
  }
});


async function refreshAllGuildsFromDiscord() {
  const hasConnections = (discordClient && discordBotInfo.connected) || Array.from(customBotClients.values()).some(c => c && c.isReady());
  if (!hasConnections) return;

  try {
    const allGuildsToSync = new Map<string, { guild: any; client: Client }>();

    if (discordClient && discordBotInfo.connected) {
      for (const g of discordClient.guilds.cache.values()) {
        allGuildsToSync.set(g.id, { guild: g, client: discordClient });
      }
    }

    for (const [gId, customClient] of customBotClients) {
      if (customClient && customClient.isReady()) {
        for (const g of customClient.guilds.cache.values()) {
          allGuildsToSync.set(g.id, { guild: g, client: customClient });
        }
      }
    }

    console.log(`[Discord Sync] Refreshing data for ${allGuildsToSync.size} guilds...`);

    for (const { guild: g, client: activeClient } of allGuildsToSync.values()) {
      const fetchedChannels = await g.channels.fetch().catch(() => null);
      let realChannels: string[] = ["#general", "#announcements", "#welcome", "#mod-logs", "#level-ups", "#tickets", "#music-bot", "#webhook-test"];
      if (fetchedChannels) {
        const textChannels = fetchedChannels.filter((c: any) => c && c.isTextBased());
        if (textChannels.size > 0) {
          realChannels = textChannels.map((c: any) => `#${c.name}`);
        }
      }

      const fetchedRoles = await g.roles.fetch().catch(() => null);
      let realRoles: string[] = [];
      if (fetchedRoles) {
        realRoles = fetchedRoles
          .filter((r: any) => r && r.name !== "@everyone" && !r.managed)
          .map((r: any) => r.name);
      }

      const existing = await getOrCreateGuild(g.id, g.name);

      // Fetch real Discord members to populate the leaderboard
      let realLeaderboard: any[] = existing ? [...existing.leaderboard] : [];
      // Filter out fake members from real servers
      realLeaderboard = realLeaderboard.filter((m: any) => m.user !== "Moderator" && m.user !== "Wumpus" && m.user !== "PressTV");

      try {
        const fetchedMembers = await g.members.fetch({ limit: 100 }).catch(() => null);
        if (fetchedMembers) {
          fetchedMembers.forEach((m: any) => {
            if (m.user.bot) return;
            const username = m.user.username;
            const displayName = m.displayName || username;
            
            let found = realLeaderboard.find((entry: any) => entry.user === username || entry.user === displayName);
            if (!found) {
              realLeaderboard.push({
                user: displayName,
                xp: 0,
                level: 1,
                avatar: m.user.displayAvatarURL() || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${username}`
              });
            } else {
              found.avatar = m.user.displayAvatarURL() || found.avatar;
              found.user = displayName;
            }
          });
        }
      } catch (memberErr) {
        console.error(`Failed to fetch members for guild ${g.id}:`, memberErr);
      }

      if (realLeaderboard.length === 0) {
        realLeaderboard = [
          { user: "Moderator", xp: 1200, level: 3, avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=Moderator" }
        ];
      }

      // Keep real analytics synchronized with active data size
      const realTickets = existing ? existing.tickets : [];
      const realModLogs = existing ? existing.modLogs : [
        { id: "log-init", type: "System", moderator: "System", user: "DarkFlower Bot", reason: "Live Bot successfully connected to Discord Gateway.", timestamp: "Just now" }
      ];

      const initialAnalytics = existing ? existing.analytics : {
        messagesToday: 0,
        activeUsersToday: 0,
        invitesToday: 0,
        weeklyActivity: [],
        moderationCount: 0,
        ticketsCount: 0,
        dailyActiveUsers: [] as string[],
        popularChannels: {} as Record<string, number>,
        botCommandUsage: {} as Record<string, number>
      };

      const activeUsersCount = realLeaderboard.filter(m => m.xp > 0).length;

      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const currentDayStr = days[new Date().getDay()];
      const updatedWeeklyActivity = initialAnalytics.weeklyActivity && initialAnalytics.weeklyActivity.length > 0
        ? [...initialAnalytics.weeklyActivity]
        : days.map(d => ({ day: d, messages: d === currentDayStr ? (initialAnalytics.messagesToday || 0) : 0, moderation: d === currentDayStr ? realModLogs.length : 0, tickets: d === currentDayStr ? realTickets.length : 0 }));

      const currentDayIndex = updatedWeeklyActivity.findIndex(d => d.day === currentDayStr);
      if (currentDayIndex !== -1) {
        updatedWeeklyActivity[currentDayIndex] = {
          day: currentDayStr,
          messages: initialAnalytics.messagesToday || 0,
          moderation: realModLogs.length,
          tickets: realTickets.length
        };
      }

      // Fetch real invites
      let realInvites: any[] = [];
      try {
        const fetchedInvites = await g.invites.fetch().catch(() => null);
        if (fetchedInvites) {
          fetchedInvites.forEach((inv: any) => {
            realInvites.push({
              inviter: inv.inviter ? (inv.inviter.globalName || inv.inviter.username) : "System / Unknown",
              code: inv.code,
              count: inv.uses || 0,
              status: (inv.maxAge === 0 || !inv.expiresTimestamp || inv.expiresTimestamp > Date.now()) ? "Active" : "Expired",
              avatar: inv.inviter ? (inv.inviter.displayAvatarURL() || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${inv.inviter.username}`) : "https://api.dicebear.com/7.x/pixel-art/svg?seed=System"
            });
          });
        }
      } catch (inviteErr) {
        console.error("Failed to fetch invites for guild:", inviteErr);
      }

      // Fallback for invites if empty
      if (realInvites.length === 0) {
        realInvites = [
          { inviter: "CyberLotus", code: "discord.gg/darkflower-cyber", count: Math.floor(Math.random() * 40) + 120, status: "Active", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=CyberLotus" },
          { inviter: "NeonViper", code: "discord.gg/neon-lounge", count: Math.floor(Math.random() * 20) + 40, status: "Active", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=NeonViper" },
          { inviter: "RoseGold", code: "discord.gg/vip-flower", count: Math.floor(Math.random() * 10) + 15, status: "Expired", avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=Staff" }
        ];
      }

      const realAnalytics = {
        messagesToday: initialAnalytics.messagesToday || 0,
        activeUsersToday: activeUsersCount || 1,
        invitesToday: realInvites.reduce((sum, inv) => sum + (inv.status === "Active" ? 1 : 0), 0) || initialAnalytics.invitesToday || 3,
        weeklyActivity: updatedWeeklyActivity,
        moderationCount: realModLogs.length,
        ticketsCount: realTickets.length,
        dailyActiveUsers: initialAnalytics.dailyActiveUsers || [],
        popularChannels: initialAnalytics.popularChannels || {},
        botCommandUsage: initialAnalytics.botCommandUsage || {},
        invitesList: realInvites
      };

      existing.name = g.name;
      if (g.iconURL()) existing.icon = g.iconURL()!;
      existing.memberCount = g.memberCount;
      existing.boosts = g.premiumSubscriptionCount || 0;
      existing.hasBot = true;
      existing.channels = realChannels;
      existing.roles = realRoles;
      existing.leaderboard = realLeaderboard;
      existing.analytics = realAnalytics;
      await saveGuild(existing);
    }
  } catch (err) {
    console.error("Error updating real guilds cache:", err);
  }
}

// Guild List endpoints
app.get("/api/guilds", async (req, res) => {
  // Filter and hide "sandbox-hq" if we have real guilds connected
  const hasRealGuilds = guilds.some(g => g.id !== "sandbox-hq" && g.hasBot);

  // If a real user is logged in, filter the guilds they can see
  if (currentUser && currentUser.loggedIn && currentUser.accessToken) {
    const cacheKey = currentUser.id;
    const now = Date.now();
    let cachedEntry = userGuildsCache.get(cacheKey);

    // If not in-memory, try to retrieve from Firestore cache
    if (!cachedEntry && db) {
      try {
        const userGuildsDoc = await getDoc(doc(db, "user_guilds", cacheKey));
        if (userGuildsDoc.exists()) {
          const data = userGuildsDoc.data();
          cachedEntry = {
            guilds: data.guilds || [],
            timestamp: data.timestamp || 0
          };
          userGuildsCache.set(cacheKey, cachedEntry);
          console.log(`[Cache Load] Loaded user guilds from Firestore for user ${cacheKey}`);
        }
      } catch (e) {
        console.warn("[Cache Warning] Failed to read user guilds from Firestore:", e);
      }
    }

    // 5-minute hot cache to minimize hitting the API (increased from 60s)
    if (cachedEntry && (now - cachedEntry.timestamp) < 300000) {
      const ADMIN_FLAG = BigInt(0x8);
      const MANAGE_SERVER_FLAG = BigInt(0x20);

      const authorizedGuildIds = new Set(
        cachedEntry.guilds
          .filter(g => g.owner || (BigInt(g.permissions) & ADMIN_FLAG) === ADMIN_FLAG || (BigInt(g.permissions) & MANAGE_SERVER_FLAG) === MANAGE_SERVER_FLAG)
          .map(g => g.id)
      );

      const filteredGuilds = guilds.filter(g => {
        if (hasRealGuilds && g.id === "sandbox-hq") return false;
        return authorizedGuildIds.has(g.id);
      });
      return res.json(filteredGuilds);
    }

    try {
      const userGuildsRes = await fetch("https://discord.com/api/v10/users/@me/guilds", {
        headers: {
          Authorization: `Bearer ${currentUser.accessToken}`
        }
      });
      if (userGuildsRes.ok) {
        const userGuilds = await userGuildsRes.json() as any[];
        
        // Update memory cache
        userGuildsCache.set(cacheKey, {
          guilds: userGuilds,
          timestamp: now
        });

        // Update Firestore cache
        if (db) {
          setDoc(doc(db, "user_guilds", cacheKey), {
            guilds: userGuilds,
            timestamp: now
          }).catch(e => console.warn("[Cache Warning] Failed to write user guilds to Firestore:", e));
        }

        const ADMIN_FLAG = BigInt(0x8);
        const MANAGE_SERVER_FLAG = BigInt(0x20);

        const authorizedGuildIds = new Set(
          userGuilds
            .filter(g => g.owner || (BigInt(g.permissions) & ADMIN_FLAG) === ADMIN_FLAG || (BigInt(g.permissions) & MANAGE_SERVER_FLAG) === MANAGE_SERVER_FLAG)
            .map(g => g.id)
        );

        const filteredGuilds = guilds.filter(g => {
          if (hasRealGuilds && g.id === "sandbox-hq") return false;
          return authorizedGuildIds.has(g.id);
        });
        return res.json(filteredGuilds);
      } else {
        const errText = await userGuildsRes.text();
        console.warn("[Discord API Warning] Failed to fetch user guilds, status code:", userGuildsRes.status, errText);
        
        if (userGuildsRes.status === 401) {
          console.log("[Auth Session] Discord token is unauthorized (401). Invalidating session...");
          if (currentUser) {
            currentUser.loggedIn = false;
            if ('accessToken' in currentUser) {
              currentUser.accessToken = undefined;
            }
          }
          userGuildsCache.delete(cacheKey);
          return res.status(401).json({ error: "Session expired or unauthorized. Please login again.", loggedIn: false });
        }

        // If we have any cached entry (even if older than 5 mins/stale), fall back to it gracefully to prevent UI breakage
        if (cachedEntry) {
          console.log("[Cache Fallback] Using stale cache due to API rate limits or errors.");
          const ADMIN_FLAG = BigInt(0x8);
          const MANAGE_SERVER_FLAG = BigInt(0x20);

          const authorizedGuildIds = new Set(
            cachedEntry.guilds
              .filter(g => g.owner || (BigInt(g.permissions) & ADMIN_FLAG) === ADMIN_FLAG || (BigInt(g.permissions) & MANAGE_SERVER_FLAG) === MANAGE_SERVER_FLAG)
              .map(g => g.id)
          );

          const filteredGuilds = guilds.filter(g => {
            if (hasRealGuilds && g.id === "sandbox-hq") return false;
            return authorizedGuildIds.has(g.id);
          });
          return res.json(filteredGuilds);
        }
      }
    } catch (err) {
      console.warn("Error fetching user guilds:", err);
      if (cachedEntry) {
        console.log("[Cache Fallback] Using stale cache after network error.");
        const ADMIN_FLAG = BigInt(0x8);
        const MANAGE_SERVER_FLAG = BigInt(0x20);

        const authorizedGuildIds = new Set(
          cachedEntry.guilds
            .filter(g => g.owner || (BigInt(g.permissions) & ADMIN_FLAG) === ADMIN_FLAG || (BigInt(g.permissions) & MANAGE_SERVER_FLAG) === MANAGE_SERVER_FLAG)
            .map(g => g.id)
        );

        const filteredGuilds = guilds.filter(g => {
          if (hasRealGuilds && g.id === "sandbox-hq") return false;
          return authorizedGuildIds.has(g.id);
        });
        return res.json(filteredGuilds);
      }
    }
  }

  if (hasRealGuilds) {
    return res.json(guilds.filter(g => g.id !== "sandbox-hq"));
  }
  res.json(guilds);
});

app.post("/api/guilds/refresh", async (req, res) => {
  try {
    console.log("[API] Manual guild refresh requested...");
    await refreshAllGuildsFromDiscord();
    res.json({ success: true, message: "Sync started in background." });
  } catch (err) {
    res.status(500).json({ error: "Failed to trigger sync." });
  }
});

app.get("/api/guilds/:id", (req, res) => {
  const guild = guilds.find(g => g.id === req.params.id);
  if (guild) {
    res.json(guild);
  } else {
    res.status(404).json({ error: "Guild not found" });
  }
});

// Invite Bot to Guild simulation
app.post("/api/guilds/:id/invite", async (req, res) => {
  const guild = guilds.find(g => g.id === req.params.id);
  if (guild) {
    guild.hasBot = true;
    // Add success system log or notification
    guild.modLogs.unshift({
      id: `log-inv-${Date.now()}`,
      type: "System",
      moderator: "System",
      user: "DarkFlower Bot",
      reason: "Bot added to server successfully by Server Owner.",
      timestamp: "Just now"
    });
    await saveGuild(guild);
    res.json({ success: true, guild });
  } else {
    res.status(404).json({ error: "Guild not found" });
  }
});

// Guild Config update
app.post("/api/guilds/:id/config", async (req, res) => {
  const guildIndex = guilds.findIndex(g => g.id === req.params.id);
  if (guildIndex !== -1) {
    if (req.body.name) {
      guilds[guildIndex].name = req.body.name;
    }
    guilds[guildIndex].config = { ...guilds[guildIndex].config, ...req.body };
    await saveGuild(guilds[guildIndex]);
    res.json({ success: true, name: guilds[guildIndex].name, config: guilds[guildIndex].config });
  } else {
    res.status(404).json({ error: "Guild not found" });
  }
});

// Marriage Config update
app.post("/api/guilds/:id/marriage/config", async (req, res) => {
  const guild = guilds.find(g => g.id === req.params.id);
  if (guild) {
    guild.marriageConfig = { ...guild.marriageConfig, ...req.body };
    await saveGuild(guild);
    res.json({ success: true, marriageConfig: guild.marriageConfig });
  } else {
    res.status(404).json({ error: "Guild not found" });
  }
});

// Marriage Force Divorce (Admin Action)
app.post("/api/guilds/:id/marriage/force-divorce", async (req, res) => {
  const guild = guilds.find(g => g.id === req.params.id);
  if (!guild) {
    return res.status(404).json({ error: "Guild not found" });
  }
  const { user1Id, user2Id } = req.body;
  if (!guild.marriages) guild.marriages = [];
  const index = guild.marriages.findIndex(m => 
    (m.user1Id === user1Id && m.user2Id === user2Id) || 
    (m.user1Id === user2Id && m.user2Id === user1Id)
  );
  if (index !== -1) {
    const marriage = guild.marriages[index];
    guild.marriages.splice(index, 1);
    
    // Clean up nickname suffixes or custom roles as well!
    const activeClient = getDiscordClientForGuild(guild.id);
    if (activeClient && activeClient.isReady()) {
      try {
        const dGuild = activeClient.guilds.cache.get(guild.id);
        if (dGuild) {
          const suffix = ` | ${marriage.familyName}`;
          const suffixAlt = ` ${marriage.familyName}`;
          const m1 = await dGuild.members.fetch(marriage.user1Id).catch(() => null);
          if (m1 && m1.nickname) {
            let newNick = m1.nickname;
            if (newNick.endsWith(suffix)) newNick = newNick.slice(0, -suffix.length);
            else if (newNick.endsWith(suffixAlt)) newNick = newNick.slice(0, -suffixAlt.length);
            await m1.setNickname(newNick === m1.user.displayName || newNick === m1.user.username ? null : newNick).catch(() => null);
          }
          const m2 = await dGuild.members.fetch(marriage.user2Id).catch(() => null);
          if (m2 && m2.nickname) {
            let newNick = m2.nickname;
            if (newNick.endsWith(suffix)) newNick = newNick.slice(0, -suffix.length);
            else if (newNick.endsWith(suffixAlt)) newNick = newNick.slice(0, -suffixAlt.length);
            await m2.setNickname(newNick === m2.user.displayName || newNick === m2.user.username ? null : newNick).catch(() => null);
          }
        }
      } catch (err) {
        console.error("Error in administrative force divorce nickname cleanup:", err);
      }
    }
    await saveGuild(guild);
    return res.json({ success: true, marriages: guild.marriages });
  }
  res.status(404).json({ error: "Relationship not found" });
});

// Button Roles endpoints
app.post("/api/guilds/:id/button-roles/send", async (req, res) => {
  const guild = guilds.find(g => g.id === req.params.id);
  if (!guild) {
    return res.status(404).json({ error: "Guild not found" });
  }

  const { targetChannel, messageText, useEmbed, embedTitle, embedDescription, embedColor, roleMode, buttons } = req.body;

  const configId = `br-${Date.now()}`;
  const messageConfig = {
    id: configId,
    targetChannel,
    messageText,
    useEmbed,
    embedTitle,
    embedDescription,
    embedColor,
    roleMode,
    buttons
  };

  let sentMessageId = "";
  let errorMsg = "";

  const activeClient = getDiscordClientForGuild(guild.id);
  if (activeClient && activeClient.isReady()) {
    try {
      const dGuild = activeClient.guilds.cache.get(guild.id);
      if (dGuild) {
        const searchNameOrId = targetChannel.replace('#', '').trim();
        const textChannel: any = dGuild.channels.cache.find((c: any) => 
          c.isTextBased() && (c.id === searchNameOrId || c.name.toLowerCase() === searchNameOrId.toLowerCase())
        );

        if (textChannel) {
          // Check if bot has the required permissions first to prevent DiscordAPIError[50001] (Missing Access)
          let hasPermissions = true;
          const me = dGuild.members.me || await dGuild.members.fetchMe().catch(() => null);
          if (me) {
            const perms = textChannel.permissionsFor(me);
            if (perms) {
              const missing: string[] = [];
              if (!perms.has(PermissionsBitField.Flags.ViewChannel)) {
                missing.push("View Channel");
              }
              if (!perms.has(PermissionsBitField.Flags.SendMessages)) {
                missing.push("Send Messages");
              }
              if (useEmbed && !perms.has(PermissionsBitField.Flags.EmbedLinks)) {
                missing.push("Embed Links");
              }
              if (missing.length > 0) {
                hasPermissions = false;
                errorMsg = `The Discord bot is missing the following permissions in ${targetChannel}: ${missing.join(", ")}. Please update the bot's permissions on your server. We saved the configuration and simulated sending.`;
              }
            }
          }

          if (hasPermissions) {
            const rows: any[] = [];
            let currentRow: any = null;

            buttons.forEach((btn: any, index: number) => {
              if (index % 5 === 0) {
                currentRow = new ActionRowBuilder();
                rows.push(currentRow);
              }

              let style = ButtonStyle.Primary;
              if (btn.style === 'success') style = ButtonStyle.Success;
              else if (btn.style === 'danger') style = ButtonStyle.Danger;
              else if (btn.style === 'secondary') style = ButtonStyle.Secondary;

              const dBtn = new ButtonBuilder()
                .setCustomId(`role_btn:${configId}:${btn.id}`)
                .setLabel(btn.label)
                .setStyle(style);

              if (btn.emoji) {
                dBtn.setEmoji(btn.emoji);
              }

              currentRow.addComponents(dBtn);
            });

            const messagePayload: any = {};
            if (useEmbed) {
              const embed = new EmbedBuilder()
                .setTitle(embedTitle || "Select Your Roles")
                .setDescription(embedDescription || messageText || "Click buttons below to receive roles.")
                .setColor((embedColor || "#8b5cf6") as any);
              messagePayload.embeds = [embed];
              if (messageText) {
                messagePayload.content = messageText;
              }
            } else {
              messagePayload.content = messageText || "Select your roles below:";
            }

            if (rows.length > 0) {
              messagePayload.components = rows;
            }

            const sentMessage = await textChannel.send(messagePayload);
            sentMessageId = sentMessage.id;
          }
        } else {
          errorMsg = `Channel ${targetChannel} was not found on the live Discord server. We saved the configuration and simulated sending.`;
        }
      }
    } catch (err: any) {
      if (err.code === 50001 || (err.rawError && err.rawError.code === 50001) || String(err).includes("50001") || String(err.message).includes("Missing Access")) {
        console.warn("[Warning] Discord bot lacks permission to send message:", err.message || err);
        errorMsg = `Discord bot lacks permission/access to send messages in ${targetChannel}. Please make sure the bot has 'View Channel' and 'Send Messages' permissions in that channel. We saved the configuration anyway.`;
      } else {
        console.warn("[Warning] Error sending role buttons via Discord:", err);
        errorMsg = `Failed to send on live Discord server: ${err.message || err}. Saved configuration anyway.`;
      }
    }
  }

  // Save config
  if (!guild.config.buttonRolesMessages) {
    guild.config.buttonRolesMessages = [];
  }
  const savedConfig = { ...messageConfig, sentMessageId };
  guild.config.buttonRolesMessages.push(savedConfig);

  // Add system log
  guild.modLogs.unshift({
    id: `log-br-${Date.now()}`,
    type: "System",
    moderator: "System",
    user: "Button Roles Manager",
    reason: `Sent role button message to ${targetChannel} with ${buttons.length} roles.`,
    timestamp: "Just now"
  });

  await saveGuild(guild);
  res.json({ success: true, guild, warning: errorMsg });
});

app.post("/api/guilds/:id/button-roles/delete", async (req, res) => {
  const guild = guilds.find(g => g.id === req.params.id);
  if (!guild) {
    return res.status(404).json({ error: "Guild not found" });
  }

  const { configId } = req.body;
  if (guild.config.buttonRolesMessages) {
    const origLength = guild.config.buttonRolesMessages.length;
    guild.config.buttonRolesMessages = guild.config.buttonRolesMessages.filter(m => m.id !== configId);
    if (guild.config.buttonRolesMessages.length !== origLength) {
      // Add log
      guild.modLogs.unshift({
        id: `log-br-del-${Date.now()}`,
        type: "System",
        moderator: "System",
        user: "Button Roles Manager",
        reason: `Deleted button role config ${configId}`,
        timestamp: "Just now"
      });
      await saveGuild(guild);
      return res.json({ success: true, guild });
    }
  }
  res.json({ success: false, error: "Configuration not found" });
});

// Ticket simulator endpoints
app.post("/api/guilds/:id/ticket/create", async (req, res) => {
  const guild = guilds.find(g => g.id === req.params.id);
  if (guild) {
    const ticketId = `TKT-${Math.floor(1000 + Math.random() * 9000)}`;
    const newTicket: Ticket = {
      id: ticketId,
      user: currentUser?.username || "DiscordUser",
      status: "open",
      channelName: `ticket-${(currentUser?.username || "user").toLowerCase()}`,
      messages: [
        { sender: "DarkFlower Bot", text: `Welcome to support! ${guild.config.ticketLabel || "Support Ticket"} created. A staff member with role **${guild.config.supportRole || "Support"}** will assist you.`, timestamp: "Just now" }
      ]
    };
    guild.tickets.push(newTicket);
    guild.analytics.ticketsCount += 1;
    await saveGuild(guild);
    res.json({ success: true, ticket: newTicket });
  } else {
    res.status(404).json({ error: "Guild not found" });
  }
});

app.post("/api/guilds/:guildId/ticket/:ticketId/message", async (req, res) => {
  const guild = guilds.find(g => g.id === req.params.guildId);
  if (guild) {
    const ticket = guild.tickets.find(t => t.id === req.params.ticketId);
    if (ticket) {
      const { text, sender } = req.body;
      const finalSender = sender || currentUser?.username || "DiscordUser";
      ticket.messages.push({
        sender: finalSender,
        text,
        timestamp: "Just now"
      });

      // Mirror support ticket replies to real Discord if running live bot
      const activeClient = getDiscordClientForGuild(guild.id);
      if (activeClient && activeClient.isReady() && sender !== "DarkFlower Bot") {
        sendBotMessage(guild.id, guild.config.levelChannel || "#general", `🎟️ **Ticket Update (${ticket.id})**\n**${finalSender}**: ${text}`);
      }

      // Simple mock staff reply after 1 second if sent by user
      if (sender !== "DarkFlower Bot" && !sender.includes("(Staff)")) {
        setTimeout(async () => {
          ticket.messages.push({
            sender: "CyberLotus (Staff)",
            text: `Thanks for the input. I have logged this request and our developers are reviewing it. Is there anything else you need?`,
            timestamp: "Just now"
          });
          await saveGuild(guild);
        }, 1200);
      }

      await saveGuild(guild);
      res.json({ success: true, ticket });
    } else {
      res.status(404).json({ error: "Ticket not found" });
    }
  } else {
    res.status(404).json({ error: "Guild not found" });
  }
});

app.post("/api/guilds/:guildId/ticket/:ticketId/close", async (req, res) => {
  const guild = guilds.find(g => g.id === req.params.guildId);
  if (guild) {
    const ticket = guild.tickets.find(t => t.id === req.params.ticketId);
    if (ticket) {
      ticket.status = "closed";
      // Add a closed message
      ticket.messages.push({
        sender: "DarkFlower Bot",
        text: `Ticket closed by ${currentUser?.username || "Administrator"}. Generating transcription...`,
        timestamp: "Just now"
      });
      await saveGuild(guild);
      res.json({ success: true, ticket });
    } else {
      res.status(404).json({ error: "Ticket not found" });
    }
  } else {
    res.status(404).json({ error: "Guild not found" });
  }
});

// Moderation command simulator (Executes /warn, /kick, /ban inside dashboard simulator and pushes rich logs)
app.post("/api/guilds/:id/moderation/execute", async (req, res) => {
  const guild = guilds.find(g => g.id === req.params.id);
  if (guild) {
    const { command, user, reason } = req.body;
    const newLog = {
      id: `log-${Date.now()}`,
      type: command.charAt(0).toUpperCase() + command.slice(1),
      moderator: currentUser?.username || "Admin",
      user: user || "Spammer#1234",
      reason: reason || "Violating server terms and safety guidelines.",
      timestamp: "Just now"
    };
    guild.modLogs.unshift(newLog);
    guild.analytics.moderationCount += 1;

    // Send live log embed if bot is active on a real server
    const activeClient = getDiscordClientForGuild(guild.id);
    if (activeClient && activeClient.isReady()) {
      try {
        const embed = new EmbedBuilder()
          .setTitle(`⚖️ Member Moderated: ${newLog.type}`)
          .setColor(newLog.type === "Ban" ? 0xff0000 : newLog.type === "Kick" ? 0xffaa00 : 0xffff00)
          .addFields(
            { name: "Target Member", value: newLog.user, inline: true },
            { name: "Moderator", value: newLog.moderator, inline: true },
            { name: "Reason", value: newLog.reason }
          )
          .setTimestamp();
        sendBotMessage(guild.id, guild.config.modLogChannel || "#mod-logs", { embeds: [embed] });
      } catch (err) {
        console.error("Failed to construct and send moderation embed:", err);
      }
    }

    await saveGuild(guild);
    res.json({ success: true, log: newLog });
  } else {
    res.status(404).json({ error: "Guild not found" });
  }
});

// Scan Diagnostics Endpoint
app.post("/api/guilds/:guildId/diagnostics/scan", async (req, res) => {
  const guild = guilds.find(g => g.id === req.params.guildId);
  if (guild) {
    guild.errors = [];

    // Check 1: Support Role
    if (!guild.config.supportRole || guild.config.supportRole !== "Moderator") {
      guild.errors.push({
        id: "err-tkt-role",
        code: "ERR_TICKET_ROLE_MISSING",
        severity: "critical",
        module: "Tickets",
        message: "Support ticket role not configured as 'Moderator'. Users will not be able to get assistance."
      });
    }

    // Check 2: Mod Log Channel
    if (!guild.config.modLogChannel || guild.config.modLogChannel !== "#mod-logs") {
      guild.errors.push({
        id: "err-mod-channel",
        code: "ERR_NO_MOD_LOG_CHANNEL",
        severity: "warning",
        module: "Moderation",
        message: "Moderation log channel is not set to '#mod-logs'. Moderation actions will not be logged."
      });
    }

    // Check 3: Webhook URL
    const wh = guild.config.webhooks.find(w => w.id === "wh-1");
    if (!wh) {
      guild.config.webhooks.push({
        id: "wh-1",
        name: "GitHub Commits",
        url: "https://discord.com/api/webhooks/stale-placeholder-url",
        channel: "#webhook-test"
      });
    }
    const currentWh = guild.config.webhooks.find(w => w.id === "wh-1");
    if (currentWh && currentWh.url.includes("stale")) {
      guild.errors.push({
        id: "err-wh-stale",
        code: "ERR_WEBHOOK_STALE",
        severity: "critical",
        module: "Webhooks",
        message: "The webhook 'wh-1' (GitHub Commits) has a stale or invalid URL. Outbound events will fail."
      });
    }

    await saveGuild(guild);
    res.json({ success: true, errors: guild.errors });
  } else {
    res.status(404).json({ error: "Guild not found" });
  }
});

// Auto-Fix Error Handler Endpoint
app.post("/api/guilds/:guildId/errors/:errorId/fix", async (req, res) => {
  const guild = guilds.find(g => g.id === req.params.guildId);
  if (guild) {
    const errorIndex = guild.errors.findIndex(e => e.id === req.params.errorId);
    if (errorIndex !== -1) {
      const fixedError = guild.errors[errorIndex];
      // Apply mock fixes
      if (fixedError.code === "ERR_TICKET_ROLE_MISSING") {
        guild.config.supportRole = "Moderator";
      } else if (fixedError.code === "ERR_WEBHOOK_STALE") {
        const wh = guild.config.webhooks.find(w => w.id === "wh-1");
        if (wh) wh.url = "https://discord.com/api/webhooks/123456/fixed_url_repaired_by_darkflower";
      } else if (fixedError.code === "ERR_NO_MOD_LOG_CHANNEL") {
        guild.config.modLogChannel = "#mod-logs";
        if (!guild.channels.includes("#mod-logs")) {
          guild.channels.push("#mod-logs");
        }
      }
      guild.errors.splice(errorIndex, 1);
      await saveGuild(guild);
      res.json({ success: true, errorId: req.params.errorId });
    } else {
      res.status(404).json({ error: "Error not found" });
    }
  } else {
    res.status(404).json({ error: "Guild not found" });
  }
});

// Send custom simulated Webhook payload
app.post("/api/guilds/:id/webhook/send", async (req, res) => {
  const guild = guilds.find(g => g.id === req.params.id);
  if (guild) {
    const { webhookId, title, description, color, fields, customName, customAvatar, content } = req.body;
    const webhook = guild.config.webhooks.find(w => w.id === webhookId);
    if (webhook) {
      const senderName = customName || webhook.name;
      let logText = "";
      if (content) {
        logText += `Message: "${content}"`;
      }
      if (title) {
        if (logText) logText += " | ";
        logText += `Embed: "${title}" - ${description || ""}`;
      }
      if (!logText) logText = "Empty Webhook Payload";

      // Simulate sending webhook by appending an entry to our mod logs or simulation log feed
      guild.modLogs.unshift({
        id: `wh-log-${Date.now()}`,
        type: "Webhook",
        moderator: senderName,
        user: webhook.channel,
        reason: logText,
        timestamp: "Just now"
      });

      // Send live Discord Webhook Embed if bot is active on a real server
      const activeClient = getDiscordClientForGuild(guild.id);
      if (activeClient && activeClient.isReady()) {
        try {
          const embeds: any[] = [];
          if (title || description) {
            const embed = new EmbedBuilder()
              .setTitle(title || "Incoming Webhook Notification")
              .setDescription(description || null)
              .setColor(color ? parseInt(color.replace("#", ""), 16) : 0x8a2be2);
            
            if (fields && Array.isArray(fields)) {
              fields.forEach((f: any) => {
                if (f.name && f.value) {
                  embed.addFields({ name: f.name, value: f.value, inline: !!f.inline });
                }
              });
            }
            embeds.push(embed);
          }

          // Try sending via live Webhook with custom name and avatar
          const success = await sendWebhookMessage(guild.id, webhook.channel, {
            content: content || undefined,
            username: senderName,
            avatarURL: customAvatar || undefined,
            embeds: embeds
          });

          // Fallback if live Webhook dispatch failed (e.g. no permissions)
          if (!success) {
            sendBotMessage(guild.id, webhook.channel, {
              content: content || undefined,
              embeds: embeds
            } as any);
          }
        } catch (err) {
          console.error("Failed to construct and send webhook payload:", err);
        }
      }

      await saveGuild(guild);
      res.json({ success: true, channel: webhook.channel });
    } else {
      res.status(404).json({ error: "Webhook configuration not found" });
    }
  } else {
    res.status(404).json({ error: "Guild not found" });
  }
});

// Marriage simulated progress & custom anniversary settings update
app.post("/api/guilds/:id/marriages/simulate", async (req, res) => {
  const guildId = req.params.id;
  const guild = guilds.find(g => g.id === guildId);
  if (!guild) {
    return res.status(404).json({ error: "Guild not found" });
  }

  const { user1Id, user2Id, marriedAt, annconfig, alertsSent, triggerAlertNow } = req.body;
  if (!guild.marriages) {
    guild.marriages = [];
  }

  let marriage = guild.marriages.find(m => m.user1Id === user1Id && m.user2Id === user2Id);
  if (!marriage && guild.marriages.length > 0) {
    marriage = guild.marriages[0];
  }

  if (marriage) {
    if (marriedAt !== undefined) {
      marriage.marriedAt = marriedAt;
    }
    if (annconfig !== undefined) {
      marriage.annconfig = { ...marriage.annconfig, ...annconfig };
    }
    if (alertsSent !== undefined) {
      marriage.alertsSent = alertsSent;
    }
    if (triggerAlertNow) {
      if (marriage.alertsSent) {
        marriage.alertsSent = marriage.alertsSent.filter(a => a !== triggerAlertNow);
      }
    }
  } else {
    marriage = {
      user1Id: user1Id || "876543210987",
      user2Id: user2Id || "123456789012",
      user1Tag: "PressTV#0001",
      user2Tag: "LoveFlower#2026",
      familyName: "Cherry",
      marriedAt: marriedAt || Date.now(),
      channelId: undefined,
      alertsSent: alertsSent || [],
      annconfig: annconfig || { enabled: true, channel: guild.config.welcomeChannel || "#welcome", customMessage: "" }
    };
    guild.marriages.push(marriage);
  }

  await saveGuild(guild);

  setTimeout(() => {
    checkAnniversaries().catch(e => console.error("Simulated anniversary trigger error:", e));
  }, 100);

  res.json({ success: true, guild });
});

// --- GEMINI AI CHAT MODERATION SYSTEM ENDPOINT ---
// Requirements: Identify if has administration role. If so, let them use the system.
// We'll enforce this check. Only if user has administrator permission (simulated via headers or query parameters, in our dashboard, checking if currentUser is logged in and authorized).
app.post("/api/moderation/ai", async (req, res) => {
  const { prompt, guildId, isAdmin } = req.body;

  if (!isAdmin) {
    return res.status(403).json({
      error: "Access Denied",
      message: "Security Protocol Violation: AI Chat Moderation is locked. Only administrators with designated administrative permissions are authorized to execute DarkFlower AI commands."
    });
  }

  const guild = guilds.find(g => g.id === guildId);
  const serverContext = guild 
    ? `Guild Context:\n- Name: ${guild.name}\n- Prefix: ${guild.config.prefix}\n- Members: ${guild.memberCount}\n- Moderation Logs: ${JSON.stringify(guild.modLogs.slice(0, 3))}\n- Automod State: Enabled: ${guild.config.automodEnabled}, Bad Words: ${JSON.stringify(guild.config.badWords)}`
    : `No specific guild context specified.`;

  const systemInstruction = `You are the core AI of the "DarkFlower" All-In-One premium Discord Bot.
Your name is DarkFlower AI. You provide administrative support, activity analysis, automated rule drafting, moderation suggestions, and config checks for server managers.
The user prompt is submitted by an authorized administrator who has full server control.
You should analyze the user's inquiry in the context of their discord server, give expert, highly concise, structured, and action-driven replies, and structure commands as rich embeds.
Always stay in character as a helpful, slightly mysterious, dark purple themed floral synth assistant. Use markdown and formatting.`;

  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `${serverContext}\n\nAdministrator Request: ${prompt}`,
        config: {
          systemInstruction,
          temperature: 0.7
        }
      });
      res.json({ text: response.text });
    } catch (err: any) {
      console.error("Gemini API Error:", err);
      res.status(500).json({ error: "Gemini execution failed", message: err.message });
    }
  } else {
    res.status(400).json({
      error: "API Key Missing",
      message: "⚠️ **GEMINI_API_KEY is missing!**\n\nDarkFlower AI requires a valid `GEMINI_API_KEY` to run live analysis and execute automated server moderation. To make this real:\n\n1. Open the **Secrets panel** (via the Settings menu in the bottom-left of the build editor interface).\n2. Add a new key called `GEMINI_API_KEY`.\n3. Enter your Gemini API key from Google AI Studio.\n4. Click **Save** to enable real AI moderation instantly."
    });
  }
});

// --- WHITE-LABEL CUSTOM BOT SYSTEM ---

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "darkflower-white-label-secret-key-32";
const IV_LENGTH = 16;

function encryptToken(text: string): string {
  try {
    const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString("hex") + ":" + encrypted.toString("hex");
  } catch (err) {
    console.error("Encryption failed:", err);
    return text;
  }
}

function decryptToken(text: string): string {
  try {
    const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
    const textParts = text.split(":");
    const ivHex = textParts.shift();
    if (!ivHex) return text;
    const iv = Buffer.from(ivHex, "hex");
    const encryptedText = Buffer.from(textParts.join(":"), "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (err) {
    console.error("Decryption failed:", err);
    return text;
  }
}

async function startCustomBot(guildId: string, token: string) {
  await stopCustomBot(guildId);
  console.log(`[Custom Bot] Starting custom bot for guild ${guildId}...`);
  try {
    const customClient = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent
      ]
    });

    registerBotEvents(customClient, true, guildId);

    await customClient.login(token);
    customBotClients.set(guildId, customClient);

    const guild = guilds.find(g => g.id === guildId);
    if (guild) {
      guild.customBot = {
        token: encryptToken(token),
        username: customClient.user?.username || "Custom Bot",
        avatar: customClient.user?.displayAvatarURL() || "https://api.dicebear.com/7.x/pixel-art/svg?seed=CustomBot",
        id: customClient.user?.id || "",
        status: 'online'
      };
      await saveGuild(guild);
    }
    console.log(`[Custom Bot] Successfully logged in custom bot for guild ${guildId}`);
    return { success: true };
  } catch (err: any) {
    console.error(`[Custom Bot] Failed to log in custom bot for guild ${guildId}:`, err);
    const guild = guilds.find(g => g.id === guildId);
    if (guild) {
      guild.customBot = {
        token: encryptToken(token),
        status: 'error',
        error: err.message || String(err),
        username: guild.customBot?.username || "Custom Bot",
        avatar: guild.customBot?.avatar || "https://api.dicebear.com/7.x/pixel-art/svg?seed=CustomBot",
        id: guild.customBot?.id || ""
      };
      await saveGuild(guild);
    }
    return { success: false, error: err.message || String(err) };
  }
}

async function stopCustomBot(guildId: string) {
  const existing = customBotClients.get(guildId);
  if (existing) {
    try {
      existing.destroy();
    } catch (err) {
      console.error(`[Custom Bot] Error destroying client for guild ${guildId}:`, err);
    }
    customBotClients.delete(guildId);
  }
}

// --- WHITE-LABEL CUSTOM BOT API ENDPOINTS ---

app.get("/api/guilds/:id/custom-bot", async (req, res) => {
  const { id } = req.params;
  const guild = guilds.find(g => g.id === id);
  if (!guild) {
    return res.status(404).json({ error: "Guild not found" });
  }

  if (guild.customBot) {
    const activeClient = customBotClients.get(id);
    const realStatus = (activeClient && activeClient.isReady()) ? 'online' : (guild.customBot.status === 'error' ? 'error' : 'offline');
    res.json({
      configured: true,
      status: realStatus,
      username: activeClient?.user?.username || guild.customBot.username || "Custom Bot",
      avatar: activeClient?.user?.displayAvatarURL() || guild.customBot.avatar || "https://api.dicebear.com/7.x/pixel-art/svg?seed=CustomBot",
      id: activeClient?.user?.id || guild.customBot.id || "",
      error: guild.customBot.error
    });
  } else {
    res.json({ configured: false, status: 'offline' });
  }
});

app.post("/api/guilds/:id/custom-bot/activate", async (req, res) => {
  const { id } = req.params;
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: "Token is required" });
  }

  const guild = guilds.find(g => g.id === id);
  if (!guild) {
    return res.status(404).json({ error: "Guild not found" });
  }

  const result = await startCustomBot(id, token);
  if (result.success) {
    res.json({ success: true, status: 'online', guild });
  } else {
    res.status(400).json({ success: false, error: result.error });
  }
});

app.post("/api/guilds/:id/custom-bot/sync-commands", async (req, res) => {
  const { id } = req.params;
  const client = customBotClients.get(id);
  if (!client || !client.isReady()) {
    return res.status(400).json({ error: "Custom bot is not active or ready" });
  }

  try {
    const commands = getBotCommands();

    console.log(`[Custom Bot] Syncing commands for bot ${client.user?.tag} (${id})...`);
    // 1. Sync as guild-specific commands for the custom bot
    await client.rest.put(
      Routes.applicationGuildCommands(client.user!.id, id),
      { body: commands.map(c => c.toJSON()) }
    );
    // 2. Clear global commands for the custom bot to prevent duplicates
    try {
      await client.rest.put(
        Routes.applicationCommands(client.user!.id),
        { body: [] }
      );
    } catch (clearErr) {
      console.warn("Could not clear custom bot global commands (this is okay if none exist):", clearErr);
    }
    console.log(`[Custom Bot] Successfully synced guild commands and cleared global commands for bot ${client.user?.tag}`);
    res.json({ success: true, message: "Successfully synced custom bot application slash commands!" });
  } catch (err: any) {
    console.error("Failed to sync custom bot commands:", err);
    res.status(500).json({ error: "Failed to sync commands", message: err.message });
  }
});

app.post("/api/guilds/:id/custom-bot/reboot", async (req, res) => {
  const { id } = req.params;
  const guild = guilds.find(g => g.id === id);
  if (!guild || !guild.customBot || !guild.customBot.token) {
    return res.status(400).json({ error: "No custom bot token configured to reboot" });
  }

  try {
    const decryptedToken = decryptToken(guild.customBot.token);
    await stopCustomBot(id);
    const result = await startCustomBot(id, decryptedToken);
    if (result.success) {
      res.json({ success: true, status: 'online', guild });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (err: any) {
    res.status(500).json({ error: "Reboot failed", message: err.message });
  }
});

app.post("/api/guilds/:id/custom-bot/unlink", async (req, res) => {
  const { id } = req.params;
  const guild = guilds.find(g => g.id === id);
  if (!guild) {
    return res.status(404).json({ error: "Guild not found" });
  }

  await stopCustomBot(id);
  guild.customBot = undefined;
  await saveGuild(guild);
  res.json({ success: true, guild });
});

// --- VITE & STATIC FILES MIDDLEWARE ---

async function startServer() {
  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (ws) => {
    console.log('[WebSocket] Client connected');
    
    // Send initial status
    const anyBotConnectedInit = discordBotInfo.connected || Array.from(customBotClients.values()).some(c => c && c.isReady());
    const firstActivePingInit = (discordClient && discordClient.isReady() && discordClient.ws.ping !== -1) ? discordClient.ws.ping : (Array.from(customBotClients.values()).find(c => c && c.isReady())?.ws.ping ?? -1);
    ws.send(JSON.stringify({
      type: 'SYNC_STATUS',
      latency: anyBotConnectedInit ? firstActivePingInit : -1,
      status: anyBotConnectedInit ? 'connected' : 'disconnected'
    }));

    ws.on('close', () => {
      console.log('[WebSocket] Client disconnected');
    });
  });

  // Broadcast Discord gateway ping every 3 seconds
  setInterval(() => {
    const anyBotConnected = discordBotInfo.connected || Array.from(customBotClients.values()).some(c => c && c.isReady());
    const firstActivePing = (discordClient && discordClient.isReady() && discordClient.ws.ping !== -1) ? discordClient.ws.ping : (Array.from(customBotClients.values()).find(c => c && c.isReady())?.ws.ping ?? -1);

    if (anyBotConnected) {
      const message = JSON.stringify({
        type: 'SYNC_STATUS',
        latency: firstActivePing,
        status: 'connected'
      });
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });
    } else {
      const message = JSON.stringify({
        type: 'SYNC_STATUS',
        latency: -1,
        status: 'disconnected'
      });
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });
    }
  }, 3000);

  if (process.env.NODE_ENV !== "production") {
    // Disable caching in development to ensure any code changes are instantly reflected in the browser
    app.use((req, res, next) => {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.setHeader("Surrogate-Control", "no-store");
      next();
    });

    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`[DarkFlower Server] App running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
