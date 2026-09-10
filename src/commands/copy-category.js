import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  OverwriteType,
} from 'discord.js';

const AUTHORIZED_USER_ID = '1505729763296411891';

export const data = new SlashCommandBuilder()
  .setName('copy-category')
  .setDescription('Copy a category channel with the same name and permissions. Server owner only.')
  .addChannelOption((opt) =>
    opt
      .setName('category')
      .setDescription('The category channel to copy')
      .setRequired(true)
      .addChannelTypes(ChannelType.GuildCategory),
  );

/**
 * Convert a Discord.js permission overwrite into the format accepted by
 * GuildChannelManager.create() / category children edit calls.
 * Returns an object usable as a PermissionOverwrites entry, or null if the
 * overwrite cannot be represented.
 * @param {import('discord.js').PermissionOverwrites} overwrite
 * @returns {{ id: string, type: number, allow: import('discord.js').PermissionFlagsBits, deny: import('discord.js').PermissionFlagsBits } | null}
 */
function convertOverwrite(overwrite) {
  const id = overwrite.id;
  if (!id) return null;

  const type = overwrite.type === OverwriteType.Member ? 1 : 0;

  return {
    id,
    type,
    allow: overwrite.allow.bitfield,
    deny: overwrite.deny.bitfield,
  };
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
    await interaction.reply({ content: '❌ Please select a category.', ephemeral: true });
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
    await interaction.reply({ content: '❌ Please select a category.', ephemeral: true });
    return;
  }

  // Convert permission overwrites from the original category
  let overwriteData;
  try {
    overwriteData = category.permissionOverwrites.cache
      .map((overwrite) => convertOverwrite(overwrite))
      .filter((o) => o !== null);
  } catch (err) {
    console.error('[COPY-CATEGORY ERROR] Failed to read permission overwrites:', err.message);
    await interaction.reply({ content: '❌ Failed to read the category permissions.', ephemeral: true });
    return;
  }

  // Create the new category with the same name and permission overwrites
  let newCategory;
  try {
    newCategory = await guild.channels.create({
      name: category.name,
      type: ChannelType.GuildCategory,
      permissionOverwrites: overwriteData,
    });
  } catch (err) {
    console.error('[COPY-CATEGORY ERROR] Failed to create new category:', err.message);
    await interaction.reply({ content: '❌ Failed to create the copied category.', ephemeral: true });
    return;
  }

  await interaction.reply({
    content: `✅ Category copied.\nOriginal: ${category.name}\nCopied: ${newCategory}`,
    ephemeral: true,
  });
}
