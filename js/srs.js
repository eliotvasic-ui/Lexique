// =========================================================
// srs.js — la répétition espacée, autour de la librairie ts-fsrs
// FSRS calcule pour chaque carte une date de prochaine révision
// à partir de tes notes (À revoir / Difficile / Bien / Facile).
// =========================================================

import { fsrs, generatorParameters, createEmptyCard, Rating, State }
  from '../vendor/ts-fsrs/index.mjs';

// Le planificateur. enable_fuzz : ajoute un peu de hasard aux intervalles pour que
// les cartes apprises le même jour ne reviennent pas toutes le même jour.
// Rétention visée par défaut : 90 % (tu te souviens de 9 cartes sur 10 au moment de la révision).
const scheduler = fsrs(generatorParameters({ enable_fuzz: true }));

// Les cartes en apprentissage peuvent être montrées jusqu'à 20 min en avance
// quand il n'y a rien d'autre à faire (comme dans Anki).
const LEARN_AHEAD_MS = 20 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const RATINGS = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]; // 1, 2, 3, 4

// ---------- Conversion stockage <-> ts-fsrs ----------
// En stockage, les dates sont du texte (JSON ne connaît pas les dates) ;
// ts-fsrs, lui, travaille avec de vrais objets Date.

function toStored(card) {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? card.last_review.toISOString() : null,
  };
}

function toFsrs(stored) {
  return {
    ...stored,
    due: new Date(stored.due),
    last_review: stored.last_review ? new Date(stored.last_review) : undefined,
  };
}

// ---------- Outils de dates ----------

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Minuit ce soir (= début de demain), heure du téléphone.
function endOfDay(date) {
  const d = startOfDay(date);
  d.setDate(d.getDate() + 1);
  return d;
}

const dueTime = (card) => new Date(card.fsrs.due).getTime();
const isNew = (card) => card.fsrs.state === State.New;
const isLearning = (card) => card.fsrs.state === State.Learning || card.fsrs.state === State.Relearning;

// ---------- Planification ----------

// État FSRS d'une carte toute neuve.
export function newSchedule(now = new Date()) {
  return toStored(createEmptyCard(now));
}

// Applique une note à une carte. Renvoie les champs à enregistrer.
export function rate(card, rating, now = new Date()) {
  const { card: next } = scheduler.next(toFsrs(card.fsrs), now, rating);
  return {
    fsrs: toStored(next),
    introduced: card.introduced || now.toISOString(),  // retient le jour de la 1re révision
  };
}

// Pour chaque note possible, l'intervalle qu'elle donnerait (« 10 min », « 3 j »…).
export function previewIntervals(card, now = new Date()) {
  const preview = scheduler.repeat(toFsrs(card.fsrs), now);
  const result = {};
  for (const rating of RATINGS) {
    result[rating] = formatDuration(preview[rating].card.due.getTime() - now.getTime());
  }
  return result;
}

// Une carte déjà vue est-elle à réviser maintenant ?
// - en révision (intervalle en jours) : dès le jour prévu, peu importe l'heure ;
// - en apprentissage (intervalle en minutes) : à la minute près.
function isDueNow(card, now) {
  if (isLearning(card)) return dueTime(card) <= now.getTime();
  return dueTime(card) < endOfDay(now).getTime();
}

// Combien de nouvelles cartes peut-on encore découvrir aujourd'hui ?
export function newQuotaLeft(cards, settings, now = new Date()) {
  const today = startOfDay(now).getTime();
  const seenToday = cards.filter((c) => c.introduced && new Date(c.introduced).getTime() >= today).length;
  return Math.max(0, settings.newPerDay - seenToday);
}

// Les chiffres du jour pour le compteur.
export function getStats(cards, settings, now = new Date()) {
  const end = endOfDay(now).getTime();
  let reviews = 0;
  let newCards = 0;
  for (const card of cards) {
    if (isNew(card)) newCards++;
    else if (dueTime(card) < end) reviews++;
  }
  const newToday = Math.min(newCards, newQuotaLeft(cards, settings, now));
  return { reviews, newToday, newCards, total: reviews + newToday };
}

// Choisit la prochaine carte à montrer (ou null s'il n'y a rien).
export function nextCard(cards, settings, now = new Date()) {
  const earliest = (list) => list.reduce((best, c) => (!best || dueTime(c) < dueTime(best) ? c : best), null);
  const seen = cards.filter((c) => !isNew(c));

  // 1) les cartes en apprentissage arrivées à échéance (elles sont fragiles, on les passe d'abord)
  const learningDue = earliest(seen.filter((c) => isLearning(c) && isDueNow(c, now)));
  if (learningDue) return learningDue;

  // 2) les révisions du jour, la plus en retard d'abord
  const reviewDue = earliest(seen.filter((c) => !isLearning(c) && isDueNow(c, now)));
  if (reviewDue) return reviewDue;

  // 3) une nouvelle carte, dans l'ordre d'ajout, si le quota du jour le permet
  if (newQuotaLeft(cards, settings, now) > 0) {
    const fresh = cards.find(isNew);
    if (fresh) return fresh;
  }

  // 4) rien d'autre : une carte en apprentissage prévue dans moins de 20 min
  const limit = now.getTime() + LEARN_AHEAD_MS;
  return earliest(seen.filter((c) => isLearning(c) && dueTime(c) <= limit));
}

// Date de la prochaine révision prévue (pour le message « reviens dans… »).
export function nextDueDate(cards) {
  const seen = cards.filter((c) => !isNew(c));
  if (!seen.length) return null;
  return new Date(Math.min(...seen.map(dueTime)));
}

// ---------- Affichage ----------

// Durée lisible : 5 min, 3 h, 12 j, 2,5 mois, 1,2 an.
export function formatDuration(ms) {
  const minutes = Math.max(1, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.round(ms / DAY_MS);
  if (days < 31) return `${days} j`;
  const oneDecimal = (n) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
  if (days < 365) return `${oneDecimal(days / 30.44)} mois`;
  const years = days / 365.25;
  return `${oneDecimal(years)} ${years < 2 ? 'an' : 'ans'}`;
}

// Date comptée en jours de calendrier : une révision prévue demain à 8 h
// donne « demain », même si c'est dans moins de 24 h.
export function describeDay(due, now = new Date()) {
  const days = Math.round((startOfDay(due) - startOfDay(now)) / DAY_MS);
  if (days <= 0) return 'aujourd\'hui';
  if (days === 1) return 'demain';
  if (days < 31) return `dans ${days} j`;
  return `dans ${formatDuration(due - now)}`;
}

// Petit texte d'état pour la liste des cartes.
export function describeDue(card, now = new Date()) {
  if (isNew(card)) return 'nouvelle';
  if (isDueNow(card, now)) return 'à réviser';
  const due = new Date(card.fsrs.due);
  if (isLearning(card)) return `dans ${formatDuration(due - now)}`;
  return describeDay(due, now);
}

// Résumé de la progression d'une carte, affiché dans la fenêtre de modification.
export function describeProgress(card) {
  if (isNew(card)) return 'Jamais révisée.';
  return `Révisée ${card.fsrs.reps} fois · prochaine : ${describeDue(card)}`;
}
