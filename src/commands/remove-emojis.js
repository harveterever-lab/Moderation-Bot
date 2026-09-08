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

const AUTHORIZED_USER_ID = '1505729763296411891';

export const data = new SlashCommandBuilder()
  .setName('remove-emojis')
  .setDescription('Delete a single server emoji or all server emojis. Server owner only.');

/**
 * Build the initial action select menu: [ Select Emoji ] [ All Emojis ].
 */
function buildActionRow() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('remove-emojis:action')
      .setPlaceholder('Select an option')
      .addOptions(
        { label: 'Select Emoji', value: 'select' },
        { label: 'All Emojis', value: 'all' },
      ),
  );
}

/**
 * Build a select menu populated with server emojis (max 25).
 * @param {import('discord.js').Guild} guild
 */
function buildEmojiSelectRow(guild) {
  const options = guild.emojis.cache
    .first(25)
    .map((emoji) => ({
      label: emoji.name.length > 100 ? emoji.name.slice(0, 97) + '...' : emoji.name,
      value: emoji.id,
    }));

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('remove-emojis:target')
      .setPlaceholder('Select Emoji')
      .addOptions(options),
  );
}

/**
 * Build the confirmation buttons for the All Emojis action.
 */
function buildConfirmRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('remove-emojis:confirm').setLabel('Confirm').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('remove-emojis:cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
  );
}

export async function execute(interaction) {
  const { guild, user } = interaction;

  // Owner-only — server owner or authorized user (NOT the Administrator permission)
  if (user.id !== guild.ownerId && user.id !== AUTHORIZED_USER_ID) {
    await interaction.reply({ content: '❌ Only the server owner can use this command.', ephemeral: true });
    return;
  }

  // Bot must have Manage Emojis and Stickers
  if (!guild.members.me.permissions.has(PermissionFlagsBits.ManageEmojisAndStickers)) {
    await interaction.reply({ content: '❌ I need the **Manage Emojis and Stickers** permission to use this command.', ephemeral: true });
    return;
  }

  if (guild.emojis.cache.size === 0) {
    await interaction.reply({ content: '❌ This server has no custom emojis.', ephemeral: true });
    return;
  }

  await interaction.reply({
    content: '**🗑️ Emoji Removal**\nChoose whether to delete a single emoji or all server emojis.',
    components: [buildActionRow()],
    ephemeral: true,
  });

  // Step 1 — wait for action choice
  let actionResponse;
  try {
    actionResponse = await interaction.channel.awaitMessageComponent({
      componentType: ComponentType.StringSelect,
      filter: (i) => i.customId === 'remove-emojis:action' && i.user.id === user.id,
      time: 60_000,
    });
  } catch {
    await safeEdit(interaction, { content: '❌ This menu has expired. Please run the command again.', components: [] });
    return;
  }

  const action = actionResponse.values[0];

  if (action === 'select') {
    // ---- Single emoji deletion ----
    if (guild.emojis.cache.size === 0) {
      await safeEdit(interaction, { content: '❌ This server has no custom emojis.', components: [] });
      return;
    }

    await actionResponse.update({
      content: '**🗑️ Select an Emoji to Delete**\nChoose an emoji from the menu below.',
      components: [buildEmojiSelectRow(guild)],
    });

    let emojiResponse;
    try {
      emojiResponse = await interaction.channel.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        filter: (i) => i.customId === 'remove-emojis:target' && i.user.id === user.id,
        time: 60_000,
      });
    } catch {
      await safeEdit(interaction, { content: '❌ This menu has expired. Please run the command again.', components: [] });
      return;
    }

    const emojiId = emojiResponse.values[0];
    const emoji = guild.emojis.cache.get(emojiId);

    if (!emoji) {
      await emojiResponse.update({ content: '❌ That emoji no longer exists.', components: [] });
      return;
    }

    try {
      await emoji.delete();
      await emojiResponse.update({ content: `✅ Successfully deleted the emoji **:${emoji.name}:**.`, components: [] });
    } catch (err) {
      console.error('[REMOVE-EMOJIS ERROR]', err.message);
      await emojiResponse.update({ content: `❌ Failed to delete **:${emoji.name}:**. ${err.message}`, components: [] });
    }

    return;
  }

  // ---- All Emojis deletion ----
  if (guild.emojis.cache.size === 0) {
    await actionResponse.update({ content: '❌ This server has no custom emojis.', components: [] });
    return;
  }

  const confirmEmbed = new EmbedBuilder()
    .setTitle('⚠️ Are you sure?')
    .setDescription(`This will permanently delete all **${guild.emojis.cache.size}** server emojis.`)
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
      filter: (i) => i.customId.startsWith('remove-emojis:') && i.user.id === user.id,
      time: 60_000,
    });
  } catch {
    await safeEdit(interaction, { content: '❌ Confirmation expired. Please run the command again.', embeds: [], components: [] });
    return;
  }

  if (confirmResponse.customId === 'remove-emojis:cancel') {
    await confirmResponse.update({ content: '❌ Emoji removal cancelled.', embeds: [], components: [] });
    return;
  }

  // Confirm — proceed with deletion
  await confirmResponse.update({
    content: '⏳ Deleting emojis... this may take a moment.',
    embeds: [],
    components: [],
  });

  let removed = 0;
  let failed = 0;

  for (const emoji of guild.emojis.cache.values()) {
    try {
      await emoji.delete();
      removed++;
    } catch (err) {
      console.error(`[REMOVE-EMOJIS ERROR] Failed to delete emoji ${emoji.name} (${emoji.id}):`, err.message);
      failed++;
    }
  }

  const resultEmbed = new EmbedBuilder()
    .setTitle('✅ Emoji removal completed.')
    .setColor(0x2ECC71)
    .addFields(
      { name: 'Removed', value: String(removed), inline: true },
      { name: 'Failed', value: String(failed), inline: true },
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
