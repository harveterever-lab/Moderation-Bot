import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { getGuildConfig } from '../config.js';
import { validateModeration } from '../utils/moderation.js';
import { sendModLog } from '../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('unquarantine')
  .setDescription('Remove the quarantine role from a member.')
  .addUserOption((opt) => opt.setName('user').setDescription('The member to unquarantine').setRequired(true))
  .addStringOption((opt) => opt.setName('reason').setDescription('Reason for the unquarantine').setRequired(true));

export async function execute(interaction) {
  const targetUser = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason');
  const config = getGuildConfig(interaction.guild.id);

  // Check quarantine role is configured
  if (!config.quarantineRoleId) {
    await interaction.reply({ content: '❌ A Quarantine Role has not been configured.', ephemeral: true });
    return;
  }

  // Check the quarantine role still exists
  const quarantineRole = interaction.guild.roles.cache.get(config.quarantineRoleId);
  if (!quarantineRole) {
    await interaction.reply({ content: '❌ The configured Quarantine Role no longer exists. Please run R!setup again.', ephemeral: true });
    return;
  }

  const { error, target } = await validateModeration({
    interaction,
    targetUser,
    actionName: 'quarantine',
    staffRoleIds: config.quarantineStaffRoleIds,
    requiredPermission: PermissionFlagsBits.ManageRoles,
  });

  if (error) {
    await interaction.reply({ content: error, ephemeral: true });
    return;
  }

  // Check if not quarantined
  if (!target.roles.cache.has(config.quarantineRoleId)) {
    await interaction.reply({ content: '❌ This member is not quarantined.', ephemeral: true });
    return;
  }

  // Check bot can manage the quarantine role (hierarchy)
  if (interaction.guild.members.me.roles.highest.position <= quarantineRole.position) {
    await interaction.reply({ content: '❌ I cannot manage the configured Quarantine Role because of Discord\'s role hierarchy.', ephemeral: true });
    return;
  }

  try {
    await target.roles.remove(quarantineRole, reason);
    await interaction.reply({ content: `✅ Successfully unquarantined ${targetUser}.` });

    await sendModLog(interaction.guild, {
      logChannelId: config.logChannelId,
      title: '🔓 Member Unquarantined',
      color: 0x1ABC9C,
      targetUser,
      moderatorUser: interaction.user,
      reason,
    });
  } catch (err) {
    console.error('[UNQUARANTINE ERROR]', err.message);
    await interaction.reply({ content: '❌ Something went wrong while trying to unquarantine that member.', ephemeral: true });
  }
}
