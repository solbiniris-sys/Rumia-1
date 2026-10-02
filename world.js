// world.js — 구(舊) 루미아 게임의 이벤트 엔진·꿈세계·편지를 TRPG 서버에 이식한 어댑터.
// legacy/ 는 원본 데이터(ch1~7 사건, 편지, 꿈세계 건물) 그대로. 여기서는 판정·기록 형식만 TRPG 규칙으로 바꾼다.
const AD = require('./legacy/data'); require('./legacy/content')(AD);
const AE = require('./legacy/engine')(AD);
const SM = { 상상: 'MAG', 호기심: 'INS', 다정: 'CHA', 관찰: 'INS', 신중: 'WIL', 용기: 'AGI' }; // 옛 6능력치 → 현 5능력치
const CHMAP = { 0: 0, 1: 3, 2: 6 };                                                           // TRPG 장 → 옛 장 (성인기는 일상 사건 없음)
const jong = (c) => { const n = c.charCodeAt(0) - 0xAC00; return n < 0 || n > 11171 ? 0 : n % 28; };
const josa = (t) => t.replace(/([가-힣])(이\(가\)|은\(는\)|을\(를\)|와\(과\)|으로\(로\))/g, (m, c, j) => { const f = jong(c), h = f > 0; return c + ({ '이(가)': h ? '이' : '가', '은(는)': h ? '은' : '는', '을(를)': h ? '을' : '를', '와(과)': h ? '과' : '와', '으로(로)': h && f !== 8 ? '으로' : '로' })[j]; });

module.exports = ({ log, roll, fmt, pick, roles, active }) => {
  const F = (r, t) => josa(fmt(r, t));
  const sum = (r) => { let h = 0, s = 0, exits = 0; for (const b of (r.dream || {}).built || []) { const x = AD.dream[b.k]; if (!x) continue; h += x.h + (b.by === 'M' && x.h > 0 ? 1 : 0); s += x.s + (b.by === 'K' && x.s > 0 ? 1 : 0); if (b.k === 'exit') exits++; } return { h, s, exits }; };
  const stats = (r) => { const st = {}; for (const k in SM) st[k] = Math.max(...roles(r).map((q) => r.players[q].stats[SM[k]] || 0)); return st; };
  const locked = (r, role, o) => o[7] && (o[7][0] === 'bond' ? r.bond < o[7][1] : (r.players[role].stats[SM[o[7][0]]] || 0) < o[7][1]);
  return {
    built: (r, k) => ((r.dream || {}).built || []).some((b) => b.k === k),
    build(r, role, k) { (r.dream = r.dream || { built: [] }).built.push({ k, by: role }); const x = sum(r); log(r, { t: 'sys', text: `꿈세계 — 행복 ${x.h} · 안전 ${x.s}${x.exits ? ' · 비상구 있음' : ''}` }); },
    // 잠들 때: 안전이 높으면 균열이 아문다. 행복만 쌓고 안전이 없으면 균열이 벌어진다. (비상구 없는 성)
    tick(r) { const x = sum(r); if (x.s >= 3 && r.rift > 0) { r.rift--; log(r, { t: 'sys', text: '꿈세계의 안전이 균열을 얇게 메웠다 — 균열 −1' }); } else if (x.h >= 6 && x.s === 0) { r.rift = Math.min(10, r.rift + 1); log(r, { t: 'gm', text: '아름답지만 나갈 문이 없는 성이다. 어딘가에서 금이 가는 소리가 들린다. (균열 +1)' }); } },
    // 하루가 지날 때: 편지가 오고, 옛 이벤트 엔진이 일상 사건을 하나 고른다. 판정은 TRPG 규칙(d20)으로 자동 진행.
    daily(r, bch) {
      const ach = CHMAP[bch]; if (ach == null) return;
      if (r.evCh !== bch) { r.evCh = bch; r.evDay = 0; } r.evDay++;
      for (const L of AD.letters) if (L.ch === ach && L.d === r.evDay) log(r, { t: 'gm', text: F(r, `[편지 · ${L.from}] ${L.t}`) });
      const st = stats(r), ar = { ch: ach, day: r.evDay, bond: Math.min(AD.bondCap[ach], Math.max(AD.bondFloor[ach], r.bond)), done: r.evDone = r.evDone || [], recent: r.evRecent = r.evRecent || [], tried: {}, clue: Array(r.clues | 0).fill(0), flags: r.flags, p: { mor: { st }, kya: { st } } };
      const e = AE.forced(ar) || AE.choose(ar, null, true); if (!e) return;
      const role = e.who === 'm' ? 'M' : e.who === 'k' ? 'K' : pick(active(r)); if (!r.players[role]) return;
      ar.done.push(e.id); ar.recent.push(e.id); if (ar.recent.length > 4) ar.recent.shift();
      log(r, { t: 'gm', text: F(r, `〈${e.title}〉 ${e.scene}`) });
      r.ev = { id: e.id, title: e.title, role, opts: e.opts.map((o) => ({ label: o[0], stat: SM[o[1]] || 'INS', dc: o[2], ok: o[3], fail: o[4], bOk: o[5], bNo: o[6], lock: o[7], flag: o[8] })) };
      if (!r.players[role].token) this.resolveEv(r, null);      // 상대 자리가 비어 있으면(솔로 동행자) 능력치에 맞는 선택을 자동으로
    },
    // 대기 중인 사건 해결: i 가 null 이면 동행자가 가장 승산 있는 선택지를 고른다. 판정은 d20.
    resolveEv(r, i) {
      const v = r.ev; if (!v) return; const p = r.players[v.role];
      const open = v.opts.map((o, k) => [o, k]).filter(([o]) => !locked(r, v.role, [0, 0, 0, 0, 0, 0, 0, o.lock]));
      const pickd = i == null ? open.reduce((a, c) => ((p.stats[c[0].stat] || 0) - c[0].dc > (p.stats[a[0].stat] || 0) - a[0].dc ? c : a), open[0]) : open.find(([, k]) => k === i);
      if (!pickd) return; const o = pickd[0]; r.ev = null;
      const x = roll(r, v.role, o.stat, o.dc, false), good = x.deg === 'ok' || x.deg === 'crit';
      log(r, { t: 'act', ex: 1, role: v.role, name: p.name, label: o.label, check: x, text: F(r, good ? o.ok : o.fail) });
      r.bond = Math.max(0, Math.min(100, r.bond + (good ? o.bOk : o.bNo))); if (o.flag) r.flags[o.flag] = 1;
    },
    evView(r) { const v = r.ev; if (!v) return null; const sc = AE.byId[v.id]; return { title: v.title, scene: F(r, sc ? sc.scene : ''), role: v.role, opts: v.opts.map((o, k) => ({ i: k, label: F(r, o.label), stat: o.stat, dc: o.dc, lock: !!locked(r, v.role, [0, 0, 0, 0, 0, 0, 0, o.lock]) })) }; },
    // 꿈세계 전용 화면용 데이터
    dreamView(r) { const x = sum(r), have = (r.dream || {}).built || []; return { h: x.h, s: x.s, exits: x.exits, built: have, items: Object.entries(AD.dream).map(([k, d]) => ({ k, n: d.n, d: d.d, h: d.h, s: d.s, by: (have.find((b) => b.k === k) || {}).by || null })) }; },
    summary(r) { const x = sum(r); log(r, { t: 'sys', text: `이야기의 끝 — 유대 ${r.bond} · 마음 ${r.heart} · 증표 ${(r.kept || []).length}개 · 꿈세계 행복 ${x.h}/안전 ${x.s}${x.exits ? ' (비상구 있음)' : ''}` }); },
  };
};
