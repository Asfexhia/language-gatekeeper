"use strict";

function initialState(lang) {
  return {
    lang: lang || "zh",
    view: "frame",
    startedAt: null,
    phase: "greet",
    styleId: null,
    draft: "",
    sentText: "",
    messages: [],
    detailSlot: null,
    understoodAt: [],
    notice: "",
    boardNote: "",
    busy: false,
    timerId: null,
    retry: false,
  };
}

let state = initialState("zh");
let gen = 0;

function L() { return COPY[state.lang]; }
function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function wait(ms) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return new Promise((resolve) => setTimeout(resolve, reduce ? Math.min(ms, 180) : ms));
}
function fmt(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
function elapsedMs() {
  if (!state.startedAt) return 0;
  return Date.now() - state.startedAt;
}
function daypart() {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}
function styleOf(id) { return SCENARIO.styles[id]; }
function activeStyle() { return state.styleId ? styleOf(state.styleId) : null; }
function defaultDraft() {
  return styleOf(state.lang === "zh" ? "chinese" : "everyday").utterance;
}
function classifyText(text) {
  const t = text.trim();
  const exact = SCENARIO.examples.find((item) => item.text === t);
  if (exact) return exact.style;
  if (t.length < 12) return null;
  const lower = t.toLowerCase();
  const formal = /crushing|substernal|压迫/.test(lower) && /radiat|jaw|下巴|左臂/.test(lower) && /40|分钟|minute/.test(lower);
  if (formal) return "formal";
  if (/[\u4e00-\u9fff]/.test(t)) return "chinese";
  return "everyday";
}
function exampleList() {
  const rank = (style) => {
    if (state.lang === "zh") return style === "chinese" ? 0 : style === "everyday" ? 1 : 2;
    return style === "everyday" ? 0 : style === "chinese" ? 1 : 2;
  };
  return SCENARIO.examples
    .map((item, index) => ({ item, index }))
    .sort((a, b) => rank(a.item.style) - rank(b.item.style) || a.index - b.index);
}
function storyOutcome() {
  if (state.styleId === "formal") return { level: 2, dept: "cardiology" };
  if (state.styleId === "chinese") return { level: 5, dept: "general" };
  return { level: 4, dept: "general" };
}
function clauseText(id) {
  const style = activeStyle();
  if (!style) return id;
  const clause = style.clauses.find((item) => item.id === id);
  if (!clause) return id;
  return clause.text[state.lang] || clause.text.zh || clause.text.en;
}

function setLang(lang) {
  if (lang !== "zh" && lang !== "en") return;
  if (state.view !== "frame" && state.view !== "brief") return;
  state.lang = lang;
  state.draft = "";
  document.documentElement.lang = lang === "zh" ? "zh-Hans" : "en";
  const skip = document.getElementById("skip");
  if (skip) skip.textContent = lang === "zh" ? "跳到主要内容" : "Skip to content";
  mount();
}
function go(view, opts) {
  gen += 1;
  state.view = view;
  state.retry = Boolean(opts && opts.retry);
  if ((view === "kiosk" || view === "desk") && !state.startedAt) state.startedAt = Date.now();
  if (view === "desk" && !state.retry) state.busy = true;
  if (view === "desk" && state.retry) {
    state.phase = "choose";
    state.detailSlot = null;
    state.messages = [];
    state.busy = false;
    state.draft = state.sentText || defaultDraft();
  }
  mount();
  if (view === "kiosk" || view === "desk" || view === "ticket" || view === "board") startTimer();
  if (view === "desk" && !state.retry) greetFlow(gen);
  if (view === "desk" && state.retry) pushMessage({ role: "nia", text: L().desk.retry });
}
function resetAll() {
  const lang = state.lang;
  clearInterval(state.timerId);
  gen += 1;
  state = initialState(lang);
  mount();
}
function startTimer() {
  clearInterval(state.timerId);
  state.timerId = setInterval(() => {
    const node = document.getElementById("elapsed");
    if (!node || !state.startedAt) return;
    node.textContent = fmt(Date.now() - state.startedAt);
  }, 1000);
}
function mount() {
  document.title = L().meta.title;
  const views = {
    frame: renderFrame,
    brief: renderBrief,
    kiosk: renderKiosk,
    desk: renderDesk,
    ticket: renderTicket,
    board: renderBoard,
  };
  document.getElementById("app").innerHTML = views[state.view]();
  if (state.view === "desk") {
    paintMessages();
    syncBusy();
  }
  const elapsed = document.getElementById("elapsed");
  if (elapsed && state.startedAt) elapsed.textContent = fmt(elapsedMs());
  const focus = document.querySelector("[data-focus]");
  if (focus) {
    if (!focus.hasAttribute("tabindex")) focus.setAttribute("tabindex", "-1");
    focus.focus();
  }
}
function mark() {
  return `<svg class="mark" viewBox="0 0 36 36" aria-hidden="true"><path d="M3 18h7l2.5-7 5 14 2.5-7H33" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}
function chrome(withTimer) {
  const c = L().chrome;
  const timer = withTimer
    ? `<span class="timer"><span class="timer-label">${esc(c.elapsed)}</span><span id="elapsed">0:00</span></span>`
    : "";
  return `<header class="topbar"><div class="brand">${mark()}<span><strong>${esc(c.city)}</strong><em>${esc(c.service)}</em></span></div><div class="top-meta">${timer}<span>${esc(c.signedIn)}</span></div></header>`;
}
function footer() {
  return `<footer class="site-foot">${esc(L().chrome.fiction)}</footer>`;
}
function langSwitch() {
  const zh = state.lang === "zh" ? "true" : "false";
  const en = state.lang === "en" ? "true" : "false";
  return `<div class="langs" role="group" aria-label="${esc(L().frame.langLabel)}"><button type="button" data-action="lang" data-lang="zh" aria-pressed="${zh}">中文</button><button type="button" data-action="lang" data-lang="en" aria-pressed="${en}">English</button></div>`;
}
function button(action, label, cls, extra) {
  return `<button type="button" class="btn ${cls || ""}" data-action="${action}" ${extra || ""}>${esc(label)}</button>`;
}
function chip(level) {
  const tone = level === 2 ? "high" : "low";
  return `<span class="chip ${tone}">${esc(L().levels[level])}</span>`;
}

function renderFrame() {
  const f = L().frame;
  return `<main class="frame" id="main"><div class="frame-card"><p class="kicker">${esc(f.kicker)}</p><h1 data-focus>${esc(f.title)}</h1><p class="lede">${esc(f.lede)}</p><p class="body">${esc(f.body)}</p>${langSwitch()}<div class="actions">${button("enter", f.enter, "")}</div></div></main>`;
}
function renderBrief() {
  const b = L().brief;
  const rows = b.rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("");
  const items = b.items.map((item) => `<li><div><strong>${esc(item[0])}</strong><em>${esc(item[1])}</em></div></li>`).join("");
  return `<main class="brief-wrap" id="main"><div class="brief-card"><p class="kicker">${esc(b.kicker)}</p><h1 data-focus>${esc(b.title)}</h1><p class="lead">${esc(b.lead)}</p><dl class="dossier">${rows}</dl><h2>${esc(b.needTitle)}</h2><ul class="need-list">${items}</ul><div class="actions">${button("to-kiosk", b.start, "")}${button("to-frame", b.back, "quiet")}</div></div></main>`;
}
function renderKiosk() {
  const p = L().portal;
  const name = SCENARIO.patient.name[state.lang];
  const hello = state.lang === "zh" ? `${p.greet[daypart()]}，${name}` : `${p.greet[daypart()]}, ${name}`;
  const stats = p.stats.map(([n, label]) => `<article class="stat-card"><b>${esc(n)}</b><span>${esc(label)}</span></article>`).join("");
  return `<div class="shell"><main id="main">${chrome(true)}<div class="portal"><div class="portal-head"><p class="kicker">${esc(p.upcoming)}</p><h1 data-focus>${esc(hello)}</h1><p>${esc(p.intro)}</p></div><p class="promise">${esc(L().promise)}</p><div class="layout"><article class="hero"><p class="kicker">${esc(p.service)}</p><p class="when">${esc(state.lang === "zh" ? "症状尚未分级" : "Symptoms not yet leveled")}</p><div class="facts"><div><span>${esc(p.place)}</span><span>${esc(String(SCENARIO.patient.age))}</span></div><div><span>${esc(p.worker)}</span></div></div>${button("to-desk", p.change, "")}</article><aside class="side-card"><h2>${esc(p.others)}</h2><div class="stack">${button("what-info", p.whatBtn, "secondary")}${button("chart-info", p.chartBtn, "secondary")}${button("lang-info", p.langBtn, "secondary")}</div><p id="notice" class="notice" ${state.notice ? "" : "hidden"}>${esc(state.notice)}</p></aside></div><div class="stats">${stats}</div></div>${footer()}</main></div>`;
}

function stepperHTML() {
  const current = state.view === "ticket" || state.view === "board" ? 4 : state.phase === "greet" ? 1 : state.phase === "choose" ? 2 : 3;
  return `<ol class="steps">${L().steps.map((label, index) => {
    const n = index + 1;
    const cls = n < current ? "done" : n === current ? "current" : "";
    const aria = n === current ? ' aria-current="step"' : "";
    return `<li class="${cls}"${aria}><span>${n}</span>${esc(label)}</li>`;
  }).join("")}</ol>`;
}
function detailButtons() {
  const style = activeStyle();
  if (!style) return "";
  return style.clauses
    .filter((clause) => !clause.kept)
    .map((clause) => button("detail", clause.text[state.lang] || clause.text.zh, "secondary", `data-field="${clause.id}"`))
    .join("");
}
function composerHTML() {
  const d = L().desk;
  if (state.phase === "greet") {
    return `<div class="stack">${button("confirm-chart", d.yesChart, "")}${button("ask-chart", d.askChart, "secondary")}</div>`;
  }
  if (state.phase === "choose") {
    if (!state.draft) state.draft = defaultDraft();
    const current = state.draft.trim();
    const examples = state.retry
      ? `<p class="group-label">${esc(d.examples)}</p><div class="examples">${exampleList().map(({ item, index }) => {
        const pressed = item.text === current ? "true" : "false";
        return `<button type="button" class="btn secondary" data-action="example" data-example="${index}" aria-pressed="${pressed}">${esc(item.text)}</button>`;
      }).join("")}</div>`
      : "";
    return `<label class="draft-label" for="draft">${esc(d.draftLabel)}</label><textarea id="draft">${esc(state.draft)}</textarea><div class="row">${button("send", d.send, "")}</div>${examples}`;
  }
  if (state.phase === "sending") return "";
  if (state.phase === "result") {
    const outcome = storyOutcome();
    const details = detailButtons();
    const extra = details ? `<p class="group-label">${esc(d.detailLabel)}</p><div class="stack">${details}</div>` : "";
    return `<p>${chip(outcome.level)} ${esc(L().places[outcome.level])}</p>${extra}<div class="row">${button("to-ticket", d.ticketBtn, "")}${button("retry", d.another, "secondary")}</div>`;
  }
  return "";
}
function renderDesk() {
  const title = state.lang === "zh" ? "描述症状" : "Describe symptoms";
  return `<div class="shell desk-shell"><main id="main">${chrome(true)}${stepperHTML()}<div class="desk-grid"><section class="thread" aria-label="ARIA"><div class="thread-head"><h1 data-focus>${esc(title)}</h1></div><div id="transcript" class="transcript" tabindex="0" aria-live="polite"></div><p id="typing" class="typing" hidden><i></i><i></i><i></i><em>${esc(L().desk.typing)}</em></p><div id="composer" class="composer" data-composer>${composerHTML()}</div></section></div>${footer()}</main></div>`;
}
function renderComposer() {
  const el = document.getElementById("composer");
  if (!el) return;
  el.innerHTML = composerHTML();
  syncBusy();
}
function renderSteps() {
  const steps = document.querySelector(".steps");
  if (steps) steps.outerHTML = stepperHTML();
}
function messageHTML(msg) {
  const body = `<div class="prose">${esc(msg.text).replace(/\n/g, "<br>")}</div>`;
  if (msg.role === "user") return `<article class="msg user"><div class="bubble">${body}</div></article>`;
  if (msg.role === "card") return routingCardHTML();
  return `<article class="msg nia"><div class="avatar" aria-hidden="true">A</div><div><div class="who">ARIA</div><div class="bubble">${body}</div></div></article>`;
}
function routingCardHTML() {
  const style = activeStyle();
  const d = L().desk;
  if (!style) return "";
  return `<aside class="trans-card"><header><span>${esc(d.routingLabel)}</span><span class="ok">${esc(d.confidence)}</span></header><p class="mono">${esc(style.routing)}</p><p class="gloss">${esc(style.routingGloss[state.lang])}</p></aside>`;
}
function paintMessages() {
  const box = document.getElementById("transcript");
  if (!box) return;
  box.innerHTML = state.messages.map(messageHTML).join("");
  box.scrollTop = box.scrollHeight;
}
function pushMessage(msg) {
  state.messages.push(msg);
  const box = document.getElementById("transcript");
  if (!box) return;
  box.insertAdjacentHTML("beforeend", messageHTML(msg));
  box.scrollTop = box.scrollHeight;
}
function syncBusy() {
  const typing = document.getElementById("typing");
  if (typing) typing.hidden = !state.busy;
  document.querySelectorAll("[data-composer] button, [data-composer] textarea").forEach((el) => { el.disabled = state.busy; });
}
function setPhase(phase) {
  state.phase = phase;
  renderComposer();
  renderSteps();
}
function markUnderstood(where) {
  if (state.understoodAt.includes(where)) return;
  state.understoodAt.push(where);
}
async function nia(text, g, delay) {
  state.busy = true;
  syncBusy();
  await wait(delay == null ? 700 : delay);
  if (g !== gen) return false;
  pushMessage({ role: "nia", text });
  state.busy = false;
  syncBusy();
  return true;
}
async function greetFlow(g) {
  await nia(L().desk.greet, g, 650);
}
function showNotice(text) {
  state.notice = text;
  const el = document.getElementById("notice");
  if (!el) return;
  el.hidden = false;
  el.textContent = text;
}
function draftValue() {
  const el = document.getElementById("draft");
  return el ? el.value : state.draft;
}

async function onConfirmChart() {
  const g = gen;
  pushMessage({ role: "user", text: L().desk.yesChart });
  const ok = await nia(L().desk.confirmed, g, 550);
  if (!ok) return;
  state.draft = state.draft || defaultDraft();
  setPhase("choose");
}
async function onAskChart() {
  const g = gen;
  pushMessage({ role: "user", text: L().desk.askChart });
  await nia(L().desk.chartReply, g, 600);
}
async function onSend() {
  const g = gen;
  const text = draftValue().trim();
  if (!text) return;
  state.draft = text;
  const id = classifyText(text);
  pushMessage({ role: "user", text });
  if (!id) {
    await nia(L().desk.unclear, g, 600);
    return;
  }
  state.styleId = id;
  state.sentText = text;
  state.detailSlot = null;
  state.phase = "sending";
  renderComposer();
  let ok = await nia(L().desk.received, g, 800);
  if (!ok) return;
  pushMessage({ role: "card" });
  const outcome = storyOutcome();
  const tail = outcome.level === 2 ? L().desk.afterGood : L().desk.afterCard;
  const summary = `${L().understood}\n\n${L().levels[outcome.level]}\n${L().depts[outcome.dept]}\n${L().impressions[outcome.level]}\n${L().places[outcome.level]}\n\n${tail}`;
  ok = await nia(summary, g, 700);
  if (!ok) return;
  markUnderstood("routing");
  setPhase("result");
}
function onExample(index) {
  const example = SCENARIO.examples[Number(index)];
  if (!example) return;
  state.draft = example.text;
  const box = document.getElementById("draft");
  if (box) {
    box.value = state.draft;
    box.focus();
  }
  document.querySelectorAll("[data-example]").forEach((btn) => {
    btn.setAttribute("aria-pressed", btn.dataset.example === String(index) ? "true" : "false");
  });
}
async function onDetail(id) {
  const g = gen;
  state.detailSlot = id;
  pushMessage({ role: "user", text: clauseText(id) });
  await nia(L().desk.detailSaved, g, 650);
}

function renderTicket() {
  const s = L().success;
  const style = activeStyle();
  const outcome = storyOutcome();
  const note = state.detailSlot ? `<div><dt>${esc(s.note)}</dt><dd>${esc(clauseText(state.detailSlot))}</dd></div>` : "";
  return `<div class="shell"><main id="main">${chrome(true)}${stepperHTML()}<div class="success-wrap"><div class="success-grid"><article class="confirm"><p class="kicker">${esc(s.kicker)}</p><div class="chip ok">${esc(s.status)}</div><h1 data-focus>${esc(s.title)}</h1><p>${esc(SCENARIO.patient.ticket)} · ${esc(SCENARIO.patient.mrn)}</p><p class="understood-line">${esc(L().understood)}</p><p>${esc(s.noAction)}</p><p class="kicker">${esc(s.levelLabel)}</p><p class="big-time">${chip(outcome.level)}</p><p>${esc(L().places[outcome.level])}</p><dl class="receipt"><div><dt>${esc(s.dept)}</dt><dd>${esc(L().depts[outcome.dept])}</dd></div><div><dt>${esc(s.impression)}</dt><dd>${esc(L().impressions[outcome.level])}</dd></div><div><dt>${esc(s.used)}</dt><dd>${esc(style.routing)}</dd></div>${note}</dl><div class="success-actions">${button("to-board", s.board, "")}${button("retry", L().desk.another, "secondary")}</div></article></div></div>${footer()}</main></div>`;
}

function boardQueue() {
  const mine = storyOutcome();
  const me = {
    me: true,
    level: mine.level,
    mrn: SCENARIO.patient.mrn,
    complaint: activeStyle().routing,
    tag: `${L().board.you} · ${L().places[mine.level]}`,
  };
  let rows = SCENARIO.queue.filter((row) => !(state.styleId === "formal" && row.id === "mirror"));
  if (mine.level === 2) return [me, ...rows];
  return rows.concat([me]);
}
function renderBoard() {
  const b = L().board;
  const style = activeStyle();
  const outcome = storyOutcome();
  const queue = boardQueue().map((row) => {
    const complaint = row.me ? row.complaint : row.complaint[state.lang];
    const tag = row.me ? row.tag : row.tag[state.lang];
    return `<article class="qrow ${row.me ? "me" : ""}">${chip(row.level)}<b>${esc(row.mrn)}</b><span>${esc(complaint)}<br>${esc(tag)}</span></article>`;
  }).join("");
  const added = state.detailSlot ? `<p>${esc(L().success.note)}：${esc(clauseText(state.detailSlot))}</p>` : "";
  const note = state.boardNote ? `<p id="board-log">${esc(state.boardNote)}</p>` : `<p id="board-log" hidden></p>`;
  return `<div class="shell"><main id="main">${chrome(true)}<div class="portal"><p class="kicker">${esc(b.kicker)}</p><h1 data-focus>${esc(b.title)}</h1><div class="layout"><section>${queue}</section><aside class="side-card"><h2>${esc(b.packet)}</h2><p class="understood-line">${esc(L().understood)}</p><p class="mono">${esc(style.routing)}</p><p>${chip(outcome.level)}</p><p>${esc(L().impressions[outcome.level])}</p><p>${esc(L().places[outcome.level])}</p>${added}<p><strong>${esc(b.original)}</strong></p><p>${esc(state.sentText)}</p>${note}<div class="stack">${button("raise", b.raise, "secondary")}${button("retry", b.again, "quiet")}</div></aside></div></div>${footer()}</main></div>`;
}

function onClick(event) {
  const btn = event.target.closest("[data-action]");
  if (!btn || !document.getElementById("app").contains(btn)) return;
  const action = btn.dataset.action;
  if (state.busy && action !== "lang") return;
  if (action === "lang") return setLang(btn.dataset.lang);
  if (action === "enter") return go("brief");
  if (action === "to-frame") return go("frame");
  if (action === "to-kiosk") return go("kiosk");
  if (action === "to-desk") return go("desk");
  if (action === "what-info") return showNotice(L().portal.what);
  if (action === "chart-info") return showNotice(L().portal.chart);
  if (action === "lang-info") return showNotice(L().portal.langs);
  if (action === "confirm-chart") return onConfirmChart();
  if (action === "ask-chart") return onAskChart();
  if (action === "send") return onSend();
  if (action === "example") return onExample(btn.dataset.example);
  if (action === "detail") return onDetail(btn.dataset.field);
  if (action === "to-ticket") {
    markUnderstood("ticket");
    return go("ticket");
  }
  if (action === "retry") return go("desk", { retry: true });
  if (action === "to-board") return go("board");
  if (action === "raise") {
    state.boardNote = L().board.raiseReply;
    const log = document.getElementById("board-log");
    if (log) {
      log.hidden = false;
      log.textContent = state.boardNote;
    }
  }
}
function onInput(event) {
  if (event.target.id === "draft") state.draft = event.target.value;
}
function init() {
  const nav = (navigator.language || "zh").toLowerCase();
  state = initialState(nav.startsWith("en") ? "en" : "zh");
  document.documentElement.lang = state.lang === "zh" ? "zh-Hans" : "en";
  const skip = document.getElementById("skip");
  if (skip) skip.textContent = state.lang === "zh" ? "跳到主要内容" : "Skip to content";
  const app = document.getElementById("app");
  app.addEventListener("click", onClick);
  app.addEventListener("input", onInput);
  mount();
}
init();
