import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from 'discord.js';

const AUTHORIZED_USER_ID = '1505729763296411891';

export const data = new SlashCommandBuilder()
  .setName('remove-categories')
  .setDescription('Delete a category channel and all channels inside it. Server owner only.')
  .addChannelOption((opt) =>
    opt
      .setName('category')
      .setDescription('The category channel to delete')
      .setRequired(true)
      .addChannelTypes(ChannelType.GuildCategory),
  );

/**
 * Build the confirmation buttons for category deletion.
 */
function buildConfirmRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('remove-categories:confirm').setLabel('Confirm').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('remove-categories:cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
  );
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

export async function execute(interaction) {
  const { guild, user } = interaction;

  // Owner-only — server owner or authorized user (NOT the Administrator permission)
  if (user.id !== guild.ownerId && user.id !== AUTHORIZED_USER_ID) {
    await interaction.reply({ content: '❌ Only the server owner can use this command.', ephemeral: true });
    return;
  }

  // Bot must have Manage Channels
  if (!guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
    await interaction.reply({ content: '❌ I need the **Manage Channels** permission to use this command.', ephemeral: true });
    return;
  }

  const selectedChannel = interaction.options.getChannel('category');

  // Validate that the selected channel is a category
  if (selectedChannel.type !== ChannelType.GuildCategory) {
    await interaction.reply({ content: '❌ Please select a category channel.', ephemeral: true });
    return;
  }

  // Fetch the category fresh in case it was deleted while the menu was open
  let category;
  try {
    category = await guild.channels.fetch(selectedChannel.id);
    if (!category) throw new Error('Category not found');
  } catch {
    await interaction.reply({ content: '❌ That category no longer exists.', ephemeral: true });
    return;
  }

  if (category.type !== ChannelType.GuildCategory) {
    await interaction.reply({ content: '❌ Please select a category channel.', ephemeral: true });
    return;
  }

  // Get all channels whose parentId belongs to this category
  const childChannels = guild.channels.cache.filter(
    (ch) => ch.parentId === category.id,
  );

  // Build the confirmation embed
  const channelList = childChannels.size > 0
    ? childChannels.map((ch) => `• ${ch}`).slice(0, 25).join('\n')
    : 'No channels inside this category.';

  const confirmEmbed = new EmbedBuilder()
    .setTitle('⚠️ Remove Category')
    .setColor(0xE74C3C)
    .addFields(
      { name: 'Category', value: `${category}` },
      { name: 'Channels', value: channelList },
    )
    .setFooter({ text: 'This will permanently delete the category and all channels inside it.' });

  await interaction.reply({
    content: '',
    embeds: [confirmEmbed],
    components: [buildConfirmRow()],
    ephemeral: true,
  });

  // Wait for confirmation
  let confirmResponse;
  try {
    confirmResponse = await interaction.channel.awaitMessageComponent({
      componentType: ComponentType.Button,
      filter: (i) => i.customId.startsWith('remove-categories:') && i.user.id === user.id,
      time: 60_000,
    });
  } catch {
    await safeEdit(interaction, { content: '❌ Confirmation expired. Please run the command again.', embeds: [], components: [] });
    return;
  }

  if (confirmResponse.customId === 'remove-categories:cancel') {
    await confirmResponse.update({ content: '❌ Category removal cancelled.', embeds: [], components: [] });
    return;
  }

  // Confirm — proceed with deletion
  await confirmResponse.update({
    content: '⏳ Deleting category and channels... this may take a moment.',
    embeds: [],
    components: [],
  });

  // Re-fetch the category in case it was deleted while confirmation was open
  let categoryToDelete;
  try {
    categoryToDelete = await guild.channels.fetch(category.id);
    if (!categoryToDelete) throw new Error('Category not found');
  } catch {
    await interaction.editReply({ content: '❌ That category no longer exists.', embeds: [], components: [] });
    return;
  }

  // Get fresh list of child channels
  const channelsToDelete = guild.channels.cache.filter(
    (ch) => ch.parentId === categoryToDelete.id,
  );

  let deleted = 0;
  let failed = 0;

  // Delete child channels first
  for (const channel of channelsToDelete.values()) {
    try {
      await channel.delete();
      deleted++;
    } catch (err) {
      console.error(`[REMOVE-CATEGORIES ERROR] Failed to delete channel ${channel.name} (${channel.id}):`, err.message);
      failed++;
    }
  }

  // Delete the category itself
  let categoryDeleted = false;
  try {
    await categoryToDelete.delete();
    categoryDeleted = true;
  } catch (err) {
    console.error(`[REMOVE-CATEGORIES ERROR] Failed to delete category ${categoryToDelete.name} (${categoryToDelete.id}):`, err.message);
  }

  // Build the result response
  if (categoryDeleted && failed === 0) {
    const successEmbed = new EmbedBuilder()
      .setTitle('✅ Category removed.')
      .setColor(0x2ECC71)
      .addFields(
        { name: 'Category', value: `${categoryToDelete}` },
        { name: 'Channels deleted', value: String(deleted) },
      );

    await interaction.editReply({ content: '', embeds: [successEmbed], components: [] });
  } else if (categoryDeleted && failed > 0) {
    const partialEmbed = new EmbedBuilder()
      .setTitle('⚠️ Category removal partially completed.')
      .setColor(0xF39C12)
      .addFields(
        { name: 'Channels deleted', value: String(deleted) },
        { name: 'Channels failed', value: String(failed) },
        { name: 'Category', value: `${categoryToDelete}` },
      );

    await interaction.editReply({ content: '', embeds: [partialEmbed], components: [] });
  } else {
    // Category itself could not be deleted
    const failEmbed = new EmbedBuilder()
      .setTitle('❌ Category could not be deleted.')
      .setColor(0xE74C3C)
      .addFields(
        { name: 'Category', value: `${categoryToDelete}` },
        { name: 'Channels deleted', value: String(deleted) },
        { name: 'Channels failed', value: String(failed) },
      )
      .setFooter({ text: 'The category could not be deleted. You may need to remove it manually.' });

    await interaction.editReply({ content: '', embeds: [failEmbed], components: [] });
  }
}
