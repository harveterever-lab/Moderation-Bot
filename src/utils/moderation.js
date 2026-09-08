import { PermissionFlagsBits } from 'discord.js';

/**
 * Parse a human duration string like "10m", "1h", "7d" into milliseconds.
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
  const unit = match[2];
  const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return value * multipliers[unit];
}

/**
 * Format milliseconds back into a readable string for logging.
 * @param {number} ms
 * @returns {string}
 */
export function formatDuration(ms) {
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
 * Check whether the moderator has at least one of the configured staff role IDs.
 * @param {import('discord.js').GuildMember} moderator
 * @param {string[]} staffRoleIds
 * @returns {boolean}
 */
export function hasStaffRole(moderator, staffRoleIds) {
  if (!staffRoleIds || staffRoleIds.length === 0) return false;
  return moderator.roles.cache.some((r) => staffRoleIds.includes(r.id));
}

/**
 * Check whether the bot has the given permission in the guild.
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').PermissionResolvable} permission
 * @returns {boolean}
 */
export function botHasPermission(guild, permission) {
  return guild.members.me.permissions.has(permission);
}

/**
 * Check whether the bot can moderate the target member based on role hierarchy.
 * @param {import('discord.js').GuildMember} target
 * @param {import('discord.js').Guild} guild
 * @returns {boolean}
 */
export function botCanModerate(target, guild) {
  const botMember = guild.members.me;
  if (target.id === guild.ownerId) return false;
  return botMember.roles.highest.position > target.roles.highest.position;
}

/**
 * Check whether the moderator can moderate the target based on role hierarchy.
 * @param {import('discord.js').GuildMember} moderator
 * @param {import('discord.js').GuildMember} target
 * @returns {boolean}
 */
export function moderatorCanModerate(moderator, target) {
  return moderator.roles.highest.position > target.roles.highest.position;
}

/**
 * Common validation checks for moderation commands.
 * Returns an error message string if validation fails, or null if all checks pass.
 * @param {object} params
 * @param {import('discord.js').Interaction} params.interaction
 * @param {import('discord.js').User} params.targetUser
 * @param {string} params.actionName - e.g. "kick", "mute"
 * @param {string[]} params.staffRoleIds
 * @param {import('discord.js').PermissionResolvable} params.requiredPermission
 * @param {boolean} [params.requireHierarchy] - whether to check role hierarchy (default true)
 * @returns {Promise<{error: string|null, target: import('discord.js').GuildMember|null}>}
 */
export async function validateModeration({
  interaction,
  targetUser,
  actionName,
  staffRoleIds,
  requiredPermission,
  requireHierarchy = true,
}) {
  const { guild, member: moderator } = interaction;

  // 1. Staff role configuration check
  if (!staffRoleIds || staffRoleIds.length === 0) {
    const label = actionName.charAt(0).toUpperCase() + actionName.slice(1);
    return { error: `❌ ${label} staff roles have not been configured.`, target: null };
  }

  // 2. Moderator staff role check
  if (!hasStaffRole(moderator, staffRoleIds)) {
    return { error: `❌ You do not have the required staff role to use this command.`, target: null };
  }

  // 3. Self moderation
  if (targetUser.id === moderator.id) {
    return { error: '❌ You cannot moderate yourself.', target: null };
  }

  // 4. Bot target
  if (targetUser.bot) {
    return { error: '❌ You cannot moderate a bot.', target: null };
  }

  // 5. Resolve target member
  let target;
  try {
    target = await guild.members.fetch(targetUser.id);
  } catch {
    return { error: '❌ Could not find that member in this server. They may have left.', target: null };
  }

  // 6. Server owner
  if (target.id === guild.ownerId) {
    return { error: '❌ You cannot moderate the server owner.', target: null };
  }

  // 7. Bot permission check
  if (!botHasPermission(guild, requiredPermission)) {
    return { error: "❌ I don't have permission to perform this action.", target: null };
  }

  // 8. Role hierarchy check
  if (requireHierarchy) {
    if (!moderatorCanModerate(moderator, target)) {
      return { error: '❌ You cannot moderate someone with an equal or higher role than you.', target: null };
    }
    if (!botCanModerate(target, guild)) {
      return { error: '❌ I cannot moderate this member because of Discord\'s role hierarchy.', target: null };
    }
  }

  return { error: null, target };
}
