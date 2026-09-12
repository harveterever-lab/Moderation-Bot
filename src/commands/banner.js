import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('banner')
  .setDescription("Show a user\'s profile banner in high quality.")
  .addUserOption((opt) =>
    opt.setName('user').setDescription('The user whose banner to show (defaults to you)').setRequired(false),
  );

/**
 * Get the highest-quality banner URL for a user.
 * Uses bannerURL with size 4096 and dynamic format.
 * @param {import('discord.js').User} user
 * @returns {string|null}
 */
function getBannerUrl(user) {
  if (!user.banner) return null;
  return user.bannerURL({ size: 4096, dynamic: true });
}

export async function execute(interaction) {
  try {
    const targetUser = interaction.options.getUser('user') || interaction.user;

    // Fetch the full user object with force: true to get banner data
    // The user option from interaction may not include banner info
    let user;
    try {
      user = await interaction.client.users.fetch(targetUser.id, { force: true });
    } catch (err) {
      console.error('[BANNER ERROR] Failed to fetch user:', err.message);
      await interaction.reply({ content: '❌ Could not fetch that user\'s profile data. Please try again later.', ephemeral: true });
      return;
    }

    const bannerUrl = getBannerUrl(user);

    if (!bannerUrl) {
      const name = user.username;
      const isSelf = user.id === interaction.user.id;
      const msg = isSelf
        ? `❌ You don't have a profile banner. You can set one in **User Settings > Profile > Banner**.`
        : `❌ **${name}** doesn't have a profile banner.`;
      await interaction.reply({ content: msg, ephemeral: true });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`${user.username}'s Banner`)
      .setImage(bannerUrl)
      .setColor(0x5865f2)
      .setFooter({ text: `User ID: ${user.id}` });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Open Full Size')
        .setStyle(ButtonStyle.Link)
        .setURL(bannerUrl),
    );

    await interaction.reply({ embeds: [embed], components: [row] });
  } catch (err) {
    console.error('[BANNER ERROR]', err.message);
    const errorMsg = interaction.replied || interaction.deferred
      ? interaction.followUp.bind(interaction)
      : interaction.reply.bind(interaction);
    await errorMsg({ content: '❌ Something went wrong while fetching the banner.', ephemeral: true }).catch(() => {});
  }
}
