import { Innertube } from 'youtubei.js';
import { Readable } from 'stream';

async function test() {
  const yt = await Innertube.create();
  console.log("Searching...");
  const search = await yt.search("lofi hip hop");
  const videoId = search.videos[1].id;
  console.log("Found:", videoId);
  try {
    const stream = await yt.download(videoId, { type: 'audio', quality: 'best', format: 'mp4' });
    const nodeStream = Readable.fromWeb(stream);
    console.log("Stream converted:", nodeStream instanceof Readable);
  } catch(e) {
    console.log(e.toString());
  }
}

test().catch(console.error);
