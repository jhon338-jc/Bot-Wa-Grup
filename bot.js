import { WhatsAppBot } from 'whatsapp-automator';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';
import OpenAI from 'openai';
import fs from 'fs';
import { createCanvas } from 'canvas';
import path from 'path';
import sharp from 'sharp';
import axios from 'axios';
import { createCanvas as createCanvasNapi, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'fs';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import puppeteer from 'puppeteer';
import https from 'https';
import http from 'http';
import { execFile } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import os from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);

const API_KEYS = {
    google: process.env.GOOGLE_API_KEY || '',
    groq: process.env.GROQ_API_KEY || '',
    deepseek: process.env.DEEPSEEK_API_KEY || '',
    mistral: process.env.MISTRAL_API_KEY || '',
    hf: process.env.HUGGINGFACE_API_KEY || '',
};

// ============================================
// 📋 DAFTAR GRUP YANG DIIZINKAN
// ============================================
const ALLOWED_GROUPS = [
    '120363430008697883@g.us',
    '120363429038702902@g.us', // <-- TAMBAHKAN INI!
    // Tambahkan ID grup lain di sini
    // Contoh: '1203631234567890@g.us',
];

// ============================================
// 📁 CEK & BACA FILE BANNER
// ============================================
const BANNER_PATH = path.join(process.cwd(), 'banner.png');
let BANNER_BUFFER = null;
let BANNER_EXISTS = false;

if (fs.existsSync(BANNER_PATH)) {
    try {
        BANNER_BUFFER = fs.readFileSync(BANNER_PATH);
        BANNER_EXISTS = true;
        console.log('✅ Banner ditemukan!');
    } catch (error) {
        console.log('⚠️ Gagal membaca banner:', error.message);
    }
} else {
    console.log('⚠️ Banner tidak ditemukan!');
}

// ============================================
// 🎨 BRAT CANVAS
// ============================================
const FONT_URL = 'https://raw.githubusercontent.com/Ditzzx-vibecoder/Assets/main/Font/ARIALN.ttf';
const EMOJI_JSON_URL = 'https://media.githubusercontent.com/media/Ditzzx-vibecoder/entahlah/main/emoji-apple.json';
const FONT_PATH = path.join(process.cwd(), 'ARIALN.ttf');
const EMOJI_JSON_PATH = path.join(process.cwd(), 'emoji-apple.json');

const THEMES = {
    black: { bg: '#000000', text: '#ffffff' },
    white: { bg: '#ffffff', text: '#000000' },
    green: { bg: '#8ace00', text: '#000000' }
};

async function downloadFile(url) {
    const res = await fetch(url);
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(FONT_PATH, buf);
    return buf;
}

async function ensureFont() {
    if (!existsSync(FONT_PATH)) await downloadFile(FONT_URL);
    GlobalFonts.registerFromPath(FONT_PATH, 'ArialNarrow');
}

let emojiMap = null;
const emojiImageCache = new Map();

function emojiToUnicode(emoji) {
    return [...emoji].map(c => c.codePointAt(0).toString(16).padStart(4, '0')).join('-');
}

async function loadEmojiMap() {
    if (emojiMap) return emojiMap;
    if (!existsSync(EMOJI_JSON_PATH)) {
        const res = await fetch(EMOJI_JSON_URL);
        const buf = Buffer.from(await res.arrayBuffer());
        writeFileSync(EMOJI_JSON_PATH, buf);
    }
    emojiMap = JSON.parse(readFileSync(EMOJI_JSON_PATH, 'utf-8'));
    return emojiMap;
}

async function getEmojiImage(emoji) {
    if (emojiImageCache.has(emoji)) return emojiImageCache.get(emoji);
    const map = await loadEmojiMap();
    const base = emojiToUnicode(emoji);
    const variants = [
        base,
        base.replace(/-fe0f/gi, ''),
        `${base.replace(/-fe0f/gi, '')}-fe0f`,
        base.toUpperCase(),
        base.replace(/-fe0f/gi, '').toUpperCase(),
        base.replace(/-fe0f/gi, '').toUpperCase() + '-FE0F'
    ];
    let b64 = null;
    for (const v of variants) {
        if (map[v]) { b64 = map[v]; break; }
    }
    if (!b64) return null;
    const img = await loadImage(Buffer.from(b64, 'base64'));
    emojiImageCache.set(emoji, img);
    return img;
}

async function drawAppleEmoji(ctx, emoji, x, y, size) {
    const img = await getEmojiImage(emoji);
    if (!img) { ctx.fillText(emoji, x, y); return; }
    ctx.drawImage(img, x, y, size, size);
}

const EMOJI_REGEX = /(\p{Emoji_Modifier_Base}\p{Emoji_Modifier}|\p{Emoji_Presentation}\uFE0F?|\p{Emoji}\uFE0F|[\u{1F1E0}-\u{1F1FF}]{2}|\p{Extended_Pictographic}\uFE0F?)/gu;

function measureTextCustom(ctx, text, fontSize) {
    const parts = text.split(EMOJI_REGEX);
    let w = 0;
    for (const part of parts) {
        if (!part) continue;
        EMOJI_REGEX.lastIndex = 0;
        if (EMOJI_REGEX.test(part)) w += fontSize;
        else w += ctx.measureText(part).width;
        EMOJI_REGEX.lastIndex = 0;
    }
    return w;
}

async function drawTextWithEmojis(ctx, text, x, y, fontSize) {
    const parts = text.split(EMOJI_REGEX);
    let curX = x;
    for (const part of parts) {
        if (!part) continue;
        EMOJI_REGEX.lastIndex = 0;
        if (EMOJI_REGEX.test(part)) {
            await drawAppleEmoji(ctx, part, curX, y, fontSize);
            curX += fontSize;
        } else {
            ctx.fillText(part, curX, y);
            curX += ctx.measureText(part).width;
        }
        EMOJI_REGEX.lastIndex = 0;
    }
}

function wrapText(ctx, text, maxWidth, fontSize) {
    ctx.font = `${fontSize}px ArialNarrow`;
    const words = text.split(' ');
    const lines = [];
    let cur = '';
    for (const word of words) {
        const test = cur ? cur + ' ' + word : word;
        if (measureTextCustom(ctx, test, fontSize) > maxWidth && cur) {
            lines.push(cur);
            cur = word;
        } else {
            cur = test;
        }
    }
    if (cur) lines.push(cur);
    return lines;
}

function fitsAt(ctx, text, fontSize, maxWidth, maxHeight, lineGap) {
    const lines = wrapText(ctx, text, maxWidth, fontSize);
    const longestWord = Math.max(...text.split(' ').map(w => measureTextCustom(ctx, w, fontSize)));
    const totalHeight = lines.length * (fontSize + lineGap) - lineGap;
    return longestWord <= maxWidth && totalHeight <= maxHeight;
}

function findBestFontSize(ctx, text, maxWidth, maxHeight, lineGap) {
    let lo = 10;
    let hi = 700;
    let best = lo;

    while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (fitsAt(ctx, text, mid, maxWidth, maxHeight, lineGap)) {
            best = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    return best;
}

async function generateBrat({ text = 'Halo Guys Nama Saya', theme = 'white', blur = 0 } = {}) {
    const selectedTheme = THEMES[theme] || THEMES.white;
    const blurAmount = [0, 1, 2, 3].includes(blur) ? blur : 0;

    const size = 1000;
    const padding = 80;
    const lineGap = 20;
    const maxWidth = size - padding * 2;
    const maxHeight = size - padding * 2;

    await ensureFont();
    await loadEmojiMap();

    const canvas = createCanvasNapi(size, size);
    const ctx = canvas.getContext('2d');

    const fontSize = findBestFontSize(ctx, text, maxWidth, maxHeight, lineGap);
    const lines = wrapText(ctx, text, maxWidth, fontSize);

    ctx.fillStyle = selectedTheme.bg;
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = selectedTheme.text;
    ctx.font = `${fontSize}px ArialNarrow`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    ctx.save();
    if (blurAmount > 0) ctx.filter = `blur(${blurAmount}px)`;

    const totalTextHeight = lines.length * (fontSize + lineGap) - lineGap;
    let y = (size - totalTextHeight) / 2;
    for (const line of lines) {
        await drawTextWithEmojis(ctx, line, padding, y, fontSize);
        y += fontSize + lineGap;
    }

    ctx.restore();

    const buffer = await canvas.encode('png');
    const outPath = path.join(process.cwd(), 'temp', `brat-${Date.now()}.png`);
    writeFileSync(outPath, buffer);
    return outPath;
}

// ============================================
// 💬 RINCHAT
// ============================================
const APPLE_EMOJI_JSON_URL = 'https://media.githubusercontent.com/media/Ditzzx-vibecoder/entahlah/main/emoji-apple.json';
const APPLE_EMOJI_JSON_LOCAL = path.join(__dirname, 'fonts', 'emoji-apple-image.json');

let appleEmojiMap = null;
const rinEmojiImageCache = new Map();

async function downloadFileRin(url) {
    const res = await axios.get(url, { responseType: 'arraybuffer', headers: { 'User-Agent': 'Mozilla/5.0' }, maxRedirects: 5 });
    return Buffer.from(res.data);
}

async function loadAppleEmojiMap() {
    if (appleEmojiMap) return appleEmojiMap;
    await mkdir(path.join(__dirname, 'fonts'), { recursive: true });
    if (!existsSync(APPLE_EMOJI_JSON_LOCAL)) {
        const buf = await downloadFileRin(APPLE_EMOJI_JSON_URL);
        await writeFile(APPLE_EMOJI_JSON_LOCAL, buf);
    }
    const raw = await readFile(APPLE_EMOJI_JSON_LOCAL, 'utf-8');
    appleEmojiMap = JSON.parse(raw);
    return appleEmojiMap;
}

async function getRinEmojiImage(emoji) {
    if (rinEmojiImageCache.has(emoji)) return rinEmojiImageCache.get(emoji);
    const map = await loadAppleEmojiMap();
    const base = emojiToUnicode(emoji);
    const variants = [
        base,
        base.replace(/-fe0f/gi, ''),
        `${base.replace(/-fe0f/gi, '')}-fe0f`,
        base.toUpperCase(),
        base.replace(/-fe0f/gi, '').toUpperCase(),
        base.replace(/-fe0f/gi, '').toUpperCase() + '-FE0F',
    ];
    let b64 = null;
    for (const v of variants) {
        if (map[v]) { b64 = map[v]; break; }
    }
    if (!b64) return null;
    const buf = Buffer.from(b64, 'base64');
    const img = await loadImage(buf);
    rinEmojiImageCache.set(emoji, img);
    return img;
}

async function drawRinAppleEmoji(ctx, emoji, x, y, size) {
    const img = await getRinEmojiImage(emoji);
    if (!img) {
        ctx.fillText(emoji, x, y);
        return;
    }
    ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
}

function measureRinTextCustom(ctx, text, fontSize) {
    const parts = text.split(EMOJI_REGEX);
    let totalWidth = 0;
    for (const part of parts) {
        if (!part) continue;
        EMOJI_REGEX.lastIndex = 0;
        if (EMOJI_REGEX.test(part)) {
            totalWidth += fontSize * 1.05;
        } else {
            totalWidth += ctx.measureText(part).width;
        }
        EMOJI_REGEX.lastIndex = 0;
    }
    return totalWidth;
}

async function drawRinTextWithEmojis(ctx, text, x, y, fontSize) {
    const parts = text.split(EMOJI_REGEX);
    let currentX = x;
    for (const part of parts) {
        if (!part) continue;
        EMOJI_REGEX.lastIndex = 0;
        if (EMOJI_REGEX.test(part)) {
            const emojiSize = fontSize * 1.05;
            const emojiCX = currentX + emojiSize / 2;
            const emojiCY = y;
            await drawRinAppleEmoji(ctx, part, emojiCX, emojiCY, emojiSize);
            currentX += emojiSize;
        } else {
            ctx.fillText(part, currentX, y);
            currentX += ctx.measureText(part).width;
        }
        EMOJI_REGEX.lastIndex = 0;
    }
}

function wrapRinText(ctx, text, maxWidth, fontSize) {
    ctx.font = `${fontSize}px InterRegular`;
    const words = text.split(" ");
    const lines = [];
    let cur = "";
    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        if (word.includes('\n')) {
            const parts = word.split('\n');
            for (let j = 0; j < parts.length; j++) {
                const test = cur + (cur ? " " : "") + parts[j];
                if (measureRinTextCustom(ctx, test, fontSize) > maxWidth && cur) {
                    lines.push(cur); cur = parts[j];
                } else { cur = test; }
                if (j < parts.length - 1) { lines.push(cur); cur = ""; }
            }
            continue;
        }
        const test = cur + (cur ? " " : "") + word;
        if (measureRinTextCustom(ctx, test, fontSize) > maxWidth && i > 0) {
            lines.push(cur); cur = word;
        } else { cur = test; }
    }
    if (cur) lines.push(cur);
    return lines;
}

async function generateRinchat({ text = 'Earth without art is just "eh" 🌍🎨✨', time = '16.34', imageUrl = null } = {}) {
    try {
        const RIN_BG_URL = 'https://raw.githubusercontent.com/ryyntwx/allimagerin/refs/heads/main/iqc-hytam.png';
        const RIN_DIR = path.join(process.cwd(), 'assets', 'rinchat');
        const RIN_BG_LOCAL = path.join(RIN_DIR, 'iqc-hytam.png');
        const RIN_FONTS_DIR = path.join(RIN_DIR, 'fonts');
        const RIN_TMP = path.join(process.cwd(), 'tmp');

        const RIN_FONTS = [
            { url: 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hiJ-Ek-_EeA.woff2', file: 'Inter-Regular.ttf' }
        ];

        const BG_W = 941;
        const BG_H = 1671;

        await mkdir(RIN_FONTS_DIR, { recursive: true });
        await mkdir(RIN_TMP, { recursive: true });

        async function rinDownload(url, isJson = false) {
            const res = await axios.get(url, { responseType: isJson ? 'json' : 'arraybuffer', headers: { 'User-Agent': 'Mozilla/5.0' }, maxRedirects: 5 });
            return isJson ? res.data : Buffer.from(res.data);
        }

        let emojis = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

        for (const f of RIN_FONTS) {
            const dest = path.join(RIN_FONTS_DIR, f.file);
            if (!existsSync(dest)) await writeFile(dest, await rinDownload(f.url));
            GlobalFonts.registerFromPath(dest, 'InterRegular');
        }

        if (!existsSync(RIN_BG_LOCAL)) {
            await writeFile(RIN_BG_LOCAL, await rinDownload(RIN_BG_URL));
        }

        await loadAppleEmojiMap();

        const canvas = createCanvasNapi(BG_W, BG_H);
        const ctx = canvas.getContext('2d');
        const bgImg = await loadImage(RIN_BG_LOCAL);
        ctx.drawImage(bgImg, 0, 0, BG_W, BG_H);

        const PERMANENT_TIME_X = 463;
        const PERMANENT_TIME_Y = 8;
        const PERMANENT_TIME_SIZE = 27;

        ctx.fillStyle = "#ffffff";
        ctx.font = `${PERMANENT_TIME_SIZE}px InterRegular`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(time || '16.34', PERMANENT_TIME_X, PERMANENT_TIME_Y);

        const chatFontSize = 30;
        const maxWidthLimit = 530;
        const minBubbleWidth = 280;
        const lineHeight = chatFontSize + 14;
        const paddingX = 30;
        const paddingY = 20;
        const rad = 28;
        const fixedX = 35;
        const fixedBaseY = 946;

        ctx.font = `22px InterRegular`;
        const timeWidth = ctx.measureText(time || '16.34').width;

        let finalY, finalBubbleHeight, bubbleW;

        if (!imageUrl) {
            ctx.font = `${chatFontSize}px InterRegular`;
            const chatLines = wrapRinText(ctx, text, maxWidthLimit, chatFontSize);

            let longestW = 0;
            chatLines.forEach(l => {
                const w = measureRinTextCustom(ctx, l.trim(), chatFontSize);
                if (w > longestW) longestW = w;
            });

            bubbleW = longestW + (paddingX * 2);
            bubbleW = Math.max(bubbleW, timeWidth + 75);
            bubbleW = Math.max(bubbleW, 180);

            const spaceTimeY = 12;
            finalBubbleHeight = (chatLines.length * lineHeight) + paddingY + spaceTimeY + 22;
            finalY = fixedBaseY - finalBubbleHeight;

            ctx.fillStyle = "#1c1c1e";
            ctx.beginPath();
            ctx.moveTo(fixedX + rad, finalY);
            ctx.lineTo(fixedX + bubbleW - rad, finalY);
            ctx.quadraticCurveTo(fixedX + bubbleW, finalY, fixedX + bubbleW, finalY + rad);
            ctx.lineTo(fixedX + bubbleW, finalY + finalBubbleHeight - rad);
            ctx.quadraticCurveTo(fixedX + bubbleW, finalY + finalBubbleHeight, fixedX + bubbleW - rad, finalY + finalBubbleHeight);
            ctx.lineTo(fixedX + rad, finalY + finalBubbleHeight);
            ctx.quadraticCurveTo(fixedX + 8, finalY + finalBubbleHeight, fixedX + 8, finalY + finalBubbleHeight - 8);
            ctx.lineTo(fixedX + 8, finalY + rad);
            ctx.quadraticCurveTo(fixedX + 8, finalY, fixedX + rad, finalY);
            ctx.closePath();
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(fixedX + 12, finalY + finalBubbleHeight - 20);
            ctx.quadraticCurveTo(fixedX - 2, finalY + finalBubbleHeight - 4, fixedX - 8, finalY + finalBubbleHeight);
            ctx.quadraticCurveTo(fixedX + 6, finalY + finalBubbleHeight, fixedX + 22, finalY + finalBubbleHeight - 2);
            ctx.closePath();
            ctx.fill();

            ctx.save();
            ctx.fillStyle = "#ffffff";
            ctx.font = `${chatFontSize}px InterRegular`;
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            for (let i = 0; i < chatLines.length; i++) {
                const lineY = finalY + paddingY + (i * lineHeight) + (chatFontSize / 2);
                await drawRinTextWithEmojis(ctx, chatLines[i].trim(), fixedX + paddingX, lineY, chatFontSize);
            }
            ctx.restore();

            ctx.fillStyle = "#727278";
            ctx.font = `22px InterRegular`;
            ctx.textAlign = "right";
            ctx.textBaseline = "top";
            ctx.fillText(time || '16.34', fixedX + bubbleW - 22, finalY + finalBubbleHeight - 38);

        } else {
            const imgBuf = imageUrl.startsWith('http')
                ? await rinDownload(imageUrl)
                : await readFile(imageUrl);
            const imgObj = await loadImage(imgBuf);

            const imgAspect = imgObj.width / imgObj.height;
            bubbleW = Math.min(Math.max(imgObj.width, minBubbleWidth), maxWidthLimit);
            let imgDrawH = Math.round(bubbleW / imgAspect);
            bubbleW = Math.max(bubbleW, timeWidth + 75);

            let captionLines = [];
            if (text) {
                ctx.font = `${chatFontSize}px InterRegular`;
                captionLines = wrapRinText(ctx, text, bubbleW - paddingX * 2, chatFontSize);
            }

            const captionH = captionLines.length > 0
                ? paddingY + (captionLines.length * lineHeight)
                : 0;
            const timeRowH = 28;
            finalBubbleHeight = imgDrawH + captionH + timeRowH + (captionLines.length > 0 ? 4 : 0);
            finalY = fixedBaseY - finalBubbleHeight;

            ctx.fillStyle = "#1c1c1e";
            ctx.beginPath();
            ctx.moveTo(fixedX + rad, finalY);
            ctx.lineTo(fixedX + bubbleW - rad, finalY);
            ctx.quadraticCurveTo(fixedX + bubbleW, finalY, fixedX + bubbleW, finalY + rad);
            ctx.lineTo(fixedX + bubbleW, finalY + finalBubbleHeight - rad);
            ctx.quadraticCurveTo(fixedX + bubbleW, finalY + finalBubbleHeight, fixedX + bubbleW - rad, finalY + finalBubbleHeight);
            ctx.lineTo(fixedX + rad, finalY + finalBubbleHeight);
            ctx.quadraticCurveTo(fixedX + 8, finalY + finalBubbleHeight, fixedX + 8, finalY + finalBubbleHeight - 8);
            ctx.lineTo(fixedX + 8, finalY + rad);
            ctx.quadraticCurveTo(fixedX + 8, finalY, fixedX + rad, finalY);
            ctx.closePath();
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(fixedX + 12, finalY + finalBubbleHeight - 20);
            ctx.quadraticCurveTo(fixedX - 2, finalY + finalBubbleHeight - 4, fixedX - 8, finalY + finalBubbleHeight);
            ctx.quadraticCurveTo(fixedX + 6, finalY + finalBubbleHeight, fixedX + 22, finalY + finalBubbleHeight - 2);
            ctx.closePath();
            ctx.fill();

            ctx.save();
            ctx.beginPath();
            ctx.moveTo(fixedX + rad, finalY);
            ctx.lineTo(fixedX + bubbleW - rad, finalY);
            ctx.quadraticCurveTo(fixedX + bubbleW, finalY, fixedX + bubbleW, finalY + rad);
            ctx.lineTo(fixedX + bubbleW, finalY + imgDrawH);
            ctx.lineTo(fixedX + 8, finalY + imgDrawH);
            ctx.lineTo(fixedX + 8, finalY + rad);
            ctx.quadraticCurveTo(fixedX + 8, finalY, fixedX + rad, finalY);
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(imgObj, fixedX, finalY, bubbleW, imgDrawH);
            ctx.beginPath();
            ctx.moveTo(fixedX + 8, finalY + imgDrawH);
            ctx.lineTo(fixedX + 8, finalY + rad);
            ctx.quadraticCurveTo(fixedX + 8, finalY, fixedX + rad, finalY);
            ctx.lineTo(fixedX + bubbleW - rad, finalY);
            ctx.quadraticCurveTo(fixedX + bubbleW, finalY, fixedX + bubbleW, finalY + rad);
            ctx.lineTo(fixedX + bubbleW, finalY + imgDrawH);
            ctx.strokeStyle = "#1c1c1e";
            ctx.lineWidth = 18;
            ctx.stroke();
            ctx.restore();

            if (captionLines.length > 0) {
                ctx.save();
                ctx.fillStyle = "#ffffff";
                ctx.font = `${chatFontSize}px InterRegular`;
                ctx.textAlign = "left";
                ctx.textBaseline = "middle";
                for (let i = 0; i < captionLines.length; i++) {
                    const lineY = finalY + imgDrawH + paddingY + (i * lineHeight) + (chatFontSize / 2);
                    await drawRinTextWithEmojis(ctx, captionLines[i].trim(), fixedX + paddingX, lineY, chatFontSize);
                }
                ctx.restore();
            }

            ctx.fillStyle = "#727278";
            ctx.font = `22px InterRegular`;
            ctx.textAlign = "right";
            ctx.textBaseline = "middle";
            ctx.fillText(time || '16.34', fixedX + bubbleW - 22, finalY + finalBubbleHeight - timeRowH);
        }

        const emojiSize = Math.round(54 * 1.03);
        const emCardH = emojiSize + Math.round(44 * 1.03);
        const emCardW = Math.round(530 * 1.03);
        const emCardX = fixedX + 8;
        const emCardY = finalY - emCardH - 18;

        ctx.fillStyle = "#1c1c1e";
        ctx.beginPath();
        ctx.roundRect(emCardX, emCardY, emCardW, emCardH, [emCardH / 2]);
        ctx.fill();

        const startX = emCardX + 55;
        const spacingX = 76;
        const emojiCY = emCardY + (emCardH / 2) + 2;

        for (let i = 0; i < Math.min(emojis.length, 6); i++) {
            await drawRinAppleEmoji(ctx, emojis[i], startX + (i * spacingX), emojiCY, emojiSize);
        }

        ctx.fillStyle = "#8e8e93";
        ctx.font = `${Math.round(36 * 1.03)}px InterRegular`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("+", startX + (6 * spacingX) - 8, emCardY + (emCardH / 2) - 2);

        const rinOut = path.join(process.cwd(), 'temp', `rinchat-${Date.now()}.png`);
        await writeFile(rinOut, await canvas.encode('png'));

        return rinOut;

    } catch (e) {
        console.error('❌ Error generateRinchat:', e.message || e);
        throw e;
    }
}

// ============================================
// 🎨 FUNGSI UBAH GAMBAR KE ANIME
// ============================================
async function imageToAnime(imageBuffer) {
    try {
        console.log('🎨 Proses ubah ke anime pake Hugging Face...');

        const base64Image = imageBuffer.toString('base64');

        const response = await axios({
            method: 'post',
            url: 'https://api-inference.huggingface.co/models/anton-l/stable-diffusion-xl-img2img',
            headers: {
                'Authorization': `Bearer ${API_KEYS.hf}`,
                'Content-Type': 'application/json',
            },
            data: {
                inputs: {
                    image: base64Image,
                    prompt: "anime style, studio ghibli, vibrant colors, beautiful, high quality, masterpiece",
                    parameters: {
                        num_inference_steps: 20,
                        strength: 0.75,
                    }
                }
            },
            responseType: 'arraybuffer',
        });

        if (response.status !== 200) {
            const errorText = Buffer.from(response.data).toString('utf-8');
            throw new Error(`API Error ${response.status}: ${errorText}`);
        }

        const resultImage = Buffer.from(response.data);
        const tempPath = path.join(process.cwd(), 'temp', `anime_${Date.now()}.png`);
        fs.writeFileSync(tempPath, resultImage);

        return tempPath;

    } catch (error) {
        console.error('❌ Error imageToAnime:', error.message);
        throw error;
    }
}

// ============================================
// 🎨 FUNGSI STIKER
// ============================================
async function createSticker(text, options = {}) {
    try {
        const {
            width = 512,
            height = 512,
            backgroundColor = '#FFFFFF',
            textColor = '#000000',
            fontFamily = 'Arial',
            maxWidth = 460,
            minFontSize = 30,
            maxFontSize = 130,
            padding = 30,
        } = options;

        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, width, height);

        let rawLines = [];
        if (text.includes('\n')) {
            rawLines = text.split('\n').filter(line => line.trim().length > 0);
        } else {
            const words = text.split(' ');
            let currentLine = '';
            const testSize = 60;
            ctx.font = `bold ${testSize}px "${fontFamily}"`;
            
            for (let word of words) {
                const testLine = currentLine + word + ' ';
                const metrics = ctx.measureText(testLine);
                
                if (metrics.width > maxWidth && currentLine.length > 0) {
                    rawLines.push(currentLine.trim());
                    currentLine = word + ' ';
                } else {
                    currentLine = testLine;
                }
            }
            
            if (currentLine.length > 0) {
                rawLines.push(currentLine.trim());
            }
        }

        if (rawLines.length === 0) {
            rawLines = [text];
        }

        let bestFontSize = maxFontSize;
        
        for (let size = maxFontSize; size >= minFontSize; size -= 2) {
            ctx.font = `bold ${size}px "${fontFamily}"`;
            let allFit = true;
            
            for (let line of rawLines) {
                const metrics = ctx.measureText(line);
                if (metrics.width > maxWidth) {
                    allFit = false;
                    break;
                }
            }
            
            if (allFit) {
                const lineHeight = size * 1.3;
                const totalHeight = rawLines.length * lineHeight;
                if (totalHeight <= height - (padding * 2)) {
                    bestFontSize = size;
                    break;
                }
            }
        }

        let finalLines = rawLines;
        let finalFontSize = bestFontSize;
        
        ctx.font = `bold ${finalFontSize}px "${fontFamily}"`;
        let needsResplit = false;
        
        for (let line of finalLines) {
            const metrics = ctx.measureText(line);
            if (metrics.width > maxWidth) {
                needsResplit = true;
                break;
            }
        }
        
        if (needsResplit && finalFontSize > minFontSize) {
            const words = text.split(' ');
            const newLines = [];
            let currentLine = '';
            
            for (let word of words) {
                const testLine = currentLine + word + ' ';
                const metrics = ctx.measureText(testLine);
                
                if (metrics.width > maxWidth && currentLine.length > 0) {
                    newLines.push(currentLine.trim());
                    currentLine = word + ' ';
                } else {
                    currentLine = testLine;
                }
            }
            
            if (currentLine.length > 0) {
                newLines.push(currentLine.trim());
            }
            
            finalLines = newLines;
        }

        let finalLineHeight = finalFontSize * 1.3;
        if (finalLines.length <= 2) {
            finalLineHeight = finalFontSize * 1.6;
        } else if (finalLines.length <= 4) {
            finalLineHeight = finalFontSize * 1.4;
        } else {
            finalLineHeight = finalFontSize * 1.2;
        }
        
        const newTotalHeight = finalLines.length * finalLineHeight;
        const availableHeight = height - (padding * 2);
        
        if (newTotalHeight < availableHeight * 0.6) {
            finalLineHeight = Math.min(
                finalFontSize * 2.0,
                (availableHeight - (padding * 0.5)) / finalLines.length
            );
        }
        
        if (newTotalHeight > availableHeight) {
            finalLineHeight = (availableHeight - (padding * 0.5)) / finalLines.length;
        }

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        const finalTotalHeight = finalLines.length * finalLineHeight;
        const startY = (height - finalTotalHeight) / 2 + (finalLineHeight / 2);

        ctx.font = `bold ${finalFontSize}px "${fontFamily}"`;
        ctx.fillStyle = textColor;

        for (let i = 0; i < finalLines.length; i++) {
            const line = finalLines[i];
            const y = startY + (i * finalLineHeight);
            
            ctx.shadowColor = 'rgba(0,0,0,0.03)';
            ctx.shadowBlur = 2;
            ctx.shadowOffsetX = 1;
            ctx.shadowOffsetY = 1;
            
            ctx.fillText(line, width/2, y);
            
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
        }

        const pngBuffer = canvas.toBuffer('image/png');
        const tempPng = path.join(process.cwd(), 'temp', `sticker_${Date.now()}.png`);
        const tempWebp = path.join(process.cwd(), 'temp', `sticker_${Date.now()}.webp`);
        
        if (!fs.existsSync('temp')) {
            fs.mkdirSync('temp');
        }
        
        fs.writeFileSync(tempPng, pngBuffer);

        await sharp(tempPng)
            .webp({
                quality: 90,
                effort: 6,
                lossless: false,
            })
            .toFile(tempWebp);

        const webpBuffer = fs.readFileSync(tempWebp);

        setTimeout(() => {
            try {
                if (fs.existsSync(tempPng)) fs.unlinkSync(tempPng);
                if (fs.existsSync(tempWebp)) fs.unlinkSync(tempWebp);
            } catch (e) {}
        }, 3000);

        return {
            buffer: webpBuffer,
            filepath: tempWebp,
            filename: path.basename(tempWebp),
            lines: finalLines.length,
            fontSize: finalFontSize,
            lineHeight: finalLineHeight,
            text: text,
        };

    } catch (error) {
        console.error('❌ Error bikin stiker:', error);
        throw error;
    }
}

// ============================================
// 📥 INSTAGRAM DOWNLOADER - PAKE FASTDL! (PRIORITAS VIDEO)
// ============================================
async function downloadInstagram(targetUrl) {
    try {
        console.log(`📥 Download pake FastDL...`);

        const [se, tst] = ["82314e32a384d00f055de496b4737acde3cbb2f851b90e1a70625f6d3bb56401", 1778140969163];

        const ins = axios.create({
            headers: {
                "user-agent": "Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36"
            }
        });

        // Ambil msec
        const { data: msc } = await ins.get("https://fastdl.app/msec");
        const drift = Date.now() - Math.floor(msc.msec * 1000);
        const to = Math.abs(drift) >= 60000 ? drift : 0;
        const ts = Date.now() - to;

        // Generate signature
        const sg = crypto.createHmac("sha256", Buffer.from(se, "hex"))
            .update(targetUrl + ts)
            .digest("hex");

        // Panggil API FastDL
        const { data: result } = await ins.post(
            "https://cors.siputzx.my.id/https://api-wh.fastdl.app/api/convert",
            new URLSearchParams({
                sf_url: targetUrl,
                ts: ts.toString(),
                _ts: tst.toString(),
                _tsc: to.toString(),
                _sv: "2",
                _s: sg,
            }).toString(),
            {
                headers: {
                    "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
                }
            }
        );

        if (result.code === "CAPTCHA_REQUIRED") {
            throw new Error("CAPTCHA_REQUIRED: Cloudflare Turnstile verification required.");
        }

        // Olah hasil - PRIORITAS VIDEO
        let medias = [];
        let postInfo = {};

        // Kumpulkan semua media
        let allMedias = [];
        if (Array.isArray(result)) {
            const metaItem = result.find(p => p.meta);
            if (metaItem) {
                postInfo = {
                    username: metaItem.meta?.username || 'Instagram User',
                    caption: metaItem.meta?.title || 'Tidak ada caption',
                    likes: metaItem.meta?.like_count || 0,
                    total_comments: metaItem.meta?.comment_count || 0,
                    posted_at: metaItem.meta?.taken_at ? new Date(metaItem.meta.taken_at * 1000).toLocaleString() : new Date().toLocaleString()
                };
            }

            result.forEach(item => {
                if (item.url && item.url.length > 0) {
                    item.url.forEach(urlObj => {
                        allMedias.push({
                            type: urlObj.type === 'jpg' ? 'image' : 'video',
                            download_url: urlObj.url,
                            quality: urlObj.subname || 'SD'
                        });
                    });
                }
            });
        } else if (result && result.url && result.url.length > 0) {
            postInfo = {
                username: result.meta?.username || 'Instagram User',
                caption: result.meta?.title || 'Tidak ada caption',
                likes: result.meta?.like_count || 0,
                total_comments: result.meta?.comment_count || 0,
                posted_at: result.meta?.taken_at ? new Date(result.meta.taken_at * 1000).toLocaleString() : new Date().toLocaleString()
            };

            result.url.forEach(urlObj => {
                allMedias.push({
                    type: urlObj.type === 'jpg' ? 'image' : 'video',
                    download_url: urlObj.url,
                    quality: urlObj.subname || 'SD'
                });
            });
        }

        if (allMedias.length === 0) {
            throw new Error('Tidak ada media ditemukan');
        }

        // 🔥 PRIORITAS: Video dulu, baru gambar
        const videos = allMedias.filter(m => m.type === 'video');
        const images = allMedias.filter(m => m.type === 'image');

        // Pilih 1 video terbaik (HD > SD), kalo ga ada video pilih 1 gambar terbaik
        let selectedMedia = null;
        
        if (videos.length > 0) {
            // Cari video dengan kualitas HD
            selectedMedia = videos.find(v => v.quality && v.quality.includes('HD')) || videos[0];
        } else if (images.length > 0) {
            // Cari gambar dengan kualitas HD
            selectedMedia = images.find(i => i.quality && i.quality.includes('HD')) || images[0];
        }

        if (!selectedMedia) {
            selectedMedia = allMedias[0];
        }

        medias = [selectedMedia];

        return {
            response: {
                post_info: postInfo,
                medias: medias
            }
        };

    } catch (error) {
        console.error('❌ Error FastDL:', error.message);
        throw new Error(`Gagal download: ${error.message}`);
    }
}

// ============================================
// 🎬 GENERATE BRAT VIDEO
// ============================================
const BRAT_FONT_URL = 'https://raw.githubusercontent.com/Ditzzx-vibecoder/Assets/main/Font/ARIALN.ttf';
const BRAT_EMOJI_JSON_URL = 'https://media.githubusercontent.com/media/Ditzzx-vibecoder/entahlah/main/emoji-apple.json';
const BRAT_FONT_PATH = path.join(__dirname, 'ARIALN.ttf');
const BRAT_EMOJI_JSON_PATH = path.join(__dirname, 'emoji-apple.json');

const BRAT_THEMES = {
  black: { bg: '#000000', text: '#ffffff' },
  white: { bg: '#ffffff', text: '#000000' },
  green: { bg: '#8ace00', text: '#000000' }
};

async function bratDownloadFile(url, dest) {
  const res = await fetch(url);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
  return buf;
}

async function bratEnsureFont() {
  if (!existsSync(BRAT_FONT_PATH)) await bratDownloadFile(BRAT_FONT_URL, BRAT_FONT_PATH);
  GlobalFonts.registerFromPath(BRAT_FONT_PATH, 'ArialNarrow');
}

let bratEmojiMap = null;
const bratEmojiImageCache = new Map();

function bratEmojiToUnicode(emoji) {
  return [...emoji].map(c => c.codePointAt(0).toString(16).padStart(4, '0')).join('-');
}

async function bratLoadEmojiMap() {
  if (bratEmojiMap) return bratEmojiMap;
  if (!existsSync(BRAT_EMOJI_JSON_PATH)) await bratDownloadFile(BRAT_EMOJI_JSON_URL, BRAT_EMOJI_JSON_PATH);
  bratEmojiMap = JSON.parse(readFileSync(BRAT_EMOJI_JSON_PATH, 'utf-8'));
  return bratEmojiMap;
}

async function bratGetEmojiImage(emoji) {
  if (bratEmojiImageCache.has(emoji)) return bratEmojiImageCache.get(emoji);
  const map = await bratLoadEmojiMap();
  const base = bratEmojiToUnicode(emoji);
  const variants = [
    base,
    base.replace(/-fe0f/gi, ''),
    `${base.replace(/-fe0f/gi, '')}-fe0f`,
    base.toUpperCase(),
    base.replace(/-fe0f/gi, '').toUpperCase(),
    base.replace(/-fe0f/gi, '').toUpperCase() + '-FE0F'
  ];
  let b64 = null;
  for (const v of variants) {
    if (map[v]) { b64 = map[v]; break; }
  }
  if (!b64) return null;
  const img = await loadImage(Buffer.from(b64, 'base64'));
  bratEmojiImageCache.set(emoji, img);
  return img;
}

async function bratDrawAppleEmoji(ctx, emoji, x, y, size) {
  const img = await bratGetEmojiImage(emoji);
  if (!img) { ctx.fillText(emoji, x, y); return; }
  ctx.drawImage(img, x, y, size, size);
}

const BRAT_EMOJI_REGEX = /(\p{Emoji_Modifier_Base}\p{Emoji_Modifier}|\p{Emoji_Presentation}\uFE0F?|\p{Emoji}\uFE0F|[\u{1F1E0}-\u{1F1FF}]{2}|\p{Extended_Pictographic}\uFE0F?)/gu;

function bratMeasureTextCustom(ctx, text, fontSize) {
  const parts = text.split(BRAT_EMOJI_REGEX);
  let w = 0;
  for (const part of parts) {
    if (!part) continue;
    BRAT_EMOJI_REGEX.lastIndex = 0;
    if (BRAT_EMOJI_REGEX.test(part)) w += fontSize;
    else w += ctx.measureText(part).width;
    BRAT_EMOJI_REGEX.lastIndex = 0;
  }
  return w;
}

async function bratDrawTextWithEmojis(ctx, text, x, y, fontSize) {
  const parts = text.split(BRAT_EMOJI_REGEX);
  let curX = x;
  for (const part of parts) {
    if (!part) continue;
    BRAT_EMOJI_REGEX.lastIndex = 0;
    if (BRAT_EMOJI_REGEX.test(part)) {
      await bratDrawAppleEmoji(ctx, part, curX, y, fontSize);
      curX += fontSize;
    } else {
      ctx.fillText(part, curX, y);
      curX += ctx.measureText(part).width;
    }
    BRAT_EMOJI_REGEX.lastIndex = 0;
  }
}

function bratWrapText(ctx, text, maxWidth, fontSize) {
  ctx.font = `${fontSize}px ArialNarrow`;
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const word of words) {
    const test = cur ? cur + ' ' + word : word;
    if (bratMeasureTextCustom(ctx, test, fontSize) > maxWidth && cur) {
      lines.push(cur);
      cur = word;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function bratFitsAt(ctx, text, fontSize, maxWidth, maxHeight, lineGap) {
  const lines = bratWrapText(ctx, text, maxWidth, fontSize);
  const longestWord = Math.max(...text.split(' ').map(w => bratMeasureTextCustom(ctx, w, fontSize)));
  const totalHeight = lines.length * (fontSize + lineGap) - lineGap;
  return longestWord <= maxWidth && totalHeight <= maxHeight;
}

function bratFindBestFontSize(ctx, text, maxWidth, maxHeight, lineGap) {
  let lo = 10;
  let hi = 700;
  let best = lo;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (bratFitsAt(ctx, text, mid, maxWidth, maxHeight, lineGap)) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

function bratTokenize(text) {
  return text.split(' ').filter(Boolean);
}

async function bratRenderCanvas(text, theme, blurAmount) {
  const selectedTheme = BRAT_THEMES[theme] || BRAT_THEMES.white;
  const size = 1000;
  const padding = 80;
  const lineGap = 20;
  const maxWidth = size - padding * 2;
  const maxHeight = size - padding * 2;

  const canvas = createCanvasNapi(size, size);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = selectedTheme.bg;
  ctx.fillRect(0, 0, size, size);

  if (!text.trim()) return canvas;

  const fontSize = bratFindBestFontSize(ctx, text, maxWidth, maxHeight, lineGap);
  const lines = bratWrapText(ctx, text, maxWidth, fontSize);

  ctx.fillStyle = selectedTheme.text;
  ctx.font = `${fontSize}px ArialNarrow`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  ctx.save();
  if (blurAmount > 0) ctx.filter = `blur(${blurAmount}px)`;

  const totalTextHeight = lines.length * (fontSize + lineGap) - lineGap;
  let y = (size - totalTextHeight) / 2;
  for (const line of lines) {
    await bratDrawTextWithEmojis(ctx, line, padding, y, fontSize);
    y += fontSize + lineGap;
  }

  ctx.restore();
  return canvas;
}

async function generateBratVideo({
  text = 'Halo Guys Nama Saya',
  theme = 'white',
  blur = 0,
  format = 'mp4',
  frameDuration = 0.35,
  holdDuration = 1.2,
  maxWordPerLayer = 1,
  maxWordBeforeReset = 0,
  fastProgress = false
} = {}) {
  const blurAmount = [0, 1, 2, 3].includes(blur) ? blur : 0;
  const step = Math.max(1, maxWordPerLayer);
  const resetSchedule = Array.isArray(maxWordBeforeReset)
    ? maxWordBeforeReset.map(n => Math.max(0, n))
    : [Math.max(0, maxWordBeforeReset)];
  const getResetAt = (batchIndex) => resetSchedule[batchIndex % resetSchedule.length];

  await bratEnsureFont();
  await bratLoadEmojiMap();

  const tokens = bratTokenize(text);
  if (!tokens.length) throw new Error('Teks kosong');

  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'brat-'));

  const partialTexts = [];
  let batchStart = 0;
  let batchIndex = 0;
  while (batchStart < tokens.length) {
    const resetAt = getResetAt(batchIndex);
    const batchEnd = resetAt > 0 ? Math.min(batchStart + resetAt, tokens.length) : tokens.length;
    for (let i = batchStart + step; i < batchEnd; i += step) {
      partialTexts.push(tokens.slice(batchStart, i).join(' '));
    }
    partialTexts.push(tokens.slice(batchStart, batchEnd).join(' '));
    batchStart = batchEnd;
    batchIndex++;
  }

  const renderFrame = async (partialText, index) => {
    const canvas = await bratRenderCanvas(partialText, theme, blurAmount);
    const buffer = await canvas.encode('png');
    const framePath = path.join(tmpDir, `frame-${String(index + 1).padStart(4, '0')}.png`);
    writeFileSync(framePath, buffer);
    return framePath;
  };

  let framePaths;
  if (fastProgress) {
    framePaths = await Promise.all(partialTexts.map((t, i) => renderFrame(t, i)));
  } else {
    framePaths = [];
    for (let i = 0; i < partialTexts.length; i++) {
      framePaths.push(await renderFrame(partialTexts[i], i));
    }
  }

  const durations = framePaths.map((_, i) =>
    i === framePaths.length - 1 ? holdDuration : frameDuration
  );

  const manifestLines = [];
  for (let i = 0; i < framePaths.length; i++) {
    manifestLines.push(`file '${framePaths[i].replace(/'/g, "'\\''")}'`);
    manifestLines.push(`duration ${durations[i]}`);
  }
  manifestLines.push(`file '${framePaths[framePaths.length - 1].replace(/'/g, "'\\''")}'`);
  const concatPath = path.join(tmpDir, 'concat.txt');
  writeFileSync(concatPath, manifestLines.join('\n'));

  const ext = format === 'gif' ? 'gif' : 'mp4';
  const outPath = path.join(process.cwd(), `brat-${Date.now()}.${ext}`);

  // Cek ffmpeg di folder project atau system
  let ffmpegPath = 'ffmpeg';
  const localFfmpeg = path.join(process.cwd(), 'ffmpeg.exe');
  if (fs.existsSync(localFfmpeg)) {
    ffmpegPath = localFfmpeg;
  }

  if (format === 'gif') {
    await execFileAsync(ffmpegPath, [
      '-y',
      '-f', 'concat', '-safe', '0', '-i', concatPath,
      '-vf', 'fps=10,scale=1000:1000:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=64[p];[s1][p]paletteuse=dither=bayer',
      '-loop', '0',
      outPath
    ]);
  } else {
    await execFileAsync(ffmpegPath, [
      '-y',
      '-f', 'concat', '-safe', '0', '-i', concatPath,
      '-vf', 'scale=1000:1000',
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '18',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      outPath
    ]);
  }

  rmSync(tmpDir, { recursive: true, force: true });
  return outPath;
}

// ============================================
// 🧹 WATERMARK REMOVER
// ============================================
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getMime(file) {
    const ext = path.extname(file).toLowerCase();
    if (ext === ".png") return "image/png";
    if (ext === ".webp") return "image/webp";
    if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
    return "application/octet-stream";
}

async function removeWatermark(filePath) {
    const filename = path.basename(filePath);
    const buffer = fs.readFileSync(filePath);
    const mime = getMime(filePath);
    const boundary = `----FormBoundary${Math.random().toString(36).slice(2)}`;

    const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image_file"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`),
        buffer,
        Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    const create = await axios.post(
        "https://api.ezremove.ai/api/ez-remove/watermark-remove/create-job",
        body,
        {
            headers: {
                "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36",
                "Accept": "application/json, text/plain, */*",
                "Origin": "https://ezremove.ai",
                "Referer": "https://ezremove.ai/",
                "product-serial": `sr-${Date.now()}`,
                "Content-Type": `multipart/form-data; boundary=${boundary}`,
                "Content-Length": body.length
            },
            timeout: 30000,
            validateStatus: () => true,
            maxBodyLength: Infinity,
            maxContentLength: Infinity
        }
    );

    if (create.status < 200 || create.status >= 300) {
        throw { code: create.status };
    }

    const jobId = create.data?.result?.job_id;

    if (!jobId) {
        throw { code: create.status };
    }

    for (let i = 0; i < 30; i++) {
        await sleep(2000);

        const check = await axios.get(
            `https://api.ezremove.ai/api/ez-remove/watermark-remove/get-job/${jobId}`,
            {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36",
                    "Accept": "application/json, text/plain, */*",
                    "Origin": "https://ezremove.ai",
                    "Referer": "https://ezremove.ai/",
                    "product-serial": `sr-${Date.now()}`
                },
                timeout: 15000,
                validateStatus: () => true
            }
        );

        if (check.status < 200 || check.status >= 300) {
            throw { code: check.status };
        }

        const resultUrl = check.data?.result?.output?.[0];

        if (check.data?.code === 100000 && resultUrl) {
            return resultUrl;
        }

        if (check.data?.code !== 300001) {
            throw { code: check.status };
        }
    }

    throw { code: 202 };
}

// ============================================
// 🖼️ BACKGROUND REMOVER
// ============================================
function randomName(len = 5) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < len; i++) result += chars[Math.floor(Math.random() * chars.length)];
    return result;
}

function fetchImageAsBase64(imageUrl) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(imageUrl);
        const client = parsedUrl.protocol === 'https:' ? https : http;
        const req = client.get(imageUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Android 14; Mobile; rv:144.0) Gecko/144.0 Firefox/144.0',
                'Accept': 'image/*,*/*',
            }
        }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return fetchImageAsBase64(res.headers.location).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
            const contentType = res.headers['content-type'] || 'image/jpeg';
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve(`data:${contentType};base64,${Buffer.concat(chunks).toString('base64')}`));
            res.on('error', reject);
        });
        req.on('error', reject);
    });
}

function removeBackground(encodedImage, title = 'image.jpg') {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({ encodedImage, title, mimeType: 'image/jpeg' });
        const options = {
            hostname: 'background-remover.com',
            path: '/removeImageBackground',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
                'User-Agent': 'Mozilla/5.0 (Android 14; Mobile; rv:144.0) Gecko/144.0 Firefox/144.0',
                'Referer': 'https://background-remover.com/upload',
                'Accept': '*/*',
                'Origin': 'https://background-remover.com',
            },
        };
        const req = https.request(options, (res) => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                const raw = Buffer.concat(chunks);
                if (res.statusCode !== 200) return reject(new Error(`API ${res.statusCode}`));
                const ct = res.headers['content-type'] || '';
                if (ct.includes('image/')) { resolve({ _rawBuffer: raw }); return; }
                try { resolve(JSON.parse(raw.toString())); }
                catch { resolve({ result: raw.toString() }); }
            });
            res.on('error', reject);
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

function saveBase64Image(data, outputPath) {
    const b64 = data.replace(/^data:[^;]+;base64,/, '').trim();
    fs.writeFileSync(outputPath, Buffer.from(b64, 'base64'));
}

function uploadToCloud(filePath) {
    return new Promise((resolve, reject) => {
        const fileBuffer = fs.readFileSync(filePath);
        const filename = path.basename(filePath);
        const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);
        const mimeType = filename.endsWith('.png') ? 'image/png' : 'image/jpeg';
        const header = Buffer.from([
            `--${boundary}\r\n`,
            `Content-Disposition: form-data; name="files[]"; filename="${filename}"\r\n`,
            `Content-Type: ${mimeType}\r\n`,
            `\r\n`,
        ].join(''));
        const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
        const body = Buffer.concat([header, fileBuffer, footer]);

        const options = {
            hostname: 'clooud.my.id',
            path: '/uploder/',
            method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': body.length,
                'User-Agent': 'Mozilla/5.0 (Android 14; Mobile; rv:144.0) Gecko/144.0 Firefox/144.0',
                'Accept': '*/*',
            },
        };

        const req = https.request(options, (res) => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
                catch (e) { reject(new Error('Upload parse error')); }
            });
            res.on('error', reject);
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

async function removeBackgroundImage(imageUrl) {
    const outputFile = randomName(5) + '.png';
    const title = path.basename(new URL(imageUrl).pathname || 'image.jpg');

    try {
        const encodedImage = await fetchImageAsBase64(imageUrl);
        const response = await removeBackground(encodedImage, title);

        if (response._rawBuffer) {
            fs.writeFileSync(outputFile, response._rawBuffer);
        } else {
            const resultData =
                response.encodedImageWithoutBackground ||
                response.image || response.resultImage ||
                response.output || response.data || response.result || null;

            if (!resultData) throw new Error('No image data in response');

            if (typeof resultData === 'string' && resultData.startsWith('http')) {
                saveBase64Image(await fetchImageAsBase64(resultData), outputFile);
            } else if (typeof resultData === 'string') {
                saveBase64Image(resultData, outputFile);
            } else {
                throw new Error('Unknown result format');
            }
        }

        const uploadResult = await uploadToCloud(outputFile);

        try { fs.unlinkSync(outputFile); } catch {}

        const imageUrlResult =
            uploadResult?.files?.[0]?.url ||
            uploadResult?.url ||
            uploadResult?.data?.url ||
            null;

        return imageUrlResult;

    } catch (err) {
        throw err;
    }
}

// ============================================
// 🧠 SYSTEM PROMPT - BAHASA GAUL!
// ============================================
const SYSTEM_PROMPT = `
Kamu adalah JHON BOT WA GRUP AI - asisten WhatsApp paling keren, pinter, dan gaul! 🚀🔥

# IDENTITAS 🦸
- Nama: JHON BOT WA GRUP AI
- Gaya: Gaul, asik, pake emoji
- Skill: Tahu SEGALANYA!

# CARA BICARA 😎
Pake: "gila", "sumpeh", "nah", "mantap jiwa", "gaskeun", "santuy", "bray", "gan", "sis", "wkwk", "anjay", "keknya", "boleh juga"

# ATURAN MAIN 🎯
1. Jawab SINGKAT, PADAT, JELAS, PAKE BAHASA GAUL
2. Kalo ga tau: "Waduh, gua belum update nih! 😅"
3. LANGSUNG JAWAB - jangan pake kata pengantar!

GASKEUN! 🔥🚀
`;

// ============================================
// 📋 MENU UTAMA - PROFILE BOT!
// ============================================
const MENU_TEKS = `
           🤖 JHON338 GROUP BOT 🤖
      ⚡ Smart • Fast • Secure • 24/7 ⚡

Hai @user 👋
Selamat datang di layanan resmi JHON338.

━━━ 🤖 BOT INFO ━━━━━━━━━━━━━

👑 Owner      : @owner
🤖 Nama Bot   : JHON338
📦 Mode       : Group Assistant
🌐 Platform   : WhatsApp
🟢 Status     : Online
🚀 Version    : v1.0.5
🔥 Runtime    : 24/7

━━━ 📂 MAIN MENU ━━━━━━━━━━━━

 🏠 .menu
 🤖 .ask ( PERBAIKAN )
 🎨 .stiker
 🎨 .anime ( PERBAIKAN )
 🎨 .brat
 💬 .rinchat
 📥 .ig
 🧹 .removewm ( PERBAIKAN )
 🖼️ .removebg ( PERBAIKAN )

━━━ ✨ KEUNGGULAN ━━━━━━━━━━━

⚡ Respon super cepat
🤖 AI Assistant
🛡️ Anti Spam
📥 Downloader lengkap
🎵 Music Support
🎨 Sticker Maker
👥 Group Management
🔒 Aman & Stabil

━━━ 🌐 OFFICIAL LINK ━━━━━━━━

🌳 Linktree
https://jhon338-jc.github.io/Linktree/

📢 WhatsApp Channel
https://whatsapp.com/channel/0029VbC0TW8545uvqe36Kv0b

👑 Owner
https://wa.me/6285775137463

━━━ 💬 CATATAN ━━━━━━━━━━━━━━

• Gunakan *.menu* untuk melihat semua fitur.
• Jangan spam bot.
• Gunakan bot dengan bijak.

━━━━━━━━━━━━━━━━━━━━━━

🚀 JHON338 GROUP BOT
❤️ Thank You For Using Our Service
`;

// ============================================
// 📦 INISIALISASI AI
// ============================================
const googleAI = new GoogleGenerativeAI(API_KEYS.google);
const groqClient = new Groq({ apiKey: API_KEYS.groq });
const deepseekClient = new OpenAI({
    baseURL: 'https://api.deepseek.com/v1',
    apiKey: API_KEYS.deepseek,
});
const mistralClient = new OpenAI({
    baseURL: 'https://api.mistral.ai/v1',
    apiKey: API_KEYS.mistral,
});
const ollamaClient = new OpenAI({
    baseURL: 'http://localhost:11434/v1',
    apiKey: 'ollama',
});

// ============================================
// 📋 PROVIDER AI
// ============================================
const PROVIDERS = [
    {
        name: '⚡ Google Gemini',
        client: googleAI,
        type: 'google',
        model: 'gemini-2.5-flash',
        call: async (prompt) => {
            const model = googleAI.getGenerativeModel({ 
                model: 'gemini-2.5-flash',
                generationConfig: {
                    maxOutputTokens: 300,
                    temperature: 0.85,
                    topP: 0.95,
                }
            });
            const result = await model.generateContent({
                contents: [
                    { 
                        role: 'user', 
                        parts: [{ 
                            text: `${SYSTEM_PROMPT}\n\nPERTANYAAN: ${prompt}\n\nJAWAB LANGSUNG PAKE BAHASA GAUL:\n` 
                        }] 
                    }
                ],
            });
            return result.response.text();
        }
    },
    {
        name: '⚡ Groq AI',
        client: groqClient,
        type: 'groq',
        model: 'llama-3.3-70b-specdec',
        call: async (prompt) => {
            const result = await groqClient.chat.completions.create({
                model: 'llama-3.3-70b-specdec',
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: `PERTANYAAN: ${prompt}\n\nJAWAB LANGSUNG PAKE BAHASA GAUL:` }
                ],
                max_tokens: 300,
                temperature: 0.85,
                top_p: 0.95,
            });
            return result.choices[0].message.content;
        }
    },
    {
        name: '⚡ Mistral AI',
        client: mistralClient,
        type: 'openai',
        model: 'mistral-large-latest',
        call: async (prompt) => {
            const result = await mistralClient.chat.completions.create({
                model: 'mistral-large-latest',
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: `PERTANYAAN: ${prompt}\n\nJAWAB LANGSUNG PAKE BAHASA GAUL:` }
                ],
                max_tokens: 300,
                temperature: 0.85,
                top_p: 0.95,
            });
            return result.choices[0].message.content;
        }
    },
    {
        name: '⚡ DeepSeek AI',
        client: deepseekClient,
        type: 'openai',
        model: 'deepseek-chat',
        call: async (prompt) => {
            const result = await deepseekClient.chat.completions.create({
                model: 'deepseek-chat',
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: `PERTANYAAN: ${prompt}\n\nJAWAB LANGSUNG PAKE BAHASA GAUL:` }
                ],
                max_tokens: 300,
                temperature: 0.85,
                top_p: 0.95,
            });
            return result.choices[0].message.content;
        }
    },
    {
        name: '⚡ Ollama Local',
        client: ollamaClient,
        type: 'openai',
        model: 'llama3.2',
        call: async (prompt) => {
            const result = await ollamaClient.chat.completions.create({
                model: 'llama3.2',
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: `PERTANYAAN: ${prompt}\n\nJAWAB LANGSUNG PAKE BAHASA GAUL:` }
                ],
                max_tokens: 300,
                temperature: 0.85,
                top_p: 0.95,
            });
            return result.choices[0].message.content;
        }
    },
];

// ============================================
// 🧠 FUNGSI PANGGIL AI
// ============================================
async function callAIWithFailover(prompt) {
    const errors = [];
    
    for (let i = 0; i < PROVIDERS.length; i++) {
        const provider = PROVIDERS[i];
        console.log(`🤖 Mencoba ${provider.name}...`);
        
        try {
            const response = await provider.call(prompt);
            console.log(`✅ ${provider.name} BERHASIL!`);
            return {
                success: true,
                response: response,
                provider: provider.name,
                model: provider.model,
                attempts: i + 1
            };
        } catch (error) {
            console.error(`❌ ${provider.name} GAGAL:`, error.message || error);
            errors.push(`${provider.name}: ${error.message || 'Unknown error'}`);
        }
    }
    
    return {
        success: false,
        error: `❌ SEMUA AI MATI!\n\n${errors.join('\n')}`,
        attempts: PROVIDERS.length
    };
}

// ============================================
// 🤖 BOT UTAMA
// ============================================
const bot = new WhatsAppBot({
    onMessage: async ({ sock, messageContent, senderId, isGroup, message, messageType }) => {
        console.log('📨 Pesan:', messageContent);
        console.log('📱 Dari:', senderId);
        console.log('📋 Type:', messageType);

        // ============================================
        // 🔒 CEK APAKAH GRUP DIIZINKAN
        // ============================================
        if (!isGroup) {
            console.log('⏭️ Bukan grup, diabaikan');
            return;
        }

        // Cek apakah grup ada di daftar yang diizinkan
        if (!ALLOWED_GROUPS.includes(senderId)) {
            console.log(`⏭️ Grup ${senderId} tidak diizinkan, diabaikan`);
            return;
        }

        const botNumber = sock.user.id.split(':')[0];
        const botName = sock.user.name || 'JHON BOT';

        const isMentioned = message?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.includes(sock.user.id) ||
                           messageContent?.toLowerCase().includes(`@${botName.toLowerCase()}`) ||
                           messageContent?.includes(`@${botNumber}`);

        const fullMessage =
            messageContent ||
            message?.message?.imageMessage?.caption ||
            message?.message?.videoMessage?.caption ||
            '';

        const isCommand = fullMessage.startsWith('.');

        try {
            let balasan = '';
            let isSticker = false;
            let stickerData = null;
            let senderName = 'Unknown';
            let groupName = 'Unknown Group';

            // ============================================
            // 📱 NAMA PENGIRIM & GRUP
            // ============================================
            try {
                const contact = await sock.getContact(senderId);
                senderName = contact?.name || contact?.pushname || senderId.split('@')[0];
            } catch (e) {
                senderName = senderId.split('@')[0];
            }

            try {
                const groupMeta = await sock.groupMetadata(senderId);
                groupName = groupMeta.subject || 'Unknown Group';
            } catch (e) {
                groupName = 'Unknown Group';
            }

            // ============================================
            // 📊 LOG SERVER
            // ============================================
            const phoneNumber = senderId.replace(/[^0-9]/g, '');
            console.log(`\n📊 GROUP: ${groupName}`);
            console.log(`📱 FROM: ${phoneNumber}`);
            console.log(`📋 TYPE: ${fullMessage}`);
            console.log(`🔄 REACT: SENT`);

            // ============================================
            // 🔄 KIRIM REAKSI 🔄 KE PESAN USER
            // ============================================
            try {
                await sock.sendMessage(senderId, { text: '🔄' });
                console.log('✅ Reaksi terkirim!');
            } catch (e) {
                console.log('⚠️ Gagal kirim reaksi');
            }

            // ============================================
            // 📥 .ig - INSTAGRAM DOWNLOADER (HANYA 1 VIDEO TERBAIK!)
            // ============================================
            if (isCommand && fullMessage.toLowerCase().startsWith('.ig ')) {
                const url = fullMessage.substring(4).trim();
                
                if (!url || !url.includes('instagram.com')) {
                    balasan = `
📥 *INSTAGRAM DOWNLOADER*

Cara pake:
.ig [link instagram]

Contoh:
.ig https://www.instagram.com/reel/DaMgfBkxzuv/

⚠️ *Pastikan linknya valid!*
`;
                } else {
                    try {
                        const result = await downloadInstagram(url);
                        
                        if (result.response && result.response.medias && result.response.medias.length > 0) {
                            const postInfo = result.response.post_info;
                            
                            // 🔥 AMBIL HANYA 1 MEDIA PERTAMA (VIDEO/IMAGE TERBAIK)
                            const media = result.response.medias[0];
                            
                            // Cari yang kualitas terbaik (HD > SD)
                            let bestMedia = media;
                            for (const m of result.response.medias) {
                                if (m.quality && m.quality.includes('HD') && !bestMedia.quality?.includes('HD')) {
                                    bestMedia = m;
                                    break;
                                }
                            }
                            
                            let infoText = `
📥 *INSTAGRAM POST*

👤 Username: ${postInfo.username}
❤️ Likes: ${postInfo.likes}
💬 Comments: ${postInfo.total_comments}
📅 Posted: ${postInfo.posted_at}
📝 Caption: ${postInfo.caption || 'Tidak ada caption'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📎 *Media: 1 file (HD)*
`;

                            if (bestMedia.type === 'image') {
                                await sock.sendMessage(senderId, {
                                    image: { url: bestMedia.download_url },
                                    caption: infoText
                                });
                            } else {
                                await sock.sendMessage(senderId, {
                                    video: { url: bestMedia.download_url },
                                    caption: infoText
                                });
                            }
                            
                            balasan = '✅ *Download selesai!*';
                        } else {
                            balasan = '❌ *Gagal download!* Link tidak valid atau private.';
                        }

                    } catch (error) {
                        console.error('❌ Error .ig:', error);
                        balasan = `❌ *Gagal download Instagram!*\n\nError: ${error.message}`;
                    }
                }
            }

// ============================================
// 🧹 .removewm
// ============================================
else if (isCommand && fullMessage.toLowerCase().trim() === '.removewm') {

    let imageBuffer = null;

    try {

console.log("========== DEBUG MESSAGE ==========");
console.dir(message, { depth: null });
console.log("==================================");

        let mediaMessage = null;

        // Gambar dengan caption
        if (message?.message?.imageMessage) {
            mediaMessage = message;
        }

        // Reply gambar
        else if (message?.message?.extendedTextMessage?.contextInfo?.quotedMessage) {

            const quoted = message.message.extendedTextMessage.contextInfo.quotedMessage;

            if (quoted.imageMessage) {
                mediaMessage = {
                    message: quoted
                };
            }

            else if (quoted.viewOnceMessage?.message?.imageMessage) {
                mediaMessage = {
                    message: quoted.viewOnceMessage.message
                };
            }

            else if (quoted.viewOnceMessageV2?.message?.imageMessage) {
                mediaMessage = {
                    message: quoted.viewOnceMessageV2.message
                };
            }

            else if (quoted.ephemeralMessage?.message?.imageMessage) {
                mediaMessage = {
                    message: quoted.ephemeralMessage.message
                };
            }
        }

        if (mediaMessage) {
            imageBuffer = await sock.downloadMediaMessage(mediaMessage, 'buffer');
        }

    } catch (e) {
        console.error("❌ Error ambil gambar:", e);
    }

    if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {

        balasan = `
🧹 *WATERMARK REMOVER*

Cara pake:
1. Kirim gambar DENGAN caption .removewm
   ATAU
2. Reply gambar yang sudah terkirim dengan .removewm

Contoh:
[kirim gambar] + caption .removewm
`;

    } else {

        try {

            const tempPath = path.join(process.cwd(), 'temp', `wm_${Date.now()}.jpg`);

            fs.writeFileSync(tempPath, imageBuffer);

            const resultUrl = await removeWatermark(tempPath);

            try {
                fs.unlinkSync(tempPath);
            } catch {}

            if (resultUrl) {

                await sock.sendMessage(senderId, {
                    image: {
                        url: resultUrl
                    },
                    caption:
`🧹 *Watermark Removed!*

👤 Pengirim: ${senderName}
✅ Watermark berhasil dihilangkan!`
                });

                console.log("✅ Watermark remover terkirim!");

            } else {

                balasan = "❌ Gagal menghilangkan watermark!";

            }

        } catch (error) {

            console.error("❌ Error .removewm:", error);

            balasan =
`❌ *Gagal menghilangkan watermark!*

Error:
${error.message}`;

        }

    }

}

// ============================================
// 🖼️ .removebg
// ============================================
else if (isCommand && fullMessage.toLowerCase().trim() === '.removebg') {
    let imageBuffer = null;
    
    try {

    console.log("========== DEBUG MEDIA ==========");
    console.log(JSON.stringify(message.message, null, 2));
    console.log("================================");

    let mediaMessage = null;

    // Kirim gambar + caption
    if (message.message?.imageMessage) {
        mediaMessage = message;
    }

    // Reply gambar
    else if (message.message?.extendedTextMessage?.contextInfo?.quotedMessage) {

        const quoted = message.message.extendedTextMessage.contextInfo.quotedMessage;

        if (quoted.imageMessage) {
            mediaMessage = {
                message: quoted
            };
        }

        else if (quoted.viewOnceMessage?.message?.imageMessage) {
            mediaMessage = {
                message: quoted.viewOnceMessage.message
            };
        }

        else if (quoted.viewOnceMessageV2?.message?.imageMessage) {
            mediaMessage = {
                message: quoted.viewOnceMessageV2.message
            };
        }

        else if (quoted.ephemeralMessage?.message?.imageMessage) {
            mediaMessage = {
                message: quoted.ephemeralMessage.message
            };
        }
    }

    if (mediaMessage) {
        imageBuffer = await sock.downloadMediaMessage(mediaMessage, 'buffer');
    }

} catch (e) {
    console.error("❌ Error ambil gambar:", e);
}

    // KALO GAK ADA GAMBAR, KASIH PANDUAN
    if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
        balasan = `
🖼️ *BACKGROUND REMOVER*

Cara pake:
1. Kirim gambar DENGAN caption .removebg
   ATAU
2. Reply gambar yang sudah terkirim dengan .removebg

Contoh: [kirim gambar] + caption .removebg
`;
    } else {
        try {
            // Proses menghilangkan background
            const tempPath = path.join(process.cwd(), 'temp', `bg_${Date.now()}.jpg`);
            fs.writeFileSync(tempPath, imageBuffer);
            
            const uploadResult = await uploadToCloud(tempPath);
            const imageUrl = uploadResult?.files?.[0]?.url || uploadResult?.url || uploadResult?.data?.url;
            
            if (!imageUrl) {
                balasan = '❌ Gagal upload gambar!';
            } else {
                const resultUrl = await removeBackgroundImage(imageUrl);
                
                if (resultUrl) {
                    await sock.sendMessage(senderId, {
                        image: { url: resultUrl },
                        caption: `🖼️ *Background Removed!*\n\n👤 Pengirim: ${senderName}\n✅ Background berhasil dihilangkan!`
                    });
                    console.log('✅ Background remover terkirim!');
                } else {
                    balasan = '❌ Gagal menghilangkan background!';
                }
            }
            
            try { fs.unlinkSync(tempPath); } catch (e) {}

        } catch (error) {
            console.error('❌ Error .removebg:', error);
            balasan = `❌ *Gagal menghilangkan background!*\n\nError: ${error.message}`;
        }
    }
}

// ============================================
// 🎨 .anime
// ============================================
else if (isCommand && fullMessage.toLowerCase().trim() === '.anime') {

    let imageBuffer = null;

    try {

        console.log("========== DEBUG MEDIA ==========");
        console.log(JSON.stringify(message.message, null, 2));
        console.log("================================");

        let mediaMessage = null;

        // Gambar dengan caption
        if (message?.message?.imageMessage) {
            mediaMessage = message;
        }

        // Reply gambar
        else if (message?.message?.extendedTextMessage?.contextInfo?.quotedMessage) {

            const quoted = message.message.extendedTextMessage.contextInfo.quotedMessage;

            if (quoted.imageMessage) {
                mediaMessage = {
                    message: quoted
                };
            }

            else if (quoted.viewOnceMessage?.message?.imageMessage) {
                mediaMessage = {
                    message: quoted.viewOnceMessage.message
                };
            }

            else if (quoted.viewOnceMessageV2?.message?.imageMessage) {
                mediaMessage = {
                    message: quoted.viewOnceMessageV2.message
                };
            }

            else if (quoted.ephemeralMessage?.message?.imageMessage) {
                mediaMessage = {
                    message: quoted.ephemeralMessage.message
                };
            }
        }

        if (mediaMessage) {
            imageBuffer = await sock.downloadMediaMessage(mediaMessage, 'buffer');
        }

    } catch (e) {
        console.error("❌ Error ambil gambar:", e);
    }

    if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {

        balasan = `
🎨 *UBAH GAMBAR KE ANIME*

Cara pake:
1. Kirim gambar DENGAN caption .anime
   ATAU
2. Reply gambar yang sudah terkirim dengan .anime

Contoh:
[kirim gambar] + caption .anime
`;

    } else {

        try {

            const animePath = await imageToAnime(imageBuffer);

            if (animePath) {

                await sock.sendMessage(senderId, {
                    image: {
                        url: animePath
                    },
                    caption:
`✨ *Hasil Anime!*

👤 Pengirim: ${senderName}
🎨 Gaya: Studio Ghibli Style`
                });

                console.log("✅ Gambar anime terkirim!");

            } else {

                balasan = "❌ Gagal mengubah gambar menjadi anime!";

            }

        } catch (error) {

            console.error("❌ Error .anime:", error);

            balasan =
`❌ *Gagal mengubah ke anime!*

Error:
${error.message}`;

        }

    }

}

            // ============================================
            // 💬 .rinchat
            // ============================================
            else if (isCommand && fullMessage.toLowerCase().startsWith('.rinchat ')) {
                const text = fullMessage.substring(9).trim();
                
                if (!text || text.length < 1) {
                    balasan = `
💬 *RINCHAT GENERATOR*

Buat gambar chat ala RIN!

Cara pake:
.rinchat [teks kamu]

Contoh:
.rinchat Earth without art is just "eh" 🌍🎨✨

GASKEUN! 💬🔥
`;
                } else {
                    try {
                        let chatText = text;
                        let imageUrl = null;
                        
                        const urlMatch = text.match(/(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|webp))/i);
                        if (urlMatch) {
                            imageUrl = urlMatch[1];
                            chatText = text.replace(urlMatch[1], '').trim();
                        }

                        const rinPath = await generateRinchat({ 
                            text: chatText || 'Earth without art is just "eh" 🌍🎨✨',
                            time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
                            imageUrl: imageUrl
                        });

                        await sock.sendMessage(senderId, {
                            image: { url: rinPath }
                        });
                        console.log('✅ RINCHAT image terkirim!');

                        setTimeout(() => {
                            try {
                                if (fs.existsSync(rinPath)) fs.unlinkSync(rinPath);
                            } catch (e) {}
                        }, 5000);

                    } catch (error) {
                        console.error('❌ Error .rinchat:', error);
                        balasan = `❌ *Gagal bikin RINCHAT!*\n\nError: ${error.message}`;
                    }
                }
            }

            // ============================================
            // 🎬 .bratvid - BUAT VIDEO BRAT STYLE
            // ============================================
            else if (isCommand && fullMessage.toLowerCase().startsWith('.bratvid ')) {
                const text = fullMessage.substring(9).trim();

                if (!text || text.length < 1) {
                    balasan = `
🎬 *BRAT VIDEO GENERATOR*

Buat video keren dari teks!

Cara pake:
.bratvid [teks kamu]

Contoh:
.bratvid Halo Guys Nama Saya

GASKEUN! 🔥
`;
                } else {
                    try {
                        // Kirim reaksi loading
                        await sock.sendMessage(senderId, { text: '⏳' });

                        const videoPath = await generateBratVideo({
                            text: text,
                            theme: 'white',
                            blur: 0,
                            format: 'mp4',
                            frameDuration: 0.35,
                            holdDuration: 1.2,
                            maxWordPerLayer: 1,
                            maxWordBeforeReset: 0,
                            fastProgress: false
                        });

                        // Kirim video
                        await sock.sendMessage(senderId, {
                            video: { url: videoPath },
                            caption: `🎬 *BRAT VIDEO!*\n\n📝 Teks: ${text}\n👤 Pengirim: ${senderName}\n🔥 GASKEUN! 💀`
                        });

                        // Hapus file temp
                        setTimeout(() => {
                            try { if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath); } catch (e) {}
                        }, 5000);

                        console.log('✅ BRAT video terkirim!');

                    } catch (error) {
                        console.error('❌ Error .bratvid:', error);
                        balasan = `❌ *Gagal bikin BRAT video!*\n\nError: ${error.message}`;
                    }
                }
            }

            // ============================================
            // 🎨 .brat
            // ============================================
            else if (isCommand && fullMessage.toLowerCase().startsWith('.brat ')) {
                const text = fullMessage.substring(6).trim();
                
                if (!text || text.length < 1) {
                    balasan = `
🎨 *BRAT STYLE GENERATOR*

Cara pake:
.brat [teks kamu]

Contoh:
.brat Halo Guys Nama Saya JHON

GASKEUN! 💀
`;
                } else {
                    try {
                        const bratPath = await generateBrat({ 
                            text: text, 
                            theme: 'white', 
                            blur: 0 
                        });

                        await sock.sendMessage(senderId, {
                            image: { url: bratPath }
                        });
                        console.log('✅ BRAT image terkirim!');

                        setTimeout(() => {
                            try {
                                if (fs.existsSync(bratPath)) fs.unlinkSync(bratPath);
                            } catch (e) {}
                        }, 5000);

                    } catch (error) {
                        console.error('❌ Error .brat:', error);
                        balasan = `❌ *Gagal bikin BRAT!*\n\nError: ${error.message}`;
                    }
                }
            }

            // ============================================
            // 🔥 .menu
            // ============================================
            else if (isCommand && messageContent.toLowerCase().trim() === '.menu') {
                if (BANNER_EXISTS && BANNER_BUFFER) {
                    await sock.sendMessage(senderId, {
                        image: BANNER_BUFFER,
                        caption: MENU_TEKS
                    });
                    console.log('✅ Banner + Menu terkirim!');
                } else {
                    balasan = MENU_TEKS;
                }
            }

            // ============================================
            // 🎨 .stiker
            // ============================================
            else if (isCommand && messageContent.toLowerCase().startsWith('.stiker ')) {
                const text = messageContent.substring(8).trim();
                
                if (!text || text.length < 1) {
                    balasan = '❌ *Teksnya mana?*\n\nContoh: .stiker kamu lucu ihh';
                } else {
                    try {
                        const result = await createSticker(text, {
                            width: 512,
                            height: 512,
                            backgroundColor: '#FFFFFF',
                            textColor: '#000000',
                            fontFamily: 'Arial',
                            maxWidth: 460,
                            minFontSize: 30,
                            maxFontSize: 130,
                            padding: 30,
                        });

                        stickerData = result;
                        isSticker = true;

                    } catch (error) {
                        console.error('❌ Error stiker:', error);
                        balasan = `❌ *Gagal bikin stiker!*\n\nError: ${error.message}`;
                    }
                }
            }

            // ============================================
            // 📝 .ask
            // ============================================
            else if (isCommand && messageContent.toLowerCase().startsWith('.ask ')) {
                const pertanyaan = messageContent.substring(5).trim();
                
                if (!pertanyaan || pertanyaan.length < 2) {
                    balasan = '❌ Pertanyaan pendek amat! Coba yang lebih seru! 😅';
                } else {
                    const result = await callAIWithFailover(pertanyaan);
                    
                    if (result.success) {
                        balasan = `${result.response}`;
                    } else {
                        balasan = `❌ *ERROR:* ${result.error}`;
                    }
                }
            }

            // ============================================
            // 📋 COMMAND LAIN
            // ============================================
            else if (isCommand) {
                const command = messageContent.toLowerCase().trim();

                if (command === '.help') {
                    if (BANNER_EXISTS && BANNER_BUFFER) {
                        await sock.sendMessage(senderId, {
                            image: BANNER_BUFFER,
                            caption: MENU_TEKS
                        });
                    } else {
                        balasan = MENU_TEKS;
                    }
                } else {
                    balasan = `❌ Command *${command}* tidak dikenal.\n\nKetik *.menu* buat lihat semua command! 💀`;
                }
            }

            // ============================================
            // 🗣️ MENTION
            // ============================================
            else if (isMentioned && !balasan) {
                const cleanMessage = messageContent
                    .replace(/@\S+/g, '')
                    .trim();
                
                if (!cleanMessage || cleanMessage.length < 3) {
                    balasan = `💀 Halo! Ketik *.menu* buat lihat command! 🔥`;
                } else {
                    const result = await callAIWithFailover(cleanMessage);
                    
                    if (result.success) {
                        balasan = `${result.response}`;
                    } else {
                        balasan = `❌ *ERROR:* ${result.error}`;
                    }
                }
            }

            // ============================================
            // 📤 KIRIM
            // ============================================
            if (isSticker && stickerData) {
                await sock.sendMessage(senderId, { 
                    sticker: stickerData.buffer,
                    mimetype: 'image/webp',
                });
                console.log('✅ Stiker WA terkirim!');
            } else if (balasan) {
                if (balasan.length > 60000) {
                    balasan = balasan.substring(0, 60000) + '\n\n... (pesan kepotong)';
                }
                await sock.sendMessage(senderId, { text: balasan });
                console.log('✅ Balasan terkirim!');
            }

        } catch (error) {
            console.error('❌ ERROR:', error);
            await sock.sendMessage(senderId, { 
                text: `❌ *ERROR:* ${error.message}\n\nBot error nih, coba lagi! 🙏` 
            });
        }
    }
});

// ============================================
// 🚀 JALANKAN BOT
// ============================================
console.log('🚀 STARTING JHON BOT WA GRUP AI!');
console.log('='.repeat(50));

if (!fs.existsSync('temp')) {
    fs.mkdirSync('temp');
    console.log('📁 Folder temp dibuat');
}

if (!fs.existsSync('fonts')) {
    fs.mkdirSync('fonts');
    console.log('📁 Folder fonts dibuat');
}

if (!fs.existsSync('assets')) {
    fs.mkdirSync('assets');
    console.log('📁 Folder assets dibuat');
}

console.log(`📸 Banner: ${BANNER_EXISTS ? '✅ DITEMUKAN' : '❌ TIDAK DITEMUKAN'}`);
console.log(`🤗 Hugging Face API: ✅ TERINSTAL (GRATIS!)`);
console.log(`🎨 BRAT Canvas: ✅ TERINSTAL (GRATIS!)`);
console.log(`💬 RINCHAT: ✅ TERINSTAL (GRATIS!)`);
console.log(`📥 Instagram Downloader: ✅ TERINSTAL (GRATIS!)`);
console.log(`🧹 Watermark Remover: ✅ TERINSTAL (GRATIS!)`);
console.log(`🖼️ Background Remover: ✅ TERINSTAL (GRATIS!)`);
console.log('='.repeat(50));

const sock = await bot.start();
console.log(`✅ ${sock?.user?.name || 'JHON BOT'} ONLINE!`);
console.log(`📋 AI Provider: ${PROVIDERS.length}`);
console.log('='.repeat(50));
console.log('🔥 USER COMMAND:');
console.log('   .menu        - Menu utama (dengan banner)');
console.log('   .ask [text]  - Tanya jawab AI (Langsung jawab gaul!)');
console.log('   .stiker [text] - Bikin stiker');
console.log('   .anime       - Upload gambar jadi anime');
console.log('   .brat [text] - Bikin gambar BRAT style');
console.log('   .rinchat [text] - Bikin gambar chat RIN');
console.log('   .ig [link]   - Download Instagram');
console.log('   .removewm    - Hilangkan watermark (kirim/reply gambar)');
console.log('   .removebg    - Hilangkan background (kirim/reply gambar)');
console.log('='.repeat(50));
console.log('📊 LOG SERVER FORMAT:');
console.log('   📊 GROUP: [Nama Grup]');
console.log('   📱 FROM: [Nomor WA]');
console.log('   📋 TYPE: [Perintah]');
console.log('   🔄 REACT: SENT');
console.log('='.repeat(50));
console.log('💀 JHON BOT WA GRUP AI - SYSTEM READY!');
console.log('🚀 GASKEUN BRO! 🔥');