// =========================================================
// store.js — stockage des cartes dans le téléphone (localStorage)
// Tout tient dans un seul objet JSON :
//   { version: 1, settings: {...}, cards: [ {id, word, definition, ...}, ... ] }
// =========================================================

const KEY = 'lexique.v1';
const DEFAULT_SETTINGS = {
  newPerDay: 20,      // nombre de nouvelles cartes présentées par jour
  lastBackup: null,   // date du dernier export JSON (texte ISO)
};

// Les données vivent en mémoire ; chaque modification est réécrite dans localStorage.
let data = load();

// Lit les données sauvegardées, ou repart d'une base vide si rien n'existe encore.
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      return {
        version: 1,
        settings: { ...DEFAULT_SETTINGS, ...saved.settings },
        cards: Array.isArray(saved.cards) ? saved.cards : [],
      };
    }
  } catch (err) {
    console.error('Lecture impossible, base vide utilisée', err);
  }
  return { version: 1, settings: { ...DEFAULT_SETTINGS }, cards: [] };
}

// Réécrit tout dans localStorage (quelques ms même pour des milliers de cartes).
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (err) {
    // Arrive si le stockage est plein : on prévient plutôt que de perdre des données en silence
    alert("Impossible d'enregistrer : le stockage du téléphone est plein ou bloqué.");
    throw err;
  }
}

// Demande à Safari de ne pas effacer nos données quand il fait du ménage.
export async function askPersistentStorage() {
  try {
    if (navigator.storage && navigator.storage.persist) await navigator.storage.persist();
  } catch { /* pas grave si le navigateur refuse */ }
}

// Identifiant unique pour chaque carte.
function newId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ---------- Lecture ----------

export function getCards() {
  return data.cards;
}

export function getCard(id) {
  return data.cards.find((c) => c.id === id);
}

export function getSettings() {
  return data.settings;
}

// Mot « normalisé » pour repérer les doublons : sans espaces autour, sans majuscules.
export function normalizeWord(word) {
  return word.normalize('NFC').trim().toLowerCase();
}

// ---------- Écriture ----------

// Ajoute plusieurs cartes d'un coup (une seule écriture, pratique pour l'import).
// Chaque élément : { word, definition, fsrs } où fsrs est l'état de planification initial.
export function addCards(list) {
  const now = new Date().toISOString();
  const created = list.map((item) => ({
    id: newId(),
    word: item.word.trim(),
    definition: item.definition.trim(),
    created: now,
    introduced: null,   // date de la toute première révision (null = jamais vue)
    fsrs: item.fsrs,
  }));
  data.cards.push(...created);
  save();
  return created;
}

// Modifie une carte (mot, définition ou état FSRS) en gardant le reste.
export function updateCard(id, changes) {
  const card = getCard(id);
  if (!card) return null;
  Object.assign(card, changes);
  save();
  return card;
}

export function deleteCard(id) {
  data.cards = data.cards.filter((c) => c.id !== id);
  save();
}

export function updateSettings(changes) {
  Object.assign(data.settings, changes);
  save();
}

// Remplace toute la base (restauration d'une sauvegarde JSON).
export function replaceAll(newData) {
  data = {
    version: 1,
    settings: { ...DEFAULT_SETTINGS, ...newData.settings },
    cards: newData.cards,
  };
  save();
}

// Copie complète des données, pour l'export JSON.
export function exportData() {
  return JSON.parse(JSON.stringify(data));
}
