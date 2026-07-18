const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf-8');
code = code.replace(
  `    player.on('stateChange', async (oldState: any, newState: any) => {
      console.log(\`Audio player transitioned from \${oldState.status} to \${newState.status}\`);
      if (newState.status === 'idle') {
        const state = musicStates.get(guildId);
        if (state && state.loop) {
          textChannel?.send(\`🔁 **Loop active:** Replaying **\${state.currentTrackTitle}**.\`);
          await playMusicStream(guildId, state.currentQuery, voiceChannelId, textChannel, null, true);
        } else if (state && state.autoplay) {
          const related = await getRelatedTrackQuery(state.currentTrackTitle);
          textChannel?.send(\`✨ **Autoplay active:** Next up: **\${related}**.\`);
          await playMusicStream(guildId, related, voiceChannelId, textChannel, null, true);
        } else {
          textChannel?.send('Player finished or went idle.');
        }
      }
    });`,
  `    player.on('stateChange', async (oldState: any, newState: any) => {
      console.log(\`Audio player transitioned from \${oldState.status} to \${newState.status}\`);
      if (oldState.status !== 'idle' && newState.status === 'idle') {
        const state = musicStates.get(guildId);
        if (state && state.loop) {
          textChannel?.send(\`🔁 **Loop active:** Replaying **\${state.currentTrackTitle}**.\`);
          await playMusicStream(guildId, state.currentQuery, voiceChannelId, textChannel, null, true);
        } else if (state && state.autoplay) {
          const related = await getRelatedTrackQuery(state.currentTrackTitle);
          textChannel?.send(\`✨ **Autoplay active:** Next up: **\${related}**.\`);
          await playMusicStream(guildId, related, voiceChannelId, textChannel, null, true);
        } else {
          textChannel?.send('Player finished or went idle.');
        }
      }
    });`
);
fs.writeFileSync('server.ts', code);
