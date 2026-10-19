// =========================================================
// app.js — point d'entrée : navigation et branchement des écrans
// =========================================================

import * as store from './store.js';
import * as srs from './srs.js';
import * as importer from './import.js';

// Raccourci pour attraper un élément de la page.
const $ = (selector) => document.querySelector(selector);

// =========================================================
// Navigation entre les 3 écrans
// =========================================================

const views = {
  review: $('#view-review'),
  cards: $('#view-cards'),
  more: $('#view-more'),
};
let currentView = 'review';

// Affiche un écran, cache les autres, et le met à jour.
function showView(name) {
  currentView = name;
  for (const [key, el] of Object.entries(views)) el.hidden = key !== name;
  for (const tab of document.querySelectorAll('.tab')) {
    if (tab.dataset.view === name) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  refresh();
  views[name].scrollTop = 0;
}

// Redessine l'écran affiché (après un changement d'onglet ou une modification des données).
function refresh() {
  if (currentView === 'review') renderReview();
  else renderCounters(new Date());
  if (currentView === 'cards') renderCards();
  if (currentView === 'more') renderMore();
}

for (const tab of document.querySelectorAll('.tab')) {
  tab.addEventListener('click', () => showView(tab.dataset.view));
}

// =========================================================
// Écran Réviser
// =========================================================

const flashcard = $('#flashcard');
let current = null;     // la carte affichée
let flipped = false;    // true quand la définition est visible
let wakeTimer = null;   // réveil pour la prochaine carte en apprentissage

// Met à jour le compteur du jour et la pastille de l'onglet.
function renderCounters(now) {
  const stats = srs.getStats(store.getCards(), store.getSettings(), now);
  $('#due-count').textContent = stats.total;
  $('#due-label').textContent = stats.total > 1 ? 'cartes à réviser aujourd\'hui' : 'carte à réviser aujourd\'hui';
  const parts = [];
  if (stats.reviews) parts.push(`${stats.reviews} révision${stats.reviews > 1 ? 's' : ''}`);
  if (stats.newToday) parts.push(`${stats.newToday} nouvelle${stats.newToday > 1 ? 's' : ''}`);
  $('#due-detail').textContent = parts.join(' · ');
  const badge = $('#tab-badge');
  badge.textContent = stats.total;
  badge.hidden = stats.total === 0;
}

// Choisit la carte suivante et l'affiche (ou un message s'il n'y en a pas).
function renderReview() {
  const now = new Date();
  const cards = store.getCards();
  const settings = store.getSettings();
  clearTimeout(wakeTimer);
  renderCounters(now);

  current = srs.nextCard(cards, settings, now);
  const hasCard = Boolean(current);
  $('#stage').hidden = !hasCard;
  $('#review-empty').hidden = hasCard;
  $('#show-bar').hidden = !hasCard;
  $('#ratings').hidden = true;

  if (hasCard) showCard(current);
  else renderEmpty(cards, settings, now);
}

// Pose une carte côté « mot », sans animation de retournement, puis la fait apparaître.
function showCard(card) {
  flipped = false;
  flashcard.classList.add('no-anim');
  flashcard.classList.remove('flipped');
  $('#card-word').textContent = card.word;
  $('#card-word-back').textContent = card.word;
  $('#card-definition').textContent = card.definition;
  void flashcard.offsetWidth;            // force le navigateur à appliquer le changement tout de suite
  flashcard.classList.remove('no-anim');

  // Petite entrée en douceur de la nouvelle carte
  flashcard.classList.remove('enter');
  void flashcard.offsetWidth;
  flashcard.classList.add('enter');
  flashcard.setAttribute('aria-label', `Mot : ${card.word}. Touche pour voir la définition.`);
}

// Retourne la carte : mot -> définition (et inversement si on retouche).
function flip() {
  if (!current) return;
  flipped = !flipped;
  flashcard.classList.toggle('flipped', flipped);
  if (flipped && $('#ratings').hidden) {
    // Premier retournement : on calcule les intervalles et on montre les 4 boutons
    const intervals = srs.previewIntervals(current, new Date());
    for (const small of document.querySelectorAll('[data-interval]')) {
      small.textContent = intervals[small.dataset.interval];
    }
    $('#show-bar').hidden = true;
    $('#ratings').hidden = false;
  }
  flashcard.setAttribute('aria-label', flipped
    ? `Définition : ${current.definition}`
    : `Mot : ${current.word}. Touche pour voir la définition.`);
}

// Enregistre la note donnée à la carte, puis passe à la suivante.
function rateCurrent(rating) {
  if (!current || $('#ratings').hidden) return;
  store.updateCard(current.id, srs.rate(current, rating, new Date()));
  renderReview();
}

// Message quand il n'y a rien à réviser maintenant.
function renderEmpty(cards, settings, now) {
  const title = $('#empty-title');
  const text = $('#empty-text');
  $('#btn-empty-add').hidden = cards.length > 0;

  if (cards.length === 0) {
    title.textContent = 'Aucune carte';
    text.textContent = 'Ajoute ta première carte, ou importe une liste depuis l\'onglet Plus.';
    return;
  }

  const next = srs.nextDueDate(cards);
  const stats = srs.getStats(cards, settings, now);
  if (stats.total > 0 && next) {
    // Il reste des cartes en apprentissage plus tard aujourd'hui : on se réveillera à l'heure
    const wait = next - now;
    title.textContent = 'Petite pause';
    text.textContent = `Prochaine carte dans ${srs.formatDuration(wait)}.`;
    wakeTimer = setTimeout(renderReview, Math.max(1000, wait - 20 * 60 * 1000));
    return;
  }

  title.textContent = 'Fini pour aujourd\'hui';
  const remainingNew = stats.newCards > 0 && srs.newQuotaLeft(cards, settings, now) === 0;
  if (remainingNew) {
    text.textContent = `Tu as vu tes ${settings.newPerDay} nouvelles cartes du jour. `
      + 'Tu peux changer ce nombre dans l\'onglet Plus.';
  } else if (next) {
    text.textContent = `Prochaine révision : ${srs.describeDay(next, now)}.`;
  } else {
    text.textContent = 'Ajoute de nouvelles cartes pour continuer.';
  }
}

flashcard.addEventListener('click', flip);
$('#btn-show').addEventListener('click', flip);
for (const btn of document.querySelectorAll('.rate')) {
  btn.addEventListener('click', () => rateCurrent(Number(btn.dataset.rating)));
}

// Raccourcis clavier (utile sur ordinateur) : Espace = retourner, 1 à 4 = noter.
document.addEventListener('keydown', (event) => {
  if (currentView !== 'review' || document.querySelector('dialog[open]')) return;
  if (event.target.matches('input, textarea')) return;
  if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); flip(); }
  if (['1', '2', '3', '4'].includes(event.key)) rateCurrent(Number(event.key));
});

// Quand on revient sur l'app (elle était en arrière-plan), on rafraîchit
// la carte du moment, sauf si une définition est déjà affichée.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && currentView === 'review' && !flipped) renderReview();
});

// =========================================================
// Écran Cartes : liste, recherche, ajout / modification / suppression
// =========================================================

// Texte simplifié pour la recherche : minuscules et sans accents (« reception » trouve « Réception »).
const searchKey = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Affiche la liste des cartes, filtrée par la recherche et triée par ordre alphabétique.
function renderCards() {
  const cards = store.getCards();
  const query = searchKey($('#search').value.trim());
  const now = new Date();

  const shown = cards
    .filter((c) => !query || searchKey(c.word).includes(query) || searchKey(c.definition).includes(query))
    .sort((a, b) => a.word.localeCompare(b.word, 'fr', { sensitivity: 'base' }));

  $('#cards-count').textContent = `${cards.length} carte${cards.length > 1 ? 's' : ''}`;
  $('#card-list').replaceChildren(...shown.map((card) => cardItem(card, now)));

  const empty = $('#cards-empty');
  empty.hidden = shown.length > 0;
  empty.textContent = cards.length ? 'Aucune carte ne correspond à ta recherche.' : 'Pas encore de carte.';
}

// Une ligne de la liste. On passe par textContent (jamais innerHTML) :
// un texte importé ne peut donc pas injecter de code dans la page.
function cardItem(card, now) {
  const li = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'card-item';

  const top = document.createElement('span');
  top.className = 'card-item-top';
  const word = document.createElement('span');
  word.className = 'card-item-word';
  word.textContent = card.word;
  const due = document.createElement('span');
  due.className = 'card-item-due';
  due.textContent = srs.describeDue(card, now);
  top.append(word, due);

  const def = document.createElement('span');
  def.className = 'card-item-def';
  def.textContent = card.definition.split('\n')[0];

  button.append(top, def);
  button.addEventListener('click', () => openEditor(card));
  li.append(button);
  return li;
}

// ---------- Fenêtre d'ajout / modification ----------

const dialog = $('#card-dialog');
let editingId = null;   // null = nouvelle carte, sinon id de la carte modifiée

function openEditor(card = null) {
  editingId = card ? card.id : null;
  $('#dialog-title').textContent = card ? 'Modifier la carte' : 'Nouvelle carte';
  $('#field-word').value = card ? card.word : '';
  $('#field-definition').value = card ? card.definition : '';
  $('#field-progress').textContent = card ? srs.describeProgress(card) : '';
  $('#btn-delete').hidden = !card;
  dialog.showModal();
  // Nouvelle carte : on ouvre directement le clavier sur le champ « Mot »
  if (!card) $('#field-word').focus();
}

$('#card-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const word = $('#field-word').value.trim();
  const definition = $('#field-definition').value.trim();
  if (!word || !definition) return;

  // Même mot déjà présent ? On demande avant de créer un doublon.
  const twin = store.getCards().find((c) => c.id !== editingId
    && store.normalizeWord(c.word) === store.normalizeWord(word));
  if (twin && !confirm(`« ${twin.word} » existe déjà. Enregistrer quand même ?`)) return;

  if (editingId) store.updateCard(editingId, { word, definition });   // la progression est gardée
  else store.addCards([{ word, definition, fsrs: srs.newSchedule() }]);
  dialog.close();
  refresh();
});

$('#btn-delete').addEventListener('click', () => {
  const card = store.getCard(editingId);
  if (!card || !confirm(`Supprimer « ${card.word} » et sa progression ?`)) return;
  store.deleteCard(card.id);
  dialog.close();
  refresh();
});

$('#btn-cancel').addEventListener('click', () => dialog.close());
$('#btn-add').addEventListener('click', () => openEditor());
$('#btn-empty-add').addEventListener('click', () => openEditor());
$('#search').addEventListener('input', renderCards);

// =========================================================
// Écran Plus : import, sauvegarde, réglages
// =========================================================

// Remplit l'écran avec les valeurs actuelles.
function renderMore() {
  const settings = store.getSettings();
  $('#new-per-day').value = settings.newPerDay;
  $('#backup-info').textContent = `Dernière sauvegarde : ${describeLastBackup(settings.lastBackup)}.`;
}

function describeLastBackup(iso) {
  if (!iso) return 'jamais';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
  if (days < 1) return 'aujourd\'hui';
  if (days === 1) return 'hier';
  return `il y a ${days} jours`;
}

const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;

// ---------- Import texte (Anki ou liste) ----------

// Ajoute les cartes lues en ignorant les mots déjà présents. Renvoie le message de bilan.
function importText(text) {
  if (text.trim().startsWith('{')) {
    return 'Ce fichier ressemble à une sauvegarde JSON : utilise plutôt « Restaurer… ».';
  }
  const { entries, skipped } = importer.parseText(text);
  if (!entries.length) {
    return 'Aucune carte trouvée. Format attendu : une carte par ligne, « mot ; définition », '
      + 'ou un export texte d\'Anki.';
  }

  // Doublons : déjà dans le téléphone, ou en double dans le fichier lui-même
  const known = new Set(store.getCards().map((c) => store.normalizeWord(c.word)));
  const fresh = [];
  for (const entry of entries) {
    const key = store.normalizeWord(entry.word);
    if (known.has(key)) continue;
    known.add(key);
    fresh.push({ ...entry, fsrs: srs.newSchedule() });
  }
  store.addCards(fresh);

  const duplicates = entries.length - fresh.length;
  const parts = [`${plural(fresh.length, 'carte')} ajoutée${fresh.length > 1 ? 's' : ''}`];
  if (duplicates) parts.push(`${plural(duplicates, 'doublon')} ignoré${duplicates > 1 ? 's' : ''}`);
  if (skipped) parts.push(`${plural(skipped, 'ligne')} illisible${skipped > 1 ? 's' : ''}`);
  return `${parts.join(' · ')}.`;
}

$('#btn-import-text').addEventListener('click', () => {
  const textarea = $('#import-text');
  if (!textarea.value.trim()) return;
  $('#import-result').textContent = importText(textarea.value);
  textarea.value = '';
  renderCounters(new Date());
});

// Pas d'attribut « accept » sur les <input type=file> : sur iPhone, il grise parfois
// des fichiers .txt ou .json pourtant valides.
$('#import-file').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  event.target.value = '';              // permet de rechoisir le même fichier plus tard
  if (!file) return;
  $('#import-result').textContent = importText(await file.text());
  renderCounters(new Date());
});

// ---------- Sauvegarde JSON ----------

$('#btn-export').addEventListener('click', async () => {
  const json = importer.buildBackup(store.exportData());
  const date = new Date().toISOString().slice(0, 10);
  const file = new File([json], `lexique-${date}.json`, { type: 'application/json' });

  // Sur iPhone : feuille de partage (Enregistrer dans Fichiers, OneDrive, Drive…).
  // Ailleurs : simple téléchargement.
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
    } catch (err) {
      if (err.name === 'AbortError') return;     // partage annulé : rien n'a été enregistré
      download(file);
    }
  } else {
    download(file);
  }
  store.updateSettings({ lastBackup: new Date().toISOString() });
  $('#backup-result').textContent = `Sauvegarde exportée (${plural(store.getCards().length, 'carte')}).`;
  renderMore();
});

// Téléchargement classique via un lien temporaire.
function download(file) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

$('#restore-file').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  const result = $('#backup-result');
  try {
    const backup = importer.parseBackup(await file.text());
    const current = store.getCards().length;
    const message = `Remplacer les cartes du téléphone (${plural(current, 'carte')}) par celles de la `
      + `sauvegarde (${plural(backup.cards.length, 'carte')}) ? La progression actuelle sera perdue.`;
    if (current > 0 && !confirm(message)) return;
    store.replaceAll(backup);
    result.textContent = `Sauvegarde restaurée : ${plural(backup.cards.length, 'carte')}.`;
    refresh();
  } catch (err) {
    result.textContent = err.message;
  }
});

// ---------- Réglages ----------

$('#new-per-day').addEventListener('change', (event) => {
  const value = Math.round(Number(event.target.value));
  // Champ vidé ou invalide : on garde l'ancienne valeur
  if (event.target.value === '' || !Number.isFinite(value)) {
    event.target.value = store.getSettings().newPerDay;
    return;
  }
  const newPerDay = Math.min(9999, Math.max(0, value));
  store.updateSettings({ newPerDay });
  event.target.value = newPerDay;
  renderCounters(new Date());
});

// =========================================================
// Démarrage
// =========================================================

store.askPersistentStorage();
showView('review');
