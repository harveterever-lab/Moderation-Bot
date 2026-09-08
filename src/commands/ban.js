import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { getGuildConfig } from '../config.js';
import { validateModeration } from '../utils/moderation.js';
import { sendModLog } from '../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('ban')
  .setDescription('Ban a member from the server.')
  .addUserOption((opt) => opt.setName('user').setDescription('The member to ban').setRequired(true))
  .addStringOption((opt) => opt.setName('reason').setDescription('Reason for the ban').setRequired(true));

export async function execute(interaction) {
  const targetUser = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason');
  const config = getGuildConfig(interaction.guild.id);

  const { error, target } = await validateModeration({
    interaction,
    targetUser,
    actionName: 'ban',
    staffRoleIds: config.banStaffRoleIds,
    requiredPermission: PermissionFlagsBits.BanMembers,
  });

  if (error) {
    await interaction.reply({ content: error, ephemeral: true });
    return;
  }

  try {
    await target.ban({ reason });
    await interaction.reply({ content: `✅ Successfully banned ${targetUser}.` });

    await sendModLog(interaction.guild, {
      logChannelId: config.logChannelId,
      title: '🔨 Member Banned',
      color: 0xE74C3C,
      targetUser,
      moderatorUser: interaction.user,
      reason,
    });
  } catch (err) {
    console.error('[BAN ERROR]', err.message);
    await interaction.reply({ content: '❌ Something went wrong while trying to ban that member.', ephemeral: true });
  }
}
