'use strict';

// ══════════════════════════════════════════════════════════════════
//  API KEYS
// ══════════════════════════════════════════════════════════════════

const USDA_API_KEY = 'vT2o59VqSjaFTJhoVBk9grEhBadSCyNVNG1DXZbN';

// ══════════════════════════════════════════════════════════════════
//  CONSTANTS
// ══════════════════════════════════════════════════════════════════

const SK = {
  onboardingDone: 'nb_onboarding_done',
  profile:        'nb_profile',
  goals:          'nb_goals',
  diary:          date => `nb_diary_${date}`,
  // Study tracking
  participantId:  'nb_participant_id',
  appVersion:     'nb_app_version',
  studyStart:     'nb_study_start',
  sessions:       'nb_sessions',
  interactions:   'nb_interactions',
  dailySummary:   'nb_daily_summary',
  studySetupDone: 'nb_study_setup_done',
};

const MEAL_NAMES = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];

// Activity multipliers for Mifflin-St Jeor TDEE
const ACTIVITY = [1.2, 1.375, 1.55, 1.725];

// Calorie adjustment per goal index
const GOAL_DELTA = [-500, 0, 300, 0];


// ══════════════════════════════════════════════════════════════════
//  UTILITIES
// ══════════════════════════════════════════════════════════════════

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function formatDateLabel(dateStr) {
  const t = today();
  if (dateStr === t) return 'Today';
  const yesterday = offsetDate(t, -1);
  if (dateStr === yesterday) return 'Yesterday';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function offsetDate(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function load(key, fallback = null) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : JSON.parse(v);
  } catch { return fallback; }
}

function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }


// ══════════════════════════════════════════════════════════════════
//  CALCULATIONS
// ══════════════════════════════════════════════════════════════════

function calcGoals(sex, weightKg, heightCm, age, activityIdx, goalIdx) {
  let bmr = 10 * weightKg + 6.25 * heightCm - 5 * age;
  bmr += sex === 'male' ? 5 : -161;
  const tdee = bmr * ACTIVITY[clamp(activityIdx, 0, 3)];
  const calories = Math.round(Math.max(1200, tdee + GOAL_DELTA[clamp(goalIdx, 0, 3)]));
  return {
    calories,
    protein: Math.round(calories * 0.30 / 4),
    carbs:   Math.round(calories * 0.40 / 4),
    fat:     Math.round(calories * 0.30 / 9),
  };
}

function getDiary(dateStr) {
  return load(SK.diary(dateStr), []);
}

function saveDiary(dateStr, entries) {
  save(SK.diary(dateStr), entries);
}

function getTotals(dateStr) {
  const entries = getDiary(dateStr);
  return entries.reduce((acc, e) => {
    const m = e.grams / 100;
    acc.calories += Math.round(e.cal100 * m);
    acc.protein  += e.pro100 * m;
    acc.carbs    += e.carb100 * m;
    acc.fat      += e.fat100 * m;
    return acc;
  }, { calories: 0, protein: 0, carbs: 0, fat: 0 });
}


// ══════════════════════════════════════════════════════════════════
//  APP STATE
// ══════════════════════════════════════════════════════════════════

const state = {
  currentDate:       today(),
  pendingMeal:       0,
  selectedFood:      null,
  sessionStart:      null,
  sessionHadLogging: false,
};


// ══════════════════════════════════════════════════════════════════
//  NAVIGATION
// ══════════════════════════════════════════════════════════════════

function showSection(id) {
  ['onboarding', 'study-setup', 'app', 'food-search'].forEach(s => {
    document.getElementById(s).classList.toggle('hidden', s !== id);
  });
}

function switchTab(name) {
  document.querySelectorAll('.tab-pane').forEach(p => {
    p.classList.toggle('active', p.id === `tab-${name}`);
    p.classList.toggle('hidden', p.id !== `tab-${name}`);
  });
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === name);
  });

  if (name === 'progress') renderProgressTab();
  if (name === 'settings')  loadSettingsValues();
  if (name === 'tracking')  renderTrackingTab();
}


// ══════════════════════════════════════════════════════════════════
//  ONBOARDING
// ══════════════════════════════════════════════════════════════════

const ob = { sex: null, weight: null, height: null, age: null, goal: null, activity: null };

function showObStep(id) {
  document.querySelectorAll('.ob-step').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function initOnboarding() {
  // Sex
  document.querySelectorAll('[data-ob-sex]').forEach(btn => {
    btn.addEventListener('click', () => {
      ob.sex = btn.dataset.obSex;
      showObStep('ob-weight');
      document.getElementById('input-weight').focus();
    });
  });

  // Weight
  document.getElementById('btn-weight-next').addEventListener('click', () => {
    const v = parseFloat(document.getElementById('input-weight').value);
    const err = document.getElementById('err-weight');
    if (!v || v < 20 || v > 400) { err.classList.remove('hidden'); return; }
    err.classList.add('hidden');
    ob.weight = v;
    showObStep('ob-height');
    document.getElementById('input-height').focus();
  });
  document.getElementById('input-weight').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btn-weight-next').click();
  });

  // Height
  document.getElementById('btn-height-next').addEventListener('click', () => {
    const v = parseFloat(document.getElementById('input-height').value);
    const err = document.getElementById('err-height');
    if (!v || v < 50 || v > 280) { err.classList.remove('hidden'); return; }
    err.classList.add('hidden');
    ob.height = v;
    showObStep('ob-age');
    document.getElementById('input-age').focus();
  });
  document.getElementById('input-height').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btn-height-next').click();
  });

  // Age
  document.getElementById('btn-age-next').addEventListener('click', () => {
    const v = parseInt(document.getElementById('input-age').value);
    const err = document.getElementById('err-age');
    if (!v || v < 10 || v > 120) { err.classList.remove('hidden'); return; }
    err.classList.add('hidden');
    ob.age = v;
    showObStep('ob-goal');
  });
  document.getElementById('input-age').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btn-age-next').click();
  });

  // Goal
  document.querySelectorAll('[data-ob-goal]').forEach(btn => {
    btn.addEventListener('click', () => {
      ob.goal = parseInt(btn.dataset.obGoal);
      showObStep('ob-activity');
    });
  });

  // Activity
  document.querySelectorAll('[data-ob-activity]').forEach(btn => {
    btn.addEventListener('click', () => {
      ob.activity = parseInt(btn.dataset.obActivity);
      finishOnboarding();
    });
  });
}

function finishOnboarding() {
  const goals = calcGoals(ob.sex, ob.weight, ob.height, ob.age, ob.activity, ob.goal);
  save(SK.goals,   goals);
  save(SK.profile, { sex: ob.sex, weight: ob.weight, height: ob.height, age: ob.age, goal: ob.goal, activity: ob.activity });
  save(SK.onboardingDone, true);
  document.getElementById('setup-name').value = '';
  document.getElementById('btn-setup-confirm').disabled = true;
  showSection('study-setup');
}


// ══════════════════════════════════════════════════════════════════
//  STUDY SETUP
// ══════════════════════════════════════════════════════════════════

function initStudySetup() {
  const nameInput  = document.getElementById('setup-name');
  const confirmBtn = document.getElementById('btn-setup-confirm');

  function refreshConfirm() {
    confirmBtn.disabled = !nameInput.value.trim();
  }

  nameInput.addEventListener('input', refreshConfirm);

  confirmBtn.addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (!name) return;
    save(SK.participantId,  name);
    save(SK.appVersion,     'control');
    save(SK.studySetupDone, true);
    showSection('app');
    renderTrackingTab();
  });
}


// ══════════════════════════════════════════════════════════════════
//  TRACKING TAB
// ══════════════════════════════════════════════════════════════════

function renderTrackingTab() {
  const d = state.currentDate;
  const t = today();

  document.getElementById('date-label').textContent = formatDateLabel(d);
  document.getElementById('btn-next-day').disabled = (d >= t);

  const participantName = load(SK.participantId, '');
  const nameBadge = document.getElementById('participant-name-label');
  nameBadge.textContent = participantName || '';
  nameBadge.classList.toggle('hidden', !participantName);

  const totals = getTotals(d);
  const goals  = load(SK.goals, { calories: 2000, protein: 150, carbs: 200, fat: 65 });
  setBar('calories', totals.calories, goals.calories, 'kcal');
  setBar('protein',  totals.protein,  goals.protein,  'g');
  setBar('carbs',    totals.carbs,    goals.carbs,    'g');
  setBar('fat',      totals.fat,      goals.fat,      'g');

  for (let m = 0; m < 4; m++) renderMealSection(m, d);
}

function setBar(macro, consumed, goal, unit) {
  const rawPct = goal > 0 ? consumed / goal * 100 : 0;
  const pct    = clamp(rawPct, 0, 100);

  document.getElementById(`bar-${macro}`).style.width = pct + '%';

  const rounded = macro === 'calories'
    ? `${Math.round(consumed)} / ${goal} ${unit}`
    : `${consumed.toFixed(1)} / ${goal} ${unit}`;
  document.getElementById(`lbl-${macro}`).textContent = rounded;
}

function renderMealSection(mealType, dateStr) {
  const container = document.getElementById(`entries-${mealType}`);
  const entries   = getDiary(dateStr).filter(e => e.meal === mealType);
  container.innerHTML = '';

  entries.forEach(entry => {
    const m    = entry.grams / 100;
    const cal  = Math.round(entry.cal100 * m);
    const pro  = (entry.pro100 * m).toFixed(1);
    const carb = (entry.carb100 * m).toFixed(1);
    const fat  = (entry.fat100 * m).toFixed(1);

    const row = document.createElement('div');
    row.className = 'entry-row';
    row.innerHTML = `
      <div class="entry-info">
        <div class="entry-name">${escHtml(entry.name)}</div>
        <div class="entry-macros">${cal} kcal &nbsp;·&nbsp; P ${pro}g &nbsp;·&nbsp; C ${carb}g &nbsp;·&nbsp; F ${fat}g</div>
      </div>
      <button class="btn-delete-entry" aria-label="Delete">&#215;</button>`;
    row.querySelector('.btn-delete-entry').addEventListener('click', () => {
      deleteEntry(entry.id, dateStr);
    });
    container.appendChild(row);
  });
}

function deleteEntry(id, dateStr) {
  const entries = getDiary(dateStr).filter(e => e.id !== id);
  saveDiary(dateStr, entries);
  renderTrackingTab();
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}


// ══════════════════════════════════════════════════════════════════
//  FOOD SEARCH — API LAYER
// ══════════════════════════════════════════════════════════════════

function findNutrient(nutrients, nameRx, unitRx = null) {
  const n = nutrients.find(n => {
    if (!nameRx.test(n.nutrientName)) return false;
    if (unitRx && n.unitName && !unitRx.test(n.unitName)) return false;
    return true;
  });
  return n ? (parseFloat(n.value) || 0) : 0;
}

async function searchUSDA(query) {
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}&pageSize=20&api_key=${USDA_API_KEY}`;
  const resp = await fetch(url);
  if (!resp.ok) return [];
  const data = await resp.json();
  const foods = data.foods || [];

  return foods
    .filter(f => f.description && f.foodNutrients && f.foodNutrients.length)
    .map(f => {
      const n = f.foodNutrients;
      return {
        name:    f.description,
        cal100:  Math.round(findNutrient(n, /^energy$/i, /kcal/i) || findNutrient(n, /^energy \(atwater/i)),
        pro100:  findNutrient(n, /^protein$/i),
        carb100: findNutrient(n, /^carbohydrate, by difference$/i),
        fat100:  findNutrient(n, /^total lipid \(fat\)$/i),
      };
    })
    .filter(f => f.cal100 > 0);
}

async function searchOpenFoodFacts(query) {
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=20&fields=product_name,nutriments`;
  const resp = await fetch(url, { headers: { 'User-Agent': 'NutureByte/1.0 (educational)' } });
  if (!resp.ok) return [];
  const data = await resp.json();
  return (data.products || [])
    .filter(p => p.product_name && p.nutriments)
    .map(p => {
      const n = p.nutriments;
      return {
        name:    p.product_name.trim(),
        cal100:  Math.round(n['energy-kcal_100g'] || n['energy_kcal_100g'] || 0),
        pro100:  parseFloat(n.proteins_100g)      || 0,
        carb100: parseFloat(n.carbohydrates_100g) || 0,
        fat100:  parseFloat(n.fat_100g)           || 0,
      };
    })
    .filter(f => f.name);
}

function displaySearchResults(foods) {
  const container = document.getElementById('search-results');
  container.innerHTML = '';
  foods.forEach(food => {
    const item = document.createElement('div');
    item.className = 'search-result-item';
    item.innerHTML = `
      <span class="result-name">${escHtml(food.name)}</span>
      <span class="result-kcal">${food.cal100} kcal/100g</span>`;
    item.addEventListener('click', () => {
      state.selectedFood = food;
      showDetailPanel();
    });
    container.appendChild(item);
  });
}


// ══════════════════════════════════════════════════════════════════
//  FOOD SEARCH — UI
// ══════════════════════════════════════════════════════════════════

function openFoodSearch(mealType) {
  state.pendingMeal = mealType;
  state.selectedFood = null;

  document.getElementById('search-input').value = '';
  document.getElementById('search-status').textContent = '';
  document.getElementById('search-results').innerHTML = '';
  document.getElementById('detail-panel').classList.add('hidden');
  document.getElementById('manual-panel').classList.add('hidden');
  document.getElementById('serving-input').value = '100';

  showSection('food-search');
  document.getElementById('search-input').focus();
}

function closeFoodSearch() {
  showSection('app');
}

async function runSearch() {
  const q = document.getElementById('search-input').value.trim();
  if (!q) return;

  const statusEl  = document.getElementById('search-status');
  const goBtn     = document.getElementById('btn-search-go');
  statusEl.textContent = 'Searching…';
  document.getElementById('search-results').innerHTML = '';
  document.getElementById('detail-panel').classList.add('hidden');
  goBtn.disabled = true;

  try {
    let foods  = await searchUSDA(q);
    let source = 'USDA';

    if (foods.length === 0) {
      foods  = await searchOpenFoodFacts(q);
      source = 'OpenFoodFacts';
    }

    if (foods.length === 0) {
      statusEl.textContent = 'No results found. Try a different search term, or enter the food manually below.';
      return;
    }

    statusEl.textContent = `${foods.length} result${foods.length > 1 ? 's' : ''} from ${source}`;
    displaySearchResults(foods);
  } catch (err) {
    statusEl.textContent = 'Search failed. Check your connection, or enter the food manually below.';
  } finally {
    goBtn.disabled = false;
  }
}

function showDetailPanel() {
  const food = state.selectedFood;
  if (!food) return;

  document.getElementById('detail-name').textContent = food.name;
  document.getElementById('detail-macros').innerHTML = `
    <div class="macro-chip macro-chip--cal">
      <div class="macro-chip-label">Energy</div>
      <div class="macro-chip-value">${food.cal100} kcal</div>
    </div>
    <div class="macro-chip macro-chip--pro">
      <div class="macro-chip-label">Protein</div>
      <div class="macro-chip-value">${food.pro100.toFixed(1)} g</div>
    </div>
    <div class="macro-chip macro-chip--carb">
      <div class="macro-chip-label">Carbs</div>
      <div class="macro-chip-value">${food.carb100.toFixed(1)} g</div>
    </div>
    <div class="macro-chip macro-chip--fat">
      <div class="macro-chip-label">Fat</div>
      <div class="macro-chip-value">${food.fat100.toFixed(1)} g</div>
    </div>`;

  document.getElementById('serving-input').value = '100';
  updateDetailTotals();
  document.getElementById('detail-panel').classList.remove('hidden');
}

function updateDetailTotals() {
  const food = state.selectedFood;
  if (!food) return;
  const g    = parseFloat(document.getElementById('serving-input').value) || 0;
  const m    = g / 100;
  const cal  = Math.round(food.cal100 * m);
  const pro  = (food.pro100  * m).toFixed(1);
  const carb = (food.carb100 * m).toFixed(1);
  const fat  = (food.fat100  * m).toFixed(1);
  document.getElementById('detail-totals').textContent =
    `${g} g serving: ${cal} kcal · P ${pro}g · C ${carb}g · F ${fat}g`;
}

function addFoodToDiary() {
  const food = state.selectedFood;
  if (!food) return;
  const g = parseFloat(document.getElementById('serving-input').value);
  if (!g || g <= 0) return;
  logEntry(food.name, food.cal100, food.pro100, food.carb100, food.fat100, g);
}


// ══════════════════════════════════════════════════════════════════
//  MANUAL FOOD ENTRY
// ══════════════════════════════════════════════════════════════════

function openManualEntry() {
  ['manual-name','manual-cal','manual-pro','manual-carb','manual-fat'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('manual-serving').value = '100';
  document.getElementById('manual-error').classList.add('hidden');
  document.getElementById('manual-panel').classList.remove('hidden');
}

function closeManualEntry() {
  document.getElementById('manual-panel').classList.add('hidden');
}

function addManualFood() {
  const name    = document.getElementById('manual-name').value.trim();
  const cal100  = parseFloat(document.getElementById('manual-cal').value)  || 0;
  const pro100  = parseFloat(document.getElementById('manual-pro').value)  || 0;
  const carb100 = parseFloat(document.getElementById('manual-carb').value) || 0;
  const fat100  = parseFloat(document.getElementById('manual-fat').value)  || 0;
  const grams   = parseFloat(document.getElementById('manual-serving').value);
  const errEl   = document.getElementById('manual-error');

  if (!name) {
    errEl.textContent = 'Please enter a food name.';
    errEl.classList.remove('hidden');
    return;
  }
  if (!grams || grams <= 0) {
    errEl.textContent = 'Please enter a valid serving size.';
    errEl.classList.remove('hidden');
    return;
  }

  errEl.classList.add('hidden');
  logEntry(name, cal100, pro100, carb100, fat100, grams);
}

function logEntry(name, cal100, pro100, carb100, fat100, grams) {
  const entries = getDiary(state.currentDate);
  entries.push({
    id:      uid(),
    meal:    state.pendingMeal,
    name,
    grams,
    cal100,
    pro100,
    carb100,
    fat100,
  });
  saveDiary(state.currentDate, entries);
  state.sessionHadLogging = true;
  trackInteraction('reflective', 'food_logged');
  closeFoodSearch();
  renderTrackingTab();
}


// ══════════════════════════════════════════════════════════════════
//  PROGRESS TAB  (plain nutrition summary)
// ══════════════════════════════════════════════════════════════════

function renderProgressTab() {
  const studyStart = load(SK.studyStart, today());
  const t          = today();

  let daysUsed     = 0;
  let totalCals    = 0;
  let totalPro     = 0;
  let trackingDays = 0;

  const rows = [];
  for (let i = 0; i < 14; i++) {
    const d        = offsetDate(studyStart, i);
    const isFuture = d > t;
    const entries  = isFuture ? [] : getDiary(d);
    const totals   = isFuture ? { calories: 0, protein: 0 } : getTotals(d);
    const calories = Math.round(totals.calories);

    if (!isFuture && entries.length > 0) {
      daysUsed++;
      totalCals    += calories;
      totalPro     += totals.protein;
      trackingDays++;
    }

    rows.push({ date: d, foods: entries.length, calories, isFuture });
  }

  const avgCals = trackingDays > 0 ? Math.round(totalCals / trackingDays) : null;
  const avgPro  = trackingDays > 0 ? (totalPro / trackingDays).toFixed(1) : null;

  document.getElementById('ctrl-table-wrap').innerHTML = `
    <div class="ctrl-table">
      <div class="ctrl-table-head">
        <span>Date</span><span>Foods</span><span>Calories</span>
      </div>
      ${rows.map(r => `
        <div class="ctrl-table-row${r.isFuture ? ' ctrl-row--future' : ''}">
          <span>${escHtml(formatDateLabel(r.date))}</span>
          <span>${r.isFuture ? '—' : r.foods}</span>
          <span>${r.isFuture ? '—' : (r.calories > 0 ? r.calories + ' kcal' : '—')}</span>
        </div>`).join('')}
    </div>`;

  document.getElementById('ctrl-stats-row').innerHTML = `
    <div class="ctrl-stat-item">
      <div class="ctrl-stat-value">${daysUsed}/14</div>
      <div class="ctrl-stat-label">Days used</div>
    </div>
    <div class="ctrl-stat-item">
      <div class="ctrl-stat-value">${avgCals !== null ? avgCals + ' kcal' : '—'}</div>
      <div class="ctrl-stat-label">Avg. daily calories</div>
    </div>
    <div class="ctrl-stat-item">
      <div class="ctrl-stat-value">${avgPro !== null ? avgPro + 'g' : '—'}</div>
      <div class="ctrl-stat-label">Avg. daily protein</div>
    </div>`;
}


// ══════════════════════════════════════════════════════════════════
//  SETTINGS TAB
// ══════════════════════════════════════════════════════════════════

function loadSettingsValues() {
  const goals   = load(SK.goals,   { calories: 2000, protein: 150, carbs: 200, fat: 65 });
  const profile = load(SK.profile, { sex: 'male', weight: 70, height: 170, age: 30, goal: 1, activity: 1 });

  document.getElementById('s-cal').value  = goals.calories;
  document.getElementById('s-pro').value  = goals.protein;
  document.getElementById('s-carb').value = goals.carbs;
  document.getElementById('s-fat').value  = goals.fat;

  document.getElementById('s-sex').value  = profile.sex;
  document.getElementById('s-wt').value   = profile.weight;
  document.getElementById('s-ht').value   = profile.height;
  document.getElementById('s-age').value  = profile.age || 30;
  document.getElementById('s-goal').value = profile.goal;
  document.getElementById('s-act').value  = profile.activity;

  hideFeedback('goals-feedback');
  hideFeedback('recalc-feedback');
  loadStudySettings();
}

function showFeedback(id, msg, isError = false) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.remove('hidden', 'error');
  if (isError) el.classList.add('error');
}
function hideFeedback(id) {
  document.getElementById(id).classList.add('hidden');
}

function saveGoals() {
  const cal  = parseInt(document.getElementById('s-cal').value);
  const pro  = parseInt(document.getElementById('s-pro').value);
  const carb = parseInt(document.getElementById('s-carb').value);
  const fat  = parseInt(document.getElementById('s-fat').value);

  if (!cal || cal < 500 || [pro, carb, fat].some(n => isNaN(n) || n < 0)) {
    showFeedback('goals-feedback', 'Please enter valid values.', true);
    return;
  }

  save(SK.goals, { calories: cal, protein: pro, carbs: carb, fat: fat });
  showFeedback('goals-feedback', 'Goals saved.');
  renderTrackingTab();
}

function recalcGoals() {
  const sex  = document.getElementById('s-sex').value;
  const wt   = parseFloat(document.getElementById('s-wt').value);
  const ht   = parseFloat(document.getElementById('s-ht').value);
  const age  = parseInt(document.getElementById('s-age').value);
  const goal = parseInt(document.getElementById('s-goal').value);
  const act  = parseInt(document.getElementById('s-act').value);

  if (!wt || wt < 20 || !ht || ht < 50 || !age || age < 10 || age > 120) {
    showFeedback('recalc-feedback', 'Please enter valid weight, height and age.', true);
    return;
  }

  const goals   = calcGoals(sex, wt, ht, age, act, goal);
  const profile = { sex, weight: wt, height: ht, age, goal, activity: act };
  save(SK.goals,   goals);
  save(SK.profile, profile);

  document.getElementById('s-cal').value  = goals.calories;
  document.getElementById('s-pro').value  = goals.protein;
  document.getElementById('s-carb').value = goals.carbs;
  document.getElementById('s-fat').value  = goals.fat;

  showFeedback('recalc-feedback', `Goals recalculated: ${goals.calories} kcal / day.`);
  renderTrackingTab();
}

function resetAllData() {
  localStorage.clear();
  location.reload();
}


// ══════════════════════════════════════════════════════════════════
//  STUDY DATA TRACKING  (FITT framework — Short et al. 2018)
// ══════════════════════════════════════════════════════════════════

// ── Session tracking — TIME ───────────────────────────────────────

function startSession() {
  state.sessionStart      = Date.now();
  state.sessionHadLogging = false;
}

function endSession() {
  if (!state.sessionStart) return;

  const end         = Date.now();
  const startTs     = state.sessionStart;
  state.sessionStart = null;

  const rawMin      = (end - startTs) / 60000;
  const durationMin = Math.min(rawMin, 120);   // cap at 2 h to discard overnight outliers
  if (durationMin < 0.5) return;

  const sessions = load(SK.sessions, []);
  sessions.push({
    date:     today(),
    start:    startTs,
    end:      end,
    duration: Math.round(durationMin * 10) / 10,
  });
  save(SK.sessions, sessions);

  if (!state.sessionHadLogging) {
    trackInteraction('passive', 'session_no_logging');
  }
}

// ── Feature interaction tracking — TYPE ──────────────────────────

function trackInteraction(type, action) {
  const interactions = load(SK.interactions, []);
  interactions.push({
    timestamp: Date.now(),
    date:      today(),
    type,
    action,
  });
  save(SK.interactions, interactions);
}

// ── Daily summary — FREQUENCY + INTENSITY ────────────────────────

function buildDailySummary(dateStr) {
  const sessions     = load(SK.sessions,     []).filter(s => s.date === dateStr);
  const entries      = getDiary(dateStr);
  const mealsUsed    = new Set(entries.map(e => e.meal));

  const totalMins = parseFloat(
    sessions.reduce((sum, s) => sum + (s.duration || 0), 0).toFixed(1)
  );

  return {
    date:                   dateStr,
    sessions_count:         sessions.length,
    total_time_minutes:     totalMins,
    foods_logged:           entries.length,
    breakfast_logged:       mealsUsed.has(0),
    lunch_logged:           mealsUsed.has(1),
    dinner_logged:          mealsUsed.has(2),
    snacks_logged:          mealsUsed.has(3),
    goal_meals_complete:    'N/A',
    goal_protein_complete:  'N/A',
    goal_calories_complete: 'N/A',
    points_earned:          'N/A',
    progress_visited:       'N/A',
    streak_eod:             'N/A',
  };
}

function generateDailySummaries() {
  const t          = today();
  const yesterday  = offsetDate(t, -1);
  const studyStart = load(SK.studyStart, t);
  const summaries  = load(SK.dailySummary, []);

  const lastDate  = summaries.length > 0 ? summaries[summaries.length - 1].date : null;
  let   cursor    = lastDate ? offsetDate(lastDate, 1) : studyStart;

  while (cursor <= yesterday) {
    summaries.push(buildDailySummary(cursor));
    cursor = offsetDate(cursor, 1);
  }

  save(SK.dailySummary, summaries);
}

function initStudyTracking() {
  const t = today();
  if (!load(SK.studyStart, null)) save(SK.studyStart, t);
  generateDailySummaries();
}

// ── CSV export ────────────────────────────────────────────────────

function csvCell(val) {
  const s = String(val);
  return (s.includes(',') || s.includes('"') || s.includes('\n'))
    ? '"' + s.replace(/"/g, '""') + '"'
    : s;
}

function boolCell(val) {
  if (val === 'N/A') return 'N/A';
  return val ? 'TRUE' : 'FALSE';
}

function downloadCSV() {
  generateDailySummaries();

  const participantId = load(SK.participantId, 'unassigned') || 'unassigned';
  const studyStart    = load(SK.studyStart, today());

  const summaries  = load(SK.dailySummary, []);
  const byDate     = {};
  summaries.forEach(s => { byDate[s.date] = s; });

  const emptyRow = date => ({
    date,
    sessions_count:         0,
    total_time_minutes:     0,
    foods_logged:           0,
    breakfast_logged:       false,
    lunch_logged:           false,
    dinner_logged:          false,
    snacks_logged:          false,
    goal_meals_complete:    'N/A',
    goal_protein_complete:  'N/A',
    goal_calories_complete: 'N/A',
    points_earned:          'N/A',
    progress_visited:       'N/A',
    streak_eod:             'N/A',
  });

  const t    = today();
  const rows = [];
  for (let i = 0; i < 14; i++) {
    const date = offsetDate(studyStart, i);
    if (date === t) {
      rows.push(buildDailySummary(date));
    } else if (date > t) {
      rows.push(emptyRow(date));
    } else {
      rows.push(byDate[date] || emptyRow(date));
    }
  }

  const headers = [
    'participant_id', 'app_version', 'date',
    'sessions_count', 'total_time_minutes', 'foods_logged',
    'breakfast_logged', 'lunch_logged', 'dinner_logged', 'snacks_logged',
    'goal_meals_complete', 'goal_protein_complete', 'goal_calories_complete',
    'points_earned', 'progress_visited', 'streak_eod',
  ];

  const lines = [headers.join(',')];
  rows.forEach(row => {
    lines.push([
      csvCell(participantId),
      'control',
      row.date,
      row.sessions_count,
      row.total_time_minutes,
      row.foods_logged,
      boolCell(row.breakfast_logged),
      boolCell(row.lunch_logged),
      boolCell(row.dinner_logged),
      boolCell(row.snacks_logged),
      row.goal_meals_complete,
      row.goal_protein_complete,
      row.goal_calories_complete,
      row.points_earned,
      row.progress_visited,
      row.streak_eod,
    ].join(','));
  });

  triggerCSVDownload(lines.join('\n'), 'nuturebyte-studydata.csv');
}

function triggerCSVDownload(csvText, fileName) {
  // iOS Safari does not support <a download> — use Web Share API instead
  if (/iPad|iPhone|iPod/.test(navigator.userAgent) && navigator.share) {
    const file = new File([csvText], fileName, { type: 'text/csv' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: fileName })
        .catch(() => iosCsvFallback(csvText, fileName));
      return;
    }
    iosCsvFallback(csvText, fileName);
    return;
  }
  // Desktop + Android Chrome: standard blob download
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function iosCsvFallback(csvText, fileName) {
  // Opens the CSV in a new Safari tab so the user can share/save via the share sheet
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// ── Study settings UI helpers ─────────────────────────────────────

function loadStudySettings() {
  const id = load(SK.participantId, '') || '—';
  document.getElementById('display-participant').textContent = id;
  document.getElementById('display-group').textContent      = 'Control';
}


// ══════════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════════

function init() {
  startSession();
  initStudyTracking();

  initOnboarding();
  initStudySetup();

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  document.getElementById('btn-prev-day').addEventListener('click', () => {
    state.currentDate = offsetDate(state.currentDate, -1);
    renderTrackingTab();
  });
  document.getElementById('btn-next-day').addEventListener('click', () => {
    const next = offsetDate(state.currentDate, +1);
    if (next <= today()) {
      state.currentDate = next;
      renderTrackingTab();
    }
  });

  document.querySelectorAll('.btn-add-food').forEach(btn => {
    btn.addEventListener('click', () => openFoodSearch(parseInt(btn.dataset.meal)));
  });

  document.getElementById('btn-search-back').addEventListener('click', closeFoodSearch);
  document.getElementById('btn-search-go').addEventListener('click', runSearch);
  document.getElementById('search-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') runSearch();
  });

  document.getElementById('btn-detail-back').addEventListener('click', () => {
    document.getElementById('detail-panel').classList.add('hidden');
    state.selectedFood = null;
  });
  document.getElementById('serving-input').addEventListener('input', updateDetailTotals);
  document.getElementById('btn-add-food').addEventListener('click', addFoodToDiary);

  document.getElementById('btn-manual-entry').addEventListener('click', openManualEntry);
  document.getElementById('btn-manual-back').addEventListener('click', closeManualEntry);
  document.getElementById('btn-manual-add').addEventListener('click', addManualFood);

  document.getElementById('btn-save-goals').addEventListener('click', saveGoals);
  document.getElementById('btn-recalc').addEventListener('click', recalcGoals);

  document.getElementById('btn-export-csv').addEventListener('click', downloadCSV);

  document.getElementById('btn-reset').addEventListener('click', () => {
    document.getElementById('modal-overlay').classList.remove('hidden');
  });
  document.getElementById('btn-reset-cancel').addEventListener('click', () => {
    document.getElementById('modal-overlay').classList.add('hidden');
  });
  document.getElementById('btn-reset-confirm').addEventListener('click', resetAllData);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      endSession();
    } else if (document.visibilityState === 'visible') {
      startSession();
    }
  });
  window.addEventListener('beforeunload', endSession);

  if (load(SK.onboardingDone, false)) {
    if (load(SK.studySetupDone, false)) {
      showSection('app');
      renderTrackingTab();
    } else {
      showSection('study-setup');
    }
  } else {
    showSection('onboarding');
  }
}

document.addEventListener('DOMContentLoaded', init);
