
// ─── Config & state ──────────────────────────────────────────────────────────
const STORAGE_KEY = "aiResilientAssessmentState";
const INTRO_KEY   = "aiResilientAssessmentIntroSeen";
const LANG_KEY    = "aiResilientAssessmentLang";

let TX        = {};   
let ASSESSMENTS = []; 
let CONFIG    = {};   

// Derived lookup maps (built after ASSESSMENTS loads)
let RISK          = {};
let ASSESSMENT_IDS = [];
let HAS_COMPENSABLE = [];
let HAS_INTERMEDIATE = [];
let HAS_INCLASS   = [];
let HAS_QA = [];
let HAS_REFLECTION = [];
let HAS_ORAL = [];

let assessments = [];
let assessmentSectionsVisible = false;
let lang = "en";

// ─── Interpolation helper ─────────────────────────────────────────────────────
function interpolate(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    vars[key] !== undefined ? vars[key] : `{${key}}`
  );
}

// ─── Translation helper ───────────────────────────────────────────────────────
function t(key) {
  return (TX[lang] && TX[lang][key]) || (TX.en && TX.en[key]) || key;
}

// ─── Data loading ─────────────────────────────────────────────────────────────
async function loadAll() {
  const [enRaw, nlRaw, assessmentsRaw, configRaw] = await Promise.all([
    fetch("translation_en.json").then(r => r.json()),
    fetch("translation_nl.json").then(r => r.json()),
    fetch("assessments.json").then(r => r.json()),
    fetch("config.json").then(r => r.json()),
  ]);

  TX = { en: enRaw, nl: nlRaw };
  ASSESSMENTS = assessmentsRaw;
  CONFIG = configRaw;

  // Build derived maps from assessments.json
  RISK = {};
  ASSESSMENT_IDS = [];
  HAS_COMPENSABLE = [];
  HAS_INTERMEDIATE = [];
  HAS_INCLASS = [];
  HAS_ORAL = [];
  ASSESSMENTS.forEach(a => {
    RISK[a.id] = a.risk;
    ASSESSMENT_IDS.push(a.id);
    if (a.toggles.includes("compensable"))  HAS_COMPENSABLE.push(a.id);
    if (a.toggles.includes("intermediate")) HAS_INTERMEDIATE.push(a.id);
    if (a.toggles.includes("inclass"))      HAS_INCLASS.push(a.id);
    if (a.toggles.includes("qa"))           HAS_QA.push(a.id);
    if (a.toggles.includes("reflection"))   HAS_REFLECTION.push(a.id);
    if (a.toggles.includes("oral"))         HAS_ORAL.push(a.id);
  });

  // Boot
  lang = detectLang();
  setLang(lang);
  loadState();
  maybeShowIntro();
}

// ─── Language ─────────────────────────────────────────────────────────────────
function detectLang() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === "en" || saved === "nl") return saved;
  } catch (e) {}
  const browserLang = (navigator.language || navigator.userLanguage || "en").toLowerCase();
  return browserLang.startsWith("nl") ? "nl" : "en";
}

function setLang(l) {
  lang = l;
  try { localStorage.setItem(LANG_KEY, l); } catch (e) {}

  document.getElementById("lang-en").classList.toggle("active", l === "en");
  document.getElementById("lang-nl").classList.toggle("active", l === "nl");
  document.documentElement.lang = l;

  applyStaticTranslations();
  render();
}

function applyStaticTranslations() {
  const tx = TX[lang];
  if (!tx) return;

  document.title = tx.pageTitle;
  document.getElementById("header-title").textContent        = tx.headerTitle;
  document.getElementById("header-save-btn").textContent     = tx.saveBtn;
  document.getElementById("header-reset-btn").textContent    = tx.resetBtn;
  document.getElementById("label-course-title").textContent  = tx.courseTitle;
  document.getElementById("course-title").placeholder        = tx.coursePlaceholder;
  document.getElementById("label-add-component").textContent = tx.addComponent;
  document.getElementById("label-type").textContent          = tx.typeCol;
  document.getElementById("label-weight").textContent        = tx.weightCol;
  document.getElementById("label-note-col").textContent      = tx.noteCol;
  document.getElementById("pct-input").placeholder           = "%";
  document.getElementById("note-input").placeholder          = tx.notePlaceholder;
  document.getElementById("btn-add").textContent             = tx.addBtn;
  document.getElementById("label-structure").textContent     = tx.structure;
  document.getElementById("label-feedback").textContent      = tx.feedback;
  document.getElementById("consult-text").textContent        = tx.consultText;
  document.getElementById("consult-btn").textContent         = tx.consultBtn;
  document.getElementById("intro-title").textContent         = tx.introTitle;
  document.getElementById("intro-body").textContent          = tx.introBody;
  document.getElementById("intro-cta").textContent           = tx.introCta;

  const helpCloseBtn = document.getElementById("exposure-help-close");
  if (helpCloseBtn) {
    helpCloseBtn.textContent = tx.close || "Close";
  }

  const selectEl = document.getElementById("assessment-select");
  const previous = selectEl.value;

  const helpTitleEl = document.getElementById("exposure-help-title");
  if (helpTitleEl) {
    helpTitleEl.textContent = tx.helpExposureTitle || "How are exposure scores decided?";
  }

  // Build the grouped help content with badges
  renderExposureHelpContent();

  selectEl.innerHTML = [...ASSESSMENT_IDS]
    .sort((a, b) => (tx.labels[a] || a).localeCompare(tx.labels[b] || b))
    .map(id => `<option value="${id}">${tx.labels[id] || id}</option>`)
    .join("");

  if (previous) selectEl.value = previous;
}
// ─── Persistence ──────────────────────────────────────────────────────────────
function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      courseTitle: document.getElementById("course-title").value || "",
      assessments,
      assessmentSectionsVisible,
    }));
  } catch (e) {}
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) { render(); return; }

    const state = JSON.parse(raw);
    if (state && typeof state === "object") {
      if (typeof state.courseTitle === "string") {
        document.getElementById("course-title").value = state.courseTitle;
        document.getElementById("header-subtitle").textContent = state.courseTitle;
        if (state.courseTitle.trim()) {
          document.getElementById("add-card").classList.remove("hidden");
        }
      }

      if (Array.isArray(state.assessments)) {
        assessments = state.assessments.map(a => ({
          compensable:  null,
          intermediate: null,
          inclass:      null,
          qa:           null,
          reflection:   null,
          oral:         null,
          ...a  // existing values overwrite the defaults
        }));
      }

      assessmentSectionsVisible =
        typeof state.assessmentSectionsVisible === "boolean"
          ? state.assessmentSectionsVisible
          : assessments.length > 0;

      if (assessmentSectionsVisible || assessments.length > 0) {
        document.getElementById("structure-card").classList.remove("hidden");
        document.getElementById("feedback-card").classList.remove("hidden");
        document.getElementById("header-save-btn").classList.remove("hidden");
        document.getElementById("header-reset-btn").classList.remove("hidden");
      }

      render();
    } else {
      render();
    }
  } catch (e) {
    console.error(e);
    render();
  }
}

// ─── Course title ─────────────────────────────────────────────────────────────
function updateCourseTitle() {
  const value = document.getElementById("course-title").value.trim();
  document.getElementById("header-subtitle").textContent = value || "";
  document.getElementById("add-card").classList.toggle("hidden", !value);
  saveState();
}

// ─── Assessment CRUD ──────────────────────────────────────────────────────────
function showAssessmentSectionsOnce() {
  if (!assessmentSectionsVisible) {
    assessmentSectionsVisible = true;
    document.getElementById("structure-card").classList.remove("hidden");
    document.getElementById("feedback-card").classList.remove("hidden");
    document.getElementById("header-save-btn").classList.remove("hidden");
    document.getElementById("header-reset-btn").classList.remove("hidden");
    saveState();
  }
}

function addAssessment() {
  const selectEl = document.getElementById("assessment-select");
  const pctInput = document.getElementById("pct-input");
  const noteInput = document.getElementById("note-input");

  const id  = selectEl.value;
  const pct = parseInt(pctInput.value, 10);

  if (isNaN(pct) || pct < 0 || pct > 100) {
    pctInput.style.outline = "2px solid #bc0031";
    pctInput.focus();
    setTimeout(() => { pctInput.style.outline = ""; }, 1200);
    return;
  }

  assessments.push({
    id,
    risk: RISK[id],
    pct,
    note: noteInput.value.trim(),
    compensable:  null,
    intermediate: null,
    inclass:      null,
    qa:           null,
    reflection:   null,
    oral:         null
  });

  pctInput.value  = "";
  noteInput.value = "";

  showAssessmentSectionsOnce();
  saveState();
  render();
}

function removeAssessment(index) {
  assessments.splice(index, 1);
  saveState();
  render();
}

function updatePct(index, value) {
  const n = parseInt(value, 10);
  if (!Number.isNaN(n) && n >= 0) {
    assessments[index].pct = n;
    saveState();
    render();
  }
}

function updateNote(index, value) {
  assessments[index].note = value;
  saveState();
}

function setToggle(index, field, value) {
  assessments[index][field] = value;
  saveState();
  render();
}

// ─── Render ───────────────────────────────────────────────────────────────────
function render() {
  renderList();
  renderFeedback();
}

function renderExposureHelpContent() {
  const bodyEl = document.getElementById("exposure-help-body");
  if (!bodyEl) return;

  const tx = TX[lang];

  // Short intro text
  const intro = tx.helpExposureIntro || "";

  // Group assessments by their default risk level
  const groups = {
    high: [
      "take-home-writing",
      "take-home-exam",
      "take-home-mc",
      "in-person-mc-laptop",
      "group-work"
    ],
    medium: [
      "peer-review",
      "presentation"
    ],
    low: [
      "in-person-exam",
      "oral-exam",
      "participation",
      "in-class-activity"
    ]
  };

  const legendLabels = {
    high: tx.legendHigh, 
    medium: tx.legendMedium,
    low: tx.legendLow
  };

  let html = "";
  if (intro) {
    html += `<p>${intro}</p>`;
  }

  ["high", "medium", "low"].forEach(level => {
    const ids = groups[level];
    if (!ids || !ids.length) return;

    const headerText = legendLabels[level] || level;

    html += `
      <div class="exposure-group">
        <div class="exposure-group-header">
          <span class="item-badge badge-${level}">${headerText}</span>
        </div>
    `;

    ids.forEach(id => {
      const name = tx.labels && tx.labels[id] ? tx.labels[id] : id;
      const descKey = "help_" + id;
      const desc = tx[descKey] || "";

      html += `
        <div class="exposure-item">
          <div class="exposure-item-header">
            <span class="item-name">${name}</span>
          </div>
          ${desc ? `<p>${desc}</p>` : ""}
        </div>
      `;
    });

    html += `</div>`;
  });

  bodyEl.innerHTML = html;
}

function renderList() {
  const listEl = document.getElementById("assessment-list");
  const tx = TX[lang];

  if (!assessments.length) {
    listEl.innerHTML = `<div class="empty-state">${tx.emptyList}</div>`;
    return;
  }

  listEl.innerHTML = assessments.map((a, i) => {
    const name = tx.labels[a.id] || a.id;
    let togglesHtml = "";

    if (HAS_COMPENSABLE.includes(a.id)) {
      const yesActive = a.compensable === "yes" ? "active-yes" : "";
      const noActive  = a.compensable === "no"  ? "active-no"  : "";
      const noteHtml  =
        a.compensable === "no"  ? `<div class="toggle-note note-success">${tx.compensableNo}</div>` :
        a.compensable === "yes" ? `<div class="toggle-note note-warn">${tx.compensableYes}</div>` : "";

      togglesHtml += `
        <div class="toggle-row">
          <span class="toggle-label">${tx.compensable}</span>
          <div class="toggle-btn-group">
            <button class="toggle-btn ${yesActive}" onclick="setToggle(${i},'compensable','yes')">${tx.yes}</button>
            <button class="toggle-btn ${noActive}"  onclick="setToggle(${i},'compensable','no')">${tx.no}</button>
          </div>
        </div>
        ${noteHtml}`;
    }

    if (HAS_INTERMEDIATE.includes(a.id)) {
      const yesActive = a.intermediate === "yes" ? "active-yes" : "";
      const noActive  = a.intermediate === "no"  ? "active-no"  : "";
      const noteHtml  =
        a.intermediate === "yes" ? `<div class="toggle-note note-info">${tx.intermediateYes}</div>` :
        a.intermediate === "no"  ? `<div class="toggle-note note-warn">${tx.intermediateNo}</div>` : "";

      togglesHtml += `
        <div class="toggle-row">
          <span class="toggle-label">${tx.intermediate}</span>
          <div class="toggle-btn-group">
            <button class="toggle-btn ${yesActive}" onclick="setToggle(${i},'intermediate','yes')">${tx.yes}</button>
            <button class="toggle-btn ${noActive}"  onclick="setToggle(${i},'intermediate','no')">${tx.no}</button>
          </div>
        </div>
        ${noteHtml}`;
    }

    if (HAS_ORAL.includes(a.id)) {
      const yesActive = a.oral === "yes" ? "active-yes" : "";
      const noActive  = a.oral === "no"  ? "active-no"  : "";
      const noteHtml  =
        a.oral === "yes" ? `<div class="toggle-note note-info">${tx.oralYes}</div>` :
        a.oral === "no"  ? `<div class="toggle-note note-warn">${tx.oralNo}</div>` : "";

      togglesHtml += `
        <div class="toggle-row">
          <span class="toggle-label">${tx.oral}</span>
          <div class="toggle-btn-group">
            <button class="toggle-btn ${yesActive}" onclick="setToggle(${i},'oral','yes')">${tx.yes}</button>
            <button class="toggle-btn ${noActive}"  onclick="setToggle(${i},'oral','no')">${tx.no}</button>
          </div>
        </div>
        ${noteHtml}`;
    } 

    if (HAS_INCLASS.includes(a.id)) {
      const yesActive = a.inclass === "yes" ? "active-yes" : "";
      const noActive  = a.inclass === "no"  ? "active-no"  : "";
      const noteHtml  =
        a.inclass === "yes" ? `<div class="toggle-note note-success">${tx.inclassYes}</div>` :
        a.inclass === "no"  ? `<div class="toggle-note note-warn">${tx.inclassNo}</div>` : "";

      togglesHtml += `
        <div class="toggle-row">
          <span class="toggle-label">${tx.inclass}</span>
          <div class="toggle-btn-group">
            <button class="toggle-btn ${yesActive}" onclick="setToggle(${i},'inclass','yes')">${tx.yes}</button>
            <button class="toggle-btn ${noActive}"  onclick="setToggle(${i},'inclass','no')">${tx.no}</button>
          </div>
        </div>
        ${noteHtml}`;
      
    }

    if (HAS_QA.includes(a.id)) {
      const yesActive = a.qa === "yes" ? "active-yes" : "";
      const noActive  = a.qa === "no"  ? "active-no"  : "";
      const noteHtml  =
        a.qa === "yes" ? `<div class="toggle-note note-success">${tx.qaYes}</div>` :
        a.qa === "no"  ? `<div class="toggle-note note-warn">${tx.qaNo}</div>` : "";

      togglesHtml += `
        <div class="toggle-row">
          <span class="toggle-label">${tx.qa}</span>
          <div class="toggle-btn-group">
            <button class="toggle-btn ${yesActive}" onclick="setToggle(${i},'qa','yes')">${tx.yes}</button>
            <button class="toggle-btn ${noActive}"  onclick="setToggle(${i},'qa','no')">${tx.no}</button>
          </div>
        </div>
        ${noteHtml}`;
    }
    if (HAS_REFLECTION.includes(a.id)) {
      const yesActive = a.reflection === "yes" ? "active-yes" : "";
      const noActive  = a.reflection === "no"  ? "active-no"  : "";
      const noteHtml  =
        a.reflection === "yes" ? `<div class="toggle-note note-info">${tx.reflectionYes}</div>` :
        a.reflection === "no"  ? `<div class="toggle-note note-warn">${tx.reflectionNo}</div>` : "";

      togglesHtml += `
        <div class="toggle-row">
          <span class="toggle-label">${tx.reflection}</span>
          <div class="toggle-btn-group">
            <button class="toggle-btn ${yesActive}" onclick="setToggle(${i},'reflection','yes')">${tx.yes}</button>
            <button class="toggle-btn ${noActive}"  onclick="setToggle(${i},'reflection','no')">${tx.no}</button>
          </div>
        </div>
        ${noteHtml}`;  
    }
    if (a.pct === 0) {
      togglesHtml += `<div class="toggle-note note-info">${tx.avvYes}</div>`;
}
      const safeNote    = a.note.replace(/"/g, "&quot;");
    const riskLabelKey = "risk" + a.risk.charAt(0).toUpperCase() + a.risk.slice(1);

    return `
      <div class="assessment-item ${a.risk}">
        <div class="item-main-row">
          <div class="item-labels">
            <span class="item-name">${name}</span>
            <input
              class="item-note-input"
              type="text"
              value="${safeNote}"
              placeholder="${tx.noteLabelPlaceholder}"
              maxlength="60"
              oninput="updateNote(${i}, this.value)"
            />
          </div>
          ${a.pct === 0 ? `<span class="avv-label">AVV</span>` : ""}
          <span class="item-badge badge-${a.risk}">${tx[riskLabelKey]}</span>
          <input
            class="item-pct-input"
            type="number"
            value="${a.pct}"
            min="0"
            max="100"
            onchange="updatePct(${i}, this.value)"
          />
          <span style="font-size:0.78rem;color:#a8a29f">%</span>
          <button class="remove-btn" onclick="removeAssessment(${i})" title="Remove">&#x2715;</button>
        </div>
        ${togglesHtml ? `<div class="item-toggles">${togglesHtml}</div>` : ""}
      </div>`;
  }).join("");
}

function renderFeedback() {
  const feedbackEl = document.getElementById("feedback-content");
  const tx = TX[lang];

  if (!assessments.length) {
    feedbackEl.innerHTML = `<div class="no-assessments-note">${tx.noAssessments}</div>`;
    return;
  }

  const RISK_SCORE = CONFIG.riskScore;
  const thresholds = CONFIG.vulnerabilityThresholds;
  const highThresholds = CONFIG.highRiskMessageThresholds;

  const total = assessments.reduce((sum, a) => sum + a.pct, 0);

  const hasMustPass = assessments.some(
    a => a.id === "in-person-exam" && a.compensable === "no"
  );

  const highPct = assessments.filter(a => a.risk === "high").reduce((s, a) => s + a.pct, 0);
  const medPct  = assessments.filter(a => a.risk === "medium").reduce((s, a) => s + a.pct, 0);
  const lowPct  = assessments.filter(a => a.risk === "low").reduce((s, a) => s + a.pct, 0);

  const effScore = a =>
    (a.id === "peer-review" && a.inclass === "yes") ? 1 :
    (a.id === "presentation" && a.qa === "yes") ? 1.25 :
    (a.id === "take-home-writing" && a.oral === "yes") ? 2.5 :
    (a.id === "group-work" && a.oral === "yes") ? 2.5 :

    RISK_SCORE[a.risk];
  const weighted = assessments.reduce((sum, a) => sum + effScore(a) * a.pct, 0);

  let vulnerability =
    total > 0 ? Math.round(((weighted - total) / (total * 2)) * 100) : 0;

  if (hasMustPass) {
    vulnerability = Math.min(vulnerability, thresholds.maxWithMustPass);
  }
  if (lowPct / total >= 0.65) {
  vulnerability = Math.min(vulnerability, thresholds.lowMax);
  }
  const mustPassPct = assessments
    .filter(a => a.id === "in-person-exam" && a.compensable === "no")
    .reduce((sum, a) => sum + a.pct, 0);
  if (mustPassPct >= 55) {
  vulnerability = Math.min(vulnerability, thresholds.lowMax);
}

  let gaugeColor, verdictText, verdictDesc;

  if (vulnerability <= thresholds.lowMax) {
    gaugeColor  = "#257835";
    verdictText = tx.verdictLow;
    verdictDesc = hasMustPass ? tx.verdictDescLowMustPass : tx.verdictDescLow;
  } else if (vulnerability <= thresholds.mediumMax) {
    gaugeColor  = "#e98300";
    verdictText = tx.verdictMed;
    verdictDesc = tx.verdictDescMed;
  } else {
    gaugeColor  = "#bc0031";
    verdictText = tx.verdictHigh;
    verdictDesc = tx.verdictDescHigh;
  }

  const radius       = 31;
  const cx = 44, cy = 44;
  const circumference = 2 * Math.PI * radius;
  const filled        = (vulnerability / 100) * circumference;

  const messages = [];

  // Weights
  if (total !== 100) {
    messages.push({
      type: total > 100 ? "danger" : "warn",
      icon: total > 100 ? "⚠️" : "📊",
      text: total > 100
        ? interpolate(tx.msgWeightsOver,  { total })
        : interpolate(tx.msgWeightsUnder, { total, remaining: 100 - total }),
    });
  } else {
    messages.push({ type: "success", icon: "✅", text: tx.msgWeightsOk });
  }

  // Must-pass shield
  if (hasMustPass) {
    messages.push({ type: "success", icon: "🛡️", text: tx.msgMustPass });
  }

  // High-risk weight warnings
  if (!hasMustPass) {
    if (highPct > highThresholds.highOver60) {
      messages.push({ type: "danger", icon: "🤖", text: interpolate(tx.msgHighOver60, { pct: highPct }) });
    } else if (highPct > highThresholds.highOver40) {
      messages.push({ type: "warn",   icon: "🤖", text: interpolate(tx.msgHighOver40, { pct: highPct }) });
    }
  }

  // No low-risk
  if (lowPct === 0) {
    messages.push({ type: "warn", icon: "⚠️", text: tx.msgNoLow });
  }

  // Compensable in-person exam
  if (assessments.some(a => a.id === "in-person-exam" && a.compensable === "yes")) {
    messages.push({ type: "info", icon: "ℹ️", text: tx.msgCompensableYes });
  }
  if (assessments.some(a => a.id === "in-person-exam" && a.compensable === null)) {
    messages.push({ type: "warn", icon: "❓", text: tx.msgCompensableNull });
  }
 // Oral component in take-home writing
  if (assessments.some(a => a.id === "take-home-writing" && a.oral === null)) {
    messages.push({ type: "warn", icon: "❓", text: tx.msgTakeHomeNull });
  }

  // Group work
  if (assessments.some(a => a.id === "group-work")) {
    if (assessments.some(a => a.id === "group-work" && (a.intermediate === null || a.reflection === null || a.oral === null))) {
      messages.push({ type: "warn", icon: "❓", text: tx.msgGroupWorkNull });
    } else {
      messages.push({ type: "info", icon: "ℹ️", text: tx.msgGroupWork });
}
}

  // Peer review without inclass answer
  if (assessments.some(a => a.id === "peer-review" && a.inclass === null)) {
    messages.push({ type: "warn", icon: "❓", text: tx.msgPeerReviewNull });
  }

  // Presentation
  if (assessments.some(a => a.id === "presentation" && a.qa === null)) {
  messages.push({ type: "info", icon: "ℹ️", text: tx.msgPresentation });
}

  // Oral exam
  if (assessments.some(a => a.id === "oral-exam")) {
    messages.push({ type: "success", icon: "🗣️", text: tx.msgOralExam });
  }

  feedbackEl.innerHTML = `
    <div class="total-row">
      <span class="total-label">${tx.totalWeight}</span>
      <span class="total-value ${total === 100 ? "total-ok" : total > 100 ? "total-error" : "total-warn"}">${total}%</span>
    </div>
    <div class="score-section">
      <div class="gauge-wrap">
        <svg viewBox="0 0 88 88">
          <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="#E6E5E3" stroke-width="9"></circle>
          <circle
            cx="${cx}" cy="${cy}" r="${radius}"
            fill="none"
            stroke="${gaugeColor}"
            stroke-width="9"
            stroke-dasharray="${filled} ${circumference}"
            stroke-linecap="round"
            transform="rotate(-90 ${cx} ${cy})"
          ></circle>
        </svg>
      </div>
      <div class="score-desc">
        <div class="verdict" style="color:${gaugeColor}">${verdictText}</div>
        <p>${verdictDesc}</p>
      </div>
    </div>
    <div class="breakdown-bar">
      <div class="bar-high"   style="width:${highPct}%"></div>
      <div class="bar-medium" style="width:${medPct}%"></div>
      <div class="bar-low"    style="width:${lowPct}%"></div>
    </div>
    <div class="breakdown-legend">
      <span><span class="legend-dot" style="background:#bc0031"></span>${tx.legendHigh}: ${highPct}%</span>
      <span><span class="legend-dot" style="background:#e98300"></span>${tx.legendMedium}: ${medPct}%</span>
      <span><span class="legend-dot" style="background:#257835"></span>${tx.legendLow}: ${lowPct}%</span>
    </div>
    <div class="messages">
      ${messages.map(m => `
        <div class="msg msg-${m.type}">
          <span class="msg-icon">${m.icon}</span>
          <span>${m.text}</span>
        </div>`).join("")}
    </div>`;
}

// ─── Save as image ────────────────────────────────────────────────────────────
function getCourseTitleForFilename() {
  let title = (document.getElementById("course-title").value || "").trim();
  if (!title) return "course";
  return title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\-]+/g, "") || "course";
}

function saveResult() {
  if (typeof html2canvas === "undefined") return;

  html2canvas(document.body, {
    scale: 2,
    useCORS: true,
    onclone: clonedDoc => {
      const addCardClone = clonedDoc.getElementById("add-card");
      if (addCardClone) {
        addCardClone.classList.add("hidden");
      }
    }
  }).then(canvas => {
    const link = document.createElement("a");
    link.href     = canvas.toDataURL("image/png");
    link.download = `${getCourseTitleForFilename()}-ai-exposure.png`;
    link.click();
  });
}

// ─── Reset ────────────────────────────────────────────────────────────────────
function resetState() {
  assessments = [];
  assessmentSectionsVisible = false;

  document.getElementById("course-title").value          = "";
  document.getElementById("header-subtitle").textContent = "";

  document.getElementById("add-card").classList.add("hidden");
  document.getElementById("structure-card").classList.add("hidden");
  document.getElementById("feedback-card").classList.add("hidden");
  document.getElementById("header-save-btn").classList.add("hidden");
  document.getElementById("header-reset-btn").classList.add("hidden");

  document.getElementById("assessment-list").innerHTML  = "";
  document.getElementById("feedback-content").innerHTML = "";

  try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
}

// ─── Intro overlay ────────────────────────────────────────────────────────────
function maybeShowIntro() {
  const overlay = document.getElementById("intro-overlay");
  try {
    if (!localStorage.getItem(INTRO_KEY)) overlay.style.display = "flex";
  } catch (e) {
    overlay.style.display = "flex";
  }
}

function dismissIntro() {
  document.getElementById("intro-overlay").style.display = "none";
  try { localStorage.setItem(INTRO_KEY, "1"); } catch (e) {}
}
function openExposureHelp() {
  const overlay = document.getElementById("exposure-help-overlay");
  if (overlay) {
    overlay.style.display = "flex";
  }
}

function closeExposureHelp() {
  const overlay = document.getElementById("exposure-help-overlay");
  if (overlay) {
    overlay.style.display = "none";
  }
}

// ─── Event listeners ──────────────────────────────────────────────────────────
document.getElementById("pct-input").addEventListener("keydown",  e => { if (e.key === "Enter") addAssessment(); });
document.getElementById("note-input").addEventListener("keydown", e => { if (e.key === "Enter") addAssessment(); });

// ─── Boot ─────────────────────────────────────────────────────────────────────
loadAll();
