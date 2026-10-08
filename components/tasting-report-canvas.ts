import type { TastingSession } from "@/lib/platform-types";
import type { TastingBlendResult, TastingSummary } from "@/lib/tasting-engine";

/**
 * Draws the tasting summary on a canvas, so it can be saved as a PDF without
 * the print dialog. Drawing directly is fast on phones; copying the page's
 * styled HTML into an image froze the browser.
 */

const WIDTH = 1240; // A4 at 150 dpi
const MARGIN = 70;
const INNER = WIDTH - MARGIN * 2;
const RIGHT = WIDTH - MARGIN;
const COLORS = {
  brown: "#4a3a31", orange: "#ec8a35", cream: "#fbf6ef", line: "#eadfd3",
  muted: "#8d8079", track: "#f1e9df", white: "#ffffff",
  levels: ["#d6cdc6", "#b7a79b", "#8d7a6c", "#5c4a3e", "#ec8a35"],
};
const FONT = 'Arial, "Noto Sans Hebrew", sans-serif';
const hasHebrew = (text: string) => /[֐-׿]/.test(text);

type Chosen = (TastingBlendResult & { reason: "favorites" | "average" }) | null;

function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, options: { size: number; weight?: number; color?: string; align?: CanvasTextAlign }) {
  ctx.font = `${options.weight || 400} ${options.size}px ${FONT}`;
  ctx.fillStyle = options.color || COLORS.brown;
  ctx.textAlign = options.align || "right";
  // Latin blend names such as "DX+" keep their order instead of being mirrored.
  ctx.direction = hasHebrew(value) ? "rtl" : "ltr";
  ctx.textBaseline = "middle";
  ctx.fillText(value, x, y);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string, stroke?: string) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
}

function wrap(ctx: CanvasRenderingContext2D, value: string, maxWidth: number, size: number) {
  ctx.font = `400 ${size}px ${FONT}`;
  const lines: string[] = [];
  let line = "";
  for (const word of value.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

export async function drawTastingReport(session: TastingSession, summary: TastingSummary, chosen: Chosen, formatDate: (value: string) => string) {
  const rated = summary.results.filter((result) => result.votes > 0);
  const favorites = [...summary.results].filter((result) => result.favorites > 0).sort((a, b) => b.favorites - a.favorites);
  const maxFavorites = Math.max(1, ...favorites.map((result) => result.favorites));
  const measure = document.createElement("canvas").getContext("2d")!;
  const commentLines = summary.comments.map((comment) => wrap(measure, `„${comment.text}”`, INNER - 40, 22));

  const rowHeight = 64;
  const listRows = Math.max(rated.length, favorites.length, 1);
  const height = 240 + (chosen ? 230 : 120)
    + (rated.length ? 110 + rated.length * (rowHeight + 10) : 0)
    + (rated.length ? 90 + listRows * 46 + 60 : 0)
    + (commentLines.length ? 80 + commentLines.reduce((sum, lines) => sum + lines.length * 32 + 30, 0) : 0)
    + 90;

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = Math.max(Math.round(WIDTH * 297 / 210), height);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = COLORS.white;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Header
  let y = MARGIN;
  const logo = await loadImage("/mister-bean-platform/brands/dada-logo.png");
  if (logo) ctx.drawImage(logo, RIGHT - 110, y, 110, 110 * logo.height / logo.width);
  text(ctx, "סיכום סקר טעימות", RIGHT - 135, y + 18, { size: 22, weight: 700, color: COLORS.orange });
  text(ctx, session.title, RIGHT - 135, y + 58, { size: 38, weight: 700 });
  text(ctx, `${session.customerName} · ${formatDate(session.createdAt)}${session.status === "open" ? " · הסקר עדיין פתוח" : ""}`, RIGHT - 135, y + 100, { size: 22, color: COLORS.muted });
  roundRect(ctx, MARGIN, y, 150, 120, 20, COLORS.cream, COLORS.line);
  text(ctx, String(summary.participants), MARGIN + 75, y + 50, { size: 48, weight: 800, align: "center" });
  text(ctx, "משתתפים", MARGIN + 75, y + 95, { size: 20, color: COLORS.muted, align: "center" });
  y += 150;
  ctx.fillStyle = COLORS.orange;
  ctx.fillRect(MARGIN, y, INNER, 4);
  y += 30;

  // Chosen blend
  if (chosen) {
    roundRect(ctx, MARGIN, y, INNER, 190, 26, COLORS.brown);
    text(ctx, "🏆", RIGHT - 30, y + 95, { size: 64 });
    text(ctx, "הבלנד הנבחר", RIGHT - 120, y + 45, { size: 22, weight: 700, color: "#f6c99c" });
    text(ctx, chosen.blend.name, RIGHT - 120, y + 95, { size: 56, weight: 800, color: COLORS.white });
    text(ctx, chosen.reason === "favorites"
      ? `נבחר כמועדף על ידי ${chosen.favorites} מתוך ${summary.participants} משתתפים`
      : "קיבל את הדירוג הממוצע הגבוה ביותר", RIGHT - 120, y + 148, { size: 22, color: "#efe2d6" });
    const stats: Array<[string, string]> = [["ממוצע", `${chosen.average.toFixed(1)}/5`], ["מדרגים", String(chosen.votes)], ["Hell yes", String(chosen.hellYes)]];
    stats.forEach(([label, value], index) => {
      const x = MARGIN + 30 + (2 - index) * 150;
      roundRect(ctx, x, y + 40, 130, 110, 18, "rgba(255,255,255,.14)");
      text(ctx, label, x + 65, y + 70, { size: 19, color: "#f6e6d6", align: "center" });
      text(ctx, value, x + 65, y + 115, { size: 36, weight: 800, color: COLORS.white, align: "center" });
    });
    y += 230;
  } else {
    roundRect(ctx, MARGIN, y, INNER, 80, 20, COLORS.cream);
    text(ctx, "עדיין אין דירוגים בטעימה הזו.", WIDTH / 2, y + 40, { size: 24, color: COLORS.muted, align: "center" });
    y += 120;
  }

  // Average per blend
  if (rated.length) {
    text(ctx, "ממוצע הדירוג לכל בלנד", RIGHT, y + 15, { size: 28, weight: 700 });
    text(ctx, "סולם 1 (Not my cup of coffee) עד 5 (Hell yes)", RIGHT, y + 55, { size: 19, color: COLORS.muted });
    y += 90;
    rated.forEach((result, index) => {
      const isChosen = chosen?.blend.id === result.blend.id;
      roundRect(ctx, MARGIN, y, INNER, rowHeight, 16, COLORS.white, isChosen ? COLORS.orange : COLORS.line);
      ctx.beginPath();
      ctx.arc(RIGHT - 34, y + rowHeight / 2, 18, 0, Math.PI * 2);
      ctx.fillStyle = isChosen ? COLORS.orange : COLORS.cream;
      ctx.fill();
      text(ctx, String(index + 1), RIGHT - 34, y + rowHeight / 2 + 1, { size: 18, weight: 700, color: isChosen ? COLORS.white : COLORS.brown, align: "center" });
      text(ctx, result.blend.name, RIGHT - 66, y + 23, { size: 24, weight: 700 });
      text(ctx, `${result.votes} הצביעו`, RIGHT - 66, y + 47, { size: 17, color: COLORS.muted });
      const trackX = MARGIN + 90, trackW = INNER - 90 - 300;
      roundRect(ctx, trackX, y + rowHeight / 2 - 10, trackW, 20, 10, COLORS.track);
      const filled = trackW * result.average / 5;
      if (filled > 0) roundRect(ctx, trackX + trackW - filled, y + rowHeight / 2 - 10, filled, 20, 10, isChosen ? COLORS.orange : COLORS.brown);
      text(ctx, result.average.toFixed(1), MARGIN + 20, y + rowHeight / 2 + 1, { size: 28, weight: 800, align: "left" });
      y += rowHeight + 10;
    });
    y += 20;

    // Rating breakdown (right) and favorites (left)
    const columnW = (INNER - 30) / 2;
    const top = y;
    text(ctx, "פילוח הדירוגים", RIGHT, y + 15, { size: 26, weight: 700 });
    text(ctx, "נבחר כמועדף", MARGIN + columnW, y + 15, { size: 26, weight: 700 });
    y += 50;
    const boxH = listRows * 46 + 24;
    roundRect(ctx, RIGHT - columnW, y, columnW, boxH, 16, COLORS.white, COLORS.line);
    roundRect(ctx, MARGIN, y, columnW, boxH, 16, COLORS.white, COLORS.line);
    rated.forEach((result, index) => {
      const rowY = y + 35 + index * 46;
      text(ctx, result.blend.name, RIGHT - 20, rowY, { size: 20, weight: 700 });
      const barX = RIGHT - columnW + 20, barW = columnW - 200;
      let x = barX;
      result.distribution.forEach((count, level) => {
        if (!count) return;
        const w = barW * count / result.votes;
        ctx.fillStyle = COLORS.levels[level];
        ctx.fillRect(x, rowY - 13, w, 26);
        if (w > 22) text(ctx, String(count), x + w / 2, rowY + 1, { size: 15, weight: 700, color: level < 2 ? COLORS.brown : COLORS.white, align: "center" });
        x += w;
      });
    });
    if (favorites.length) favorites.forEach((result, index) => {
      const rowY = y + 35 + index * 46;
      text(ctx, result.blend.name, MARGIN + columnW - 20, rowY, { size: 20, weight: 700 });
      const barX = MARGIN + 60, barW = columnW - 260;
      roundRect(ctx, barX, rowY - 8, barW, 16, 8, COLORS.track);
      const filled = barW * result.favorites / maxFavorites;
      roundRect(ctx, barX + barW - filled, rowY - 8, filled, 16, 8, COLORS.brown);
      text(ctx, String(result.favorites), MARGIN + 20, rowY + 1, { size: 20, weight: 700, align: "left" });
    });
    else text(ctx, "אף משתתף לא בחר בלנד מועדף.", MARGIN + columnW - 20, y + 35, { size: 19, color: COLORS.muted });
    y += boxH + 20;
    // Same left-to-right order as the rating bars above it.
    COLORS.levels.forEach((color, level) => {
      const x = RIGHT - columnW + 20 + level * 60;
      roundRect(ctx, x, y - 8, 16, 16, 4, color);
      text(ctx, String(level + 1), x + 24, y + 1, { size: 17, color: COLORS.muted, align: "left" });
    });
    y = Math.max(y, top) + 40;
  }

  // Comments
  if (commentLines.length) {
    text(ctx, "מה אמרו הטועמים", RIGHT, y + 15, { size: 26, weight: 700 });
    y += 50;
    for (const lines of commentLines) {
      const boxH = lines.length * 32 + 20;
      roundRect(ctx, MARGIN, y, INNER, boxH, 12, COLORS.cream);
      ctx.fillStyle = COLORS.orange;
      ctx.fillRect(RIGHT - 5, y, 5, boxH);
      lines.forEach((line, index) => text(ctx, line, RIGHT - 20, y + 26 + index * 32, { size: 22 }));
      y += boxH + 10;
    }
  }

  // Footer
  y = Math.max(y + 30, canvas.height - 70);
  ctx.fillStyle = COLORS.line;
  ctx.fillRect(MARGIN, y - 25, INNER, 2);
  text(ctx, `הופק ב-${formatDate(new Date().toISOString())} · DAdA Fresh Coffee`, WIDTH / 2, y + 5, { size: 18, color: COLORS.muted, align: "center" });
  return canvas;
}
