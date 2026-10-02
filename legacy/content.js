// content.js — 이벤트 로더. ch1.js ~ ch7.js (학년별 파일)를 읽어 D.events 를 채운다. 파일이 없으면 건너뛴다.
//
// 장별 파일 작성법:  module.exports = (D, { M, m, o }) => { M(...); m(...); };
//   M(누구, 제목, 지문, [선택지...], 메타)  굵직한 사건(한 번만 나오고, 늦어지면 반드시 나옴)
//   m(누구, 제목, 지문, [선택지...], 메타)  일반 사건(소진되면 다시 나올 수 있음)
//   o(라벨, 능력치, 난이도, 성공문, 실패문, 성공시유대, 실패시유대, 잠금, 플래그)
//     잠금: ['능력치', n] 또는 ['bond', n]      플래그: 이 선택지를 고르면 켜지는 값 (엔딩 판정에 쓰임)
//   누구: 'b'=둘 중 아무나, 'm'=모르포, 'k'=케야티
//   메타: { loc:'train|hall|library|tower|garden|lake|dorm|stairs|village', b:[최소,최대 유대], d:[최소일차,최대일차], day:고정일차,
//          need:['먼저 일어나야 하는 사건 제목'], not:['일어났으면 사라지는 사건 제목'], once:1,
//          st:['능력치',n], cl:단서수, fl:'켜진 플래그', nofl:'꺼져 있어야 하는 플래그',
//          pr:['약속id:약속 문장'] (사건이 시작되면 약속이 생김), keep:'약속id' (그 약속이 지켜짐), nm:['이름 장부에 적힐 문장'] }
//   텍스트 치환: {M}=모르포 {K}=케야티, 조사 \"이(가) 은(는) 을(를) 와(과) 으로(로)\" 는 자동 보정
const fs = require('fs'), path = require('path');

module.exports = D => {
  D.traits = { // 이름: [올라가는 능력치, 선택 가능한 캐릭터]
    '꿈 이야기꾼': ['상상', 'mor'], '질문 많은 박사': ['호기심', 'mor'], '행복을 나누는 사람': ['다정', 'mor'],
    '빈틈없는 수첩': ['관찰', 'kya'], '우산을 챙기는 사람': ['신중', 'kya'], '먼저 달려가는 사람': ['용기', 'kya'],
  };
  D.events = D.chapters.map(() => []);

  const o = (a, s, dc, t, f, b = 2, c = 0, lock = null, flag = null) => [a, s, dc, t, f, b, c, lock, flag];
  const add = (ch, maj, who, title, scene, opts, meta = {}) => { const e = { ch, maj: maj ? 1 : 0, who, title, scene, opts, ...meta }; D.events[ch].push(e); return e; };

  const loaded = [], re = /^ch([1-7])[a-z]*\.js$/;
  fs.readdirSync(__dirname).filter(f => re.test(f)).sort().forEach(f => {
    const ch = Number(f.match(re)[1]) - 1;
    require(path.join(__dirname, f))(D, { M: (...a) => add(ch, 1, ...a), m: (...a) => add(ch, 0, ...a), o });
    loaded.push(f);
  });
  console.log(`[content] 불러온 장별 파일: ${loaded.join(', ') || '(없음)'}`);

  D.events.forEach(list => list.forEach(e => (e.id = `${e.ch}:${e.title}`)));
  const all = D.events.flat();
  const findId = (ch, t) => (all.find(x => x.ch === ch && x.title === t) || all.find(x => x.title === t) || {}).id;
  all.forEach(e => {
    ['need', 'not'].forEach(k => { if (e[k]) e[k] = e[k].map(t => findId(e.ch, t) || (() => { throw new Error(`${k} 를 찾을 수 없음: '${e.title}' → '${t}'`); })()); });
    if (!e.b) e.b = e.ch === 0 ? [0, D.bondCap[0]] : [Math.max(0, D.bondFloor[e.ch] - 8), 100];
    if (e.pr && !Array.isArray(e.pr)) e.pr = [e.pr];
    if (e.nm && !Array.isArray(e.nm)) e.nm = [e.nm];
  });
  D.events.forEach((list, ch) => { // d 없는 굵직한 사건은 장 전체에 고르게 배치
    const majors = list.filter(e => e.maj && !e.d && !e.day);
    majors.forEach((e, i) => (e.d = [1 + Math.round(i * (D.len[ch] - 8) / Math.max(1, majors.length - 1))]));
  });
  // 해금 조건에 쓰인 사건이 실제로 있는지 검사 (오타 방지)
  Object.values(D.dream).forEach(s => { if (s.u && s.u[0] === 'ev' && !all.some(e => e.id === s.u[1])) throw new Error('꿈세계 해금 사건 없음: ' + s.u[1]); });
};
