// =========================================================
// import.js — lecture des fichiers texte et des sauvegardes JSON
// Deux formats texte sont reconnus automatiquement :
//   1. l'export d'Anki « Notes en texte brut » (colonnes séparées par des tabulations)
//   2. une liste simple, une carte par ligne : mot ; définition
// =========================================================

// Noms de séparateurs qu'Anki écrit dans l'en-tête « #separator:… »
const SEPARATORS = { tab: '\t', comma: ',', semicolon: ';', space: ' ', pipe: '|', colon: ':' };

// ---------- Texte -> liste de { word, definition } ----------

export function parseText(rawText) {
  // Retours à la ligne Windows/Mac -> \n, et retrait de l'éventuel BOM en tout début de fichier
  const text = rawText.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const header = readAnkiHeader(text);

  // Format Anki si l'en-tête le dit, ou si une ligne de données contient une tabulation
  const dataLines = text.split('\n').filter((line) => line.trim() && !line.startsWith('#'));
  const separator = header.separator || (dataLines.some((line) => line.includes('\t')) ? '\t' : null);

  if (separator) return parseAnki(text, separator, header);
  return parseList(dataLines);
}

// Lit les lignes d'en-tête d'Anki, par exemple :
//   #separator:tab   #html:true   #guid column:1   #notetype column:2   #deck column:3   #tags column:6
function readAnkiHeader(text) {
  const header = { separator: null, html: true, skipColumns: new Set() };
  for (const line of text.split('\n')) {
    if (!line.startsWith('#')) break;   // l'en-tête est toujours en haut du fichier
    const [key, ...rest] = line.slice(1).split(':');
    const value = rest.join(':').trim();
    const name = key.trim().toLowerCase();
    if (name === 'separator') header.separator = SEPARATORS[value.toLowerCase()] || value || null;
    else if (name === 'html') header.html = value.toLowerCase() !== 'false';
    else if (/^(guid|notetype|deck|tags) column$/.test(name)) header.skipColumns.add(Number(value) - 1);
  }
  return header;
}

// Export Anki : on garde les 2 premières colonnes utiles (recto = mot, verso = définition).
function parseAnki(text, separator, header) {
  const entries = [];
  let skipped = 0;
  for (const fields of splitRecords(text, separator)) {
    if (fields.length === 1 && !fields[0].trim()) continue;          // ligne vide
    const useful = fields.filter((_, index) => !header.skipColumns.has(index));
    const word = cleanField(useful[0] || '', header.html);
    const definition = cleanField(useful[1] || '', header.html);
    if (word && definition) entries.push({ word, definition });
    else skipped++;
  }
  return { entries, skipped };
}

// Liste « mot ; définition » : on coupe au PREMIER point-virgule seulement,
// la définition peut donc elle-même contenir des « ; ».
function parseList(lines) {
  const entries = [];
  let skipped = 0;
  for (const line of lines) {
    const cut = line.indexOf(';');
    const word = cut > 0 ? cleanField(line.slice(0, cut), false) : '';
    const definition = cut > 0 ? cleanField(line.slice(cut + 1), false) : '';
    if (word && definition) entries.push({ word, definition });
    else skipped++;
  }
  return { entries, skipped };
}

// Découpe le texte en lignes et en colonnes, en respectant les guillemets à la façon CSV :
//   "texte avec ""guillemets"" ou une tabulation"  ->  texte avec "guillemets" ou une tabulation
// Une ligne qui commence par # est ignorée.
function splitRecords(text, separator) {
  const records = [];
  let fields = [];
  let field = '';
  let inQuotes = false;
  let lineStart = true;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch !== '"') field += ch;
      else if (text[i + 1] === '"') { field += '"'; i++; }          // "" = un guillemet
      else inQuotes = false;                                       // guillemet fermant
      continue;
    }

    if (lineStart && ch === '#') {                                 // ligne de commentaire
      const end = text.indexOf('\n', i);
      i = end < 0 ? text.length : end;
      continue;
    }
    lineStart = false;

    if (ch === '"' && field === '') inQuotes = true;               // guillemet ouvrant
    else if (ch === separator) { fields.push(field); field = ''; }
    else if (ch === '\n') {
      fields.push(field);
      records.push(fields);
      fields = [];
      field = '';
      lineStart = true;
    } else field += ch;
  }
  if (!lineStart) { fields.push(field); records.push(fields); }    // dernière ligne sans \n
  return records;
}

// Nettoie un champ : HTML retiré (mais retours à la ligne gardés), sons Anki retirés, espaces en trop.
function cleanField(value, isHtml) {
  let text = isHtml ? htmlToText(value) : value;
  text = text
    .replace(/\[sound:[^\]]*\]/g, '')     // [sound:fichier.mp3] d'Anki
    .replace(/ /g, ' ');            // espace insécable -> espace normal
  return text
    .split('\n').map((line) => line.trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Transforme du HTML en texte brut. DOMParser n'exécute aucun script : c'est sans danger.
function htmlToText(html) {
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|li|h[1-6]|tr)>/gi, '\n');
  return new DOMParser().parseFromString(withBreaks, 'text/html').body.textContent || '';
}

// ---------- Sauvegarde JSON ----------

// Fabrique le contenu du fichier de sauvegarde (cartes + progression + réglages).
export function buildBackup(data) {
  return JSON.stringify({
    app: 'lexique',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: data.settings,
    cards: data.cards,
  }, null, 2);
}

// Relit un fichier de sauvegarde et vérifie qu'il est utilisable.
// Lève une erreur avec un message clair sinon.
export function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Ce fichier n\'est pas un JSON valide.');
  }
  if (!data || data.app !== 'lexique' || !Array.isArray(data.cards)) {
    throw new Error('Ce fichier n\'est pas une sauvegarde Lexique.');
  }
  const cards = data.cards.filter(isValidCard);
  if (cards.length !== data.cards.length) {
    throw new Error(`${data.cards.length - cards.length} carte(s) abîmée(s) dans ce fichier : restauration annulée.`);
  }
  // La date de la sauvegarde devient la « dernière sauvegarde » connue
  return { settings: { ...data.settings, lastBackup: data.exportedAt || null }, cards };
}

// Une carte doit avoir un mot, une définition et un état FSRS lisible.
function isValidCard(card) {
  if (!card || typeof card !== 'object') return false;
  const f = card.fsrs;
  return typeof card.word === 'string' && card.word.trim() !== ''
    && typeof card.definition === 'string'
    && f && !Number.isNaN(new Date(f.due).getTime())
    && [0, 1, 2, 3].includes(f.state)
    && ['stability', 'difficulty', 'reps', 'lapses'].every((key) => typeof f[key] === 'number');
}
