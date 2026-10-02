// server.js — 루미아 TRPG 서버. 1인 솔로 / 2인 협동. 판정(주사위)은 모두 서버가 굴린다.
// 실행: npm install && npm start → http://localhost:3000   (Railway: DATA_DIR 에 볼륨 경로 지정)
const express = require('express'), http = require('http'), fs = require('fs'), path = require('path'), { WebSocketServer } = require('ws');
const R = require('./rules');
const DATA = process.env.DATA_DIR || __dirname, FILE = path.join(DATA, 'rooms.json'), VER = 6;
const app = express(); app.use(express.static(path.join(__dirname, 'public')));
app.get('/api/meta', (q, res) => res.json({ stats: R.STATS, budget: R.BUDGET, min: R.MIN, max: R.MAX, dc: R.DC, luckBonus: R.LUCK_BONUS, tags: R.TAGS,
  scenarios: Object.values(SCN).map((s) => ({ id: s.id, title: s.title, blurb: s.blurb, roles: s.roles, scenes: Object.keys(s.scenes).length })) }));
const srv = http.createServer(app), wss = new WebSocketServer({ server: srv });

// ── 시나리오 로드 (scenarios/*.js, '_' 로 시작하는 파일은 데이터 조각이라 제외)
const SCN = {};
for (const f of fs.readdirSync(path.join(__dirname, 'scenarios'))) if (f.endsWith('.js') && !f.startsWith('_')) { const s = require('./scenarios/' + f); SCN[s.id] = s; }
const rooms = {};
const pick = (a) => a[Math.floor(Math.random() * a.length)], clamp = (v, a, b) => Math.max(a, Math.min(b, v)), d = (n) => 1 + Math.floor(Math.random() * n);
const uid = () => Math.random().toString(36).slice(2, 10);

// ── 저장
try { Object.assign(rooms, JSON.parse(fs.readFileSync(FILE, 'utf8')).rooms || {}); for (const k in rooms) if (rooms[k].ver !== VER) delete rooms[k]; } catch (e) {}
let st; const save = () => { clearTimeout(st); st = setTimeout(() => { try { fs.writeFileSync(FILE + '.tmp', JSON.stringify({ rooms })); fs.renameSync(FILE + '.tmp', FILE); } catch (e) {} }, 400); };

// ── 캐릭터
const mkPlayer = (role, def) => { const p = { role, token: null, name: def.name, stats: { ...def.preset }, xp: 0, lvl: 1, pts: 0, luck: R.LUCK_MAX, built: true, online: false };
  p.plan = def.plan || 0; p.hpMax = R.hpMax(p.stats); p.mindMax = R.mindMax(p.stats); p.hp = p.hpMax; p.mind = p.mindMax; return p; };
const roleKeys = (r) => Object.keys(SCN[r.scn].roles);
const humans = (r) => roleKeys(r).filter((k) => r.players[k].token);
const active = (r) => { const h = humans(r).filter((k) => r.players[k].online); return h.length ? h : humans(r); };  // 접속 중인 사람(없으면 전원)
const fmt = (r, t) => (t || '').replace(/\{(\w+)\}/g, (m, k) => (r.players[k] ? r.players[k].name : m));
const W = require('./world')({ log, roll, fmt, pick, roles: roleKeys, active });
const text = (t) => (Array.isArray(t) ? t.join('\n') : t);

function log(r, e) { e.id = ++r.seq; e.ts = Date.now(); r.log.push(e); if (r.log.length > 500) r.log.splice(0, r.log.length - 500); return e; }
function newRoom(code, scn) {
  const S = SCN[scn], players = {}; for (const k in S.roles) players[k] = mkPlayer(k, S.roles[k]);
  const r = { ver: VER, code, scn, players, bond: 0, heart: 0, day: 1, per: 0, clues: 0, clueSeen: 0, rift: 0, anchored: 0, kept: [], seen: [], items: [], flags: {}, log: [], chat: [], seq: 0, scene: null, phase: 'choose', picks: {}, ready: {}, nextId: null, rpCount: 0, evDone: [], evRecent: [], evDay: 0, evCh: -1, dream: { built: [] }, done: false, createdAt: Date.now() };
  enter(r, S.start); return r;
}
const reqOk = (r, q, role) => { if (!q) return true;
  if (q.item && !r.items.includes(q.item)) return false; if (q.flag && !r.flags[q.flag]) return false; if (q.bond && r.bond < q.bond) return false;
  if (q.stat) for (const k in q.stat) if (r.players[role].stats[k] < q.stat[k]) return false; return true; };
const choicesFor = (r, role) => { const sc = SCN[r.scn].scenes[r.scene]; if (!sc.choices) return []; const list = Array.isArray(sc.choices) ? sc.choices : (sc.choices[role] || []);
  return list.map((c, i) => ({ c, i })).filter((x) => reqOk(r, x.c.req, role)); };

function applyFx(r, role, fx) { if (!fx) return; const p = r.players[role];
  if (fx.bond) r.bond = Math.max(0, r.bond + fx.bond); if (fx.heart) r.heart = Math.max(0, r.heart + fx.heart);
  if (fx.hp) p.hp = clamp(p.hp + fx.hp, 0, p.hpMax); if (fx.mind) p.mind = clamp(p.mind + fx.mind, 0, p.mindMax); if (fx.luck) p.luck = clamp(p.luck + fx.luck, 0, 9);
  if (fx.give && !r.items.includes(fx.give)) { r.items.push(fx.give); const it = (SCN[r.scn].items || {})[fx.give]; log(r, { t: 'sys', text: `소지품 획득 — ${it ? it.name : fx.give}` }); }
  if (fx.flag) r.flags[fx.flag] = 1;
  if (fx.xp && p.token) gainXp(r, p, fx.xp); }
function gainXp(r, p, n) { p.xp += n; while (p.xp >= R.xpNeed(p.lvl)) { p.xp -= R.xpNeed(p.lvl); p.lvl++; p.pts++; log(r, { t: 'sys', text: `${p.name} 레벨 ${p.lvl}! 능력치 포인트 +1 (캐릭터 탭에서 배분)` }); } }

// ── 장면 진입
function enter(r, id, guard = 0) {
  const S = SCN[r.scn], sc = S.scenes[id]; if (!sc) { r.done = true; r.phase = 'end'; return; }
  if (!S.linear && sc.if && !reqOk(r, sc.if, roleKeys(r)[0]) && sc.next && guard < 50) return enter(r, sc.next, guard + 1);
  r.scene = id; if (sc.flag) r.flags[sc.flag] = 1; if (!(r.seen || (r.seen = [])).includes(id)) r.seen.push(id); r.picks = {}; r.ready = {}; r.rpCount = 0; r.freeXp = 0; r.nextId = null;
  log(r, { t: sc.chapterStart ? 'chapter' : 'scene', id, title: sc.title, kicker: sc.kicker || '', text: fmt(r, text(sc.text)) });
  checkKeeps(r);
  if (sc.chapterStart) for (const k in r.players) { const p = r.players[k]; p.hp = clamp(p.hp + 3, 0, p.hpMax); p.mind = clamp(p.mind + 3, 0, p.mindMax); p.luck = Math.max(p.luck, R.LUCK_MAX); p.plan = Math.max(p.plan | 0, S.roles[k].plan || 0); }
  if (sc.give) applyFx(r, roleKeys(r)[0], { give: sc.give });
  if (sc.hit) for (const k of roleKeys(r)) applyFx(r, k, { mind: -1 });
  r.phase = sc.ending ? 'end' : (sc.choices ? 'choose' : 'after'); if (sc.ending) { r.done = true; W.summary(r); }
  if (r.phase === 'after') r.nextId = sc.next || null;
  if (r.phase === 'choose' && !roleKeys(r).some((k) => choicesFor(r, k).length)) { r.phase = 'after'; r.nextId = sc.next || null; }
  tryAuto(r);
}

// ── 판정
const idnOf = (r, role) => (((SCN[r.scn].identity || {})[role]) || [])[(SCN[r.scn].scenes[r.scene] || {}).ch || 0] || null;
function roll(r, role, stat, dc, luck) {
  const p = r.players[role], die = d(20), base = p.stats[stat] || 0, mods = []; let mod = base;
  if (p.mind <= 0) { mod -= 2; mods.push('동요 −2'); } if (luck) { mod += R.LUCK_BONUS; mods.push(`행운 +${R.LUCK_BONUS}`); }
  const idn = idnOf(r, role); if (idn && idn.mod[stat]) { mod += idn.mod[stat]; mods.push(`${idn.n} ${idn.mod[stat] > 0 ? '+' : '−'}${Math.abs(idn.mod[stat])}`); }
  const judge = (x) => { const t = x + mod; return { die: x, total: t, deg: x === 20 ? 'crit' : x === 1 ? 'fumble' : t >= dc ? 'ok' : 'fail' }; };
  let j = judge(die);
  if (j.deg === 'fail' && (p.plan | 0) > 0) { const lab = p.plan >= 2 ? '플랜 B' : '플랜 C'; p.plan--; mods.push(`${lab}: 재판정 (처음 ${die})`); j = judge(d(20)); }  // 케야티: 실패하면 준비해 둔 우회로로 한 번 더
  return { die: j.die, base, mods, total: j.total, dc, deg: j.deg, stat };
}
const FAIL = { safe: ['신중하려 했지만 준비가 어긋났다. 침묵이 한 박자 길어진다.', '계획은 있었으나 현실이 한 걸음 빨랐다.'], near: ['다가가려던 말이 반 박자 늦었다. 어색한 공기가 남는다.', '손을 뻗었지만 닿지 않았다.'], know: ['짚어낸 줄 알았으나 단서가 손에서 빠져나간다.', '알 것 같았던 것이 다시 흐려진다.'] };
function resolve(r, role, ch, luck, npc) {
  const p = r.players[role]; const nm = p.name;
  const needs = ch.stat ? (ch.dc || (SCN[r.scn].scenes[r.scene].dc) || R.DEFAULT_DC) : 0;
  const ok = ch.ok || { text: ch.say, fx: ch.fx, goto: ch.goto }, fl = ch.fail || { text: pick(FAIL[ch.tag] || FAIL.know), fx: ch.failFx, goto: ch.goto };
  let res = { deg: 'ok' }; if (ch.stat) { if (luck && !npc) p.luck--; res = roll(r, role, ch.stat, needs, luck && !npc); }
  const good = res.deg === 'ok' || res.deg === 'crit', out = good ? ok : fl;
  const e = { t: 'act', role, name: nm, label: ch.label, npc: !!npc, check: ch.stat ? res : null, text: fmt(r, out.text || ''), tag: ch.tag || '' };
  log(r, e);
  if (res.deg === 'fumble') { applyFx(r, role, { mind: -1 }); log(r, { t: 'sys', text: `대실패 — ${nm}의 마음이 흔들렸다. (마음 −1)` }); }
  if (res.deg === 'crit') { applyFx(r, role, { mind: 1, bond: 1 }); log(r, { t: 'sys', text: `대성공! — 유대 +1 · 마음 +1` }); }
  const fx = out.fx ? { ...out.fx } : null, bondGain = fx && fx.bond ? fx.bond : 0; if (fx) delete fx.bond; applyFx(r, role, fx); if (!out.fx || !out.fx.xp) applyFx(r, role, { xp: good ? 1 : 0 });
  if (res.deg === 'crit') applyFx(r, role, { xp: 1 });
  return { total: res.total || 0, goto: out.goto, bond: bondGain };
}
// ── 탐색: 하루 3번(아침·낮·저녁) + 밤. 행동마다 시간이 흐르고, 단서가 쌓이면 이야기 조각이 열린다
// ── 증표: 정해진 서사의 장면을 지나면 하나씩 떠오른다 (분기 없음 · 많을수록 기억이 흐려지기 어렵다)
function checkKeeps(r) { r.kept = r.kept || []; for (const k of SCN[r.scn].keepsakes || []) if ((r.seen || []).includes(k.scene) && !r.kept.includes(k.id)) { r.kept.push(k.id); log(r, { t: 'gm', text: `증표가 떠올랐다 — ${k.n}` }); } }
const keepView = (r) => (SCN[r.scn].keepsakes || []).map((k) => { const on = (r.kept || []).includes(k.id); return { n: on ? k.n : '???', on, icon: k.icon, text: on ? k.text : k.hint }; });
function addClue(r, n) { const S = SCN[r.scn], before = r.clueSeen || 0; r.clues += n; r.clueSeen = Math.max(before, r.clues);
  for (const [t, txt] of S.clueLog || []) if (before < t && r.clues >= t) { log(r, { t: 'gm', text: fmt(r, txt) }); r.bond += 1; log(r, { t: 'sys', text: `단서 ${t}개 달성 — 유대 +1` }); } }
function explore(r, role, l, i) { const S = SCN[r.scn], L = Object.hasOwn(S.loc || {}, l) ? S.loc[l] : null, a = L && L.a[+i], p = r.players[role];
  if (!a || r.per > 3 || !(L.at || [0, 1, 2]).includes(r.per)) return; const f = (t) => fmt(r, String(t || '').replace(/\{P\}/g, p.name)); if (a.build && W.built(r, a.build)) { log(r, { t: 'sys', text: '이미 완성한 건물이다.' }); return; } r.per++;
  if (a.stat === 'rest') { log(r, { t: 'act', ex: 1, role, name: p.name, label: a.n, text: f(a.ok) }); applyFx(r, role, { hp: 2, mind: 2 }); log(r, { t: 'sys', text: '휴식 — 체력 +2 · 마음 +2' }); return; }
  const x = roll(r, role, a.stat, a.dc, false), good = x.deg === 'ok' || x.deg === 'crit';
  log(r, { t: 'act', ex: 1, role, name: p.name, label: a.n, check: x, text: f(good ? a.ok : a.fail) });
  if (x.deg === 'fumble') applyFx(r, role, { mind: -1 }); if (x.deg === 'crit') applyFx(r, role, { mind: 1 });
  if (good && a.build) W.build(r, role, a.build); if (a.rift) r.rift = clamp(r.rift + a.rift, 0, 10);
  if (good) { applyFx(r, role, { xp: x.deg === 'crit' ? 2 : 1 }); if (a.bond) r.bond += a.bond; if (a.clue) addClue(r, a.clue + (x.deg === 'crit' ? 1 : 0)); }
  else if (a.risk) { applyFx(r, role, { hp: -a.risk }); log(r, { t: 'sys', text: `${p.name} 체력 −${a.risk}` }); } }
function journal(r, role) { if (r.per > 3) return; const p = r.players[role]; r.per++; const x = roll(r, role, 'WIL', 8, false), good = x.deg === 'ok' || x.deg === 'crit';
  log(r, { t: 'act', ex: 1, role, name: p.name, label: '오늘의 기록', check: x, text: good ? `「${r.day}일째. 이건 오늘 내가 적었다.」 오늘의 일을 또박또박 적고 어제의 기록과 한 줄씩 맞춰 본다. 어긋남이 없다. 기억에 닻이 내려졌다.` : '글씨가 번져 몇 줄을 다시 적어야 했다. 기억이 아직 마음에 걸린다.' });
  if (good) { r.anchored = 1; r.rift = clamp(r.rift - 1, 0, 10); log(r, { t: 'sys', text: '닻을 내렸다 — 균열 −1' }); } if (x.deg === 'fumble') applyFx(r, role, { mind: -1 }); }
function drift(r) { const k = pick(['mind', 'clue', 'dream']);
  if (k === 'clue' && r.clues > 0) { r.clues--; log(r, { t: 'gm', text: '수첩의 한 줄이 번져 읽을 수 없다. 어제 알아낸 것이 하나 흐려졌다. (단서 −1)' }); }
  else if (k === 'dream') log(r, { t: 'gm', text: '꿈속에서 본 적 없는 복도를 걸었다. 깨어나도 발바닥이 그 길을 기억하고 있다.' });
  else { for (const q in r.players) applyFx(r, q, { mind: -1 }); log(r, { t: 'gm', text: '아침, 어제의 기억이 한 겹 어긋나 있다. 분명 함께였던 누군가의 얼굴이 낯설다. (마음 −1)' }); }
  if (r.rift >= 8) { for (const q in r.players) applyFx(r, q, { mind: -1 }); log(r, { t: 'sys', text: '균열이 깊다 — 마음 −1' }); } }
function sleepDay(r) { if (r.ev) W.resolveEv(r, null); W.tick(r); if (!r.anchored) { r.rift = clamp(r.rift + 1, 0, 10); if (r.rift >= 3 + Math.floor((r.kept || []).length / 2)) drift(r); } r.anchored = 0; r.day++; W.daily(r, (SCN[r.scn].scenes[r.scene] || {}).ch); r.per = 0; for (const k in r.players) { const p = r.players[k]; p.hp = clamp(p.hp + 3, 0, p.hpMax); p.mind = clamp(p.mind + 2, 0, p.mindMax); p.luck = Math.max(p.luck, R.LUCK_MAX); }
  log(r, { t: 'sys', text: `— ${r.day}일째 아침이 밝았다. (체력 +3 · 마음 +2 · 행운 회복) —` }); }
function npcPick(r, role) { const opts = choicesFor(r, role); if (!opts.length) return null; const p = r.players[role];
  const w = opts.map((o) => 1 + (p.stats[o.c.stat] || 0)), sum = w.reduce((a, b) => a + b, 0); let x = Math.random() * sum; for (let i = 0; i < opts.length; i++) { x -= w[i]; if (x <= 0) return opts[i].i; } return opts[0].i; }

function tryAuto(r) { // 모든 '사람' 이 골랐으면 해결, NPC 는 자동 선택
  if (r.phase !== 'choose' || !humans(r).length) return; const need = active(r).filter((k) => choicesFor(r, k).length); if (need.some((k) => r.picks[k] == null)) return;
  const results = []; const SC = SCN[r.scn].scenes[r.scene];
  for (const k of roleKeys(r)) { const opts = choicesFor(r, k); if (!opts.length) continue; const human = need.includes(k); const idx = human ? r.picks[k].i : npcPick(r, k);
    const ch = Array.isArray(SC.choices) ? SC.choices[idx] : SC.choices[k][idx]; results.push({ k, ...resolve(r, k, ch, human && r.picks[k].luck, !human) }); }
  const bg = Math.max(0, ...results.map((x) => x.bond)); if (bg) r.bond += bg;  // 유대는 장면당 한 번(둘 중 큰 값)
  results.sort((a, b) => b.total - a.total); const lead = results.find((x) => x.goto);
  r.nextId = (!SCN[r.scn].linear && lead && lead.goto) || SC.next || null;  // linear: 정해진 서사는 분기하지 않는다 r.phase = 'after'; r.picks = {}; r.ready = {};
  if (!r.nextId) { r.done = true; r.phase = 'end'; }
}
function advance(r) { if (r.phase !== 'after' || !r.nextId) return; const ok = active(r).every((k) => r.ready[k]); if (ok) enter(r, r.nextId); }

// ── 역극 · 주사위 · 잡담
function rp(r, role, kind, t) { t = String(t || '').trim().slice(0, 1200); if (!t) return; const p = r.players[role];
  log(r, { t: 'rp', role, name: p.name, kind: ['say', 'act', 'narr'].includes(kind) ? kind : 'say', text: t }); r.rpCount++;
  const S = SCN[r.scn], mine = humans(r).length;
  if (mine === 1 || !active(r).some((k) => k !== role)) { // 솔로: 동행자(NPC) 가 응답
    const npc = roleKeys(r).find((k) => k !== role); const lines = (SCN[r.scn].scenes[r.scene].npc || {})[npc] || ((S.npcByCh || {})[SCN[r.scn].scenes[r.scene].ch] || {})[npc] || (S.npcLines || {})[npc] || ['…계속해.', '그래서, 다음은?', '(고개를 끄덕이며 귀를 기울인다.)', '그 말, 잊지 않을게.'];
    if (npc) log(r, { t: 'rp', role: npc, name: r.players[npc].name, kind: lines[0] && /^\(/.test(lines[0]) ? 'act' : 'say', text: pick(lines), npc: true }); }
  if (r.rpCount % 4 === 0 && S.gm) log(r, { t: 'gm', text: fmt(r, pick(S.gm)) });
}
function freeRoll(r, role, expr, stat, dc, note) { dc = clamp(+dc || R.DC.normal, 5, 25); const p = r.players[role]; const m = /^(\d{0,2})d(\d{1,3})([+-]\d+)?$/i.exec(String(expr || '').trim());
  if (stat && p.stats[stat] != null) { const x = roll(r, role, stat, dc, false); log(r, { t: 'roll', role, name: p.name, stat, check: x, note: String(note || '').trim().slice(0, 200), narr: pick(R.NARR[x.deg]) });
    if (x.deg === 'fumble') applyFx(r, role, { mind: -1 }); if ((x.deg === 'ok' || x.deg === 'crit') && (r.freeXp || 0) < 2) { r.freeXp = (r.freeXp || 0) + 1; applyFx(r, role, { xp: 1 }); } return; }
  if (!m) return; const n = clamp(+m[1] || 1, 1, 20), s = clamp(+m[2], 2, 1000), add = +(m[3] || 0), rolls = Array.from({ length: n }, () => d(s));
  log(r, { t: 'roll', role, name: p.name, expr: `${n}d${s}${add ? (add > 0 ? '+' : '') + add : ''}`, rolls, total: rolls.reduce((a, b) => a + b, 0) + add }); }

// ── 클라이언트에 보낼 상태
function view(r, role) { const S = SCN[r.scn], sc = S.scenes[r.scene] || {}; const my = r.players[role];
  const opts = r.phase === 'choose' && my ? choicesFor(r, role).map((o) => ({ i: o.i, label: fmt(r, o.c.label), stat: o.c.stat || null, dc: o.c.stat ? (o.c.dc || sc.dc || R.DEFAULT_DC) : null, tag: o.c.tag || null })) : [];
  const ps = {}; for (const k in r.players) { const p = r.players[k]; ps[k] = { role: k, name: p.name, human: !!p.token, online: p.online, built: p.built, stats: p.stats, hp: p.hp, hpMax: p.hpMax, mind: p.mind, mindMax: p.mindMax, luck: p.luck, plan: p.plan | 0, idn: (() => { const i = idnOf(r, k); return i ? { n: i.n, t: i.t, mod: i.mod } : null; })(), xp: p.xp, need: R.xpNeed(p.lvl), lvl: p.lvl, pts: p.pts }; }
  return { code: r.code, scn: { id: S.id, title: S.title, roles: S.roles, items: S.items || {}, codex: S.codex || [], chapters: S.chapters || [] }, role, scene: { id: r.scene, title: sc.title, ch: sc.ch || 0 }, phase: r.phase, opts, picked: Object.keys(r.picks), ready: Object.keys(r.ready),
    players: ps, bond: r.bond, heart: r.heart, day: r.day, per: r.per, clues: r.clues, rift: r.rift, anchored: r.anchored, keep: keepView(r), clueNext: ((SCN[r.scn].clueLog || []).find((c) => c[0] > r.clues) || [null])[0],
    loc: Object.fromEntries(Object.entries(SCN[r.scn].loc || {}).map(([k, L]) => [k, { n: L.n, icon: L.icon, at: L.at || [0, 1, 2], a: L.a.map((a) => ({ n: a.n, stat: a.stat, dc: a.dc || 0, clue: a.clue || 0 })) }])), ev: W.evView(r), dream: W.dreamView(r), items: r.items, log: r.log.slice(-240), chat: r.chat.slice(-120), canNext: r.phase === 'after' && !!r.nextId, done: r.done,
    waiting: r.phase === 'choose' ? active(r).filter((k) => choicesFor(r, k).length && r.picks[k] == null) : [], solo: humans(r).length < 2 }; }
// ── 기기 백업: 서버가 방을 잃어도(무료 호스팅 재시작 등) 접속한 기기가 가진 스냅샷으로 복구한다
const snapOf = (r) => ({ ver: VER, code: r.code, scn: r.scn, bond: r.bond, heart: r.heart, day: r.day, per: r.per, clues: r.clues, clueSeen: r.clueSeen, rift: r.rift, anchored: r.anchored, kept: r.kept, seen: r.seen, items: r.items, flags: r.flags, seq: r.seq, scene: r.scene, phase: r.phase, nextId: r.nextId, rpCount: r.rpCount, ev: r.ev, evDone: r.evDone, evRecent: r.evRecent, evDay: r.evDay, evCh: r.evCh, dream: r.dream, done: r.done,
  log: r.log.slice(-120), chat: r.chat.slice(-60), players: Object.fromEntries(Object.entries(r.players).map(([k, p]) => [k, { ...p, token: null, online: false }])) });
function restoreRoom(m) { const sn = m.snap; if (!sn || sn.ver !== VER || !SCN[sn.scn] || !/^[A-Z0-9]{4,6}$/.test(String(sn.code)) || rooms[sn.code]) return null;
  const S = SCN[sn.scn]; if (!S.scenes[sn.scene] || !S.roles[m.role]) return null; for (const k in S.roles) if (!sn.players || !sn.players[k]) return null;
  const r = { ...sn, picks: {}, ready: {}, createdAt: Date.now() }; rooms[r.code] = r; return r; }
const clients = new Map(); // ws -> {code, role}
const snapT = new Map();
function push(r) { if (!snapT.has(r.code)) snapT.set(r.code, setTimeout(() => { snapT.delete(r.code); for (const [w, c] of clients) if (c.code === r.code && w.readyState === 1) w.send(JSON.stringify({ type: 'snap', snap: snapOf(r) })); }, 3000)); for (const [ws, c] of clients) if (c.code === r.code && ws.readyState === 1) ws.send(JSON.stringify({ type: 'state', s: view(r, c.role) })); save(); }
const send = (ws, o) => ws.readyState === 1 && ws.send(JSON.stringify(o));
const genCode = () => { let c; do c = Math.random().toString(36).slice(2, 6).toUpperCase(); while (rooms[c]); return c; };

wss.on('connection', (ws) => {
  ws.on('message', (raw) => { let m; try { m = JSON.parse(raw); } catch (e) { return; }
    const c = clients.get(ws), r = c && rooms[c.code], P = r && r.players[c.role];
    if (m.type === 'list') return send(ws, { type: 'list', scenarios: Object.values(SCN).map((s) => ({ id: s.id, title: s.title, blurb: s.blurb, roles: s.roles, scenes: Object.keys(s.scenes).length })), stats: R.STATS, budget: R.BUDGET, min: R.MIN, max: R.MAX });
    if (m.type === 'restore') { const room = restoreRoom(m); if (!room) return send(ws, { type: 'err', code: 'norestore', text: '이 방은 복구할 수 없어요.' }); m.type = 'enter'; m.code = room.code; m.token = null; }
    if (m.type === 'enter') { // {code?, token?, scn, role}
      let room = m.code && rooms[String(m.code).toUpperCase()];
      if (m.code && !room) return send(ws, { type: 'err', code: 'noroom', text: '그 방 코드를 찾을 수 없어요.' });
      if (!room) { if (!SCN[m.scn]) return send(ws, { type: 'err', text: '시나리오를 고르세요.' }); const code = genCode(); room = rooms[code] = newRoom(code, m.scn); }
      let role = Object.keys(room.players).find((k) => m.token && room.players[k].token === m.token);
      if (!role) { role = SCN[room.scn] && (room.players[m.role] && !room.players[m.role].token ? m.role : Object.keys(room.players).find((k) => !room.players[k].token));
        if (!role) return send(ws, { type: 'err', text: '이 방은 이미 두 명이 있어요.' }); const p = room.players[role]; p.token = uid(); p.built = false; log(room, { t: 'sys', text: `${SCN[room.scn].roles[role].name} 자리에 오너가 입장했어요.` }); }
      room.players[role].online = true; clients.set(ws, { code: room.code, role });
      send(ws, { type: 'joined', code: room.code, token: room.players[role].token, role, scn: room.scn }); push(room); return; }
    if (!r || !P) return;
    switch (m.type) {
      case 'build': { const st = m.stats || {}, sum = R.STATS.reduce((a, s) => a + (+st[s.k] || 0), 0); if (sum !== R.BUDGET || R.STATS.some((s) => st[s.k] < R.MIN || st[s.k] > R.MAX)) return send(ws, { type: 'err', text: `능력치는 각 ${R.MIN}~${R.MAX}, 총합 ${R.BUDGET} 이어야 해요.` });
        P.stats = Object.fromEntries(R.STATS.map((s) => [s.k, +st[s.k]])); P.name = String(m.name || P.name).trim().slice(0, 12) || P.name; P.hpMax = R.hpMax(P.stats); P.mindMax = R.mindMax(P.stats); P.hp = P.hpMax; P.mind = P.mindMax; P.built = true; tryAuto(r); break; }
      case 'spend': if (P.pts > 0 && P.stats[m.stat] != null && P.stats[m.stat] < 8) { P.pts--; P.stats[m.stat]++; P.hpMax = R.hpMax(P.stats); P.mindMax = R.mindMax(P.stats); } break;
      case 'pick': { if (r.phase !== 'choose' || !P.built || r.picks[c.role] != null) break; const o = choicesFor(r, c.role).find((x) => x.i === m.i); if (!o) break;
        const lk = !!m.luck && P.luck > 0 && !!o.c.stat; r.picks[c.role] = { i: m.i, luck: lk }; tryAuto(r); break; }
      case 'next': if (r.phase === 'after') { r.ready[c.role] = 1; advance(r); } break;
      case 'rp': rp(r, c.role, m.kind, m.text); break;
      case 'roll': freeRoll(r, c.role, m.expr, m.stat, m.dc, m.note); break;
      case 'chat': { const t = String(m.text || '').trim().slice(0, 600); if (!t) break; r.chat.push({ role: c.role, name: P.name, text: t, ts: Date.now() }); if (r.chat.length > 200) r.chat.shift(); break; }
      case 'explore': if (P.built) explore(r, c.role, m.l, m.i); break;
      case 'journal': if (P.built) journal(r, c.role); break;
      case 'sleep': sleepDay(r); break;
        case 'evpick': if (r.ev && r.ev.role === c.role) { W.resolveEv(r, +m.i); } break;
      case 'restart': { const fresh = newRoom(r.code, r.scn); for (const k in r.players) { const p = r.players[k]; p.hp = p.hpMax; p.mind = p.mindMax; p.luck = R.LUCK_MAX; } fresh.players = r.players; Object.keys(r).forEach((k) => delete r[k]); Object.assign(r, fresh); r.log = []; r.seq = 0; enter(r, SCN[r.scn].start); break; }
    }
    push(r); });
  ws.on('close', () => { const c = clients.get(ws); clients.delete(ws); const r = c && rooms[c.code]; if (r && r.players[c.role]) { const still = [...clients.values()].some((x) => x.code === c.code && x.role === c.role); if (!still) { r.players[c.role].online = false; tryAuto(r); push(r); } } });
});
setInterval(() => { for (const ws of wss.clients) if (ws.readyState === 1) ws.ping(); }, 30000);
srv.listen(process.env.PORT || 3000, () => console.log('루미아 TRPG → http://localhost:' + (process.env.PORT || 3000)));
