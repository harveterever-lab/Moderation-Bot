import { EmbedBuilder, ChannelType, PermissionFlagsBits } from 'discord.js';

/**
 * Send a moderation log embed to the configured log channel.
 * Never throws — logging failures are swallowed so moderation actions are never undone.
 * @param {import('discord.js').Guild} guild
 * @param {object} params
 * @param {string|null} params.logChannelId
 * @param {string} params.title
 * @param {string} params.color
 * @param {import('discord.js').User} params.targetUser
 * @param {import('discord.js').User} params.moderatorUser
 * @param {string} params.reason
 * @param {string} [params.duration]
 */
export async function sendModLog(guild, params) {
  const { logChannelId, title, color, targetUser, moderatorUser, reason, duration } = params;

  if (!logChannelId) return;

  let channel;
  try {
    channel = await guild.channels.fetch(logChannelId);
    if (!channel || channel.type !== ChannelType.GuildText) return;

    const botPerms = channel.permissionsFor(guild.members.me);
    if (!botPerms || !botPerms.has(PermissionFlagsBits.SendMessages) || !botPerms.has(PermissionFlagsBits.EmbedLinks)) {
      return;
    }
  } catch {
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .addFields(
      { name: 'Member', value: `${targetUser} (${targetUser.id})` },
      { name: title.includes('Muted') || title.includes('Unmuted') ? 'Muted by' : title.includes('Kicked') ? 'Kicked by' : title.includes('Banned') ? 'Banned by' : title.includes('Quarantined') ? 'Quarantined by' : 'Unquarantined by', value: `${moderatorUser} (${moderatorUser.id})` },
    )
    .setTimestamp();

  if (duration) {
    embed.addFields({ name: 'Duration', value: duration });
  }

  embed.addFields({ name: 'Reason', value: reason });

  try {
    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error(`[LOG ERROR] Failed to send mod log to channel ${logChannelId}:`, err.message);
  }
}
