import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { getGuildConfig } from '../config.js';
import { validateModeration } from '../utils/moderation.js';
import { sendModLog } from '../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('kick')
  .setDescription('Kick a member from the server.')
  .addUserOption((opt) => opt.setName('user').setDescription('The member to kick').setRequired(true))
  .addStringOption((opt) => opt.setName('reason').setDescription('Reason for the kick').setRequired(true));

export async function execute(interaction) {
  const targetUser = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason');
  const config = getGuildConfig(interaction.guild.id);

  const { error, target } = await validateModeration({
    interaction,
    targetUser,
    actionName: 'kick',
    staffRoleIds: config.kickStaffRoleIds,
    requiredPermission: PermissionFlagsBits.KickMembers,
  });

  if (error) {
    await interaction.reply({ content: error, ephemeral: true });
    return;
  }

  try {
    await target.kick(reason);
    await interaction.reply({ content: `✅ Successfully kicked ${targetUser}.` });

    await sendModLog(interaction.guild, {
      logChannelId: config.logChannelId,
      title: '🔨 Member Kick',
      color: 0xE67E22,
      targetUser,
      moderatorUser: interaction.user,
      reason,
    });
  } catch (err) {
    console.error('[KICK ERROR]', err.message);
    await interaction.reply({ content: '❌ Something went wrong while trying to kick that member.', ephemeral: true });
  }
}
