/* ============================================================
   BEYOND THE DESK - app logic
   Architecture: static page, data lives as CSV files in this repo.
   Reads: plain relative fetch() of data/<year>/*.csv (works on any
   static host, e.g. GitHub Pages - no auth needed to just view).
   Writes (score entry): GitHub Contents API with a Personal Access
   Token, so saving a score literally creates a commit. No server.
   ============================================================ */

(() => {
  // Fixed once by whoever deploys this - same repo for every scorer, so
  // signing in only ever asks for a name + that person's own token.
  const REPO_OWNER = 'lolaaaaa1';
  const REPO_NAME = 'nmiExtras';
  const REPO_BRANCH = 'main';

  const SESSION_KEY = 'btd_session'; // { name, token } - the signed-in person
  const YEARS = ['2026', '2025'];
  const YEAR_LABEL = { '2026': 'THIS YEAR', '2025': '2025' };

  const state = {
    year: '2026',
    game: null,
    entryOpen: false,
    factsOpen: null,
  };

  /* ---------------- CSV ---------------- */
  const CSV = {
    parse(text) {
      const lines = (text || '').replace(/\r\n/g, '\n').split('\n').filter(l => l.length > 0);
      if (lines.length === 0) return { headers: [], rows: [] };
      const headers = splitCsvLine(lines[0]);
      const rows = lines.slice(1).map(line => {
        const cells = splitCsvLine(line);
        const row = {};
        headers.forEach((h, i) => { row[h] = cells[i] !== undefined ? cells[i] : ''; });
        return row;
      });
      return { headers, rows };
    },
    serialize(headers, rows) {
      const esc = (v) => {
        v = v === undefined || v === null ? '' : String(v);
        return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      };
      const lines = [headers.join(',')];
      rows.forEach(r => lines.push(headers.map(h => esc(r[h])).join(',')));
      return lines.join('\n') + '\n';
    },
  };
  function splitCsvLine(line) {
    const out = []; let cur = ''; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') { inQ = false; }
        else cur += c;
      } else {
        if (c === '"') inQ = true;
        else if (c === ',') { out.push(cur); cur = ''; }
        else cur += c;
      }
    }
    out.push(cur);
    return out;
  }

  /* ---------------- Embedded fallback seed (so the page never shows blank) ---------------- */
  const EMBEDDED = {
    'data/2025/departments.csv': `id,name
D1,Admin & HR
D2,HSP
D3,Actuarial & BI
D4,Membership & QA
D5,Claims
D6,CR
D7,Sales
D8,Accounts
D9,MIS & BMC
D10,Call Center
`,
    'data/2025/games.csv': `id,name,has_breakdown
G1,Oware,1
G2,Ludu,0
G3,Jumbo Jenga,0
G4,Archery,0
G5,Darts,0
G6,Football,1
G7,Sack Race,0
G8,Volleyball,0
G9,Table Tennis,0
G10,Cycling,0
G11,Ring Toss,0
G12,Flip Da Bottle,0
`,
    'data/2025/scores.csv': `game_id,department_id,score
G1,D10,3
G1,D4,3
G6,D2,4
`,
    'data/2025/totals.csv': `department_id,total
D1,13
D2,4
D3,21
D4,26
D5,21
D6,23
D7,8
D8,12
D9,21
D10,18
`,
    'data/2025/event.csv': `company,date,location,trip_name,title,subtitle,feedback_emails
Nationwide Medical Insurance,"Sept 27, 2025","Safari Valley, Adukrom",NMI Staff Trip 2025,Departmental Games,May the best department win,"philiptwum@nationwidemh.com,jeromejacaboba@nationwidemh.com"
`,
    'data/2026/departments.csv': `id,name
D1,Admin & HR
D2,HSP
D3,Actuarial & BI
D4,Membership & QA
D5,Claims
D6,CR
D7,Sales
D8,Accounts
D9,MIS & BMC
D10,Call Center
`,
    'data/2026/games.csv': `id,name,has_breakdown
G1,Oware,1
G2,Ludu,1
G3,Jumbo Jenga,1
G4,Archery,1
G5,Darts,1
G6,Football,1
G7,Sack Race,1
G8,Volleyball,1
G9,Table Tennis,1
G10,Cycling,1
G11,Ring Toss,1
G12,Flip Da Bottle,1
`,
    'data/2026/scores.csv': `game_id,department_id,score
`,
    'data/2026/event.csv': `company,date,location,trip_name,title,subtitle,feedback_emails
Nationwide Medical Insurance,"Sept 27, 2025","Safari Valley, Adukrom",NMI Staff Trip 2026,Departmental Games,May the best department win,"philiptwum@nationwidemh.com,jeromejacaboba@nationwidemh.com"
`,
  };

  /* ---------------- session (who's signed in) ---------------- */
  function session() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { return null; }
  }
  function saveSession(s) { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
  function clearSession() { localStorage.removeItem(SESSION_KEY); }
  function repoConfigured() { return !!(REPO_OWNER && REPO_NAME); }

  /* ---------------- GitHub client ---------------- */
  function b64encode(str) { return btoa(unescape(encodeURIComponent(str))); }
  function b64decode(str) { return decodeURIComponent(escape(atob(str.replace(/\n/g, '')))); }

  async function ghFetchFile(path) {
    const s = session();
    const headers = {};
    if (s && s.token) headers.Authorization = `token ${s.token}`;
    const res = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}?ref=${REPO_BRANCH}`, { headers });
    if (!res.ok) { const e = new Error(`GitHub read failed (${res.status})`); e.status = res.status; throw e; }
    const json = await res.json();
    return { text: b64decode(json.content), sha: json.sha };
  }

  async function ghWriteFile(path, content, sha, message) {
    const s = session();
    const body = { message, content: b64encode(content), branch: REPO_BRANCH };
    if (sha) body.sha = sha;
    const res = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`, {
      method: 'PUT',
      headers: { Authorization: `token ${s.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const e = new Error(err.message || `GitHub write failed (${res.status})`);
      e.status = res.status;
      throw e;
    }
    return res.json();
  }

  /* ---------------- DATA store ---------------- */
  const DATA = { cache: {} };

  async function loadCsv(path) {
    let text, sha = null;
    if (repoConfigured()) {
      try { const r = await ghFetchFile(path); text = r.text; sha = r.sha; } catch (e) { /* fall through to static/embedded */ }
    }
    if (text === undefined) {
      try {
        const res = await fetch(path, { cache: 'no-store' });
        if (res.ok) text = await res.text();
      } catch (e) { /* fall through */ }
    }
    if (text === undefined) text = EMBEDDED[path] || '';
    const parsed = CSV.parse(text);
    const entry = { headers: parsed.headers, rows: parsed.rows, sha, path };
    DATA.cache[path] = entry;
    return entry;
  }

  async function saveCsv(path, headers, rows, message) {
    const s = session();
    if (!repoConfigured()) {
      const e = new Error("This app isn't connected to a repo yet - ask the organizer to set REPO_OWNER/REPO_NAME in assets/app.js.");
      throw e;
    }
    if (!s || !s.token) {
      const e = new Error('Sign in first (top right) to save scores.');
      e.needsSetup = true;
      throw e;
    }
    const content = CSV.serialize(headers, rows);
    const cached = DATA.cache[path];
    let sha = cached ? cached.sha : null;
    try {
      await ghWriteFile(path, content, sha, message);
    } catch (e) {
      if (e.status === 409 || e.status === 422) {
        const fresh = await ghFetchFile(path);
        await ghWriteFile(path, content, fresh.sha, message);
      } else if (e.status === 401 || e.status === 403) {
        const e2 = new Error(`GitHub rejected ${s.name}'s token - it may be missing repo write access, or expired.`);
        e2.needsSetup = true;
        throw e2;
      } else {
        throw e;
      }
    }
    const refreshed = await ghFetchFile(path);
    DATA.cache[path] = { headers, rows, sha: refreshed.sha, path };
  }

  /* ---------------- helpers ---------------- */
  function byId(id) { return document.getElementById(id); }
  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }
  function toast(msg, ms = 2600) {
    const t = byId('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), ms);
  }

  async function loadYearData(year) {
    const [dep, games, scores, event] = await Promise.all([
      loadCsv(`data/${year}/departments.csv`),
      loadCsv(`data/${year}/games.csv`),
      loadCsv(`data/${year}/scores.csv`),
      loadCsv(`data/${year}/event.csv`),
    ]);
    let totals = null;
    if (year === '2025') totals = await loadCsv(`data/${year}/totals.csv`);

    const depMap = {};
    dep.rows.forEach(r => { depMap[r.id] = r.name; });

    let totalsByDept;
    if (totals && totals.rows.length) {
      totalsByDept = totals.rows.map(r => ({ id: r.department_id, name: depMap[r.department_id] || r.department_id, total: Number(r.total) || 0 }));
    } else {
      const sums = {};
      dep.rows.forEach(r => { sums[r.id] = 0; });
      scores.rows.forEach(r => { sums[r.department_id] = (sums[r.department_id] || 0) + (Number(r.score) || 0); });
      totalsByDept = dep.rows.map(r => ({ id: r.id, name: r.name, total: sums[r.id] || 0 }));
    }
    totalsByDept.sort((a, b) => b.total - a.total);

    return { dep, games, scores, totalsByDept, depMap, event: event.rows[0] || {} };
  }

  function renderEvent(ctx) {
    const ev = ctx.event;
    if (!ev || !ev.company) return;
    const strip = byId('eventStrip');
    if (strip) {
      const mapHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ev.location)}`;
      strip.innerHTML = `${ev.company}  ·  ${ev.date}  ·  <a href="${mapHref}" target="_blank" rel="noopener">${ev.location}</a>`;
    }
    const title = byId('heroTitle');
    if (title) title.textContent = ev.title;
    const sub = byId('heroSub');
    if (sub) sub.textContent = ev.subtitle;
    document.title = ev.title ? `${ev.title} - Beyond the Desk` : 'Beyond the Desk';
  }

  /* ---------------- rendering ---------------- */
  function renderYearToggle() {
    document.querySelectorAll('.year-toggle').forEach(wrap => {
      wrap.innerHTML = '';
      YEARS.forEach((y) => {
        const b = el('button', 'year-link' + (state.year === y ? ' active' : ''), YEAR_LABEL[y]);
        b.addEventListener('click', () => { state.year = y; state.game = null; state.entryOpen = false; state.factsOpen = null; render(); });
        wrap.appendChild(b);
      });
    });
  }

  const MEDALS = ['🥇', '🥈', '🥉'];

  function initials(name) {
    const words = name.replace(/&/g, ' ').trim().split(/\s+/).filter(Boolean);
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  // One color per department, so identity reads at a glance in every
  // list and bar chart - cycling by the numeric suffix on the
  // department id so it's stable regardless of row order. This exact
  // set + order is validated (dataviz skill's six checks: lightness,
  // chroma floor, CVD adjacent-pair separation, normal-vision floor,
  // contrast) - an earlier hand-picked set failed three of those
  // checks. Identity is never color-alone anyway (every bar/avatar
  // sits right next to the department's name), which is what makes
  // the sub-3:1 contrast on a couple of these slots acceptable.
  const DEPT_COLORS = [
    '#a8631f', '#2a78d6', '#b3306b', '#eb6834', '#1baf7a',
    '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948',
  ];
  function deptColor(id) {
    const n = parseInt(String(id).replace(/\D/g, ''), 10) || 0;
    return DEPT_COLORS[n % DEPT_COLORS.length];
  }
  function avatarHtml(dep) {
    return `<div class="avatar" style="--dept-color:${deptColor(dep.id)}">${initials(dep.name)}</div>`;
  }

  function boardRow(rank, dep, value, max) {
    const pct = max > 0 ? Math.round((value / max) * 100) : 0;
    const row = el('div', 'board-row' + (value === 0 ? ' zero' : ''));
    row.innerHTML = `
      <div class="board-rank">${rank}</div>
      <div class="board-main">
        ${avatarHtml(dep)}
        <div class="board-name-wrap">
          <div class="board-name">${dep.name}</div>
          <div class="board-track"><div class="board-fill" style="width:${pct}%"></div></div>
        </div>
      </div>
      <div class="board-score">${value === 0 ? '-' : value}</div>
    `;
    return row;
  }

  function podiumCol(rank, dep, value) {
    const col = el('div', `podium-col p${rank}`);
    col.innerHTML = `
      ${avatarHtml(dep)}
      <div class="podium-name">${dep.name}</div>
      <div class="podium-score">${value} pts</div>
      <div class="podium-block"><span class="podium-rankicon">${MEDALS[rank - 1]}</span></div>
    `;
    return col;
  }

  function renderPodium(ctx) {
    const wrap = byId('podium');
    wrap.innerHTML = '';
    const top3 = ctx.totalsByDept.slice(0, 3).filter(d => d.total > 0);
    if (top3.length === 0) {
      wrap.innerHTML = `<div class="podium-empty">No scores yet - check back once the games kick off.</div>`;
      return;
    }
    const order = top3.length >= 3 ? [1, 0, 2] : top3.length === 2 ? [1, 0] : [0];
    order.forEach(i => { if (top3[i]) wrap.appendChild(podiumCol(i + 1, top3[i], top3[i].total)); });

    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (window.confetti && !reduceMotion) {
      window.confetti({
        particleCount: 90, spread: 75, origin: { y: 0.4 }, scalar: 0.9,
        colors: ['#006640', '#6640a3', '#a34068', '#407ba3', '#a37440'],
        ticks: 500, gravity: 0.6, decay: 0.94,
      });
    }
  }

  function renderStatRow(ctx) {
    const wrap = byId('statRow');
    wrap.innerHTML = '';
    const champion = ctx.totalsByDept[0];
    const hasScores = champion && champion.total > 0;

    const cards = [
      { key: 'games', num: ctx.games.rows.length, lbl: 'Games',
        detail: ctx.games.rows.map(g => g.name).join(' · ') },
      { key: 'departments', num: ctx.dep.rows.length, lbl: 'Departments',
        detail: ctx.dep.rows.map(d => d.name).join(' · ') },
      { key: 'champion', num: hasScores ? champion.total : '-', lbl: 'Leader', sub: hasScores ? champion.name : 'TBD',
        detail: hasScores ? ctx.totalsByDept.slice(0, 3).map((d, i) => `${MEDALS[i]} ${d.name} (${d.total})`).join('  ') : 'Standings appear once scores are recorded.' },
    ];

    cards.forEach(c => {
      const chip = el('div', 'stat-chip');
      chip.innerHTML = `<div class="stat-lbl">${c.lbl}</div><div class="stat-num">${c.num}</div>${c.sub ? `<div class="stat-sub">${c.sub}</div>` : ''}`;
      chip.addEventListener('click', () => { state.factsOpen = state.factsOpen === c.key ? null : c.key; renderStatRow(ctx); });
      wrap.appendChild(chip);
    });

    const open = cards.find(c => c.key === state.factsOpen);
    if (open) wrap.appendChild(el('div', 'stat-detail show', open.detail));
  }

  function renderBoardStatus() {
    byId('boardStatus').textContent = state.year === '2026'
      ? 'Live · updates as scores are recorded'
      : 'Final · Sept 2025';
  }

  function renderBoard(ctx) {
    const wrap = byId('board');
    wrap.innerHTML = '';
    const hasScores = ctx.totalsByDept.some(d => d.total > 0);
    const rest = ctx.totalsByDept.slice(3);
    if (!hasScores || rest.length === 0) return;
    const max = Math.max(1, ...ctx.totalsByDept.map(d => d.total));
    rest.forEach((d, i) => wrap.appendChild(boardRow(i + 4, d, d.total, max)));
  }

  function renderGameSelector(ctx) {
    const sel = byId('gameSelect');
    sel.innerHTML = '';
    ctx.games.rows.forEach(g => {
      const o = el('option'); o.value = g.id; o.textContent = g.name;
      sel.appendChild(o);
    });
    if (!state.game || !ctx.games.rows.some(g => g.id === state.game)) {
      const preferred = ctx.games.rows.find(g => g.has_breakdown === '1') || ctx.games.rows[0];
      state.game = preferred ? preferred.id : null;
    }
    sel.value = state.game;
    sel.onchange = () => { state.game = sel.value; renderGameBoard(ctx); };
    renderGameBoard(ctx);
  }

  function renderGameBoard(ctx) {
    const game = ctx.games.rows.find(g => g.id === state.game);
    const wrap = byId('gameBoard');
    const note = byId('gameSectionNote');
    if (!game) { wrap.innerHTML = ''; note.textContent = ''; return; }

    if (game.has_breakdown !== '1') {
      note.textContent = `${game.name} - not digitized for ${state.year}`;
      wrap.innerHTML = `<div class="board-empty">Detailed scores for ${game.name} weren't recorded in ${state.year}. See the Leaderboard above for final totals.</div>`;
      return;
    }
    note.textContent = `${game.name} - per department`;
    const rows = ctx.scores.rows.filter(r => r.game_id === game.id);
    const items = ctx.dep.rows.map(d => ({
      dep: d,
      value: Number((rows.find(r => r.department_id === d.id) || {}).score) || 0,
    })).sort((a, b) => b.value - a.value);

    wrap.innerHTML = '';
    if (items.every(it => it.value === 0)) {
      wrap.innerHTML = `<div class="board-empty">No scores recorded yet for ${game.name}.</div>`;
      return;
    }
    const max = Math.max(1, ...items.map(i => i.value));
    items.forEach((it, i) => wrap.appendChild(boardRow(i + 1, it.dep, it.value, max)));
  }

  function renderProfileBtn() {
    const btn = byId('profileBtn');
    const s = session();
    if (s && s.token) {
      btn.textContent = s.name;
      btn.classList.add('signed-in');
      btn.title = `Signed in as ${s.name} - tap to sign out or switch`;
    } else {
      btn.textContent = 'Sign in';
      btn.classList.remove('signed-in');
      btn.title = 'Sign in to record scores';
    }
  }

  function initTabbar() {
    document.querySelectorAll('.tab-btn[data-scroll]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const targetId = btn.dataset.scroll;
        if (targetId === 'top') window.scrollTo({ top: 0, behavior: 'smooth' });
        else byId(targetId).scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  /* ---------------- main render ---------------- */
  async function render() {
    renderYearToggle();
    renderProfileBtn();
    const ctx = await loadYearData(state.year);
    renderEvent(ctx);
    renderStatRow(ctx);
    renderBoardStatus();
    renderPodium(ctx);
    renderBoard(ctx);
    renderGameSelector(ctx);
    // Native emoji glyphs render as flat, ugly ribbon icons on some
    // systems (Windows in particular) - Twemoji swaps them for the same
    // consistent SVG art every chat app uses, so medals look the same
    // everywhere instead of depending on the visitor's OS font.
    if (window.twemoji) window.twemoji.parse(document.body);
    return ctx;
  }

  document.addEventListener('DOMContentLoaded', async () => {
    // The Desk tab only shows once signed in - every page that has it
    // gets the same check, so it can't drift out of sync page to page.
    const tabDesk = byId('tabDesk');
    if (tabDesk) {
      const s = session();
      tabDesk.style.display = (s && s.token) ? '' : 'none';
    }
    // desk.html/gallery.html load this file too (for window.BTD below)
    // but don't have the dashboard markup - skip booting the dashboard
    // itself when it isn't there.
    if (!byId('statRow')) return;
    initTabbar();
    await render();
  });

  // Shared with desk.html (and any other standalone page) so the same
  // session/CSV/GitHub-commit logic isn't duplicated per page - nothing
  // here changes, this just hands out references to what already exists.
  window.BTD = { session, saveSession, clearSession, loadCsv, saveCsv, CSV, toast, YEARS };
})();
