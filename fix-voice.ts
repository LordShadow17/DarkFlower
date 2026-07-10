import { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, entersState, VoiceConnectionStatus, StreamType, generateDependencyReport, NoSubscriberBehavior, getVoiceConnection } from "@discordjs/voice";

const test = `
              const networkStateChangeHandler = (oldNetworkState: any, newNetworkState: any) => {
                const newUdp = Reflect.get(newNetworkState, 'udp');
                clearInterval(newUdp?.keepAliveInterval);
              }
              
              connection.on('stateChange', (oldState, newState) => {
                const oldNetworking = Reflect.get(oldState, 'networking');
                const newNetworking = Reflect.get(newState, 'networking');
                oldNetworking?.off('stateChange', networkStateChangeHandler);
                newNetworking?.on('stateChange', networkStateChangeHandler);
                console.log(\`Connection transitioned from \${oldState.status} to \${newState.status}\`);
              });

              // Apply to initial networking state
              const initialNetworking = Reflect.get(connection.state, 'networking');
              if (initialNetworking) {
                initialNetworking.on('stateChange', networkStateChangeHandler);
              }
`;
