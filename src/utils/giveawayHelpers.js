import { EmbedBuilder, time, TimestampStyles } from 'discord.js';

const AUTHORIZED_USER_ID = '1505729763296411891';

export const GIVEAWAY_COLOR = 0xf1c40f;
export const GIVEAWAY_ENDED_COLOR = 0x2ecc71;
export const GIVEAWAY_CANCELLED_COLOR = 0xe74c3c;

/**
 * Parse a human duration string like "10m", "1h", "7d", "30s" into milliseconds.
 * Supports s, m, h, d. Returns null if invalid.
 * @param {string} input
 * @returns {number|null} milliseconds, or null
 */
export function parseDuration(input) {
  if (typeof input !== 'string' || input.length < 2) return null;
  const match = input.match(/^(\d+)([smhd])$/);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  if (value <= 0) return null;
  const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return value * multipliers[match[2]];
}

/**
 * Format milliseconds into a human-readable countdown string.
 * @param {number} ms
 * @returns {string}
 */
export function formatDuration(ms) {
  if (ms <= 0) return 'Ended';
  const seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (secs) parts.push(`${secs}s`);
  return parts.join(' ') || '0s';
}

/**
 * Generate a unique giveaway ID.
 * @returns {string}
 */
export function generateGiveawayId() {
  return `gw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Check if a user is the server owner or the authorized override user.
 * @param {import('discord.js').Message} message
 * @returns {boolean}
 */
export function isOwnerOrAuthorized(message) {
  return message.author.id === message.guild.ownerId || message.author.id === AUTHORIZED_USER_ID;
}

/**
 * Build the active giveaway embed.
 * @param {object} giveaway - The giveaway document
 * @param {number} participantCount - Current participant count
 * @param {import('discord.js').User} [hostUser] - The host user object for display
 * @returns {EmbedBuilder}
 */
export function buildGiveawayEmbed(giveaway, participantCount, hostUser) {
  const embed = new EmbedBuilder()
    .setTitle(`🎉 ${giveaway.prize}`)
    .setColor(GIVEAWAY_COLOR)
    .addFields(
      { name: 'Winners', value: `${giveaway.winnerCount}`, inline: true },
      { name: 'Ends', value: time(Math.floor(new Date(giveaway.endTime).getTime() / 1000), TimestampStyles.RelativeTime), inline: true },
      { name: 'Host', value: hostUser ? `${hostUser} (${hostUser.id})` : `<@${giveaway.hostId}>`, inline: true },
      { name: 'Entries', value: `${participantCount}`, inline: true },
    );

  if (giveaway.requiredRoleId) {
    embed.addFields({ name: 'Required Role', value: `<@&${giveaway.requiredRoleId}>`, inline: true });
  }

  embed.setDescription(`React with ${giveaway.reaction} to enter!`);

  if (giveaway.image) {
    embed.setImage(giveaway.image);
  }

  if (giveaway.thumbnail) {
    embed.setThumbnail(giveaway.thumbnail);
  }

  embed.setFooter({ text: `Giveaway ID: ${giveaway.giveawayId}` });
  embed.setTimestamp(new Date(giveaway.startTime));

  return embed;
}

/**
 * Build the ended giveaway embed.
 * @param {object} giveaway - The giveaway document
 * @param {import('discord.js').User[]} winners - Array of winner user objects
 * @param {import('discord.js').User} [hostUser]
 * @returns {EmbedBuilder}
 */
export function buildEndedEmbed(giveaway, winners, hostUser) {
  const embed = new EmbedBuilder()
    .setTitle(`🎉 ${giveaway.prize}`)
    .setColor(GIVEAWAY_ENDED_COLOR)
    .setDescription('This giveaway has ended.');

  const winnerText = winners.length > 0
    ? winners.map((w) => `${w} (${w.id})`).join('\n')
    : 'No valid winners could be selected.';

  embed.addFields(
    { name: 'Winners', value: winnerText },
    { name: 'Host', value: hostUser ? `${hostUser} (${hostUser.id})` : `<@${giveaway.hostId}>`, inline: true },
    { name: 'Participants', value: `${giveaway.participantIds.length}`, inline: true },
  );

  if (giveaway.image) {
    embed.setImage(giveaway.image);
  }

  if (giveaway.thumbnail) {
    embed.setThumbnail(giveaway.thumbnail);
  }

  embed.setFooter({ text: `Giveaway ID: ${giveaway.giveawayId}` });
  embed.setTimestamp(new Date(giveaway.endTime));

  return embed;
}

/**
 * Build the cancelled giveaway embed.
 * @param {object} giveaway - The giveaway document
 * @param {import('discord.js').User} [hostUser]
 * @returns {EmbedBuilder}
 */
export function buildCancelledEmbed(giveaway, hostUser) {
  const embed = new EmbedBuilder()
    .setTitle(`🎉 ${giveaway.prize}`)
    .setColor(GIVEAWAY_CANCELLED_COLOR)
    .setDescription('This giveaway has been cancelled. No winners were selected.');

  embed.addFields(
    { name: 'Host', value: hostUser ? `${hostUser} (${hostUser.id})` : `<@${giveaway.hostId}>`, inline: true },
    { name: 'Participants', value: `${giveaway.participantIds.length}`, inline: true },
  );

  if (giveaway.image) {
    embed.setImage(giveaway.image);
  }

  if (giveaway.thumbnail) {
    embed.setThumbnail(giveaway.thumbnail);
  }

  embed.setFooter({ text: `Giveaway ID: ${giveaway.giveawayId}` });
  embed.setTimestamp();

  return embed;
}

/**
 * Build the preview embed for the admin before confirming a giveaway.
 * @param {object} options - The giveaway options
 * @returns {EmbedBuilder}
 */
export function buildPreviewEmbed(options) {
  const embed = new EmbedBuilder()
    .setTitle(`🎉 ${options.prize}`)
    .setColor(GIVEAWAY_COLOR)
    .setDescription('**Giveaway Preview** — Review the details below before confirming.');

  embed.addFields(
    { name: 'Prize', value: options.prize, inline: true },
    { name: 'Winners', value: `${options.winnerCount}`, inline: true },
    { name: 'Duration', value: formatDuration(options.durationMs), inline: true },
    { name: 'Channel', value: `<#${options.channelId}>`, inline: true },
    { name: 'Reaction', value: options.reaction, inline: true },
  );

  if (options.requiredRoleId) {
    embed.addFields({ name: 'Required Role', value: `<@&${options.requiredRoleId}>`, inline: true });
  }

  if (options.image) {
    embed.setImage(options.image);
  }

  if (options.thumbnail) {
    embed.setThumbnail(options.thumbnail);
  }

  embed.setTimestamp();

  return embed;
}

/**
 * Resolve an emoji identifier from a Discord emoji string or custom emoji.
 * Handles both unicode emojis and custom emoji formats like <:name:id:>.
 * @param {string} emojiString
 * @returns {string|null} The emoji identifier for reaction purposes
 */
export function resolveEmojiIdentifier(emojiString) {
  if (!emojiString) return null;

  // Custom emoji: <:name:id:> or <a:name:id:>
  const customMatch = emojiString.match(/^<(a?):(\w+):(\d+)>$/);
  if (customMatch) {
    return customMatch[3]; // Return the ID for custom emoji reactions
  }

  // If it's a plain custom emoji ID (just numbers), return as-is
  if (/^\d+$/.test(emojiString)) {
    return emojiString;
  }

  // Unicode emoji — return as-is
  return emojiString;
}

/**
 * Get the display form of an emoji for embed text.
 * @param {string} emojiIdentifier
 * @returns {string}
 */
export function displayEmoji(emojiIdentifier) {
  return emojiIdentifier;
}

/**
 * Validate a URL.
 * @param {string} url
 * @returns {boolean}
 */
export function isValidUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Randomly select N winners from a pool of participant IDs, excluding previous winners.
 * @param {string[]} participants - All eligible participant IDs
 * @param {number} count - Number of winners to select
 * @param {string[]} [excludeIds] - IDs to exclude from selection (previous winners)
 * @returns {string[]} Selected winner IDs
 */
export function selectWinners(participants, count, excludeIds = []) {
  if (!participants || participants.length === 0 || count <= 0) return [];

  const pool = participants.filter((id) => !excludeIds.includes(id));

  // If not enough non-excluded participants, include excluded ones
  const finalPool = pool.length >= count ? pool : [...pool, ...excludeIds.filter((id) => participants.includes(id))];

  if (finalPool.length === 0) return [];

  // Fisher-Yates shuffle
  const shuffled = [...finalPool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled.slice(0, Math.min(count, shuffled.length));
}
