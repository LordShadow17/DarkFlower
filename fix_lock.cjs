const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf-8');
code = code.replace(
  `      if (interaction.commandName === 'lock') {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageChannels as any)) return interaction.reply({ content: 'You do not have the required permissions to lock channels.', ephemeral: true });
        const channel = (interaction.options.getChannel('channel') || interaction.channel) as any;
        if (!channel || !channel.isTextBased() || !('permissionOverwrites' in channel)) {
          return interaction.reply({ content: 'Can only lock text channels.', ephemeral: true });
        }
        await interaction.deferReply();
        try {
          await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {`,
  `      if (interaction.commandName === 'lock') {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageChannels as any)) return interaction.reply({ content: 'You do not have the required permissions to lock channels.', ephemeral: true });
        const channelOpt = (interaction.options.getChannel('channel') || interaction.channel) as any;
        const channel = interaction.guild?.channels.cache.get(channelOpt?.id) || channelOpt;
        if (!channel || !channel.isTextBased() || !('permissionOverwrites' in channel)) {
          return interaction.reply({ content: 'Can only lock text channels.', ephemeral: true });
        }
        await interaction.deferReply();
        try {
          await channel.permissionOverwrites.edit(interaction.guild!.roles.everyone, {`
);

code = code.replace(
  `      if (interaction.commandName === 'unlock') {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageChannels as any)) return interaction.reply({ content: 'You do not have the required permissions to unlock channels.', ephemeral: true });
        const channel = (interaction.options.getChannel('channel') || interaction.channel) as any;
        if (!channel || !channel.isTextBased() || !('permissionOverwrites' in channel)) {
          return interaction.reply({ content: 'Can only unlock text channels.', ephemeral: true });
        }
        await interaction.deferReply();
        try {
          await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {`,
  `      if (interaction.commandName === 'unlock') {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageChannels as any)) return interaction.reply({ content: 'You do not have the required permissions to unlock channels.', ephemeral: true });
        const channelOpt = (interaction.options.getChannel('channel') || interaction.channel) as any;
        const channel = interaction.guild?.channels.cache.get(channelOpt?.id) || channelOpt;
        if (!channel || !channel.isTextBased() || !('permissionOverwrites' in channel)) {
          return interaction.reply({ content: 'Can only unlock text channels.', ephemeral: true });
        }
        await interaction.deferReply();
        try {
          await channel.permissionOverwrites.edit(interaction.guild!.roles.everyone, {`
);

fs.writeFileSync('server.ts', code);
