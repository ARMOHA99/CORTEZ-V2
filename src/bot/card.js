const fs = require('fs');
const { createCanvas, GlobalFonts, loadImage } = require('@napi-rs/canvas');

const FONT_CANDIDATES = [
  'C:/Windows/Fonts/tahoma.ttf',
  'C:/Windows/Fonts/arial.ttf',
  'C:/Windows/Fonts/segoeui.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/truetype/noto/NotoSansArabic-Regular.ttf',
  '/usr/share/fonts/truetype/noto/NotoSansArabic-Bold.ttf',
  '/System/Library/Fonts/Supplemental/Arial.ttf'
];

let fontsReady = false;

function registerFonts() {
  if (fontsReady) return;
  for (const candidate of FONT_CANDIDATES) {
    try {
      if (fs.existsSync(candidate)) {
        GlobalFonts.registerFromPath(candidate, 'CortezSans');
      }
    } catch (error) {
      /* ignore */
    }
  }
  fontsReady = true;
}

function palette(rank) {
  const rankKey = rank && rank.key ? rank.key : 'member';
  const map = {
    owner: ['#2a0509', '#7d0f1c', '#ff4757'],
    operations: ['#1d1206', '#7a4210', '#ff9f43'],
    business: ['#04191b', '#0f5a5d', '#4ecdc4'],
    member: ['#101014', '#2c2c35', '#d9d4d6'],
    store: ['#160b24', '#4b2a72', '#b58cff'],
    guest: ['#0b0b0d', '#252528', '#7a7376']
  };
  const colors = map[rankKey] || map.member;
  return { deep: colors[0], mid: colors[1], accent: (rank && rank.color) || colors[2] };
}

async function loadAvatar(url) {
  if (!url) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    return await loadImage(buffer);
  } catch (error) {
    return null;
  }
}

function drawRoundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawFingerprint(ctx, cx, cy, radius, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  ctx.globalAlpha = 0.55;
  for (let index = 0; index < 9; index += 1) {
    const r = radius - index * 4.2;
    if (r <= 4) break;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 0.68, r, -0.35, 0.45 + index * 0.12, Math.PI * 1.75 + index * 0.08);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.2;
  for (let index = 0; index < 5; index += 1) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, radius * 0.22, radius * 0.3, 0.2, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function formatHours(minutes) {
  return Math.round(((Number(minutes) || 0) / 60) * 10) / 10;
}

async function generateCard(card) {
  registerFonts();
  const width = 1000;
  const height = 600;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const colors = palette(card.rank);

  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, '#050506');
  background.addColorStop(0.45, colors.deep);
  background.addColorStop(1, '#08080a');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalAlpha = 0.55;
  const beam = ctx.createLinearGradient(650, 0, 1000, height);
  beam.addColorStop(0, 'rgba(0,0,0,0)');
  beam.addColorStop(0.55, `${colors.accent}33`);
  beam.addColorStop(1, `${colors.accent}08`);
  ctx.fillStyle = beam;
  ctx.beginPath();
  ctx.moveTo(560, 0);
  ctx.lineTo(880, 0);
  ctx.lineTo(1000, height);
  ctx.lineTo(700, height);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = 'rgba(255,255,255,0.035)';
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  ctx.strokeStyle = `${colors.accent}55`;
  ctx.lineWidth = 2;
  drawRoundRect(ctx, 18, 18, width - 36, height - 36, 18);
  ctx.stroke();

  ctx.fillStyle = colors.accent;
  ctx.fillRect(18, 18, 6, height - 36);

  ctx.save();
  ctx.shadowColor = colors.accent;
  ctx.shadowBlur = 28;
  ctx.fillStyle = colors.accent;
  ctx.font = 'bold 58px CortezSans';
  ctx.fillText('CORTEZ', 58, 92);
  ctx.restore();

  ctx.fillStyle = 'rgba(244,241,242,0.55)';
  ctx.font = '18px CortezSans';
  ctx.fillText('BLOOD BOUND SINCE 2021', 62, 122);

  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(244,241,242,0.35)';
  ctx.font = '16px CortezSans';
  ctx.fillText('MEMBER IDENTITY CARD', width - 58, 74);
  ctx.fillStyle = colors.accent;
  ctx.font = 'bold 22px CortezSans';
  ctx.fillText((card.rank && card.rank.short) || 'MEMBER', width - 58, 104);

  const avatarSize = 150;
  const avatarX = 58;
  const avatarY = 170;
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
  ctx.fillStyle = '#0c0c10';
  ctx.fill();
  ctx.clip();
  const avatarImage = await loadAvatar(card.user.avatarUrl || '');
  if (avatarImage) {
    ctx.drawImage(avatarImage, avatarX, avatarY, avatarSize, avatarSize);
  } else {
    const gradient = ctx.createLinearGradient(avatarX, avatarY, avatarX + avatarSize, avatarY + avatarSize);
    gradient.addColorStop(0, colors.mid);
    gradient.addColorStop(1, '#0a0a0c');
    ctx.fillStyle = gradient;
    ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
    ctx.fillStyle = colors.accent;
    ctx.font = 'bold 64px CortezSans';
    ctx.textAlign = 'center';
    ctx.fillText((card.user.name || 'C').slice(0, 1).toUpperCase(), avatarX + avatarSize / 2, avatarY + avatarSize / 2 + 22);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
  ctx.strokeStyle = colors.accent;
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#f4f1f2';
  ctx.font = 'bold 42px CortezSans';
  const displayName = (card.user.name || 'CORTEZ MEMBER').slice(0, 26);
  ctx.fillText(displayName, 238, 218);

  ctx.fillStyle = 'rgba(244,241,242,0.55)';
  ctx.font = '20px CortezSans';
  ctx.fillText(`@${(card.user.username || 'cortez').slice(0, 24)}`, 240, 250);

  drawRoundRect(ctx, 238, 278, 210, 38, 19);
  ctx.fillStyle = `${colors.accent}22`;
  ctx.fill();
  ctx.strokeStyle = `${colors.accent}88`;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = colors.accent;
  ctx.font = 'bold 17px CortezSans';
  ctx.textAlign = 'center';
  ctx.fillText((card.rank && card.rank.name) || 'عضو', 343, 303);

  ctx.textAlign = 'left';
  const stats = [
    { label: 'DUTY HOURS', value: formatHours(card.duty.weeklyMinutes).toFixed(1), suffix: 'h / WEEK' },
    { label: 'TOTAL HOURS', value: formatHours(card.duty.totalMinutes).toFixed(0), suffix: 'h ALL TIME' },
    { label: 'OPERATIONS', value: String(card.operations.total || 0), suffix: `${card.operations.wins || 0} WINS` },
    { label: 'DISCIPLINE', value: String(card.discipline.warnings || 0), suffix: 'ACTIVE WARNINGS' }
  ];
  const startX = 58;
  const startY = 360;
  const boxWidth = 208;
  const boxHeight = 96;
  stats.forEach((stat, index) => {
    const x = startX + index * (boxWidth + 16);
    drawRoundRect(ctx, x, startY, boxWidth, boxHeight, 12);
    ctx.fillStyle = 'rgba(255,255,255,0.035)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.stroke();
    ctx.fillStyle = 'rgba(244,241,242,0.4)';
    ctx.font = '13px CortezSans';
    ctx.fillText(stat.label, x + 16, startY + 28);
    ctx.fillStyle = '#f4f1f2';
    ctx.font = 'bold 34px CortezSans';
    ctx.fillText(stat.value, x + 16, startY + 66);
    ctx.fillStyle = colors.accent;
    ctx.font = '12px CortezSans';
    ctx.fillText(stat.suffix, x + 16, startY + 84);
  });

  ctx.fillStyle = 'rgba(244,241,242,0.35)';
  ctx.font = '14px CortezSans';
  ctx.fillText(`WEEK ${card.generatedAt.slice(0, 10)}  •  ${card.org}`, 58, 528);

  if (card.bloodPact && card.bloodPact.signed) {
    drawFingerprint(ctx, 878, 500, 48, colors.accent);
    ctx.fillStyle = colors.accent;
    ctx.textAlign = 'center';
    ctx.font = 'bold 12px CortezSans';
    ctx.fillText('BLOOD PACT SIGNED', 878, 566);
  } else {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(244,241,242,0.25)';
    ctx.font = '13px CortezSans';
    ctx.fillText('UNSIGNED PACT', 878, 540);
  }

  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(244,241,242,0.28)';
  ctx.font = '13px CortezSans';
  ctx.fillText(card.motto || '', width - 58, 528);

  return canvas.toBuffer('image/png');
}

module.exports = { generateCard };
