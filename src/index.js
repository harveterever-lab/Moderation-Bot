import { Client, GatewayIntentBits, Events, Partials } from 'discord.js';
import { getGuildConfig } from './config.js';
import { handleSetup, handleSetupResponse } from './commands/setup.js';
import { data as kickData, execute as kickExecute } from './commands/kick.js';
import { data as muteData, execute as muteExecute } from './commands/mute.js';
import { data as unmuteData, execute as unmuteExecute } from './commands/unmute.js';
import { data as quarantineData, execute as quarantineExecute } from './commands/quarantine.js';
import { data as unquarantineData, execute as unquarantineExecute } from './commands/unquarantine.js';
import { data as banData, execute as banExecute } from './commands/ban.js';
import { data as removeRolesData, execute as removeRolesExecute } from './commands/remove-roles.js';
import { data as removeEmojisData, execute as removeEmojisExecute } from './commands/remove-emojis.js';
import { data as removeCategoriesData, execute as removeCategoriesExecute } from './commands/remove-categories.js';
import { data as copyCategoryData, execute as copyCategoryExecute } from './commands/copy-category.js';
import { data as embedData, execute as embedExecute } from './commands/embed.js';
import { data as controlData, execute as controlExecute } from './commands/control.js';
import { data as giveawayData, execute as giveawayExecute } from './commands/giveaway.js';
import { data as avatarData, execute as avatarExecute } from './commands/avatar.js';
import { data as bannerData, execute as bannerExecute } from './commands/banner.js';
import { handleGiveawayPrefix } from './commands/giveaway-prefix.js';
import { handleControlButton, handleControlModal, isControlButton, isControlModal } from './components/control-panel.js';
import { handleGiveawayPreviewButton, isGiveawayPreviewButton } from './components/giveaway-preview.js';
import { registerGiveawayReactionHandlers } from './events/giveaway-reactions.js';
import { recoverGiveaways } from './utils/giveawayManager.js';
import { connectDatabase, disconnectDatabase } from './db/database.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildEmojisAndStickers,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember, Partials.Reaction],
});

const slashCommands = [
  kickData,
  muteData,
  unmuteData,
  quarantineData,
  unquarantineData,
  banData,
  removeRolesData,
  removeEmojisData,
  removeCategoriesData,
  copyCategoryData,
  embedData,
  controlData,
  giveawayData,
  avatarData,
  bannerData,
];

const commandMap = new Map();
for (const cmd of slashCommands) {
  commandMap.set(cmd.name, {
    kick: kickExecute,
    mute: muteExecute,
    unmute: unmuteExecute,
    quarantine: quarantineExecute,
    unquarantine: unquarantineExecute,
    ban: banExecute,
    'remove-roles': removeRolesExecute,
    'remove-emojis': removeEmojisExecute,
    'remove-categories': removeCategoriesExecute,
    'copy-category': copyCategoryExecute,
    embed: embedExecute,
    control: controlExecute,
    giveaway: giveawayExecute,
    avatar: avatarExecute,
    banner: bannerExecute,
  }[cmd.name]);
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`✅ Bot online as ${readyClient.user.tag}`);

  // Register slash commands globally
  try {
    await readyClient.application.commands.set(slashCommands);
    console.log('✅ Slash commands registered globally.');
  } catch (err) {
    console.error('[COMMAND REGISTER ERROR]', err.message);
  }

  // Register giveaway reaction handlers (no duplicate listeners — these are separate events)
  registerGiveawayReactionHandlers(readyClient);

  // Recover active giveaways from MongoDB and schedule their timers
  await recoverGiveaways(readyClient);
});

// Handle prefix commands (R!setup) and setup conversation responses
client.on(Events.MessageCreate, async (message) => {
  try {
    if (message.author.bot) return;
    if (!message.guild) return;

    const config = getGuildConfig(message.guild.id);

    // If a moderation setup is in progress, handle the response
    if (config.setupStep !== null) {
      await handleSetupResponse(message);
      return;
    }

    // Handle R! prefix commands
    if (message.content.startsWith('R!')) {
      // Giveaway prefix commands (end, cancel, reroll, Pick)
      const handled = await handleGiveawayPrefix(message);
      if (handled) return;

      const content = message.content.slice(2).trim().toLowerCase();

      // R!setup (existing moderation setup)
      await handleSetup(message);
    }
  } catch (err) {
    console.error('[MESSAGE ERROR]', err.message);
  }
});

// Handle slash command, button, and modal interactions
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // Slash commands
    if (interaction.isChatInputCommand()) {
      const executor = commandMap.get(interaction.commandName);
      if (!executor) return;

      // Prevent duplicate processing
      if (interaction.replied || interaction.deferred) return;

      await executor(interaction);
      return;
    }

    // Button interactions
    if (interaction.isButton()) {
      if (isControlButton(interaction.customId)) {
        await handleControlButton(interaction);
        return;
      }
      if (isGiveawayPreviewButton(interaction.customId)) {
        await handleGiveawayPreviewButton(interaction);
        return;
      }
    }

    // Modal submissions
    if (interaction.isModalSubmit()) {
      if (isControlModal(interaction.customId)) {
        await handleControlModal(interaction);
        return;
      }
    }
  } catch (err) {
    console.error('[INTERACTION ERROR]', err.message);
    try {
      if (interaction.isRepliable()) {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: '❌ Something went wrong.', ephemeral: true });
        } else {
          await interaction.reply({ content: '❌ Something went wrong.', ephemeral: true });
        }
      }
    } catch {
      // Already replied or interaction expired — nothing more we can do
    }
  }
});

// Graceful shutdown — close the database connection cleanly
process.on('SIGINT', async () => {
  await disconnectDatabase();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await disconnectDatabase();
  process.exit(0);
});

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('❌ DISCORD_TOKEN is not set in the environment. Add it to your .env file.');
  process.exit(1);
}

// Connect to MongoDB before logging in to Discord.
// If MongoDB is unavailable the bot still starts — database is optional.
await connectDatabase();

client.login(token);
