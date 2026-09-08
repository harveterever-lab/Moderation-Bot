import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { getGuildConfig } from '../config.js';
import { validateModeration, parseDuration, formatDuration } from '../utils/moderation.js';
import { sendModLog } from '../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('mute')
  .setDescription('Timeout a member (mute).')
  .addUserOption((opt) => opt.setName('user').setDescription('The member to mute').setRequired(true))
  .addStringOption((opt) => opt.setName('duration').setDescription('Duration (e.g. 10m, 1h, 7d)').setRequired(true))
  .addStringOption((opt) => opt.setName('reason').setDescription('Reason for the mute').setRequired(true));

export async function execute(interaction) {
  const targetUser = interaction.options.getUser('user');
  const durationStr = interaction.options.getString('duration');
  const reason = interaction.options.getString('reason');
  const config = getGuildConfig(interaction.guild.id);

  // Validate duration before other checks
  const durationMs = parseDuration(durationStr);
  if (!durationMs) {
    await interaction.reply({ content: '❌ Invalid duration. Use formats like `10m`, `1h`, or `7d`.', ephemeral: true });
    return;
  }

  const { error, target } = await validateModeration({
    interaction,
    targetUser,
    actionName: 'mute',
    staffRoleIds: config.muteStaffRoleIds,
    requiredPermission: PermissionFlagsBits.ModerateMembers,
  });

  if (error) {
    await interaction.reply({ content: error, ephemeral: true });
    return;
  }

  try {
    // If already muted, extend/update the timeout
    const wasMuted = target.isCommunicationDisabled();

    await target.timeout(durationMs, reason);

    const confirmMsg = wasMuted
      ? `✅ Updated mute for ${targetUser} (${formatDuration(durationMs)}).`
      : `✅ Successfully muted ${targetUser} for ${formatDuration(durationMs)}.`;

    await interaction.reply({ content: confirmMsg });

    await sendModLog(interaction.guild, {
      logChannelId: config.logChannelId,
      title: '🔇 Member Muted',
      color: 0x3498DB,
      targetUser,
      moderatorUser: interaction.user,
      reason,
      duration: formatDuration(durationMs),
    });
  } catch (err) {
    console.error('[MUTE ERROR]', err.message);
    await interaction.reply({ content: '❌ Something went wrong while trying to mute that member.', ephemeral: true });
  }
}
