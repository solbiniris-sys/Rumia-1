// app.js — 루미아 TRPG 클라이언트. 판정/상태는 전부 서버가 정하고, 여기서는 그리기만 한다.
const $ = (s) => document.querySelector(s), esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ic = (n, c = '') => `<svg class="ic ${c}"><use href="#i-${n}"/></svg>`;
const LS = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
let META = null, S = null, ws = null, sess = LS.get('lumia.sess', null), tab = 'story', sideTab = 'sheet', prefs = Object.assign({ theme: 'night', fs: 17, sans: false }, LS.get('lumia.prefs', {}));
let ui = { kind: 'say', luck: false, drawn: 0, chatSeen: 0, first: true, pickedHere: null, draft: '', lobby: { scn: null, role: null } };
const wide = () => matchMedia('(min-width:880px)').matches;
const DEG = { crit: ['대성공', 'crit'], ok: ['성공', 'ok'], fail: ['실패', 'fail'], fumble: ['대실패', 'fumble'] };
const statName = (k) => (META.stats.find((s) => s.k === k) || {}).n || k;
const roleOf = (k) => S.scn.roles[k] || { name: k, color: '#999' };
const col = (k) => roleOf(k).color;

function applyPrefs() { const b = document.body; b.dataset.theme = prefs.theme === 'paper' ? 'paper' : ''; b.dataset.sans = prefs.sans ? 'on' : 'off'; document.documentElement.style.setProperty('--fs', prefs.fs + 'px');
  document.querySelector('meta[name=theme-color]').content = prefs.theme === 'paper' ? '#e9e0cc' : '#13151b'; LS.set('lumia.prefs', prefs); }
function toast(t) { const e = $('#toast'); e.textContent = t; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (e.hidden = true), 1800); }

// ── 통신
function connect(first) {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.onopen = () => { if (first) first(); else if (sess) send({ type: 'enter', code: sess.code, token: sess.token, role: sess.role }); };
  ws.onmessage = (e) => { const m = JSON.parse(e.data);
    if (m.type === 'joined') { sess = { code: m.code, token: m.token, role: m.role, scn: m.scn }; LS.set('lumia.sess', sess); }
    else if (m.type === 'snap') LS.set('lumia.snap', m.snap);
    else if (m.type === 'err' && m.code === 'noroom' && !S && sess && (LS.get('lumia.snap', {}) || {}).code === sess.code) { toast('서버에서 방이 사라져 기기에 저장된 기록으로 복구해요…'); send({ type: 'restore', snap: LS.get('lumia.snap'), role: sess.role }); }
    else if (m.type === 'err') { const el = $('#err'); if (el) el.textContent = m.text; else toast(m.text); if (!S) { sess = null; LS.set('lumia.sess', null); } }
    else if (m.type === 'state') onState(m.s); };
  ws.onclose = () => { if (S || sess) { $('#hd') && toast('연결이 끊겼어요. 다시 연결하는 중…'); setTimeout(() => connect(), 1500); } };
}
const send = (o) => ws && ws.readyState === 1 && ws.send(JSON.stringify(o));

// ── 로비
async function boot() { applyPrefs(); try { META = await (await fetch('/api/meta')).json(); } catch (e) { document.body.innerHTML = '<p style="padding:30px">서버에 연결할 수 없어요.</p>'; return; }
  const q = new URLSearchParams(location.search).get('r'); if (sess && !q) { $('#lobby').hidden = true; connect(); return; } lobby(q || ''); }
function lobby(prefill) {
  const L = $('#lobby'); L.hidden = false; $('#app').hidden = true; ui.lobby.scn = ui.lobby.scn || META.scenarios[0].id; const sc = META.scenarios.find((s) => s.id === ui.lobby.scn);
  ui.lobby.role = ui.lobby.role && sc.roles[ui.lobby.role] ? ui.lobby.role : Object.keys(sc.roles)[0];
  L.innerHTML = `<div class="lb"><h1>루미아</h1><p class="sub">함께 쓰는 역극 TRPG · 혼자서도, 둘이서도</p><div class="orn">${ic('d20')}</div>
  <div><div class="h4">시나리오</div>${META.scenarios.map((s) => `<button class="scn ${s.id === ui.lobby.scn ? 'on' : ''}" data-scn="${s.id}"><b>${esc(s.title)}</b><span>${esc(s.blurb)}</span></button>`).join('<div style="height:8px"></div>')}</div>
  <div><div class="h4">내 역할</div><div class="seg">${Object.entries(sc.roles).map(([k, r]) => `<button class="rolebtn ${k === ui.lobby.role ? 'on' : ''}" style="--c:${r.color}" data-role="${k}"><b>${esc(r.name)}</b><small>${esc(r.sub)}</small></button>`).join('')}</div></div>
  <button class="btn-p" id="mk">새 방 만들기</button><p class="sm mu" style="margin:-8px 0 0;text-align:center">혼자 시작해도 괜찮아요. 상대 역할은 동행자가 자동으로 맡고, 친구가 방 코드로 들어오면 그 자리를 이어받아요.</p>
  <div class="card"><div class="h4">방 코드로 입장</div><div class="seg"><input id="code" maxlength="6" placeholder="방 코드" value="${esc(prefill)}" autocomplete="off" autocapitalize="characters"><button id="jn" style="flex:none;min-width:96px">입장</button></div></div>
  ${sess ? '<button id="rs">이어하기 (' + esc(sess.code) + ')</button>' : ''}<p class="err" id="err"></p></div>`;
  L.querySelectorAll('[data-scn]').forEach((b) => (b.onclick = () => { ui.lobby.scn = b.dataset.scn; lobby($('#code').value); }));
  L.querySelectorAll('[data-role]').forEach((b) => (b.onclick = () => { ui.lobby.role = b.dataset.role; lobby($('#code').value); }));
  const go = (o) => { const f = () => send(Object.assign({ type: 'enter', role: ui.lobby.role, scn: ui.lobby.scn }, o)); if (ws && ws.readyState === 1) f(); else connect(f); };
  $('#mk').onclick = () => go({}); $('#jn').onclick = () => { const c = $('#code').value.trim().toUpperCase(); if (!c) return ($('#err').textContent = '방 코드를 입력하세요.'); go({ code: c }); };
  const rs = $('#rs'); if (rs) rs.onclick = () => { if (ws && ws.readyState === 1) send({ type: 'enter', code: sess.code, token: sess.token, role: sess.role }); else connect(); };
}

// ── 상태 수신
function onState(s) { const prevScene = S && S.scene.id, restarted = S && s.log.length && S.log.length && s.log[0].id < S.log[0].id; S = s;
  if (restarted) { ui.drawn = 0; ui.first = true; $('#feed').innerHTML = ''; }
  if ($('#app').hidden) { $('#lobby').hidden = true; $('#app').hidden = false; buildApp(); }
  if (prevScene !== s.scene.id) ui.luck = false; renderAll(); }
function buildApp() { $('#comp').innerHTML = `<div class="col"><div class="kinds">${[['say', '대사'], ['act', '행동'], ['narr', '서술']].map(([k, n]) => `<button data-kind="${k}">${n}</button>`).join('')}</div><textarea id="ta" rows="1" placeholder="역극을 이어 써 보세요… (Enter 줄바꿈 · ⌘/Ctrl+Enter 전송)"></textarea></div><button class="ib" id="dbtn" aria-label="주사위">${ic('d20')}</button><button class="ib btn-p" id="sbtn" aria-label="보내기">${ic('send')}</button>`;
  const ta = $('#ta'); ta.oninput = () => { ui.draft = ta.value; ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 132) + 'px'; };
  ta.onkeydown = (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendRp(); } };
  $('#sbtn').onclick = sendRp; $('#dbtn').onclick = diceMenu;
  $('#comp').querySelectorAll('[data-kind]').forEach((b) => (b.onclick = () => { ui.kind = b.dataset.kind; kindUi(); }));
  matchMedia('(min-width:880px)').addEventListener('change', renderAll); }
function kindUi() { $('#comp').querySelectorAll('[data-kind]').forEach((b) => b.classList.toggle('on', b.dataset.kind === ui.kind)); const ph = { say: '대사를 적어요…', act: '행동을 적어요… (예: 창가로 몸을 돌린다)', narr: '장면을 서술해요…' }; $('#ta').placeholder = ph[ui.kind]; }
function sendRp() { const ta = $('#ta'), t = ta.value.trim(); if (!t) return; if (!S.players[S.role].built) return;
  const m = /^\/r\s+(.+)$/i.exec(t); if (m) { const a = m[1].trim(), st = META.stats.find((s) => s.n === a || s.k === a.toUpperCase()); send(st ? { type: 'roll', stat: st.k, dc: META.dc.normal } : { type: 'roll', expr: a }); }
  else send({ type: 'rp', kind: ui.kind, text: t }); ta.value = ''; ta.style.height = 'auto'; ui.draft = ''; ta.focus(); }
function diceMenu() { const me = S.players[S.role]; let dc = META.dc.normal;
  modal(`<button class="x" id="mx">${ic('x')}</button><h3>주사위</h3><p class="mu sm">역극 중 즉석 판정을 굴려요. 결과는 모두에게 기록돼요.</p>
  <div class="h4">능력 판정 (d20 + 능력치)</div><input id="dnote" maxlength="200" placeholder="무엇을 시도하나요? 예: 서가 뒤를 살핀다" style="margin-bottom:10px"><div class="seg" id="dcs">${[['easy', '쉬움'], ['normal', '보통'], ['hard', '어려움'], ['extreme', '극한']].map(([k, n]) => `<button data-dc="${k}" class="${k === 'normal' ? 'on' : ''}">${n} ${META.dc[k]}</button>`).join('')}</div>
  <div style="height:10px"></div><div class="rowb">${META.stats.map((s) => `<button data-st="${s.k}">${ic(s.k)} ${s.n} ${me.stats[s.k]}</button>`).join('')}</div>
  <div class="h4">일반 주사위</div><div class="rowb">${['1d6', '1d10', '1d20', '1d100', '2d6'].map((x) => `<button data-ex="${x}">${x}</button>`).join('')}</div>`);
  $('#mx').onclick = closeModal; document.querySelectorAll('[data-dc]').forEach((b) => (b.onclick = () => { dc = META.dc[b.dataset.dc]; document.querySelectorAll('[data-dc]').forEach((x) => x.classList.toggle('on', x === b)); }));
  document.querySelectorAll('[data-st]').forEach((b) => (b.onclick = () => { send({ type: 'roll', stat: b.dataset.st, dc, note: $('#dnote').value }); closeModal(); }));
  document.querySelectorAll('[data-ex]').forEach((b) => (b.onclick = () => { send({ type: 'roll', expr: b.dataset.ex }); closeModal(); })); }
function modal(h) { const m = $('#modal'); m.innerHTML = `<div class="sheet">${h}</div>`; m.hidden = false; m.onclick = (e) => { if (e.target === m) closeModal(); }; }
function closeModal() { $('#modal').hidden = true; }

// ── 그리기
function renderAll() { const me = S.players[S.role]; document.body.dataset.tab = tab; renderHeader(); renderFeed(); renderChoices(); renderSide(); renderNav(); kindUi(); $('#comp').hidden = !me.built;
  if (!me.built) creation(); else if ($('#modal').dataset.cr) closeModal(); }
function renderHeader() { const me = S.players[S.role], ch = S.scn.chapters[S.scene.ch];
  $('#hd').innerHTML = `<div class="ttl"><b>${esc(S.scn.title)}</b><span>${ch ? esc(ch.title) + ' · ' : ''}${esc(S.scene.title || '')}</span></div>
  <button id="inv">${ic('link')}<span>${esc(S.code)}</span></button><button id="gear" aria-label="설정">${ic('gear')}</button>`;
  $('#inv').onclick = () => { const u = location.origin + '/?r=' + S.code; (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(() => toast('초대 링크를 복사했어요'), () => toast('방 코드: ' + S.code)); };
  $('#gear').onclick = settings; }
function para(t) { return String(t).split('\n').map((p) => `<p>${esc(p)}</p>`).join(''); }
function chkHtml(c, who) { if (!c) return ''; const [dn, dk] = DEG[c.deg]; return `<div class="chk deg-${dk}">${ic(c.stat || 'd20')}<span>${esc(statName(c.stat))}</span><span class="die">d20 ${c.die}${c.base != null ? ' + ' + c.base : ''}${(c.mods || []).map((m) => ' · ' + esc(m)).join('')} = ${c.total}</span><span>/ DC ${c.dc}</span><span class="res">${dn}</span></div>`; }
function entryHtml(e) { let h = entryHtml0(e);
  if (e.t === 'roll' && e.check && (e.note || e.narr)) h = h.replace(/<\/div>$/, (e.note ? `<div class="lab">“${esc(e.note)}”</div>` : '') + (e.narr ? `<p class="say">${esc(e.narr)}</p>` : '') + '</div>'); return h; }
function entryHtml0(e) { const c = e.role ? col(e.role) : '';
  if (e.t === 'chapter') return `<div class="chap" data-id="${e.id}"><small>${esc(e.kicker)}</small><h2>${esc(e.title)}</h2><div class="orn">${ic('d20')}</div><p>${esc(e.text)}</p></div>`;
  if (e.t === 'scene') return `<section class="sc" data-id="${e.id}">${e.kicker ? `<small>${esc(e.kicker)}</small>` : ''}<h3>${esc(e.title)}</h3><div class="tx">${para(e.text)}</div></section>`;
  if (e.t === 'act') return `<div class="act" data-id="${e.id}" style="--c:${c}"><div class="who"><b>${esc(e.name)}</b>${e.npc ? ' · 동행(자동)' : ''}</div><div class="lab">${esc(e.label)}</div>${chkHtml(e.check)}${e.text ? `<p class="say">${esc(e.text)}</p>` : ''}</div>`;
  if (e.t === 'rp') { const k = e.kind === 'act' ? 'act2' : e.kind === 'narr' ? 'narr' : ''; const t = e.kind === 'say' ? `“${esc(e.text)}”` : e.kind === 'act' ? '*' + esc(e.text) + '*' : esc(e.text);
    return `<div class="rp ${k} ${e.npc ? 'npc' : ''}" data-id="${e.id}" style="--c:${c}">${e.kind === 'narr' ? '' : `<b>${esc(e.name)}</b>`}${t.replace(/\n/g, '<br>')}</div>`; }
  if (e.t === 'roll') return `<div class="rl" data-id="${e.id}" style="--c:${c}">${e.check ? `<div class="chk deg-${DEG[e.check.deg][1]}"><b>${esc(e.name)}</b>${chkHtml(e.check).replace(/^<div[^>]*>|<\/div>$/g, '')}</div>` : `<div class="chk"><b>${esc(e.name)}</b>${ic('d20')}<span>${esc(e.expr)}</span><span class="die">[${e.rolls.join(', ')}] = ${e.total}</span></div>`}</div>`;
  if (e.t === 'gm') return `<div class="gm" data-id="${e.id}">${ic('eye')} ${esc(e.text)}</div>`;
  return `<div class="sys" data-id="${e.id}">${esc(e.text)}</div>`; }
function renderFeed() { const f = $('#feed'), near = f.scrollHeight - f.scrollTop - f.clientHeight < 160 || ui.first; let n = 0, mine = null;
  let top = null; for (const e of S.log) { if (e.id <= ui.drawn) continue; f.insertAdjacentHTML('beforeend', entryHtml(e)); ui.drawn = e.id; n++; if (!top && !ui.first && (e.t === 'scene' || e.t === 'chapter')) top = f.lastElementChild; if (!ui.first && e.role === S.role && !e.npc && e.check && (e.t === 'act' || e.t === 'roll')) mine = e; }
  if (n && near) requestAnimationFrame(() => { if (top) f.scrollTop += top.getBoundingClientRect().top - f.getBoundingClientRect().top - 12; else f.scrollTop = f.scrollHeight; }); ui.first = false; if (mine) diceAnim(mine); }
function chance(dc, mod) { return Math.max(5, Math.min(95, (21 - (dc - mod)) * 5)); }
function renderChoices() { const me = S.players[S.role], el = $('#choices'); let h = '';
  if (!me.built) h = ''; else if (S.phase === 'choose') {
    const picked = S.picked.includes(S.role), anyChk = S.opts.some((o) => o.stat), bonus = (me.mind <= 0 ? -2 : 0) + (ui.luck ? META.luckBonus : 0);
    if (picked) h = `<p class="hint">선택을 전달했어요.${S.waiting.length ? ' ' + S.waiting.map((k) => esc(S.players[k].name)).join(', ') + '님을 기다리는 중…' : ''}</p>`;
    else { if (anyChk && me.luck > 0) h += `<div class="tg"><button id="lk" class="${ui.luck ? 'on' : ''}">${ic('luck')} 행운 +${META.luckBonus} ${ui.luck ? '사용 예정' : '사용'}</button><span class="mu">남은 행운 ${me.luck}</span></div>`;
      h += S.opts.map((o) => { const mod = o.stat ? me.stats[o.stat] + bonus : 0, p = o.stat ? chance(o.dc, mod) : 100;
        const meta = o.stat ? `${ic(o.stat)}<span>${esc(statName(o.stat))} ${me.stats[o.stat]}</span><span>DC ${o.dc}</span><span class="pb"><i style="width:${p}%"></i></span><span>${p}%</span>` : `${ic('check')}<span>판정 없음</span>`;
        return `<button class="ch" data-i="${o.i}"><span class="m">${meta}</span><span class="t">${esc(o.label)}</span></button>`; }).join('');
      if (S.waiting.some((k) => k !== S.role)) h += `<p class="hint">상대 오너도 선택 중이에요. 둘이 고른 뒤 함께 판정해요.</p>`;
      else if (S.solo) h += `<p class="hint">동행자(${esc(S.players[Object.keys(S.players).find((k) => k !== S.role)].name)})는 자동으로 행동해요.</p>`; }
  } else if (S.phase === 'after') { const mineReady = S.ready.includes(S.role); h = `<button class="btn-p next" id="nx" ${mineReady ? 'disabled' : ''}>${mineReady ? '상대를 기다리는 중…' : '다음 장면 ▸'}</button>${mineReady ? '' : '<p class="hint tip">역극을 더 이어도 좋아요. 준비되면 넘어가요.</p>'}`; }
  else if (S.phase === 'end') h = `<div class="card" style="text-align:center"><b style="font-family:var(--narr);font-size:19px">막이 내렸어요</b><p class="mu sm">새 시나리오 파일을 scenarios 폴더에 추가하면 이야기를 이어 확장할 수 있어요.</p><button id="rst">처음부터 다시 시작</button></div>`;
  el.innerHTML = h; el.hidden = !h; const lk = $('#lk'); if (lk) lk.onclick = () => { ui.luck = !ui.luck; renderChoices(); };
  el.querySelectorAll('[data-i]').forEach((b) => (b.onclick = () => { el.querySelectorAll('[data-i]').forEach((x) => (x.disabled = true)); b.classList.add('sel'); send({ type: 'pick', i: +b.dataset.i, luck: ui.luck }); }));
  const nx = $('#nx'); if (nx) nx.onclick = () => send({ type: 'next' }); const rst = $('#rst'); if (rst) rst.onclick = () => confirm('처음부터 다시 시작할까요? (캐릭터는 유지)') && send({ type: 'restart' }); }

// ── 주사위 연출
function diceAnim(e) { const c = e.check, [dn, dk] = DEG[c.deg], box = $('#dice'); box.hidden = false; let n = 0;
  box.innerHTML = `<div class="dc"><div class="d20 rolling"><svg viewBox="0 0 24 24"><path d="M12 2.5l8.5 5v9l-8.5 5-8.5-5v-9z"/><path d="M12 7.5l4.5 8h-9z" fill="none"/></svg><b id="dn">20</b></div><div class="eq mu">&nbsp;</div><div class="big">&nbsp;</div></div>`;
  const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches, t = setInterval(() => { const d = $('#dn'); if (d) d.textContent = 1 + Math.floor(Math.random() * 20); if (++n > (reduce ? 1 : 12)) { clearInterval(t); show(); } }, 70);
  const close = () => { clearInterval(t); clearTimeout(close.t); box.hidden = true; }; box.onclick = close;
  function show() { const d = $('#dn'); if (!d) return; d.textContent = c.die; box.querySelector('.d20').classList.remove('rolling');
    box.querySelector('.eq').innerHTML = c.base != null ? `d20 ${c.die} + ${esc(statName(c.stat))} ${c.base}${(c.mods || []).map((m) => ' · ' + esc(m)).join('')} = <b>${c.total}</b> <span class="mu">/ DC ${c.dc}</span>` : '';
    const g = box.querySelector('.big'); g.textContent = dn; g.className = 'big ' + (dk === 'ok' || dk === 'crit' ? 'ok' : 'bad'); close.t = setTimeout(close, 1800); } }

// ── 사이드 패널
function renderNav() { const items = [['story', '이야기', 'story'], ['explore', '탐색' + (S.ev && S.ev.role === S.role ? ' ●' : ''), 'compass'], ['dream', '꿈세계', 'gate'], ['sheet', '캐릭터', 'user'], ['log', '기록', 'log'], ['codex', '세계', 'book'], ['chat', '잡담', 'chat']]; const sideCur = wide() ? sideTab : tab;
  if (sideCur === 'chat') ui.chatSeen = S.chat.length; const unread = S.chat.filter((c, i) => i >= ui.chatSeen && c.role !== S.role).length;
  $('#nav').innerHTML = items.map(([k, n, i]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${ic(i)}${n}${k === 'chat' && unread && tab !== 'chat' ? `<span class="dot">${unread}</span>` : ''}</button>`).join('');
  $('#stabs').innerHTML = items.slice(1).map(([k, n, i]) => `<button data-t="${k}" class="${sideTab === k ? 'on' : ''}">${ic(i)}${n}${k === 'chat' && unread && sideTab !== 'chat' ? ` <span class="dot" style="position:static;display:inline-block">${unread}</span>` : ''}</button>`).join('');
  $('#nav').querySelectorAll('button').forEach((b) => (b.onclick = () => { tab = b.dataset.t; if (tab !== 'story') sideTab = tab; renderAll(); }));
  $('#stabs').querySelectorAll('button').forEach((b) => (b.onclick = () => { sideTab = b.dataset.t; tab = 'story'; renderAll(); })); }
function renderSide() { const k = wide() ? sideTab : tab; if (k === 'story') return; const el = $('#spanel'), keep = $('#cin') ? $('#cin').value : ''; const focused = document.activeElement && document.activeElement.id === 'cin';
  el.innerHTML = '<div class="in">' + (k === 'sheet' ? sheet() : k === 'log' ? logTab() : k === 'codex' ? codexTab() : k === 'explore' ? exploreTab() : k === 'dream' ? dreamTab() : chatTab()) + '</div>'; bindSide(k);
  if (k === 'chat') { const c = $('#cin'); if (c) { c.value = keep; if (focused) c.focus(); } el.scrollTop = el.scrollHeight; } }
const bar = (label, ic_, v, mx, c) => `<div class="bar"><span>${ic(ic_)} ${label}</span><div class="tr"><i style="width:${Math.max(0, Math.min(100, v / mx * 100))}%;background:${c}"></i></div><span>${v}/${mx}</span></div>`;
function sheet0() { const me = S.players[S.role], r = roleOf(S.role), other = Object.keys(S.players).find((k) => k !== S.role), o = S.players[other];
  const sc = META.stats.map((s) => `<div class="stat"><span>${ic(s.k)}</span><div><b>${s.n}</b><small>${s.d}</small></div><div class="v">${me.pts > 0 && me.stats[s.k] < 8 ? `<button data-sp="${s.k}" aria-label="${s.n} 올리기">${ic('plus')}</button>` : ''}${me.stats[s.k]}</div></div>`).join('');
  return `<div class="pc" style="--c:${r.color}"><div class="av">${esc(me.name[0])}</div><div><b>${esc(me.name)}</b><span>${esc(r.sub)} · Lv.${me.lvl}</span></div></div>
  <div class="bars">${bar('체력', 'hp', me.hp, me.hpMax, '#d9857a')}${bar('마음', 'mind', me.mind, me.mindMax, '#7fa8d9')}${bar('경험', 'story', me.xp, me.need, 'var(--ac)')}<div class="bar"><span>${ic('luck')} 행운</span><div class="pips">${[1, 2, 3].map((i) => `<i class="${i <= me.luck ? 'f' : ''}"></i>`).join('')}</div><span></span></div></div>
  ${me.mind <= 0 ? '<p class="sm" style="color:var(--bad)">마음이 무너졌어요 — 모든 판정 −2. 다음 장(章)에서 회복해요.</p>' : ''}
  <div class="h4">능력치 ${me.pts > 0 ? `<span style="color:var(--ac)">· 배분 가능 ${me.pts}</span>` : ''}</div>${sc}
  <div class="h4">유대</div><div class="meter"><i style="width:${Math.min(100, S.bond)}%"></i></div><p class="sm mu" style="margin:6px 0 0">유대 ${S.bond}${S.heart ? ' · 마음 ' + S.heart : ''}</p>
  <div class="h4">동행</div><div class="pc" style="--c:${col(other)}"><div class="av">${esc(o.name[0])}</div><div><b>${esc(o.name)}</b><span>${o.human ? (o.online ? '오너 접속 중' : '오너 오프라인') : '자동 동행 (NPC)'} · Lv.${o.lvl}</span></div></div>
  <div class="h4">소지품</div>${S.items.length ? S.items.map((i) => { const it = S.scn.items[i] || { name: i, desc: '' }; return `<div class="it"><b>${ic('bag')} ${esc(it.name)}</b><p>${esc(it.desc)}</p></div>`; }).join('') : '<p class="mu sm">아직 아무것도 없어요.</p>'}`; }
function logTab() { const scenes = S.log.filter((e) => e.t === 'scene' || e.t === 'chapter'); return `<div class="h4">지나온 장면 (${scenes.length})</div>${scenes.slice().reverse().map((e) => `<div class="it"><b>${esc(e.title)}</b><p>${esc(e.kicker || '')}</p></div>`).join('') || '<p class="mu">기록이 없어요.</p>'}<div class="h4">내보내기</div><button id="exp" style="width:100%">${ic('log')} 이야기 텍스트로 저장 (.txt)</button>`; }
function chatTab() { return `<p class="sm mu" style="margin:0 0 12px">오너끼리 나누는 잡담방이에요. 역극 기록에는 남지 않아요.</p><div class="cl">${S.chat.map((c) => `<div class="bub ${c.role === S.role ? 'me' : ''}"><small>${esc(c.name)}</small>${esc(c.text)}</div>`).join('') || '<p class="mu sm" style="text-align:center">아직 대화가 없어요.</p>'}</div><div class="chatrow"><input id="cin" placeholder="잡담 입력…" maxlength="600"><button class="btn-p" id="csd" style="flex:none">${ic('send')}</button></div>`; }
function codexTab() { const rules = [['판정', 'd20 + 능력치가 난이도(DC) 이상이면 성공. 20은 대성공(유대+1·마음+1), 1은 대실패(마음−1).'], ['난이도', `쉬움 ${META.dc.easy} · 보통 ${META.dc.normal} · 어려움 ${META.dc.hard} · 극한 ${META.dc.extreme}`], ['행운', `장(章)마다 3개. 판정 전에 쓰면 +${META.luckBonus}.`], ['마음', '0이 되면 모든 판정 −2. 새 장이 시작될 때 일부 회복해요.'], ['자유 행동', '역극 중 주사위 버튼 → 하고 싶은 행동을 적고 능력·난이도를 고르면 GM이 판정해 서술해요. 장면당 경험치는 2회까지.'], ['혼자 · 둘이서', '혼자일 땐 동행이 자동으로 움직이고, 둘일 땐 함께 고른 뒤 함께 판정해요.']];
  const cx = S.scn.codex || [], d = (a) => a.map(([t, b]) => `<details class="cx"><summary>${esc(t)}</summary><p>${esc(b).replace(/\n/g, '<br>')}</p></details>`).join('');
  const kp = S.keep || [], kn = kp.filter((k) => k.on).length, kh = kp.length ? `<div class="h4">증표 ${kn}/${kp.length}</div>` + kp.map((k) => `<details class="cx ${k.on ? '' : 'lk'}"><summary>${ic(k.icon)} ${esc(k.n)}</summary><p>${esc(k.text)}</p></details>`).join('') + '<p class="sm mu">증표는 정해진 이야기의 장면을 지나면 떠올라요. 많을수록 기억이 쉽게 흐려지지 않아요.</p>' : '';
  return `<div class="h4">규칙 안내</div>${d(rules)}${kh}<div class="h4">세계관 노트</div>${cx.length ? d(cx.map((c) => [c.t, c.b])) : '<p class="mu sm">이 시나리오에는 아직 노트가 없어요. 시나리오 파일의 codex 에 추가해 보세요.</p>'}`; }
function exploreTab() { const me = S.players[S.role], PN = ['아침', '낮', '저녁', '밤'], TI = ['sunrise', 'sun', 'dusk', 'moon'], bonus = me.mind <= 0 ? -2 : 0, last = [...S.log].reverse().find((e) => e.ex && e.role === S.role);
  const locs = Object.entries(S.loc || {}); if (!locs.length) return '<p class="mu sm">이 시나리오에는 탐색 장소가 없어요.</p>';
  const can = S.per <= 3, tm = `<div class="tm"><div class="slots">${TI.map((t, i) => `<span class="${i === S.per ? 'on' : i < S.per ? 'past' : ''}">${ic(t)}<small>${PN[i]}</small></span>`).join('')}</div><b>${S.day}일째 · ${can ? PN[S.per] : '깊은 밤'}</b></div>`;
  const gauges = `<div class="h4">단서 ${S.clues}${S.clueNext ? ' / ' + S.clueNext : ''}</div><div class="meter"><i style="width:${S.clueNext ? S.clues / S.clueNext * 100 : 100}%"></i></div>
  <div class="h4">시간의 균열 ${S.rift}/10</div><div class="meter rf"><i style="width:${S.rift * 10}%"></i></div><p class="sm mu" style="margin:6px 0 0">${S.rift >= 8 ? '기억이 곳곳에서 어긋난다. 오늘의 기록으로 닻을 내려야 한다.' : S.anchored ? '오늘의 닻이 내려져 있다. 잠들어도 기억은 흐려지지 않는다.' : '기록하지 않고 잠들면 균열이 한 칸 벌어진다.'}</p>`;
  const res = last ? `<div class="lastr"><b>${esc(last.label)}</b>${last.check ? chkHtml(last.check) : ''}<p>${esc(last.text)}</p></div>` : '';
  const jn = `<button class="ax" id="jnl" ${can ? '' : 'disabled'}>${ic('pen')}<span><b>오늘의 기록 쓰기</b><small>의지 ${me.stats.WIL} · DC 8 · ${chance(8, me.stats.WIL + bonus)}% · 성공하면 오늘의 닻 · 균열 −1</small></span></button>`;
  const list = locs.map(([k, L]) => { const open = can && L.at.includes(S.per);
    return `<details class="lc" ${open ? 'open' : ''}><summary>${ic(L.icon)}<b>${esc(L.n)}</b>${open ? '' : `<small>${L.at.includes(3) ? '밤이 되어야 길이 열린다' : '지금은 닫혀 있다'}</small>`}</summary>${L.a.map((a, i) => { const rest = a.stat === 'rest', p = rest ? 100 : chance(a.dc, me.stats[a.stat] + bonus);
      return `<button class="ax" data-xl="${k}" data-xi="${i}" ${open ? '' : 'disabled'}>${ic(a.stat)}<span><b>${esc(a.n)}</b><small>${rest ? '휴식 · 체력·마음 +2' : statName(a.stat) + ' · DC ' + a.dc + ' · ' + p + '%'}${a.clue ? ' · 단서' : ''}${a.rift ? ' · 균열 주의' : ''}</small></span></button>`; }).join('')}</details>`; }).join('');
  return `${evCard()}${tm}${res}${gauges}<div class="h4">기록</div>${jn}<div class="h4">갈 곳</div>${list}<button class="btn-p" id="slp" style="width:100%;margin-top:14px">${ic('moon')} 잠들기 · 다음 날로</button>`; }
function bindSide(k) { document.querySelectorAll('[data-ev]').forEach((b) => (b.onclick = () => send({ type: 'evpick', i: +b.dataset.ev }))); document.querySelectorAll('[data-xl]').forEach((b) => (b.onclick = () => send({ type: 'explore', l: b.dataset.xl, i: +b.dataset.xi }))); const jl = $('#jnl'); if (jl) jl.onclick = () => send({ type: 'journal' }); const sl = $('#slp'); if (sl) sl.onclick = () => send({ type: 'sleep' }); document.querySelectorAll('[data-sp]').forEach((b) => (b.onclick = () => send({ type: 'spend', stat: b.dataset.sp })));
  const c = $('#cin'), go = () => { const t = c.value.trim(); if (t) { send({ type: 'chat', text: t }); c.value = ''; } }; if (c) { c.onkeydown = (e) => { if (e.key === 'Enter' && !e.isComposing) go(); }; $('#csd').onclick = go; }
  const ex = $('#exp'); if (ex) ex.onclick = () => { const L = S.log.map((e) => e.t === 'scene' || e.t === 'chapter' ? `\n■ ${e.title}\n${e.text}\n` : e.t === 'act' ? `[${e.name}] ${e.label}${e.check ? ` (d20 ${e.check.die}+${e.check.base || 0}=${e.check.total}/DC${e.check.dc} ${DEG[e.check.deg][0]})` : ''}\n  ${e.text || ''}` : e.t === 'rp' ? `${e.name}: ${e.text}` : e.text || '').join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([L], { type: 'text/plain' })); a.download = 'lumia-' + S.code + '.txt'; a.click(); }; }

// ── 캐릭터 생성
function creation() { const m = $('#modal'); if (m.dataset.cr && !m.hidden) return; const r = roleOf(S.role), me = S.players[S.role]; let st = { ...me.stats }, name = me.name;
  const rem = () => META.budget - Object.values(st).reduce((a, b) => a + b, 0);
  const draw = () => { m.dataset.cr = 1; m.hidden = false; m.onclick = null; m.innerHTML = `<div class="sheet"><h3>캐릭터 만들기</h3><p class="mu sm" style="margin:0 0 12px">${esc(r.name)} · ${esc(r.sub)}. 능력치는 각 ${META.min}~${META.max}, 총합 ${META.budget}점이에요. 판정은 d20 + 능력치로 정해요.</p>
    <div class="h4">이름</div><input id="cn" maxlength="12" value="${esc(name)}">
    <div class="h4">능력치 <span class="rem ${rem() === 0 ? 'z' : ''}">· 남은 ${rem()}</span></div>${META.stats.map((s) => `<div class="stat"><span>${ic(s.k)}</span><div><b>${s.n}</b><small>${s.d}</small></div><div class="v"><button data-m="${s.k}">${ic('minus')}</button><span style="min-width:1.2em;text-align:center">${st[s.k]}</span><button data-p="${s.k}">${ic('plus')}</button></div></div>`).join('')}
    <div class="rowb" style="margin-top:16px"><button id="cp">추천 배분</button><button class="btn-p" id="cok" ${rem() !== 0 ? 'disabled' : ''}>이 캐릭터로 시작</button></div></div>`;
    $('#cn').oninput = (e) => (name = e.target.value); m.querySelectorAll('[data-m]').forEach((b) => (b.onclick = () => { if (st[b.dataset.m] > META.min) { st[b.dataset.m]--; draw(); } }));
    m.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => { if (st[b.dataset.p] < META.max && rem() > 0) { st[b.dataset.p]++; draw(); } }));
    $('#cp').onclick = () => { st = { ...(S.scn.roles[S.role].preset) }; draw(); }; $('#cok').onclick = () => { send({ type: 'build', name, stats: st }); m.dataset.cr = ''; closeModal(); }; };
  draw(); }
function settings() { modal(`<button class="x" id="mx">${ic('x')}</button><h3>설정</h3>
  <div class="setrow"><span>테마</span><div class="seg" style="width:190px"><button data-th="night" class="${prefs.theme !== 'paper' ? 'on' : ''}">밤</button><button data-th="paper" class="${prefs.theme === 'paper' ? 'on' : ''}">양피지</button></div></div>
  <div class="setrow"><span>글자 크기</span><div class="seg" style="width:190px"><button id="fm">A−</button><button id="fp">A+</button></div></div>
  <div class="setrow"><span>본문 글꼴</span><div class="seg" style="width:190px"><button data-sa="0" class="${!prefs.sans ? 'on' : ''}">명조</button><button data-sa="1" class="${prefs.sans ? 'on' : ''}">고딕</button></div></div>
  <div class="setrow"><span>방 코드</span><b>${esc(S.code)}</b></div>
  <div class="rowb" style="margin-top:14px"><button id="rst2">처음부터 다시</button><button id="lv">방 나가기</button></div>`);
  $('#mx').onclick = closeModal; document.querySelectorAll('[data-th]').forEach((b) => (b.onclick = () => { prefs.theme = b.dataset.th; applyPrefs(); settings(); }));
  document.querySelectorAll('[data-sa]').forEach((b) => (b.onclick = () => { prefs.sans = b.dataset.sa === '1'; applyPrefs(); settings(); }));
  $('#fm').onclick = () => { prefs.fs = Math.max(14, prefs.fs - 1); applyPrefs(); }; $('#fp').onclick = () => { prefs.fs = Math.min(24, prefs.fs + 1); applyPrefs(); };
  $('#rst2').onclick = () => { if (confirm('처음부터 다시 시작할까요? (캐릭터는 유지)')) { send({ type: 'restart' }); closeModal(); } };
  $('#lv').onclick = () => { if (confirm('방에서 나갈까요? (방 코드로 다시 들어올 수 있어요)')) { sess = null; LS.set('lumia.sess', null); location.href = '/'; } }; }
boot();

// ── 오늘의 사건 (일상 사건 선택지) ──
function evCard() { const v = S.ev; if (!v) return ''; const me = S.players[S.role], who = S.players[v.role].name, bonus = me.mind <= 0 ? -2 : 0;
  const body = v.role === S.role ? v.opts.map((o) => `<button class="ax" data-ev="${o.i}" ${o.lock ? 'disabled' : ''}>${ic(o.stat)}<span><b>${esc(o.label)}</b><small>${statName(o.stat)} · DC ${o.dc} · ${chance(o.dc, me.stats[o.stat] + bonus)}%${o.lock ? ' · 능력치·유대 부족' : ''}</small></span></button>`).join('') : `<p class="mu sm">${esc(who)}의 선택을 기다리는 중이에요. 다음 날이 되면 동행자가 대신 고릅니다.</p>`;
  return `<div class="lastr" style="border-left:3px solid var(--accent,#e59ab8);margin-bottom:10px"><div class="h4">오늘의 사건 · ${esc(v.title)}</div><p class="sm" style="margin:4px 0 8px">${esc(v.scene)}</p>${body}</div>`; }

// ── 꿈세계 전용 화면 ──
function dreamTab() { const D = S.dream; if (!D) return '<p class="mu sm">꿈세계 정보가 없어요.</p>'; const PN = ['아침', '낮', '저녁', '밤'], L = (S.loc || {}).dream, can = L && S.per <= 3 && L.at.includes(S.per);
  const col = { M: '#e59ab8', K: '#9db38a' }, cells = Array.from({ length: 25 }, (_, i) => D.built[i] || null);
  const grid = `<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin:8px 0">${cells.map((b) => { const it = b && D.items.find((x) => x.k === b.k); return `<div style="aspect-ratio:1;border:1px ${b ? 'solid' : 'dashed'} ${b ? col[b.by] : 'rgba(128,128,128,.4)'};border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:11px;text-align:center;padding:2px;${b ? 'background:' + col[b.by] + '22' : 'opacity:.5'}">${b && it ? esc(it.n.slice(0, 4)) : ''}</div>`; }).join('')}</div>`;
  const warn = D.h >= 6 && D.s === 0 ? '아름답지만 나갈 문이 없는 성이에요. 안전한 건물을 지어 두세요. 잠들 때마다 균열이 벌어집니다.' : D.s >= 3 ? '안전이 충분해요. 잠들 때마다 시간의 균열이 한 칸씩 메워집니다.' : D.exits ? '비상구가 있어요.' : '모르포는 행복을, 케야티는 안전을 더 크게 쌓아요. 둘 다 필요해요.';
  const list = D.items.map((x, i) => x.by ? `<div class="lastr" style="opacity:.85"><b>${esc(x.n)}</b> · ${esc(S.players[x.by].name)}가 지음<p class="sm mu" style="margin:2px 0 0">${esc(x.d)}</p></div>` : `<button class="ax" data-xl="dream" data-xi="${i}" ${can ? '' : 'disabled'}>${ic('gate')}<span><b>${esc(x.n)} 짓기</b><small>행복 +${x.h} · 안전 +${x.s} · ${esc(x.d)}</small></span></button>`).join('');
  return `<div class="h4">꿈세계 · ${D.built.length}/${D.items.length}</div><div class="h4">행복 ${D.h}</div><div class="meter"><i style="width:${Math.min(100, D.h * 5)}%"></i></div><div class="h4">안전 ${D.s}</div><div class="meter rf"><i style="width:${Math.min(100, D.s * 8)}%;background:#9db38a"></i></div><p class="sm mu" style="margin:6px 0">${warn}</p>${grid}<p class="sm mu">건설은 저녁·밤에만 가능해요. 지금은 ${S.per <= 3 ? PN[S.per] : '깊은 밤'}.</p>${list}`; }

// ── 정체성 · 플랜 카드 (캐릭터 탭 맨 위) ──
// 케야티 성인기: 시간의 균열이 깊을수록 사고 장부의 숫자가 흔들린다
function ledgerCard() { if (S.role !== 'K' || S.scene.ch !== 3) return ''; const r = S.rift, lines = r < 3 ? ['공식 기록 — 사망자 0명 · 구조 32명', '근무자 명단에 서명이 있다.'] : r < 7 ? ['기록마다 숫자가 다르다 — 0명 · 3명', '사망자 명단에도 이름이 남아 있다.'] : ['0명, 3명, 혹은 그보다 많은 명단', '어느 기록에는 구조자가 아니라 사망자로 적혀 있다.'];
  return `<div class="lastr" style="border-left:3px solid #9db38a;margin-bottom:10px"><div class="h4">성 뭉고 제3병동 사고 장부</div><p class="sm" style="margin:4px 0">${lines[0]}</p><small class="mu">${lines[1]} ${S.anchored ? '오늘의 닻이 내려져 있다.' : '오늘의 기록을 쓰면 숫자가 덜 흔들린다.'}</small></div>`; }
function sheet() { const me = S.players[S.role], I = me.idn; if (!I) return ledgerCard() + sheet0();
  const mods = Object.entries(I.mod).map(([k, v]) => `${statName(k)} ${v > 0 ? '+' : '−'}${Math.abs(v)}`).join(' · '), plan = S.role === 'K' ? `<div class="h4" style="margin-top:8px">플랜 B·C ${'●'.repeat(me.plan)}${'○'.repeat(Math.max(0, 2 - me.plan))}</div><p class="sm mu" style="margin:2px 0 0">판정에 실패하면 한 번 더 굴려요. 새 장이 시작되면 채워져요.</p>` : '';
  return `<div class="lastr" style="border-left:3px solid #e59ab8;margin-bottom:10px"><div class="h4">지금의 나 · ${esc(I.n)}</div><p class="sm" style="margin:4px 0">${esc(I.t)}</p><small class="mu">${mods}</small>${plan}</div>` + ledgerCard() + sheet0(); }
