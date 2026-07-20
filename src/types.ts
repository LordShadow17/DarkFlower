export interface UserSession {
  id: string;
  username: string;
  avatar: string;
  email: string;
  loggedIn: boolean;
}

export interface Ticket {
  id: string;
  user: string;
  status: 'open' | 'closed';
  messages: Array<{ sender: string; text: string; timestamp: string }>;
  channelName: string;
}

export interface GuildConfig {
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

export interface ButtonRoleMapping {
  id: string;
  label: string;
  role: string;
  style: 'success' | 'primary' | 'danger' | 'secondary';
  emoji?: string;
}

export interface ButtonRolesMessageConfig {
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

export interface MarriageConfig {
  maxSpouses: number;
  cooldownSeconds: number;
  requireDivorceFee: boolean;
  roleRewards: Array<{ days: number; roleName: string }>;
  bannerUrl: string;
  embedColor: string;
  customWeddingText: string;
}

export interface ParentChildLink {
  parentId: string;
  parentTag: string;
  childId: string;
  childTag: string;
  timestamp: number;
}

export interface Guild {
  id: string;
  name: string;
  icon: string;
  hasBot: boolean;
  memberCount: number;
  boosts: number;
  channels: string[];
  roles?: string[];
  config: GuildConfig;
  analytics: {
    messagesToday: number;
    activeUsersToday: number;
    invitesToday: number;
    weeklyActivity: Array<{ day: string; messages: number; moderation: number; tickets: number }>;
    moderationCount: number;
    ticketsCount: number;
    invitesList?: Array<{ inviter: string; code: string; count: number; status: string; avatar: string }>;
    dailyActiveUsers?: string[];
    popularChannels?: { [channelName: string]: number };
    botCommandUsage?: { [commandName: string]: number };
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
  customBot?: {
    token?: string;
    username?: string;
    avatar?: string;
    id?: string;
    status?: 'online' | 'offline' | 'error';
    error?: string;
  };
  customBots?: CustomBotInstance[];
}

export interface CustomBotInstance {
  id: string;
  token?: string;
  username?: string;
  avatar?: string;
  status?: 'online' | 'offline' | 'error';
  error?: string;
  modules: string[];
}

declare global {
  interface Window {
    showToast?: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  }
}
