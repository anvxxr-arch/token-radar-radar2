// Token Radar's dashboard. Reads window.RADAR (written beside dashboard/ by main.ts) and renders the
// ranked board, a filterable table, a per-protocol detail drawer with the model's breakdown and farm
// plan, a live-token view and a model sandbox. No network, no framework, no build step: every byte it
// shows is already in data.js.
(function () {
  'use strict';

  var D = window.RADAR;
  var root = document.getElementById('board');
  if (!D || !Array.isArray(D.rows)) {
    root.textContent = 'data.js did not load: window.RADAR is missing.';
    return;
  }

  var M = D.model;
  var ROWS = D.rows;
  var LIVE = Array.isArray(D.live) ? D.live : [];
  var HOUSE = { category: 1, growth: 1, maturity: 1 };

  // ---------------------------------------------------------------- the model, in the page
  // The same class table lib/model.ts applies: matched on substrings of the category, never on a name.
  var CLASSES = [
    [/perpetual|derivative|options/i, 0.4, 'perpetuals', ['perpetual', 'derivative', 'options']],
    [/dex|amm|exchange/i, 0.32, 'dex', ['dex', 'amm', 'exchange']],
    [/lending|cdp|collateral/i, 0.3, 'lending', ['lending', 'cdp', 'collateral']],
    [/prediction/i, 0.3, 'prediction', ['prediction']],
    [/rwa|real world/i, 0.26, 'rwa', ['rwa', 'real world']],
    [/yield|vault|curator|allocator/i, 0.24, 'yield', ['yield', 'vault', 'curator', 'allocator']],
    [/insurance/i, 0.18, 'insurance', ['insurance']]
  ];

  function classOf(category) {
    if (category === null || category === undefined) return null;
    for (var i = 0; i < CLASSES.length; i++) if (CLASSES[i][0].test(category)) return CLASSES[i];
    return null;
  }
  function classMultiple(category) {
    var c = classOf(category);
    return c === null ? M.base_multiple : c[1];
  }
  function classLabel(category) {
    var c = classOf(category);
    if (c === null) return 'no class match, so the base multiple';
    var lower = String(category).toLowerCase();
    for (var i = 0; i < c[3].length; i++) if (lower.indexOf(c[3][i]) >= 0) return 'matched "' + c[3][i] + '"';
    return c[2] + ' class';
  }
  function kindOf(category) {
    var c = classOf(category);
    return c === null ? 'other' : c[2];
  }
  function sizeMultiple(tvl) {
    var ratio = Math.log10(tvl / M.size_min_tvl) / Math.log10(M.size_scale);
    return M.size_floor + M.size_range * Math.min(1, Math.max(0, ratio));
  }
  function maturityOf(ageDays) {
    var age = ageDays === null || ageDays === undefined ? M.unknown_age_days : ageDays;
    return M.maturity_floor + (Math.min(Math.max(age, 0), M.maturity_days) / M.maturity_days) * M.maturity_range;
  }
  // The board stores its multipliers to four decimals. Growth is the one the page cannot rebuild from the
  // snapshot alone (it needs the category median over the whole pre-token set), so it is read from the
  // row; maturity and size are recomputed exactly from age and TVL.
  function growthOf(row) {
    if (typeof row.growth_multiplier === 'number') return row.growth_multiplier;
    var excess = typeof row.growth_excess_pct === 'number' ? row.growth_excess_pct : 0;
    return 1 + (Math.min(M.growth_cap, Math.max(M.growth_floor, excess)) / 100) * M.growth_weight;
  }
  function categoryOf(row) {
    return typeof row.category_multiple === 'number' ? row.category_multiple : classMultiple(row.category);
  }
  // A weight of 1 is the house model exactly. Other weights raise each multiplier to that power, so a
  // weight of 2 counts a multiplier twice over and 0.5 counts it half: the ranking responds, and nothing
  // outside the snapshot is invented.
  function impliedOf(row, w) {
    var cat = Math.pow(categoryOf(row), w.category);
    var growth = Math.pow(growthOf(row), w.growth);
    var maturity = Math.pow(maturityOf(row.age_days), w.maturity);
    return Math.max(1, Math.round(row.tvl_usd * cat * growth * maturity * sizeMultiple(row.tvl_usd)));
  }

  // ---------------------------------------------------------------- the load-time check
  // Recompute every row and hold it against the board's own figure. The board's multipliers carry four
  // decimals, so a row is verified against that rounding bound; anything wider is a real disagreement.
  var check = { rows: ROWS.length, bad: [], worstAbs: 0, worstRel: 0 };
  ROWS.forEach(function (row) {
    var mine = impliedOf(row, HOUSE);
    var diff = Math.abs(mine - row.implied_value_usd);
    var rel = row.implied_value_usd > 0 ? diff / row.implied_value_usd : diff;
    // The board stores its three multipliers to four decimals, so a recomputation can sit up to about
    // 2e-4 relative away from the stored integer; anything wider is a real disagreement.
    var tolerance = Math.max(1, row.implied_value_usd * 2e-4);
    if (rel > check.worstRel) { check.worstRel = rel; check.worstAbs = diff; }
    if (diff > tolerance) check.bad.push({ slug: row.slug, mine: mine, board: row.implied_value_usd });
  });

  // ---------------------------------------------------------------- formatting
  function money(n) {
    if (typeof n !== 'number' || !isFinite(n)) return '—';
    var a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function moneyFull(n) {
    if (typeof n !== 'number' || !isFinite(n)) return '—';
    return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }
  function pct(n) {
    if (typeof n !== 'number' || !isFinite(n)) return '—';
    return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toFixed(2) + '%';
  }
  function age(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.round(days) + 'd';
  }
  function num(n) {
    return Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
  }
  function mult(n) {
    return n.toFixed(3) + '×';
  }

  function h(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'text') node.textContent = v;
        else if (k === 'class') node.className = v;
        else if (k === 'style') node.setAttribute('style', v);
        else node.setAttribute(k, v === true ? '' : v);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var kid = arguments[i];
      if (kid === null || kid === undefined || kid === false) continue;
      if (Array.isArray(kid)) kid.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof kid === 'string') node.appendChild(document.createTextNode(kid));
      else node.appendChild(kid);
    }
    return node;
  }

  // ---------------------------------------------------------------- header
  document.getElementById('subtitle').textContent =
    D.model_version + ' — the board ranks pre-token protocols by implied value: TVL held against their ' +
    'own category, their seven-day growth and how long they have run with no token.';
  document.getElementById('stat-asof').textContent = D.as_of;
  document.getElementById('stat-source').textContent = String(D.source).split(' ')[0];
  document.getElementById('stat-cohort').textContent =
    D.watchlist_size + ' on the watchlist / ' + D.board_size + ' ranked';

  // ---------------------------------------------------------------- KPI strip
  var totalImplied = ROWS.reduce(function (a, r) { return a + r.implied_value_usd; }, 0);
  var top = ROWS[0];
  var tvls = ROWS.map(function (r) { return r.tvl_usd; }).sort(function (a, b) { return a - b; });
  var mid = tvls.length % 2 ? tvls[(tvls.length - 1) / 2] : (tvls[tvls.length / 2 - 1] + tvls[tvls.length / 2]) / 2;

  [
    ['Total implied value', money(totalImplied), 'sum across ' + ROWS.length + ' ranked rows'],
    ['Top row', money(top.implied_value_usd), top.name],
    ['Median TVL', money(mid), 'middle of the ' + ROWS.length + ' rows'],
    ['Early finds', num(D.early_size), 'rows below the ' + money(D.floor_usd) + ' watchlist floor']
  ].forEach(function (k) {
    document.getElementById('kpis').appendChild(
      h('div', { class: 'kpi' },
        h('span', { class: 'field-label', text: k[0] }),
        h('span', { class: 'kpi-num', text: k[1] }),
        h('span', { class: 'kpi-sub', text: k[2] })
      )
    );
  });

  // ---------------------------------------------------------------- state
  var state = { q: '', category: 'all', chain: 'all', sort: 'implied', dir: -1, watch: false };
  // The view's two non-filter parts: which tab is up, and which protocol's drawer is open.
  var currentTab = 0;
  var currentSlug = null;

  // The address bar carries the view, so a screenshot's URL reproduces it. Read once, write back on
  // every change; an unknown value falls back to the default rather than breaking the page.
  var params = new URLSearchParams(window.location.search);
  function param(name) { return params.get(name); }
  function oneOf(value, allowed, fallback) { return value !== null && allowed.indexOf(value) >= 0 ? value : fallback; }

  state.q = (param('q') || '').trim().toLowerCase();

  // ---------------------------------------------------------------- chips
  var counts = {};
  ROWS.forEach(function (r) {
    var c = r.category === null ? 'Uncategorised' : r.category;
    counts[c] = (counts[c] || 0) + 1;
  });
  var cats = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a] || (a < b ? -1 : 1); });
  state.category = oneOf(param('category'), ['all'].concat(cats), 'all');
  var chipHost = document.getElementById('chips');

  function chip(label, value, count) {
    var b = h('button', { type: 'button', class: 'chip', 'aria-pressed': value === state.category ? 'true' : 'false' }, label);
    b.appendChild(h('span', { class: 'n', text: String(count) }));
    b.addEventListener('click', function () {
      state.category = value;
      Array.prototype.forEach.call(chipHost.children, function (c) {
        c.setAttribute('aria-pressed', c === b ? 'true' : 'false');
      });
      render();
      syncUrl();
    });
    return b;
  }
  chipHost.appendChild(chip('All', 'all', ROWS.length));
  cats.forEach(function (c) { chipHost.appendChild(chip(c, c, counts[c])); });

  // ---------------------------------------------------------------- chain select
  var chainCounts = {};
  ROWS.forEach(function (r) { (r.chains || []).forEach(function (c) { chainCounts[c] = (chainCounts[c] || 0) + 1; }); });
  var chainSel = document.getElementById('chain');
  chainSel.appendChild(h('option', { value: 'all', text: 'All chains (' + ROWS.length + ')' }));
  Object.keys(chainCounts).sort().forEach(function (c) {
    chainSel.appendChild(h('option', { value: c, text: c + ' (' + chainCounts[c] + ')' }));
  });
  state.chain = oneOf(param('chain'), ['all'].concat(Object.keys(chainCounts).sort()), 'all');
  chainSel.value = state.chain;
  chainSel.addEventListener('change', function () { state.chain = chainSel.value; render(); syncUrl(); });

  // ---------------------------------------------------------------- controls
  var qEl = document.getElementById('q');
  qEl.value = state.q;
  qEl.addEventListener('input', function () { state.q = qEl.value.trim().toLowerCase(); render(); syncUrl(); });

  var sortSel = document.getElementById('sort');
  state.sort = oneOf(param('sort'), ['implied', 'tvl', 'change', 'age', 'name', 'rank', 'category'], 'implied');
  state.dir = param('dir') === '1' ? 1 : param('dir') === '-1' ? -1 : (state.sort === 'name' ? 1 : -1);
  sortSel.value = state.sort;
  sortSel.addEventListener('change', function () {
    state.sort = sortSel.value;
    state.dir = state.sort === 'name' ? 1 : -1;
    paintDir();
    render();
    syncUrl();
  });

  var dirBtn = document.getElementById('dir');
  function paintDir() {
    document.getElementById('dir-glyph').textContent = state.dir === 1 ? '↑' : '↓';
    dirBtn.setAttribute('aria-label', 'Sort direction: ' + (state.dir === 1 ? 'ascending' : 'descending'));
  }
  dirBtn.addEventListener('click', function () { state.dir = -state.dir; paintDir(); render(); syncUrl(); });
  paintDir();

  var watchEl = document.getElementById('watch');
  state.watch = param('watch') === '1';
  watchEl.checked = state.watch;
  watchEl.addEventListener('change', function () { state.watch = watchEl.checked; render(); syncUrl(); });

  // Write the view back into the address bar on every change: same document, no navigation, no reload.
  // A file: URL may refuse a state URL in some browsers, so the write is best-effort and never fatal.
  function syncUrl() {
    var qs = new URLSearchParams();
    qs.set('q', state.q);
    qs.set('category', state.category);
    qs.set('chain', state.chain);
    qs.set('sort', state.sort);
    qs.set('dir', state.dir === 1 ? '1' : '-1');
    qs.set('watch', state.watch ? '1' : '0');
    qs.set('tab', currentTab === 1 ? 'live' : 'board');
    if (currentSlug) qs.set('slug', currentSlug);
    try { history.replaceState(null, '', window.location.pathname + '?' + qs.toString()); } catch (e) { /* no state URL here */ }
  }

  // ---------------------------------------------------------------- the table
  // The toolbar is sticky at the top of the viewport, so the sticky header row has to sit exactly under
  // it. Its height changes when the controls wrap, so measure it instead of trusting a fixed number.
  function syncSticky() {
    var tb = document.querySelector('.toolbar');
    if (!tb) return;
    var sticky = getComputedStyle(tb).position !== 'static';
    var h = sticky ? Math.ceil(tb.getBoundingClientRect().height) : 0;
    document.documentElement.style.setProperty('--bar-h', h + 'px');
  }
  syncSticky();
  window.addEventListener('resize', syncSticky);
  var body = document.getElementById('board-body');
  var tableEl = document.getElementById('board-table');
  var emptyEl = document.getElementById('empty');
  var noteEl = document.getElementById('table-note');
  var maxImplied = ROWS.reduce(function (a, r) { return Math.max(a, r.implied_value_usd); }, 1);

  function matches(row) {
    // Search comes first and narrows whatever else is on: inside an active chip it filters that chip,
    // and clearing it leaves the chip standing.
    if (state.q) {
      var hay = (row.name + ' ' + row.slug + ' ' + (row.category || '') + ' ' + (row.chains || []).join(' ')).toLowerCase();
      if (hay.indexOf(state.q) < 0) return false;
    }
    if (state.category !== 'all') {
      var c = row.category === null ? 'Uncategorised' : row.category;
      if (c !== state.category) return false;
    }
    if (state.chain !== 'all' && (row.chains || []).indexOf(state.chain) < 0) return false;
    // The watchlist is the floor: every watchlist slug sits at or above it, the early finds below.
    if (state.watch && row.tvl_usd < D.floor_usd) return false;
    return true;
  }

  function valueOf(row, key) {
    if (key === 'tvl') return row.tvl_usd;
    if (key === 'change') return row.change_7d === null ? -Infinity : row.change_7d;
    if (key === 'age') return row.age_days === null ? -Infinity : row.age_days;
    if (key === 'name') return row.name.toLowerCase();
    if (key === 'category') return (row.category || 'Uncategorised').toLowerCase();
    if (key === 'rank') return row.rank;
    return row.implied_value_usd;
  }

  function rowNode(row) {
    var tr = h('tr', { tabindex: '0', 'data-slug': row.slug, 'aria-selected': 'false' });
    tr.appendChild(h('td', { class: 'c-rank', text: String(row.rank) }));

    var chains = row.chains || [];
    var dots = h('span', { class: 'dots', 'aria-hidden': 'true' });
    chains.slice(0, 3).forEach(function (c, i) {
      dots.appendChild(h('span', { class: 'dot c' + (i + 1), title: c }));
    });
    if (chains.length > 3) dots.appendChild(h('span', { class: 'dot more' }));

    tr.appendChild(
      h('td', { class: 'c-name' },
        h('span', { class: 'proto' },
          h('b', { text: row.name }),
          h('span', { class: 'meta' },
            h('span', { class: 'slug', text: row.slug }),
            dots,
            h('span', { text: chains.length > 1 ? chains.length + ' chains' : (chains[0] || 'no chain') })
          )
        )
      )
    );
    tr.appendChild(h('td', { class: 'c-cat', 'data-label': 'Category', text: row.category || 'Uncategorised' }));
    tr.appendChild(h('td', { class: 'c-num', 'data-label': 'TVL', text: money(row.tvl_usd) }));

    var chg = row.change_7d;
    tr.appendChild(
      h('td', {
        class: 'c-num ' + (chg === null || chg === 0 ? 'flat' : chg > 0 ? 'pos' : 'neg'),
        'data-label': '7d',
        text: chg === null ? '—' : pct(chg)
      })
    );

    var width = Math.max(1, Math.round((row.implied_value_usd / maxImplied) * 100));
    tr.appendChild(
      h('td', { class: 'c-num c-implied', 'data-label': 'Implied' },
        h('span', { class: 'v', text: money(row.implied_value_usd) }),
        h('span', { class: 'bar', 'aria-hidden': 'true' }, h('i', { style: 'width:' + width + '%' }))
      )
    );
    tr.appendChild(h('td', { class: 'c-num', 'data-label': 'Age', text: age(row.age_days) }));

    tr.addEventListener('click', function () { open(row); });
    tr.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(row); }
    });
    return tr;
  }

  function paintSort() {
    Array.prototype.forEach.call(tableEl.querySelectorAll('thead th'), function (th) {
      var on = th.getAttribute('data-sort') === state.sort;
      th.setAttribute('aria-sort', on ? (state.dir === 1 ? 'ascending' : 'descending') : 'none');
    });
  }

  function render() {
    var list = ROWS.filter(matches);
    var key = state.sort;
    list = list.slice().sort(function (a, b) {
      var va = valueOf(a, key), vb = valueOf(b, key);
      if (va < vb) return -state.dir;
      if (va > vb) return state.dir;
      return a.rank - b.rank;
    });

    var frag = document.createDocumentFragment();
    list.forEach(function (r) { frag.appendChild(rowNode(r)); });
    body.textContent = '';
    body.appendChild(frag);

    var none = list.length === 0;
    tableEl.hidden = none;
    emptyEl.hidden = !none;
    emptyEl.textContent = none ? 'No protocol matches these filters — clear the search or pick another category.' : '';

    var label = { implied: 'implied value', tvl: 'TVL', change: '7-day change', age: 'age', name: 'name', category: 'category', rank: 'rank' }[key];
    noteEl.textContent = none ? '' : list.length + ' of ' + ROWS.length + ' rows · by ' + label +
      ', ' + (state.dir === 1 ? 'lowest first' : 'highest first') + (state.watch ? ' · watchlist only' : '');
    paintSort();
  }

  // The header cells sort: a click on a column sets it, a second click turns the direction around.
  Array.prototype.forEach.call(tableEl.querySelectorAll('thead th[data-sort]'), function (th) {
    var key = th.getAttribute('data-sort');
    var btn = th.querySelector('button') || th;
    btn.addEventListener('click', function () {
      if (state.sort === key) state.dir = -state.dir;
      else { state.sort = key; state.dir = key === 'name' ? 1 : -1; }
      if (['implied', 'tvl', 'change', 'age', 'name'].indexOf(key) >= 0) sortSel.value = key;
      paintDir();
      render();
      syncUrl();
    });
  });

  // ---------------------------------------------------------------- drawer
  var drawer = document.getElementById('drawer');
  var lastFocus = null;

  function bar(label, value, ref, detail, tick) {
    var track = h('span', { class: 'mult-track' },
      h('i', { style: 'width:' + Math.max(2, Math.min(100, (value / ref) * 100)) + '%' }));
    if (typeof tick === 'number') track.appendChild(h('u', { style: 'left:' + Math.min(100, (tick / ref) * 100) + '%' }));
    return h('div', { class: 'mult' },
      h('span', { class: 'mult-top' }, h('span', { class: 'lbl', text: label }), h('span', { class: 'num', text: mult(value) })),
      h('span', { class: 'mult-detail', text: detail }),
      track
    );
  }

  // The farm plan, derived exactly as lib/model.ts derives it: the category picks the action, the TVL the
  // capital, the first chain the route, the age the hold. Six steps, no hand-written list.
  function farmPlan(row) {
    if (Array.isArray(row.farm_steps) && row.farm_steps.length) return row.farm_steps;
    var name = row.name;
    var chain = (row.chains && row.chains[0]) || 'its main chain';
    var tvl = row.tvl_usd;
    var capital = tvl >= 1e9 ? 2000 : tvl >= 1e8 ? 500 : tvl >= 1e7 ? 150 : 50;
    var base = capital >= 1000 ? 6 : capital >= 500 ? 4 : 3;
    var gas = /ethereum|bnb|avalanche/i.test(chain) ? base * 2 : base;
    var hold = row.age_days === null || row.age_days === undefined ? 45 : row.age_days < 180 ? 60 : row.age_days < 365 ? 45 : 30;
    var move = /^ethereum$/i.test(chain)
      ? 'Fund the wallet with $' + capital + ' of USDC on Ethereum'
      : 'Bridge $' + capital + ' of USDC to ' + chain;
    var position;
    switch (kindOf(row.category)) {
      case 'perpetuals': position = move + ' and open one small hedge with it on ' + name; break;
      case 'dex': position = move + " and provide it as liquidity in " + name + "'s main pool"; break;
      case 'lending': position = move + ' and supply it to ' + name + ' as a deposit'; break;
      case 'prediction': position = move + ' and place one market position on ' + name + ' with it'; break;
      case 'rwa': position = move + " and mint " + name + "'s yield asset with it"; break;
      case 'yield': position = move + ' and deposit it into a ' + name + ' vault'; break;
      case 'insurance': position = move + ' and buy cover from ' + name + ' with it'; break;
      default: position = move + ' and deposit it into ' + name;
    }
    return [
      'Open a fresh wallet dedicated to ' + name + ' that holds only the $' + capital + ' you plan to farm, keep its recovery phrase offline, and fund it with $' + gas + ' of gas; about 10 minutes.',
      position + '; budget about $' + gas + ' of gas; about 25 minutes to set up.',
      'Repeat one qualifying action on ' + name + ' every week for ' + hold + ' days, a swap or a deposit or a vote, and set aside about $2 of gas each week; about 15 minutes a week.',
      'Hold the $' + capital + ' position open on ' + chain + ' for at least ' + hold + ' days so ' + name + ' counts the activity in more than one snapshot; the $' + capital + ' stays at work and no new dollars are needed.',
      "Before withdrawing, open " + name + "'s own rewards page and claim only from the link it publishes, allowing about $2 of gas and never paying a fee to claim; about 15 minutes.",
      'Write the wallet address, every ' + name + ' transaction, its date and the $' + capital + ' committed into a farm log so the position can be repeated or unwound; about 10 minutes.'
    ];
  }

  function parseStep(text) {
    var costs = [];
    var re = /\$\s?([\d,]+(?:\.\d+)?)/g;
    var m;
    while ((m = re.exec(text)) !== null) {
      var v = '$' + m[1];
      if (costs.indexOf(v) < 0) costs.push(v);
    }
    var t = /about ([0-9][^.;]*)/.exec(text);
    return {
      cost: costs.length ? 'Cost ' + costs.join(' + ') : 'Cost not stated',
      time: t ? 'Time about ' + t[1].trim() : 'Time not stated'
    };
  }

  function open(row) {
    lastFocus = document.activeElement;
    Array.prototype.forEach.call(body.children, function (tr) {
      tr.setAttribute('aria-selected', tr.getAttribute('data-slug') === row.slug ? 'true' : 'false');
    });

    document.getElementById('d-title').textContent = row.name;
    document.getElementById('d-sub').textContent =
      (row.category || 'Uncategorised') + ' · ' + ((row.chains || []).join(', ') || 'no chain');
    document.getElementById('d-value').textContent = moneyFull(row.implied_value_usd);
    document.getElementById('d-value-sub').textContent =
      'rank ' + row.rank + ' of ' + ROWS.length + ' · TVL ' + money(row.tvl_usd) +
      ' · 7d ' + (row.change_7d === null ? '—' : pct(row.change_7d)) +
      ' · ' + age(row.age_days) + ' with no token';

    var host = document.getElementById('d-body');
    host.textContent = '';

    var catM = categoryOf(row);
    var growthM = growthOf(row);
    var matM = maturityOf(row.age_days);

    var excess = typeof row.growth_excess_pct === 'number'
      ? row.growth_excess_pct
      : ((growthM - 1) * 100) / M.growth_weight;
    var clamped = excess >= M.growth_cap || excess <= M.growth_floor;
    var medianPct = typeof row.category_median_pct === 'number'
      ? row.category_median_pct
      : (row.change_7d === null ? 0 : row.change_7d - excess);

    var growthDetail = row.change_7d === null
      ? 'no seven-day figure, so no excess'
      : pct(row.change_7d) + ' against a ' + pct(medianPct) + ' category median · excess ' +
        (excess > 0 ? '+' : excess < 0 ? '−' : '') + Math.abs(excess).toFixed(2) + 'pp' +
        (clamped ? ', held at the clamp' : '') + ' × ' + M.growth_weight;

    host.appendChild(
      h('div', { class: 'd-section' },
        h('h3', { text: 'Model breakdown' }),
        bar('Category', catM, 0.4, (row.category || 'Uncategorised') + ' → ' + classLabel(row.category), null),
        bar('Growth', growthM, 1.54, growthDetail, 1),
        bar('Maturity', matM, 1,
          (row.age_days === null ? M.unknown_age_days + ' days assumed' : row.age_days + ' days') +
          ', capped at ' + M.maturity_days, 1),
        bar('Size', sizeMultiple(row.tvl_usd), 1,
          'TVL ' + money(row.tvl_usd) + ' · penalty from ' + money(M.size_min_tvl), 1)
      )
    );

    var steps = farmPlan(row);
    var list = h('ol', { class: 'steps' });
    steps.forEach(function (s) {
      var p = parseStep(s);
      list.appendChild(
        h('li', {},
          h('span', { class: 'txt', text: s }),
          h('span', { class: 'cost', text: p.cost }),
          h('span', { class: 'time', text: p.time })
        )
      );
    });
    if (steps.length === 0) list.appendChild(h('li', {}, h('span', { class: 'txt', text: 'No farm plan recorded.' })));
    host.appendChild(h('div', { class: 'd-section' }, h('h3', { text: 'Farm plan' }), list));

    drawer.hidden = false;
    currentSlug = row.slug;
    syncUrl();
    document.getElementById('d-close').focus();
  }

  function close() {
    if (drawer.hidden) return;
    drawer.hidden = true;
    currentSlug = null;
    Array.prototype.forEach.call(body.children, function (tr) { tr.setAttribute('aria-selected', 'false'); });
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    syncUrl();
  }

  document.getElementById('d-close').addEventListener('click', close);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

  // ---------------------------------------------------------------- sandbox
  var weights = { category: 1, growth: 1, maturity: 1 };
  var slidersHost = document.getElementById('sliders');
  var listHost = document.getElementById('sandbox-list');

  [
    ['category', 'Category weight', 'the class multiple, 0.18 to 0.40 by class'],
    ['growth', 'Growth weight', 'the excess over the category median'],
    ['maturity', 'Maturity weight', 'how long it has run with no token']
  ].forEach(function (s) {
    var key = s[0];
    var out = h('span', { class: 'slider-val', text: '1.00×' });
    var input = h('input', {
      type: 'range', min: '0.5', max: '2', step: '0.05', value: '1',
      id: 'w-' + key, 'aria-label': s[1]
    });
    input.addEventListener('input', function () {
      weights[key] = Number(input.value);
      out.textContent = weights[key].toFixed(2) + '×';
      sandbox();
    });
    slidersHost.appendChild(
      h('div', { class: 'slider' },
        h('span', { class: 'slider-top' }, h('label', { class: 'field-label', for: 'w-' + key, text: s[1] }), out),
        input,
        h('span', { class: 'mult-detail', text: s[2] })
      )
    );
  });

  function sandbox() {
    var houseRank = {};
    ROWS.forEach(function (r) { houseRank[r.slug] = r.rank; });

    var scored = ROWS.map(function (r) { return { row: r, v: impliedOf(r, weights) }; });
    scored.sort(function (a, b) { return b.v - a.v || (a.row.slug < b.row.slug ? -1 : 1); });

    listHost.textContent = '';
    scored.slice(0, 5).forEach(function (s, i) {
      var was = houseRank[s.row.slug];
      var now = i + 1;
      var delta = was - now;
      var mv = delta === 0 ? 'held at #' + was : delta > 0 ? '↑ ' + delta + ' to #' + now : '↓ ' + Math.abs(delta) + ' to #' + now;
      listHost.appendChild(
        h('li', {},
          h('span', { class: 'i', text: String(now) }),
          h('span', { class: 'nm', text: s.row.name }),
          h('span', { class: 'val', text: money(s.v) }),
          h('span', { class: 'mv ' + (delta > 0 ? 'up' : delta < 0 ? 'down' : ''), text: mv })
        )
      );
    });
  }

  document.getElementById('reset').addEventListener('click', function () {
    weights = { category: 1, growth: 1, maturity: 1 };
    Array.prototype.forEach.call(slidersHost.querySelectorAll('input[type="range"]'), function (el) { el.value = '1'; });
    Array.prototype.forEach.call(slidersHost.querySelectorAll('.slider-val'), function (el) { el.textContent = '1.00×'; });
    sandbox();
  });

  // ---------------------------------------------------------------- live tokens
  document.getElementById('live-note').textContent = LIVE.length +
    ' protocols that already trade. They are kept off the ranked board: the market prices them, so a ' +
    'board row would show the market\'s value instead of the model\'s.';

  var liveBody = document.getElementById('live-body');
  LIVE.forEach(function (p) {
    var ratio = p.mcap_usd && p.tvl_usd ? p.mcap_usd / p.tvl_usd : null;
    liveBody.appendChild(
      h('tr', {},
        h('td', { class: 'c-name' },
          h('span', { class: 'proto' },
            h('b', { text: p.name }),
            h('span', { class: 'meta' },
              h('span', { class: 'slug', text: p.slug }),
              h('span', { text: (p.chains || []).join(', ') || 'no chain' })
            )
          )
        ),
        h('td', { class: 'c-cat', 'data-label': 'Category', text: p.category || 'Uncategorised' }),
        h('td', { class: 'c-num', 'data-label': 'TVL', text: money(p.tvl_usd) }),
        h('td', { class: 'c-num', 'data-label': 'Market cap', text: money(p.mcap_usd) }),
        h('td', { class: 'c-num', 'data-label': 'MC / TVL', text: ratio === null ? '—' : ratio.toFixed(2) + '×' }),
        h('td', {
          class: 'c-num ' + (p.change_7d === null || p.change_7d === 0 ? 'flat' : p.change_7d > 0 ? 'pos' : 'neg'),
          'data-label': '7d',
          text: p.change_7d === null ? '—' : pct(p.change_7d)
        })
      )
    );
  });

  // ---------------------------------------------------------------- tabs
  var tabs = [document.getElementById('tab-board'), document.getElementById('tab-live')];
  var panels = [document.getElementById('panel-board'), document.getElementById('panel-live')];
  function selectTab(i) {
    currentTab = i;
    tabs.forEach(function (t, j) {
      t.setAttribute('aria-selected', i === j ? 'true' : 'false');
      t.tabIndex = i === j ? 0 : -1;
      panels[j].hidden = i !== j;
    });
    if (i === 1) close();
    syncUrl();
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { selectTab(i); });
    t.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        var next = i === 0 ? 1 : 0;
        selectTab(next);
        tabs[next].focus();
      }
    });
  });

  // ---------------------------------------------------------------- footer
  document.getElementById('formula').textContent =
    'implied = round( TVL × class × (1 + clamp(excess, ' + M.growth_floor + ', ' + M.growth_cap + ') / 100 × ' +
    M.growth_weight + ') × (' + M.maturity_floor + ' + ' + M.maturity_range + ' × min(age, ' + M.maturity_days +
    ') / ' + M.maturity_days + ') × (' + M.size_floor + ' + ' + M.size_range + ' × clamp(log10(TVL / ' +
    money(M.size_min_tvl) + ') / log10(' + M.size_scale + '), 0, 1)) )';
  document.getElementById('colophon').textContent =
    D.model_version + ' · snapshot ' + D.as_of + ' · ' + D.source + ' · ' + D.board_size + ' ranked, ' +
    D.early_size + ' early finds, ' + D.live_size + ' live set aside';

  var checkEl = document.getElementById('mismatch');
  checkEl.hidden = false;
  if (check.bad.length) {
    checkEl.textContent = 'Arithmetic check: ' + check.bad.length + ' of ' + check.rows +
      ' rows do not reproduce from their own figures (first: ' + check.bad[0].slug + ' — page ' +
      moneyFull(check.bad[0].mine) + ', board ' + moneyFull(check.bad[0].board) + ').';
  } else {
    checkEl.className = 'colophon';
    checkEl.textContent = 'Arithmetic check: all ' + check.rows + ' rows reproduce from TVL and the breakdown — ' +
      'largest gap ' + moneyFull(check.worstAbs) + ' (' + (check.worstRel * 100).toFixed(4) +
      '%), the board storing its multipliers to four decimals.';
  }

  // ---------------------------------------------------------------- go
  render();
  sandbox();
  selectTab(param('tab') === 'live' ? 1 : 0);
  // A slug in the URL opens that protocol's drawer on load; a slug the board does not carry is ignored.
  var wanted = param('slug');
  if (wanted) {
    for (var wi = 0; wi < ROWS.length; wi++) {
      if (ROWS[wi].slug === wanted) { open(ROWS[wi]); break; }
    }
  }
  syncUrl();
  root.removeAttribute('aria-busy');
})();
