import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { getGuildConfig, clearTicketSetupState } from '../config.js';
import { isDatabaseConnected } from '../db/database.js';
import { TicketPanel } from '../db/models/TicketPanel.js';
import {
  buildPanelEmbed,
  buildPanelButtons,
  resolveStyle,
  isValidColor,
  isValidEmoji,
} from '../utils/ticketHelpers.js';

const PREFIX = 'R!';
const AUTHORIZED_USER_ID = '1505729763296411891';
const SETUP_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Steps for the ticket panel setup conversation.
 * Each step has a key, label, prompt, and optional validate function.
 */
const STEPS = [
  { key: 'title', label: 'Panel Title', prompt: 'Enter the **panel title**:', type: 'text' },
  { key: 'description', label: 'Panel Description', prompt: 'Enter the **panel description**:', type: 'text' },
  { key: 'staffRoleId', label: 'Ticket Staff Role', prompt: 'Mention the **Ticket Staff Role** (e.g. @Ticket Staff):', type: 'role' },
  { key: 'buttonCount', label: 'Number of Buttons', prompt: 'How many ticket buttons do you want? Enter a number **1–5**:', type: 'number', min: 1, max: 5 },
];

/**
 * Check if the user is allowed to run ticket setup / delete.
 */
function isAuthorized(member, userId) {
  if (userId === AUTHORIZED_USER_ID) return true;
  if (member && member.permissions && member.permissions.has('Administrator')) return true;
  return false;
}

/**
 * Handle the "R! Ticket setup" prefix command.
 * Starts the multi-step guided setup conversation.
 * @param {import('discord.js').Message} message
 */
export async function handleTicketSetup(message) {
  const content = message.content.slice(PREFIX.length).trim();
  if (!content.toLowerCase().startsWith('ticket setup')) return;

  if (!isAuthorized(message.member, message.author.id)) {
    await message.reply('❌ You do not have permission to use this command.');
    return;
  }

  if (!isDatabaseConnected()) {
    await message.reply('❌ The ticket system is temporarily unavailable. Please try again later.');
    return;
  }

  const guildId = message.guild.id;

  // Check for existing panel
  let existingPanel = null;
  try {
    existingPanel = await TicketPanel.findOne({ guildId });
  } catch (err) {
    console.error('[TICKET SETUP ERROR]', err.message);
    await message.reply('❌ The ticket system is temporarily unavailable. Please try again later.');
    return;
  }

  if (existingPanel) {
    const config = getGuildConfig(guildId);
    config.ticketSetupData = { ...(config.ticketSetupData || {}), replacing: true };

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_setup_replace').setLabel('Replace Panel').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ticket_setup_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
    );
    const embed = new EmbedBuilder()
     .setTitle('⚠️ Existing Ticket Panel Found')
      .setDescription('A ticket panel already exists in this server. Do you want to replace it?\n\n**Existing ticket channels and records will be preserved.**')
      .setColor(0xf39c12);

    const confirmMsg = await message.reply({ embeds: [embed], components: [row] });

    const filter = (i) => i.user.id === message.author.id && (i.customId === 'ticket_setup_replace' || i.customId === 'ticket_setup_cancel');
    try {
      const interaction = await confirmMsg.awaitMessageComponent({ filter, time: SETUP_TIMEOUT_MS });
      if (interaction.customId === 'ticket_setup_cancel') {
        clearTicketSetupState(guildId);
        await interaction.update({ content: '❌ Setup cancelled.', embeds: [], components: [] });
        return;
      }
      await interaction.deferUpdate();
    } catch {
      clearTicketSetupState(guildId);
      await confirmMsg.edit({ content: '❌ Setup timed out.', embeds: [], components: [] }).catch(() => {});
      return;
    }
  }

  // Start the setup conversation
  const config = getGuildConfig(guildId);
  config.ticketSetupStep = 0;
  config.ticketSetupData = {
    buttons: [],
    insideColor: '#2b2d31',
    closeButtonName: 'Close Ticket',
    closeButtonEmoji: '',
    ...(config.ticketSetupData || {}),
  };

  await message.channel.send(`🎟️ **Ticket Setup — Step 1/${STEPS.length}: ${STEPS[0].label}**\n${STEPS[0].prompt}`);
}

/**
 * Handle messages during an active ticket setup conversation.
 * @param {import('discord.js').Message} message
 */
export async function handleTicketSetupResponse(message) {
  const config = getGuildConfig(message.guild.id);
  if (config.ticketSetupStep === null) return;

  if (message.author.id !== message.author.id) return;

  const input = message.content.trim();

  if (input.toLowerCase() === 'cancel') {
    clearTicketSetupState(message.guild.id);
    await message.reply('❌ Setup cancelled. No changes were made.');
    return;
  }

  const stepIndex = config.ticketSetupStep;
  const data = config.ticketSetupData;

  // Main STEPS (0–3)
  if (stepIndex < STEPS.length) {
    const step = STEPS[stepIndex];

    if (step.type === 'text') {
      data[step.key] = input;
    } else if (step.type === 'role') {
      const roleMention = message.mentions.roles.first();
      if (!roleMention) {
        await message.reply('❌ Please mention a valid role (e.g. @role), or type `cancel`.');
        return;
      }
      const role = message.guild.roles.cache.get(roleMention.id);
      if (!role) {
        await message.reply('❌ That role does not exist.');
        return;
      }
      data[step.key] = roleMention.id;
    } else if (step.type === 'number') {
 const n = parseInt(input, 10);
      if (!n || n < step.min || n > step.max) {
        await message.reply(`❌ Please enter a number between ${step.min} and ${step.max}.`);
        return;
      }
      data[step.key] = n;
    }

    config.ticketSetupStep++;

    if (config.ticketSetupStep < STEPS.length) {
      const nextStep = STEPS[config.ticketSetupStep];
      await message.channel.send(`🎟️ **Ticket Setup — Step ${config.ticketSetupStep + 1}/${STEPS.length}: ${nextStep.label}**\n${nextStep.prompt}`);
      return;
    }

    // Move to button configuration
    data.buttonIndex = 0;
    await message.channel.send(`🎟️ **Button 1/${data.buttonCount} — Name**\nEnter the button name:`);
    return;
  }

  // Button configuration steps
  const btnIdx = data.buttonIndex;
  const btnStep = data.buttonStep || 'name';
  const currentBtn = data.buttons[btnIdx] || (data.buttons[btnIdx] = { typeId: `btn_${Date.now()}_${btnIdx}`, name: '', emoji: '', style: 'Primary', limit: 'inf' });

  if (btnStep === 'name') {
    currentBtn.name = input.slice(0, 80);
    data.buttonStep = 'emoji';
    await message.channel.send(`🎟️ **Button ${btnIdx + 1}/${data.buttonCount} — Emoji**\nEnter an emoji (or type \`none\` for no emoji):`);
    return;
  }

  if (btnStep === 'emoji') {
    if (input.toLowerCase() !== 'none') {
      if (isValidEmoji(input)) {
        currentBtn.emoji = input;
      } else {
        await message.reply('⚠️ Invalid emoji format. No emoji will be set.');
      }
    }
    data.buttonStep = 'style';
    await message.channel.send(`🎟️ **Button ${btnIdx + 1}/${data.buttonCount} — Style**\nEnter the button style: **Primary**, **Secondary**, **Success**, or **Danger**:`);
    return;
  }

  if (btnStep === 'style') {
    const validStyles = ['Primary', 'Secondary', 'Success', 'Danger'];
    if (!validStyles.includes(input)) {
      await message.reply('⚠️ Invalid style. Defaulting to **Primary**.');
    } else {
      currentBtn.style = input;
    }
    data.buttonStep = 'limit';
    await message.channel.send(`🎟️ **Button ${btnIdx + 1}/${data.buttonCount} — Limit**\nEnter the ticket limit: **inf** for unlimited, or a positive number:`);
    return;
  }

  if (btnStep === 'limit') {
    if (input.toLowerCase() === 'inf') {
      currentBtn.limit = 'inf';
    } else {
      const n = parseInt(input, 10);
      if (!n || n < 1) {
        await message.reply('⚠️ Invalid limit. Defaulting to **inf**.');
        currentBtn.limit = 'inf';
      } else {
        currentBtn.limit = String(n);
      }
    }

    data.buttonIndex++;
    delete data.buttonStep;

    if (data.buttonIndex < data.buttonCount) {
      await message.channel.send(`🎟️ **Button ${data.buttonIndex + 1}/${data.buttonCount} — Name**\nEnter the button name:`);
      return;
    }

    // Move to inside-ticket embed configuration
    data.insideStep = 'title';
    await message.channel.send('🎟️ **Inside-Ticket Embed — Title**\nEnter the inside-ticket embed title (use {user}, {username}, {type} placeholders):');
    return;
  }

  // Inside-ticket embed steps
  const insideStep = data.insideStep;

  if (insideStep === 'title') {
    data.insideTitle = input;
    data.insideStep = 'description';
    await message.channel.send('Enter the **inside-ticket embed description** (use {user}, {username}, {type} placeholders):');
    return;
  }

  if (insideStep === 'description') {
    data.insideDescription = input;
    data.insideStep = 'color';
    await message.channel.send('Enter the **inside-ticket embed color** (hex, e.g. #2b2d31):');
    return;
  }

  if (insideStep === 'color') {
    if (isValidColor(input)) {
      data.insideColor = input.startsWith('#') ? input : `#${input}`;
    } else {
      await message.reply('⚠️ Invalid color. Defaulting to #2b2d31.');
    }
    data.insideStep = 'footer';
    await message.channel.send('Enter the **inside-ticket embed footer** (or type \`none\` for no footer):');
    return;
  }

  if (insideStep === 'footer') {
    if (input.toLowerCase() !== 'none') {
      data.insideFooter = input;
    }
    data.insideStep = 'closeName';
    await message.channel.send('Enter the **Close Ticket button name** (e.g. "Close Ticket"):');
    return;
  }

  if (insideStep === 'closeName') {
    data.closeButtonName = input.slice(0, 80);
    data.insideStep = 'closeEmoji';
    await message.channel.send('Enter the **Close Ticket button emoji** (or type \`none\` for no emoji):');
    return;
  }

  if (insideStep === 'closeEmoji') {
    if (input.toLowerCase() !== 'none') {
      if (isValidEmoji(input)) {
        data.closeButtonEmoji = input;
      } else {
        await message.reply('⚠️ Invalid emoji format. No emoji will be set for the close button.');
      }
    }
    delete data.insideStep;

    // Show preview and ask for confirmation
    await showPreviewAndConfirm(message, data);
    return;
  }
}

/**
 * Show a preview of the panel and ask for confirmation before saving.
 */
async function showPreviewAndConfirm(message, data) {
  const guildId = message.guild.id;
  const config = getGuildConfig(guildId);

  const previewEmbed = new EmbedBuilder()
    .setTitle(data.title)
    .setDescription(data.description)
    .setColor(0x2b2d31)
    .setFooter({ text: 'Ticket Panel Preview' });

  const previewButtons = [];
  for (const btn of data.buttons) {
    const builder = new ButtonBuilder()
      .setCustomId(`ticket_create_preview:${btn.typeId}`)
      .setLabel(btn.name)
      .setStyle(resolveStyle(btn.style));
    if (btn.emoji && btn.emoji.trim()) builder.setEmoji(btn.emoji.trim());
    previewButtons.push(builder);
  }
  const previewRows = [];
  for (let i = 0; i < previewButtons.length; i += 5) {
    previewRows.push(new ActionRowBuilder().addComponents(...previewButtons.slice(i, i + 5)));
  }

  const confirmRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_setup_confirm').setLabel('✅ Confirm & Save').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('ticket_setup_cancel').setLabel('❌ Cancel').setStyle(ButtonStyle.Danger),
  );
  previewRows.push(confirmRow);

  const previewMsg = await message.channel.send({ content: '📋 **Preview of your ticket panel:**', embeds: [previewEmbed], components: previewRows });

  const filter = (i) => i.user.id === message.author.id && (i.customId === 'ticket_setup_confirm' || i.customId === 'ticket_setup_cancel');
  try {
    const interaction = await previewMsg.awaitMessageComponent({ filter, time: SETUP_TIMEOUT_MS });

    if (interaction.customId === 'ticket_setup_cancel') {
      clearTicketSetupState(guildId);
      await interaction.update({ content: '❌ Setup cancelled. No changes were made.', embeds: [], components: [] });
      return;
    }

    await interaction.deferUpdate();

    // Save to MongoDB and post the panel
    try {
      // Delete old panel message if replacing
      const oldPanel = await TicketPanel.findOne({ guildId });
      if (oldPanel) {
        try {
          const oldCh = await message.guild.channels.fetch(oldPanel.channelId).catch(() => null);
          if (oldCh) {
            const oldMsg = await oldCh.messages.fetch(oldPanel.messageId).catch(() => null);
            if (oldMsg) await oldMsg.delete().catch(() => {});
          }
        } catch (err) {
          console.warn('[TICKET SETUP] Could not delete old panel message:', err.message);
        }
      }

      // Post the real panel message
      const panelEmbed = buildPanelEmbed({ title: data.title, description: data.description });
      const panelRows = buildPanelButtons({ buttons: data.buttons });
      const panelMessage = await message.channel.send({ embeds: [panelEmbed], components: panelRows });

      const doc = {
        guildId,
        channelId: message.channel.id,
        messageId: panelMessage.id,
        title: data.title,
        description: data.description,
        staffRoleId: data.staffRoleId,
        insideTitle: data.insideTitle,
        insideDescription: data.insideDescription,
        insideColor: data.insideColor,
        insideFooter: data.insideFooter || '',
        closeButtonName: data.closeButtonName,
        closeButtonEmoji: data.closeButtonEmoji,
        buttons: data.buttons,
      };

      await TicketPanel.findOneAndUpdate({ guildId }, doc, { upsert: true, new: true, setDefaultsOnInsert: true });

      console.log(`[TICKET] Panel saved for guild ${guildId}`);
      clearTicketSetupState(guildId);
      await message.channel.send('✅ Ticket panel has been saved and posted!');
    } catch (err) {
      console.error('[TICKET SETUP SAVE ERROR]', err.message);
      clearTicketSetupState(guildId);
      await message.channel.send('❌ Failed to save the panel. Please try again.');
    }
  } catch {
    clearTicketSetupState(guildId);
    await previewMsg.edit({ content: '❌ Setup timed out. No changes were made.', embeds: [], components: [] }).catch(() => {});
  }
}
