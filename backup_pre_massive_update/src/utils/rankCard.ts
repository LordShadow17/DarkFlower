import { createCanvas, loadImage } from '@napi-rs/canvas';

interface RankCardData {
  username: string;
  avatarUrl: string;
  level: number;
  currentXp: number;
  neededXp: number;
  rank: number;
}

export async function drawRankCard(data: RankCardData): Promise<Buffer> {
  const width = 1000;
  const height = 500;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // 1. Draw cosmic deep space background gradient
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, '#060411'); // Super dark indigo
  bgGrad.addColorStop(0.4, '#10092c'); // Deep twilight purple
  bgGrad.addColorStop(0.8, '#1b0d3a'); // Nebulous violet
  bgGrad.addColorStop(1, '#020108'); // Dark space
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // 2. Draw glowing nebula clouds (soft radial circles)
  const drawNebula = (x: number, y: number, r: number, color: string) => {
    try {
      const radGrad = ctx.createRadialGradient(x, y, 0, x, y, r);
      radGrad.addColorStop(0, color);
      radGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = radGrad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    } catch (e) {
      console.error("Nebula render error:", e);
    }
  };
  drawNebula(300, 200, 250, 'rgba(94, 23, 235, 0.15)'); // Royal purple glow
  drawNebula(750, 250, 300, 'rgba(255, 115, 250, 0.08)'); // Cosmic pink glow

  // 3. Draw twinkling starry sky with consistent pseudo-random generation
  let seed = 42;
  const random = () => {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
  };

  for (let i = 0; i < 120; i++) {
    const starX = random() * width;
    const starY = random() * height;
    const starR = random() * 2 + 0.5;
    const opacity = random() * 0.8 + 0.2;
    ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
    ctx.beginPath();
    ctx.arc(starX, starY, starR, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw sparkles / 4-point shining stars
  const drawSparkle = (cx: number, cy: number, size: number) => {
    ctx.beginPath();
    ctx.moveTo(cx, cy - size);
    ctx.lineTo(cx + size * 0.3, cy - size * 0.3);
    ctx.lineTo(cx + size, cy);
    ctx.lineTo(cx + size * 0.3, cy + size * 0.3);
    ctx.lineTo(cx, cy + size);
    ctx.lineTo(cx - size * 0.3, cy + size * 0.3);
    ctx.lineTo(cx - size, cy);
    ctx.lineTo(cx - size * 0.3, cy - size * 0.3);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fill();
  };

  drawSparkle(200, 100, 12);
  drawSparkle(850, 320, 15);
  drawSparkle(915, 415, 18); // Sparkle at bottom right matching the mockup image star!

  // 4. Draw shooting star/meteor on the right (matching the image exactly!)
  const trailGrad = ctx.createLinearGradient(730, 250, 850, 130);
  trailGrad.addColorStop(0, 'rgba(0, 242, 254, 0.85)'); // Bright Cyan head
  trailGrad.addColorStop(0.3, 'rgba(255, 115, 250, 0.5)'); // Pink mid-trail
  trailGrad.addColorStop(1, 'rgba(94, 23, 235, 0)'); // Fading purple tail
  
  ctx.beginPath();
  ctx.moveTo(730, 250);
  ctx.lineTo(850, 130);
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';
  ctx.strokeStyle = trailGrad;
  ctx.stroke();

  // Glowing meteor head
  ctx.beginPath();
  ctx.arc(730, 250, 7, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  // 5. Draw User Avatar with circular clip
  const avatarX = 140;
  const avatarY = 240;
  const avatarRadius = 95;

  // Draw Avatar Backing Circle (thick white outer border frame)
  ctx.beginPath();
  ctx.arc(avatarX, avatarY, avatarRadius + 5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2);
  ctx.clip();

  try {
    const avatarImg = await loadImage(data.avatarUrl);
    ctx.drawImage(avatarImg, avatarX - avatarRadius, avatarY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
  } catch (err) {
    // Fallback if image load fails
    ctx.fillStyle = '#5865f2';
    ctx.fillRect(avatarX - avatarRadius, avatarY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 80px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(data.username.charAt(0).toUpperCase(), avatarX, avatarY);
  }
  ctx.restore();

  // 6. Draw User Name
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 50px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(data.username, 260, 220);

  // 7. Draw the thin purple accent line below the name
  ctx.strokeStyle = '#5e17eb';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(260, 240);
  ctx.lineTo(540, 240);
  ctx.stroke();

  // 8. Draw stats text below the line: Level : {level} , xp : {needed}/{gained} Rank : {rank}
  ctx.fillStyle = '#ffffff';
  ctx.font = '28px sans-serif';
  ctx.fillText(`Level : ${data.level} , xp : ${data.currentXp}/${data.neededXp} Rank : #${data.rank}`, 265, 300);

  // 9. Draw the progress bar container at the bottom
  const barX = 30;
  const barY = 390;
  const barW = 940;
  const barH = 50;
  const barR = 25;

  const drawRoundedRect = (bx: number, by: number, bw: number, bh: number, br: number) => {
    ctx.beginPath();
    ctx.moveTo(bx + br, by);
    ctx.lineTo(bx + bw - br, by);
    ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + br);
    ctx.lineTo(bx + bw, by + bh - br);
    ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - br, by + bh);
    ctx.lineTo(bx + br, by + bh);
    ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - br);
    ctx.lineTo(bx, by + br);
    ctx.quadraticCurveTo(bx, by, bx + br, by);
    ctx.closePath();
  };

  // Draw dark track
  drawRoundedRect(barX, barY, barW, barH, barR);
  ctx.fillStyle = '#333333';
  ctx.fill();

  // Draw purple progress fill
  const pct = Math.max(0.02, Math.min(1.0, data.currentXp / data.neededXp));
  const fillW = barW * pct;
  
  if (fillW > barR * 2) {
    drawRoundedRect(barX, barY, fillW, barH, barR);
    const fillGrad = ctx.createLinearGradient(barX, barY, barX + fillW, barY);
    fillGrad.addColorStop(0, '#4f11b2'); // Darker purple
    fillGrad.addColorStop(0.5, '#7c25d9'); // Mid purple
    fillGrad.addColorStop(1, '#9d32f5'); // Vibrant purple
    ctx.fillStyle = fillGrad;
    ctx.fill();
  } else {
    // If progress is very low, draw a small circle pill
    drawRoundedRect(barX, barY, Math.max(barH, fillW), barH, barR);
    ctx.fillStyle = '#7c25d9';
    ctx.fill();
  }

  return canvas.toBuffer('image/png');
}
