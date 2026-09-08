import { PermissionFlagsBits } from 'discord.js';
import { getGuildConfig, clearSetupState } from '../config.js';

const PREFIX = 'R!';

const STEPS = [
  { key: 'logChannelId', label: 'Log Channel', prompt: 'Mention the **Log Channel** (e.g. #channel) or type `skip`.', type: 'channel' },
  { key: 'quarantineRoleId', label: 'Quarantine Role', prompt: 'Mention the **Quarantine Role** (e.g. @role) or type `skip`.', type: 'role' },
  { key: 'muteStaffRoleIds', label: 'Mute Staff', prompt: 'Mention the **Mute Staff** role(s) (e.g. @role @role) or type `skip`.', type: 'roles' },
  { key: 'kickStaffRoleIds', label: 'Kick Staff', prompt: 'Mention the **Kick Staff** role(s) (e.g. @role @role) or type `skip`.', type: 'roles' },
  { key: 'quarantineStaffRoleIds', label: 'Quarantine Staff', prompt: 'Mention the **Quarantine Staff** role(s) (e.g. @role @role) or type `skip`.', type: 'roles' },
  { key: 'banStaffRoleIds', label: 'Ban Staff', prompt: 'Mention the **Ban Staff** role(s) (e.g. @role @role) or type `skip`.', type: 'roles' },
];

/**
 * Build a config summary string for the current guild config.
 */
function buildConfigSummary(config) {
  const lines = [];

  const logChannel = config.logChannelId ? `<#${config.logChannelId}>` : 'Not set';
  lines.push(`**Log Channel:** ${logChannel}`);

  const quarantineRole = config.quarantineRoleId ? `<@&${config.quarantineRoleId}>` : 'Not set';
  lines.push(`**Quarantine Role:** ${quarantineRole}`);

  const formatRoles = (ids) => ids.length > 0 ? ids.map((id) => `<@&${id}>`).join(' ') : 'Not set';
  lines.push(`**Mute Staff:** ${formatRoles(config.muteStaffRoleIds)}`);
  lines.push(`**Kick Staff:** ${formatRoles(config.kickStaffRoleIds)}`);
  lines.push(`**Quarantine Staff:** ${formatRoles(config.quarantineStaffRoleIds)}`);
  lines.push(`**Ban Staff:** ${formatRoles(config.banStaffRoleIds)}`);

  return lines.join('\n');
}

/**
 * Handle the R!setup prefix command and its multi-step conversation.
 * @param {import('discord.js').Message} message
 */
export async function handleSetup(message) {
  if (!message.content.startsWith(PREFIX)) return;
  const args = message.content.slice(PREFIX.length).trim();
  if (!args.toLowerCase().startsWith('setup')) return;
  if (args.toLowerCase() !== 'setup' && !args.toLowerCase().startsWith('setup ')) return;

  // Admin-only
  if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
    await message.reply('❌ You need Administrator permission to use this command.');
    return;
  }

  const config = getGuildConfig(message.guild.id);

  // Show current config
  const summary = buildConfigSummary(config);
  await message.reply({
    content: `**🔧 Moderation Bot Setup**\n\nCurrent configuration:\n${summary}\n\nLet's configure each setting. You can type \`skip\` to keep the current value, or \`cancel\` to abort.`,
  });

  // Start interactive setup
  config.setupStep = 0;
  config.setupData = {};

  await message.channel.send(`**Step 1/${STEPS.length}:** ${STEPS[0].prompt}`);
}

/**
 * Handle messages during an active setup conversation.
 * @param {import('discord.js').Message} message
 */
export async function handleSetupResponse(message) {
  const config = getGuildConfig(message.guild.id);
  if (config.setupStep === null) return;

  // Only admins can respond during setup
  if (message.author.id !== message.guild.ownerId && !message.member.permissions.has(PermissionFlagsBits.Administrator)) return;

  const input = message.content.trim();

  if (input.toLowerCase() === 'cancel') {
    clearSetupState(message.guild.id);
    await message.reply('❌ Setup cancelled. No changes were made.');
    return;
  }

  const stepIndex = config.setupStep;
  const step = STEPS[stepIndex];

  let value;

  if (input.toLowerCase() === 'skip') {
    value = null;
  } else if (step.type === 'channel') {
    const channelMention = message.mentions.channels.first();
    if (!channelMention) {
      await message.reply('❌ Please mention a valid channel (e.g. #channel), or type `skip`.');
      return;
    }
    value = channelMention.id;
  } else if (step.type === 'role') {
    const roleMention = message.mentions.roles.first();
    if (!roleMention) {
      await message.reply('❌ Please mention a valid role (e.g. @role), or type `skip`.');
      return;
    }
    value = roleMention.id;
  } else if (step.type === 'roles') {
    const roleMentions = message.mentions.roles;
    if (roleMentions.size === 0) {
      await message.reply('❌ Please mention at least one valid role (e.g. @role @role), or type `skip`.');
      return;
    }
    value = roleMentions.map((r) => r.id);
  }

  // Apply the value (or keep existing on skip)
  if (value !== null) {
    config[step.key] = value;
  }

  config.setupStep++;

  if (config.setupStep >= STEPS.length) {
    clearSetupState(message.guild.id);
    const finalSummary = buildConfigSummary(config);
    await message.reply(`✅ Setup complete!\n\n**Final configuration:**\n${finalSummary}`);
    return;
  }

  const nextStep = STEPS[config.setupStep];
  await message.channel.send(`**Step ${config.setupStep + 1}/${STEPS.length}:** ${nextStep.prompt}`);
}
