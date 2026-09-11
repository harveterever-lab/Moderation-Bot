import { Client, GatewayIntentBits, Events, Partials } from 'discord.js';
import { getGuildConfig } from './config.js';
import { handleSetup, handleSetupResponse } from './commands/setup.js';
import { handleTicketSetup, handleTicketSetupResponse } from './commands/ticket-setup.js';
import { handleTicketDeletePanel } from './commands/ticket-delete.js';
import { handleTicketCreate } from './components/ticket-create.js';
import { handleTicketClose } from './components/ticket-close.js';
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
import { connectDatabase, disconnectDatabase } from './db/database.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildEmojisAndStickers,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember],
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
});

// Handle prefix commands (R!setup, R! Ticket setup, R! delete panel) and setup conversation responses
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

    // If a ticket setup is in progress, handle the response
    if (config.ticketSetupStep !== null) {
      await handleTicketSetupResponse(message);
      return;
    }

    // Handle R! prefix commands
    if (message.content.startsWith('R!')) {
      const content = message.content.slice(2).trim().toLowerCase();

      // R! Ticket setup
      if (content.startsWith('ticket setup')) {
        await handleTicketSetup(message);
        return;
      }

      // R! delete panel
      if (content.startsWith('delete panel')) {
        await handleTicketDeletePanel(message);
        return;
      }

      // R!setup (existing moderation setup)
      await handleSetup(message);
    }
  } catch (err) {
    console.error('[MESSAGE ERROR]', err.message);
  }
});

// Handle slash command interactions and button interactions
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
      const customId = interaction.customId;

      // Ticket panel create button: ticket_create:<typeId>
      if (customId.startsWith('ticket_create:')) {
        await handleTicketCreate(interaction);
        return;
      }

      // Preview buttons — do nothing (panel not saved yet)
      if (customId.startsWith('ticket_create_preview:')) {
        await interaction.reply({ content: 'This is a preview button. The panel is not active yet.', ephemeral: true });
        return;
      }

      // Ticket close button
      if (customId === 'ticket_close') {
        await handleTicketClose(interaction);
        return;
      }

      // Ticket setup confirm/cancel (button clicks during setup)
      if (customId === 'ticket_setup_confirm' || customId === 'ticket_setup_cancel') {
        // These are handled by awaitMessageComponent in ticket-setup.js
        return;
      }

      // Ticket delete confirm/cancel (button clicks during delete)
      if (customId === 'ticket_delete_confirm' || customId === 'ticket_delete_cancel') {
        // These are handled by awaitMessageComponent in ticket-delete.js
        return;
      }

      // Ticket setup replace (handled by awaitMessageComponent in ticket-setup.js)
      if (customId === 'ticket_setup_replace') {
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
