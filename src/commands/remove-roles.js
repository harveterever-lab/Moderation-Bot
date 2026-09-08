import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('remove-roles')
  .setDescription('Delete a single server role or all removable roles. Server owner only.');

/**
 * Return roles the bot is allowed to delete (excludes @everyone, managed roles,
 * and roles at or above the bot's highest role).
 * @param {import('discord.js').Guild} guild
 * @returns {import('discord.js').Collection<string, import('discord.js').Role>}
 */
function getRemovableRoles(guild) {
  const botHighest = guild.members.me.roles.highest;
  return guild.roles.cache.filter(
    (role) =>
      role.id !== guild.id && // @everyone
      !role.managed && // integration/boost roles
      role.position < botHighest.position,
  );
}

/**
 * Build the initial action select menu: [ Select Role ] [ All Roles ].
 */
function buildActionRow() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('remove-roles:action')
      .setPlaceholder('Select an option')
      .addOptions(
        { label: 'Select Role', value: 'select' },
        { label: 'All Roles', value: 'all' },
      ),
  );
}

/**
 * Build a select menu populated with removable roles (max 25).
 * @param {import('discord.js').Guild} guild
 */
function buildRoleSelectRow(guild) {
  const removable = getRemovableRoles(guild);
  const options = removable
    .sorted((a, b) => b.position - a.position)
    .first(25)
    .map((role) => ({
      label: role.name.length > 100 ? role.name.slice(0, 97) + '...' : role.name,
      value: role.id,
    }));

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('remove-roles:target')
      .setPlaceholder('Select Role')
      .addOptions(options),
  );
}

/**
 * Build the confirmation buttons for the All Roles action.
 */
function buildConfirmRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('remove-roles:confirm').setLabel('Confirm').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('remove-roles:cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
  );
}

export async function execute(interaction) {
  const { guild, user } = interaction;

  // Owner-only — NOT the Administrator permission
  if (user.id !== guild.ownerId) {
    await interaction.reply({ content: '❌ Only the server owner can use this command.', ephemeral: true });
    return;
  }

  // Bot must have Manage Roles
  if (!guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    await interaction.reply({ content: '❌ I need the **Manage Roles** permission to use this command.', ephemeral: true });
    return;
  }

  const removable = getRemovableRoles(guild);

  if (removable.size === 0) {
    await interaction.reply({ content: '❌ There are no roles I can delete in this server.', ephemeral: true });
    return;
  }

  await interaction.reply({
    content: '**🗑️ Role Removal**\nChoose whether to delete a single role or all removable roles.',
    components: [buildActionRow()],
    ephemeral: true,
  });

  // Step 1 — wait for action choice
  let actionResponse;
  try {
    actionResponse = await interaction.channel.awaitMessageComponent({
      componentType: ComponentType.StringSelect,
      filter: (i) => i.customId === 'remove-roles:action' && i.user.id === user.id,
      time: 60_000,
    });
  } catch {
    await safeEdit(interaction, { content: '❌ This menu has expired. Please run the command again.', components: [] });
    return;
  }

  const action = actionResponse.values[0];

  if (action === 'select') {
    // ---- Single role deletion ----
    if (removable.size === 0) {
      await safeEdit(interaction, { content: '❌ There are no roles I can delete in this server.', components: [] });
      return;
    }

    await actionResponse.update({
      content: '**🗑️ Select a Role to Delete**\nChoose a role from the menu below.',
      components: [buildRoleSelectRow(guild)],
    });

    let roleResponse;
    try {
      roleResponse = await interaction.channel.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        filter: (i) => i.customId === 'remove-roles:target' && i.user.id === user.id,
        time: 60_000,
      });
    } catch {
      await safeEdit(interaction, { content: '❌ This menu has expired. Please run the command again.', components: [] });
      return;
    }

    const roleId = roleResponse.values[0];
    const role = guild.roles.cache.get(roleId);

    if (!role) {
      await roleResponse.update({ content: '❌ That role no longer exists.', components: [] });
      return;
    }

    if (role.id === guild.id) {
      await roleResponse.update({ content: '❌ You cannot delete the @everyone role.', components: [] });
      return;
    }

    if (role.managed) {
      await roleResponse.update({ content: '❌ I cannot delete that role because it is managed by an integration.', components: [] });
      return;
    }

    if (role.position >= guild.members.me.roles.highest.position) {
      await roleResponse.update({ content: "❌ I cannot delete that role because of Discord's role hierarchy.", components: [] });
      return;
    }

    try {
      await role.delete();
      await roleResponse.update({ content: `✅ Successfully deleted the role **${role.name}**.`, components: [] });
    } catch (err) {
      console.error('[REMOVE-ROLES ERROR]', err.message);
      await roleResponse.update({ content: `❌ Failed to delete **${role.name}**. ${err.message}`, components: [] });
    }

    return;
  }

  // ---- All Roles deletion ----
  const allRemovable = getRemovableRoles(guild);

  if (allRemovable.size === 0) {
    await actionResponse.update({ content: '❌ There are no roles I can delete in this server.', components: [] });
    return;
  }

  const confirmEmbed = new EmbedBuilder()
    .setTitle('⚠️ Are you sure?')
    .setDescription(`This will permanently delete all **${allRemovable.size}** removable roles.`)
    .setColor(0xE74C3C);

  await actionResponse.update({
    content: '',
    embeds: [confirmEmbed],
    components: [buildConfirmRow()],
  });

  let confirmResponse;
  try {
    confirmResponse = await interaction.channel.awaitMessageComponent({
      componentType: ComponentType.Button,
      filter: (i) => i.customId.startsWith('remove-roles:') && i.user.id === user.id,
      time: 60_000,
    });
  } catch {
    await safeEdit(interaction, { content: '❌ Confirmation expired. Please run the command again.', embeds: [], components: [] });
    return;
  }

  if (confirmResponse.customId === 'remove-roles:cancel') {
    await confirmResponse.update({ content: '❌ Role removal cancelled.', embeds: [], components: [] });
    return;
  }

  // Confirm — proceed with deletion
  await confirmResponse.update({
    content: '⏳ Deleting roles... this may take a moment.',
    embeds: [],
    components: [],
  });

  const currentRemovable = getRemovableRoles(guild);
  let removed = 0;
  let failed = 0;
  let skipped = 0;

  for (const role of currentRemovable.values()) {
    // Re-check each role in case things changed during iteration
    if (role.id === guild.id) { skipped++; continue; }
    if (role.managed) { skipped++; continue; }
    if (role.position >= guild.members.me.roles.highest.position) { skipped++; continue; }

    try {
      await role.delete();
      removed++;
    } catch (err) {
      console.error(`[REMOVE-ROLES ERROR] Failed to delete role ${role.name} (${role.id}):`, err.message);
      failed++;
    }
  }

  const resultEmbed = new EmbedBuilder()
    .setTitle('✅ Role removal completed.')
    .setColor(0x2ECC71)
    .addFields(
      { name: 'Removed', value: String(removed), inline: true },
      { name: 'Failed', value: String(failed), inline: true },
      { name: 'Skipped', value: String(skipped), inline: true },
    );

  await interaction.editReply({ content: '', embeds: [resultEmbed], components: [] });
}

/**
 * Safely edit the original reply, swallowing errors if the interaction expired.
 */
async function safeEdit(interaction, payload) {
  try {
    await interaction.editReply(payload);
  } catch {
    // Interaction expired — nothing we can do
  }
}
