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

export interface Guild {
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
    invitesList?: Array<{ inviter: string; code: string; count: number; status: string; avatar: string }>;
  };
  leaderboard: Array<{ user: string; xp: number; level: number; avatar: string }>;
  tickets: Ticket[];
  modLogs: Array<{ id: string; type: string; moderator: string; user: string; reason: string; timestamp: string }>;
  errors: Array<{ id: string; code: string; message: string; module: string; severity: 'warning' | 'critical' }>;
}
