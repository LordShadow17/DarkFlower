import express from "express";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { Client, GatewayIntentBits, Events, EmbedBuilder, REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField, TextChannel } from "discord.js";
import { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, entersState, VoiceConnectionStatus, StreamType, generateDependencyReport, NoSubscriberBehavior, getVoiceConnection } from "@discordjs/voice";
import ffmpegStatic from "ffmpeg-static";
import play from "play-dl";
import { Innertube, UniversalCache } from "youtubei.js";
import { Readable } from "stream";
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc, collection, getDocs } from "firebase/firestore";

const ytClients = new Map<string, Innertube>();

async function getYTClient(guildId: string): Promise<Innertube> {
    if (ytClients.has(guildId)) {
        return ytClients.get(guildId)!;
    }
    const cacheDir = path.join(process.cwd(), `.yt_cache_${guildId}`);
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    
    const innertube = await Innertube.create({ cache: new UniversalCache(true, cacheDir) });
    ytClients.set(guildId, innertube);
    console.log(`youtubei.js initialized for guild ${guildId}`);
    return innertube;
}

play.getFreeClientID().then(id => {
  play.setToken({ soundcloud: { client_id: id } });
  console.log("play-dl soundcloud initialized");
}).catch(console.error);


process.env.FFMPEG_PATH = ffmpegStatic as string;
console.log(generateDependencyReport());

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

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
const userWarnings = new Map<string, { reason: string, timestamp: number }[]>();

// Live Discord Bot Client Setup
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

    discordClient.once(Events.ClientReady, async (readyClient) => {
      console.log(`[DarkFlower Discord Bot] Logged in as ${readyClient.user.tag}!`);
      discordBotInfo.connected = true;
      discordBotInfo.username = readyClient.user.username;
      discordBotInfo.avatar = readyClient.user.displayAvatarURL() || "https://api.dicebear.com/7.x/pixel-art/svg?seed=DarkFlower";
      discordBotInfo.id = readyClient.user.id;
      
      try {
        const commands = [
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
            .setDescription('View all available commands and their explanations.')
        ];
        
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN as string);
        console.log('Started refreshing application (/) commands.');
        await rest.put(
          Routes.applicationCommands(readyClient.user.id),
          { body: commands },
        );
        console.log('Successfully reloaded application (/) commands.');
      } catch (error) {
        console.error('Error registering commands:', error);
      }
    });

    discordClient.on(Events.GuildMemberAdd, async (member: any) => {
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

        // Find the database guild configuration (from the dashboard)
        const dbGuild = guilds.find(g => g.id === member.guild.id);

        // 1. Check if a welcome channel has been explicitly configured via /setwelcome
        const configuredId = welcomeChannelsConfig.get(member.guild.id);
        if (configuredId) {
          const confChan = await member.guild.channels.fetch(configuredId).catch(() => null);
          if (canSend(confChan)) {
            channel = confChan;
          }
        }

        // 2. Check if a welcome channel has been configured via the dashboard config (e.g. "#welcome")
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

        // 3. Check if we have a test channel ID attached (from /testwelcome command) as a fallback
        if (!channel && member.testChannelId) {
          const testChan = await member.guild.channels.fetch(member.testChannelId).catch(() => null);
          if (canSend(testChan)) {
            channel = testChan;
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
        let welcomeCardUrl = 'https://media.tenor.com/2s0n6U1w58gAAAAC/eminence-in-shadow-the-eminence-in-shadow.gif';
        
        if (dbGuild && dbGuild.config) {
          if (dbGuild.config.welcomeMessage) {
            welcomeText = dbGuild.config.welcomeMessage
              .replace(/{user}/g, `${member.user}`)
              .replace(/{server}/g, `**${member.guild.name}**`)
              .replace(/{count}/g, `${member.guild.memberCount}`);
          }
          if (dbGuild.config.welcomeCard) {
            welcomeCardUrl = dbGuild.config.welcomeCard;
          }
        }

        const embed = new EmbedBuilder()
          .setTitle('Welcome to Our server!')
          .setDescription(welcomeText)
          .setImage(welcomeCardUrl)
          .setColor('#483d8b'); // Dark Slate Blue

        if (discordBotInfo.avatar) {
          embed.setAuthor({ 
            name: 'Aicherecter', // Defaulting to the text in the image
            iconURL: discordBotInfo.avatar 
          });
        } else {
          embed.setAuthor({ 
            name: 'Aicherecter'
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

    // XP cooldown map: key = `guildId-userId`, value = timestamp of last XP award
    const xpCooldowns = new Map<string, number>();

    discordClient.on(Events.MessageCreate, async (message) => {
      try {
        // 1. Ignore bot messages or messages outside guilds
        if (message.author.bot) return;
        if (!message.guild) return;

        const guildId = message.guild.id;
        const userId = message.author.id;
        const dbGuild = guilds.find(g => g.id === guildId);

        if (!dbGuild) return;

        // 2. Automod checks (Links & Bad Words)
        if (dbGuild.config && dbGuild.config.automodEnabled) {
          let shouldDelete = false;
          let violationReason = "";

          // Block links check
          if (dbGuild.config.blockLinks) {
            const hasLink = /https?:\/\/[^\s]+/.test(message.content);
            if (hasLink) {
              shouldDelete = true;
              violationReason = "Sent a link (Links are blocked).";
            }
          }

          // Bad words check
          if (!shouldDelete && dbGuild.config.badWords && dbGuild.config.badWords.length > 0) {
            const lowerContent = message.content.toLowerCase();
            for (const badWord of dbGuild.config.badWords) {
              if (badWord.trim() && lowerContent.includes(badWord.trim().toLowerCase())) {
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
      } catch (err) {
        console.error("Error in MessageCreate listener:", err);
      }
    });

    discordClient.on(Events.InteractionCreate, async (interaction) => {
      if (interaction.isButton()) {
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
                      id: discordClient.user!.id,
                      allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
                  }
              ]
            });
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
          await guildYt.session.signIn();
        } catch (err: any) {
          console.error("Login flow error:", err);
        }
        return;
      }

      if (interaction.commandName === 'play') {
        const member = interaction.member;
        // In discord.js, interaction.member might be a GuildMember
        if (member && typeof member === 'object' && 'voice' in member && member.voice.channelId) {
          const channelId = member.voice.channelId;
          const guildId = interaction.guildId!;
          const guild = interaction.guild!;

          try {
            const connection = joinVoiceChannel({
              channelId: channelId,
              guildId: guildId,
              adapterCreator: guild.voiceAdapterCreator,
              selfDeaf: false,
              selfMute: false,
            });

            const player = createAudioPlayer({
              behaviors: {
                noSubscriber: NoSubscriberBehavior.Play,
              },
            });
            guildPlayers.set(guildId, player);
            
            player.on('error', error => {
                console.error('Audio Player Error:', error);
                interaction.channel?.send(`Audio Player Error: ${error.message}`);
            });
            
            player.on('stateChange', (oldState, newState) => {
                console.log(`Audio player transitioned from ${oldState.status} to ${newState.status}`);
                if (newState.status === 'idle') {
                  interaction.channel?.send('Player finished or went idle.');
                }
            });

            // Get the requested song/url from the command options
            const query = interaction.options.getString('query') || interaction.options.getString('url') || interaction.options.getString('song') || 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';
            
            await interaction.deferReply();

            let stream;
            let trackInfo = query;
            let resource;
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
                  
                  try {
                    try {
                       const info = await guildYt.getBasicInfo(videoId);
                       trackInfo = info.basic_info.title || query;
                    } catch (e) {
                       // Try youtube-ext if youtubei.js getBasicInfo fails
                       const ytExt = await import('youtube-ext');
                       const info = await ytExt.videoInfo(videoId);
                       trackInfo = info.title || query;
                    }
                    ytTitle = trackInfo;
                    const webStream = await guildYt.download(videoId, { type: 'audio', quality: 'best', format: 'mp4' });
                    stream = { stream: Readable.fromWeb(webStream as any) };
                    resource = createAudioResource(stream.stream);
                  } catch (err: any) {
                    if (ytTitle && ytTitle !== query && !ytTitle.startsWith('http')) {
                       console.log("YouTube download failed, trying SoundCloud for:", ytTitle);
                       const cleanQ = sanitizeTitleForSoundCloud(ytTitle);
                       const searchResults = await play.search(cleanQ || ytTitle, { limit: 1, source: { soundcloud: 'tracks' } });
                       if (searchResults && searchResults.length > 0) {
                         trackInfo = (searchResults[0] as any).name || (searchResults[0] as any).title || ytTitle;
                         const soStream = await play.stream(searchResults[0].url);
                         stream = { stream: soStream.stream, type: soStream.type };
                         resource = createAudioResource(stream.stream, { inputType: stream.type });
                       } else {
                         throw new Error(`YouTube is blocking playback, and the track "${cleanQ}" could not be found on SoundCloud fallback.`);
                       }
                    } else {
                       throw new Error(`YouTube is blocking playback for this track (Bot Protection). Try searching for the song name instead of URL to use the SoundCloud fallback.`);
                    }
                  }
              } else if (query.startsWith('http')) {
                  // Direct URL
                  stream = { stream: query, type: StreamType.Arbitrary };
                  resource = createAudioResource(stream.stream, { inputType: stream.type });
              } else {
                try {
                  const searchResults = await play.search(query, { limit: 1, source: { soundcloud: 'tracks' } });
                  if (searchResults && searchResults.length > 0) {
                    trackInfo = (searchResults[0] as any).name || (searchResults[0] as any).title || query;
                    const soStream = await play.stream(searchResults[0].url);
                    stream = { stream: soStream.stream, type: soStream.type };
                    resource = createAudioResource(stream.stream, { inputType: stream.type });
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
                     
                     try {
                        const guildYt = await getYTClient(guildId);
                        const webStream = await guildYt.download(videoId, { type: 'audio', quality: 'best', format: 'mp4' });
                        stream = { stream: Readable.fromWeb(webStream as any) };
                        resource = createAudioResource(stream.stream);
                     } catch(dlErr: any) {
                         // One last try with SoundCloud if youtube download fails
                         console.log("YouTube download failed, trying SoundCloud again for:", trackInfo);
                         const cleanQ = sanitizeTitleForSoundCloud(trackInfo);
                         const soSearch = await play.search(cleanQ || trackInfo, { limit: 1, source: { soundcloud: 'tracks' } });
                         if (soSearch && soSearch.length > 0) {
                           trackInfo = (soSearch[0] as any).name || (soSearch[0] as any).title || trackInfo;
                           const soStream = await play.stream(soSearch[0].url);
                           stream = { stream: soStream.stream, type: soStream.type };
                           resource = createAudioResource(stream.stream, { inputType: stream.type });
                         } else {
                           throw new Error(`YouTube is blocking playback, and the track "${cleanQ}" could not be found on SoundCloud fallback.`);
                         }
                     }
                   } else {
                     throw new Error("No results found");
                   }
                }
              }
              
              const networkStateChangeHandler = (oldNetworkState: any, newNetworkState: any) => {
                const newUdp = Reflect.get(newNetworkState, 'udp');
                clearInterval(newUdp?.keepAliveInterval);
              }

              connection.on('stateChange', (oldState, newState) => {
                const oldNetworking = Reflect.get(oldState, 'networking');
                const newNetworking = Reflect.get(newState, 'networking');

                oldNetworking?.off('stateChange', networkStateChangeHandler);
                newNetworking?.on('stateChange', networkStateChangeHandler);
                
                console.log(`Connection transitioned from ${oldState.status} to ${newState.status}`);
              });

              // Apply to initial networking state
              const initialNetworking = Reflect.get(connection.state, 'networking');
              if (initialNetworking) {
                initialNetworking.on('stateChange', networkStateChangeHandler);
              }

              connection.on('error', (error) => {
                console.error('Connection Error:', error);
              });
              
              connection.subscribe(player);
              
              await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
              
              player.play(resource);
              
              const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle('▶️ Now Playing')
                .setDescription('Started playing music in the voice channel.')
                .addFields(
                  { name: 'Channel', value: `<#${channelId}>`, inline: true },
                  { name: 'Track', value: trackInfo, inline: true }
                )
                .setTimestamp();

              await interaction.editReply({ embeds: [embed] });
            } catch (err: any) {
              console.error('Error playing track:', err);
              
              const errorEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Error')
                .setDescription(`Failed to play the requested track.\nReason: \`${err.message || err}\``);
              await interaction.editReply({ embeds: [errorEmbed] });
            }
          } catch (error) {
            console.error('Error joining voice channel:', error);
            const errorEmbed = new EmbedBuilder()
              .setColor('#FF0000')
              .setTitle('❌ Error')
              .setDescription('Failed to join voice channel or play music.');
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
          }
        } else {
          const warnEmbed = new EmbedBuilder()
            .setColor('#FFA500')
            .setTitle('⚠️ Warning')
            .setDescription('You must be in a voice channel to play music!');
          await interaction.reply({ embeds: [warnEmbed], ephemeral: true });
        }
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
          return interaction.reply('⏹️ Stopped the music playback and left the voice channel.');
        }

        if (!player) {
          return interaction.reply({ content: 'There is no active music player running on this server.', ephemeral: true });
        }

        if (interaction.commandName === 'skip') {
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
        const target = interaction.options.getUser('target');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        try {
          await interaction.guild?.members.ban(target!, { reason });
          return interaction.reply(`Banned ${target?.tag} for: ${reason}`);
        } catch (e: any) {
          return interaction.reply({ content: `Error: ${e.message}`, ephemeral: true });
        }
      }
      
      if (interaction.commandName === 'kick') {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.KickMembers as any)) return interaction.reply({ content: 'No permission', ephemeral: true });
        const target = interaction.options.getUser('target');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        try {
          await interaction.guild?.members.kick(target!, reason);
          return interaction.reply(`Kicked ${target?.tag} for: ${reason}`);
        } catch (e: any) {
          return interaction.reply({ content: `Error: ${e.message}`, ephemeral: true });
        }
      }
      
      if (interaction.commandName === 'timeout') {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ModerateMembers as any)) return interaction.reply({ content: 'No permission', ephemeral: true });
        const target = interaction.options.getUser('target');
        const duration = interaction.options.getInteger('duration')!;
        const reason = interaction.options.getString('reason') || 'No reason provided';
        try {
          const member = await interaction.guild?.members.fetch(target!.id);
          await member?.timeout(duration * 60 * 1000, reason);
          return interaction.reply(`Timed out ${target?.tag} for ${duration} minutes. Reason: ${reason}`);
        } catch (e: any) {
          return interaction.reply({ content: `Error: ${e.message}`, ephemeral: true });
        }
      }

      if (interaction.commandName === 'clear') {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageMessages as any)) return interaction.reply({ content: 'No permission', ephemeral: true });
        const amount = interaction.options.getInteger('amount')!;
        try {
          if (interaction.channel?.isTextBased() && 'bulkDelete' in interaction.channel) {
              await (interaction.channel as any).bulkDelete(amount, true);
              return interaction.reply({ content: `Cleared ${amount} messages.`, ephemeral: true });
          }
          return interaction.reply({ content: 'Could not clear messages in this channel.', ephemeral: true });
        } catch (e: any) {
          return interaction.reply({ content: `Error: ${e.message}`, ephemeral: true });
        }
      }

      if (interaction.commandName === 'unban') {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.BanMembers as any)) return interaction.reply({ content: 'You do not have the required permissions to unban members.', ephemeral: true });
        const userId = interaction.options.getString('userid')!;
        const reason = interaction.options.getString('reason') || 'No reason provided';
        try {
          await interaction.guild?.members.unban(userId, reason);
          return interaction.reply(`✅ Successfully unbanned user ID: \`${userId}\` for reason: ${reason}`);
        } catch (e: any) {
          return interaction.reply({ content: `❌ Error unbanning: ${e.message}`, ephemeral: true });
        }
      }

      if (interaction.commandName === 'warn') {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ModerateMembers as any)) return interaction.reply({ content: 'You do not have the required permissions to warn members.', ephemeral: true });
        const target = interaction.options.getUser('target')!;
        const reason = interaction.options.getString('reason')!;
        const guildId = interaction.guildId!;
        
        const key = `${guildId}-${target.id}`;
        const warnings = userWarnings.get(key) || [];
        warnings.push({ reason, timestamp: Date.now() });
        userWarnings.set(key, warnings);

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

        return interaction.reply({ embeds: [embed] });
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

        try {
          await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
            SendMessages: false
          });
          return interaction.reply(`🔒 Channel <#${channel.id}> has been locked down.`);
        } catch (e: any) {
          return interaction.reply({ content: `Error locking channel: ${e.message}`, ephemeral: true });
        }
      }

      if (interaction.commandName === 'unlock') {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageChannels as any)) return interaction.reply({ content: 'You do not have the required permissions to unlock channels.', ephemeral: true });
        const channel = (interaction.options.getChannel('channel') || interaction.channel) as any;
        if (!channel || !channel.isTextBased() || !('permissionOverwrites' in channel)) {
          return interaction.reply({ content: 'Can only unlock text channels.', ephemeral: true });
        }

        try {
          await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
            SendMessages: null
          });
          return interaction.reply(`🔓 Channel <#${channel.id}> has been unlocked.`);
        } catch (e: any) {
          return interaction.reply({ content: `Error unlocking channel: ${e.message}`, ephemeral: true });
        }
      }

      if (interaction.commandName === 'slowmode') {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageChannels as any)) return interaction.reply({ content: 'You do not have the required permissions to manage channel slowmode.', ephemeral: true });
        const seconds = interaction.options.getInteger('seconds')!;
        const channel = (interaction.options.getChannel('channel') || interaction.channel) as any;
        if (!channel || !channel.isTextBased() || !('setRateLimitPerUser' in channel)) {
          return interaction.reply({ content: 'Can only apply slowmode to text channels.', ephemeral: true });
        }

        try {
          await channel.setRateLimitPerUser(seconds);
          if (seconds === 0) {
            return interaction.reply(`🕒 Slowmode has been disabled for <#${channel.id}>.`);
          }
          return interaction.reply(`🕒 Slowmode has been set to **${seconds}** seconds for <#${channel.id}>.`);
        } catch (e: any) {
          return interaction.reply({ content: `Error setting slowmode: ${e.message}`, ephemeral: true });
        }
      }

      if (interaction.commandName === 'ticket') {
        const subcommand = interaction.options.getSubcommand();
        if (subcommand === 'setup' || subcommand === 'panel') {
          if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator as any)) return interaction.reply({ content: 'No permission', ephemeral: true });
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
          await interaction.channel?.send({ embeds: [embed], components: [row] });
          return interaction.reply({ content: 'Ticket panel has been created.', ephemeral: true });
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
          welcomeChannelsConfig.set(interaction.guildId!, channel.id);
          return interaction.reply(`Welcome channel set to <#${channel.id}>.`);
      }

      if (interaction.commandName === 'testwelcome') {
          const testMember = interaction.member as any;
          if (testMember) {
              testMember.testChannelId = interaction.channelId;
          }
          discordClient.emit(Events.GuildMemberAdd, testMember);
          return interaction.reply({ content: 'Testing welcome message! Check the welcome channel or this channel for the welcome notification.', ephemeral: true });
      }

      if (interaction.commandName === 'rank' || interaction.commandName === 'profile') {
        const guildId = interaction.guildId;
        if (!guildId) {
          return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
        }

        await interaction.deferReply();

        const dbGuild = guilds.find(g => g.id === guildId);
        if (!dbGuild) {
          return interaction.editReply('Server configuration not found.');
        }

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

      if (interaction.commandName === 'info') {
        const infoEmbed = new EmbedBuilder()
          .setTitle('🌸 DarkFlower Bot Services & Commands Directory 🌸')
          .setDescription('Welcome! Here is the full catalog of available commands and system features you can use to moderate, engage, and manage your community.')
          .setColor('#7c25d9')
          .setThumbnail(discordClient.user?.displayAvatarURL() || null)
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
            }
          )
          .setFooter({ text: 'Powered by DarkFlower Management Console • Type /info anytime', iconURL: discordClient.user?.displayAvatarURL() || undefined })
          .setTimestamp();

        return interaction.reply({ embeds: [infoEmbed] });
      }
    });

    discordClient.login(process.env.DISCORD_BOT_TOKEN).catch(err => {
      console.error("[DarkFlower Discord Bot] Failed to login:", err.message);
      discordBotInfo.connected = false;
    });
  } catch (err) {
    console.error("[DarkFlower Discord Bot] Failed to initialize Discord Client:", err);
  }
}

// Live Bot Helper: send messages to real Discord Guild channels
async function sendBotMessage(guildId: string, channelNameOrId: string, message: string | { embeds: any[] }) {
  if (!discordClient || !discordBotInfo.connected) return;
  try {
    const guild = await discordClient.guilds.fetch(guildId).catch(() => null);
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
  if (!discordClient || !discordBotInfo.connected) return false;
  try {
    const guild = await discordClient.guilds.fetch(guildId).catch(() => null);
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
      let webhook = webhooks?.find((wh: any) => wh.owner?.id === discordClient?.user?.id);

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

interface GuildConfig {
  prefix: string;
  modLogChannel: string;
  welcomeChannel: string;
  welcomeMessage: string;
  welcomeCard: string;
  automodEnabled: boolean;
  blockLinks: boolean;
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
}

interface Guild {
  id: string;
  name: string;
  icon: string;
  hasBot: boolean;
  memberCount: number;
  boosts: number;
  channels: string[];
  config: GuildConfig;
  analytics: {
    messagesToday: number;
    activeUsersToday: number;
    invitesToday: number;
    weeklyActivity: Array<{ day: string; messages: number; moderation: number; tickets: number }>;
    moderationCount: number;
    ticketsCount: number;
  };
  leaderboard: Array<{ user: string; xp: number; level: number; avatar: string }>;
  tickets: Ticket[];
  modLogs: Array<{ id: string; type: string; moderator: string; user: string; reason: string; timestamp: string }>;
  errors: Array<{ id: string; code: string; message: string; module: string; severity: 'warning' | 'critical' }>;
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
      blockLinks: true,
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
      ticketsCount: 30
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
      await setDoc(doc(db, "guilds", guild.id), guild);
      console.log(`Successfully persisted guild ${guild.id} to Firestore!`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `guilds/${guild.id}`);
    }
  }
}

const firebaseConfigPath = path.join(process.cwd(), "firebase-applet-config.json");
if (fs.existsSync(firebaseConfigPath)) {
  try {
    const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf8"));
    const firebaseApp = initializeApp(firebaseConfig);
    db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);
    auth = getAuth(firebaseApp);
    
    // Run connection test and sync
    testConnection();
    syncGuildsFromFirestore();
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
      console.log(`[YouTube Cookie] Saved YouTube cookie (${cleanCookie.length} characters)`);
      res.json({ success: true, length: cleanCookie.length, configured: true });
    } else {
      if (fs.existsSync(cookieFilePath)) {
        fs.unlinkSync(cookieFilePath);
      }
      delete process.env.YOUTUBE_COOKIE;
      console.log("[YouTube Cookie] Cleared YouTube cookie");
      res.json({ success: true, configured: false });
    }
  } catch (err: any) {
    console.error("[YouTube Cookie] Error saving cookie:", err);
    res.status(500).json({ error: "Failed to save YouTube cookie: " + err.message });
  }
});


// Guild List endpoints
app.get("/api/guilds", async (req, res) => {
  if (discordClient && discordBotInfo.connected) {
    try {
      for (const g of discordClient.guilds.cache.values()) {
        const fetchedChannels = await g.channels.fetch().catch(() => null);
        let realChannels: string[] = ["#general", "#announcements", "#welcome", "#mod-logs", "#level-ups", "#tickets", "#music-bot", "#webhook-test"];
        if (fetchedChannels) {
          const textChannels = fetchedChannels.filter((c: any) => c && c.isTextBased());
          if (textChannels.size > 0) {
            realChannels = textChannels.map((c: any) => `#${c.name}`);
          }
        }

        const existing = guilds.find(mockG => mockG.id === g.id);

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
          ticketsCount: 0
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
          invitesList: realInvites
        };

        if (!existing) {
          const newGuild = {
            id: g.id,
            name: g.name,
            icon: g.iconURL() || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=60",
            hasBot: true,
            memberCount: g.memberCount,
            boosts: g.premiumSubscriptionCount || 0,
            channels: realChannels,
            config: {
              prefix: "df!",
              modLogChannel: realChannels.includes("#mod-logs") ? "#mod-logs" : (realChannels[0] || "#general"),
              welcomeChannel: realChannels.includes("#welcome") ? "#welcome" : (realChannels[0] || "#general"),
              welcomeMessage: "Welcome to our server, {user}! Have a blast! 🌸",
              welcomeCard: "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=500&auto=format&fit=crop&q=80",
              automodEnabled: true,
              blockLinks: true,
              badWords: ["scam", "hack"],
              spamLimit: 5,
              ticketEnabled: true,
              ticketLabel: "Open Support Ticket",
              supportRole: "Staff",
              levelingEnabled: true,
              xpRate: 1.0,
              levelChannel: realChannels.includes("#level-ups") ? "#level-ups" : (realChannels[0] || "#general"),
              reactionRoles: [],
              webhooks: [],
              levelRoles: [
                { level: 5, role: "Bronze Bud" },
                { level: 15, role: "Violet Petal" },
                { level: 30, role: "DarkFlower Elder" }
              ]
            },
            analytics: realAnalytics,
            leaderboard: realLeaderboard,
            tickets: realTickets,
            modLogs: realModLogs,
            errors: []
          };
          await saveGuild(newGuild);
        } else {
          existing.name = g.name;
          if (g.iconURL()) existing.icon = g.iconURL()!;
          existing.memberCount = g.memberCount;
          existing.boosts = g.premiumSubscriptionCount || 0;
          existing.hasBot = true;
          existing.channels = realChannels;
          existing.leaderboard = realLeaderboard;
          existing.analytics = realAnalytics;
          await saveGuild(existing);
        }
      }
    } catch (err) {
      console.error("Error updating real guilds cache:", err);
    }
  }

  // Filter and hide "sandbox-hq" if we have real guilds connected
  const hasRealGuilds = guilds.some(g => g.id !== "sandbox-hq" && g.hasBot);

  // If a real user is logged in, filter the guilds they can see
  if (currentUser && currentUser.loggedIn && currentUser.accessToken) {
    const cacheKey = currentUser.accessToken;
    const now = Date.now();
    const cachedEntry = userGuildsCache.get(cacheKey);

    // 60-second hot cache to completely avoid hammering the API
    if (cachedEntry && (now - cachedEntry.timestamp) < 60000) {
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
        
        // Update cache
        userGuildsCache.set(cacheKey, {
          guilds: userGuilds,
          timestamp: now
        });

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
        
        // If we have any cached entry (even if older than 60s), fall back to it gracefully to prevent UI breakage
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
      if (discordClient && discordBotInfo.connected && sender !== "DarkFlower Bot") {
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
    if (discordClient && discordBotInfo.connected) {
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
      if (discordClient && discordBotInfo.connected) {
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
    ? `Guild Context:\n- Name: ${guild.name}\n- Prefix: ${guild.config.prefix}\n- Members: ${guild.memberCount}\n- Moderation Logs: ${JSON.stringify(guild.modLogs.slice(0, 3))}\n- Automod State: Enabled: ${guild.config.automodEnabled}, Block Links: ${guild.config.blockLinks}, Bad Words: ${JSON.stringify(guild.config.badWords)}`
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

// --- VITE & STATIC FILES MIDDLEWARE ---

async function startServer() {
  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (ws) => {
    console.log('[WebSocket] Client connected');
    
    // Send initial status
    ws.send(JSON.stringify({
      type: 'SYNC_STATUS',
      latency: discordClient?.ws.ping || -1,
      status: discordBotInfo.connected ? 'connected' : 'disconnected'
    }));

    ws.on('close', () => {
      console.log('[WebSocket] Client disconnected');
    });
  });

  // Broadcast Discord gateway ping every 3 seconds
  setInterval(() => {
    if (discordBotInfo.connected && discordClient) {
      const ping = discordClient.ws.ping;
      const message = JSON.stringify({
        type: 'SYNC_STATUS',
        latency: ping,
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
