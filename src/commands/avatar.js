import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('avatar')
  .setDescription('Show a user\'s avatar in high quality.')
  .addUserOption((opt) =>
    opt.setName('user').setDescription('The user whose avatar to show (defaults to you)').setRequired(false),
  );

/**
 * Get the highest-quality avatar URL for a user.
 * Uses displayAvatarURL with size 4096 and dynamic format.
 * @param {import('discord.js').User} user
 * @returns {string}
 */
function getAvatarUrl(user) {
  return user.displayAvatarURL({ size: 4096, dynamic: true });
}

export async function execute(interaction) {
  try {
    const targetUser = interaction.options.getUser('user') || interaction.user;

    // Fetch the full user object to ensure we have up-to-date avatar data
    let user = targetUser;
    try {
      user = await interaction.client.users.fetch(targetUser.id, { force: true });
    } catch {
      // Fall back to the option user if the fetch fails
      user = targetUser;
    }

    const avatarUrl = getAvatarUrl(user);

    const embed = new EmbedBuilder()
      .setTitle(`${user.username}'s Avatar`)
      .setImage(avatarUrl)
      .setColor(0x5865f2)
      .setFooter({ text: `User ID: ${user.id}` });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Open Full Size')
        .setStyle(ButtonStyle.Link)
        .setURL(avatarUrl),
    );

    await interaction.reply({ embeds: [embed], components: [row] });
  } catch (err) {
    console.error('[AVATAR ERROR]', err.message);
    const errorMsg = interaction.replied || interaction.deferred
      ? interaction.followUp.bind(interaction)
      : interaction.reply.bind(interaction);
    await errorMsg({ content: '❌ Something went wrong while fetching the avatar.', ephemeral: true }).catch(() => {});
  }
}
