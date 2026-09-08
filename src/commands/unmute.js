import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { getGuildConfig } from '../config.js';
import { validateModeration } from '../utils/moderation.js';
import { sendModLog } from '../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('unmute')
  .setDescription('Remove a member\'s timeout (unmute).')
  .addUserOption((opt) => opt.setName('user').setDescription('The member to unmute').setRequired(true))
  .addStringOption((opt) => opt.setName('reason').setDescription('Reason for the unmute').setRequired(true));

export async function execute(interaction) {
  const targetUser = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason');
  const config = getGuildConfig(interaction.guild.id);

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

  if (!target.isCommunicationDisabled()) {
    await interaction.reply({ content: '❌ This member is not muted.', ephemeral: true });
    return;
  }

  try {
    await target.timeout(null, reason);
    await interaction.reply({ content: `✅ Successfully unmuted ${targetUser}.` });

    await sendModLog(interaction.guild, {
      logChannelId: config.logChannelId,
      title: '🔊 Member Unmuted',
      color: 0x2ECC71,
      targetUser,
      moderatorUser: interaction.user,
      reason,
    });
  } catch (err) {
    console.error('[UNMUTE ERROR]', err.message);
    await interaction.reply({ content: '❌ Something went wrong while trying to unmute that member.', ephemeral: true });
  }
}
