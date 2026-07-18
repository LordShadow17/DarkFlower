const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf-8');
code = code.replace(
  `        if (interaction.commandName === 'skip') {
          player.stop();
          return interaction.reply('⏭️ Skipped the current track.');
        }`,
  `        if (interaction.commandName === 'skip') {
          const state = musicStates.get(interaction.guildId!);
          if (state) state.loop = false;
          player.stop();
          return interaction.reply('⏭️ Skipped the current track.');
        }`
);
fs.writeFileSync('server.ts', code);
