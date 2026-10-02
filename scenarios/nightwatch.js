// 예시 시나리오 「등불 없는 서고」 — 시나리오 북 작성 예시를 겸한다. (분기 · 판정 성공/실패 · 조건 선택지 · 아이템)
// 필드 요약:  scene{ title, kicker, text(문자열|배열), choices: 배열(공통) 또는 {역할키:[...]}, next, if, give, dc, ending }
//            choice{ label, stat, dc, tag, req:{item,flag,bond,stat:{INS:4}}, ok:{text,fx,goto}, fail:{text,fx,goto}, say, fx, goto }
//            fx{ bond, heart, hp, mind, luck, xp, give:'아이템키', flag:'플래그' }
module.exports = {
  id: 'nightwatch', title: '등불 없는 서고 (예시)', blurb: '짧은 데모. 판정·분기·역극을 확인해 보세요. 시나리오 작성 예시를 겸합니다.',
  roles: {
    A: { name: '탐사자', sub: '서고의 문을 연 사람', color: '#8fb3d9', preset: { MAG: 2, INS: 4, WIL: 3, CHA: 2, AGI: 4 } },
    B: { name: '길잡이', sub: '지도를 가진 사람', color: '#d9b36b', preset: { MAG: 4, INS: 3, WIL: 3, CHA: 3, AGI: 2 } },
  },
  items: { lamp: { name: '꺼진 등불', desc: '심지가 젖어 있다. 불을 붙이면 서고의 그림자가 달라질 것 같다.' }, key: { name: '놋쇠 열쇠', desc: '이름 대신 별 모양이 새겨져 있다.' } },
  gm: ['서가 사이로 종이 넘기는 소리가 지나간다.', '바닥의 먼지가 두 사람의 발자국 모양으로 갈라져 있다.'],
  start: 'door',
  scenes: {
    door: { title: '잠기지 않은 문', kicker: '프롤로그', text: ['폐쇄된 서고의 문은 열쇠 구멍 대신 손자국 모양의 홈이 파여 있다.', '안쪽에서 희미한 공기가 흘러나온다. 오래된 종이와 비 냄새.'],
      choices: [
        { label: '문틈을 자세히 살핀다', stat: 'INS', dc: 11, ok: { text: '홈 아래 눌린 먼지의 방향이 읽힌다. 누군가 이 문을 안에서 닫았다.', fx: { flag: 'inside', xp: 1 }, goto: 'hall' }, fail: { text: '아무것도 보이지 않는다. 대신 손끝에 가시가 박혔다.', fx: { hp: -1 }, goto: 'hall' } },
        { label: '주문을 속삭여 문을 연다', stat: 'MAG', dc: 13, ok: { text: '홈이 소리 없이 물러난다. 문이 스스로 열린다.', fx: { give: 'key' }, goto: 'hall' }, fail: { text: '주문이 되튀어 마음이 한 번 흔들렸다.', fx: { mind: -1 }, goto: 'hall' } },
        { label: '그냥 밀어 본다', stat: 'AGI', dc: 9, say: '…열렸다.', goto: 'hall' },
      ] },
    hall: { title: '서가의 복도', kicker: '1막', text: '천장까지 닿는 서가 사이로 좁은 통로가 갈라진다. 왼쪽 끝에는 불 꺼진 등불이 걸려 있고, 오른쪽 끝에서는 무언가 규칙적으로 두드리는 소리가 난다.',
      choices: [
        { label: '등불을 가져온다', stat: 'AGI', dc: 10, ok: { text: '등불이 손에 들어온다. 유리에 비친 얼굴이 한 박자 늦게 웃는다.', fx: { give: 'lamp' }, goto: 'tap' }, fail: { text: '발을 헛디뎌 서가에 기댄다. 책 몇 권이 떨어진다.', goto: 'tap' } },
        { label: '두드리는 소리를 따라간다', stat: 'WIL', dc: 12, ok: { text: '소리 쪽으로 걸을수록 오히려 마음이 가라앉는다.', goto: 'tap', fx: { xp: 1 } }, fail: { text: '소리가 심장 박동과 겹친다. 호흡이 흐트러진다.', fx: { mind: -2 }, goto: 'tap' } },
      ] },
    tap: { title: '두드리는 것', kicker: '1막', text: '서가 끝, 책상 위에 노란 장부가 놓여 있다. 장부를 두드리는 것은 펜을 쥔 손 모양의 그림자뿐이다. 그림자는 두 사람이 다가오자 멈추고 장부를 가리킨다.',
      choices: {
        A: [{ label: '그림자에게 말을 건다', stat: 'CHA', dc: 12, ok: { text: '그림자가 고개를 끄덕인다. 장부의 첫 장이 저절로 넘어간다.', fx: { bond: 1, flag: 'talk' }, goto: 'ledger' }, fail: { text: '그림자가 움찔 물러난다. 장부가 덮인다.', goto: 'ledger' } },
            { label: '등불에 불을 붙인다', req: { item: 'lamp' }, stat: 'MAG', dc: 10, ok: { text: '불빛에 그림자의 윤곽이 드러난다. 사람의 것이었다.', fx: { flag: 'seen', xp: 1 }, goto: 'ledger' }, fail: { text: '불꽃이 튀어 그림자가 사라졌다.', goto: 'ledger' } }],
        B: [{ label: '장부의 글자를 읽는다', stat: 'INS', dc: 12, ok: { text: '이름과 날짜. 오늘 날짜 아래에 두 사람의 이름이 이미 적혀 있다.', fx: { flag: 'named' }, goto: 'ledger' }, fail: { text: '글씨가 번져 읽히지 않는다.', goto: 'ledger' } },
            { label: '열쇠를 장부 표지의 별에 맞춘다', req: { item: 'key' }, stat: 'AGI', dc: 9, ok: { text: '별이 돌아가며 장부의 잠금이 풀린다.', fx: { flag: 'seen', xp: 1 }, goto: 'ledger' }, fail: { text: '열쇠가 헛돈다.', goto: 'ledger' } }],
      } },
    ledger: { title: '마지막 장', kicker: '2막', text: '장부의 마지막 장에는 빈 줄이 하나 남아 있다. 펜이 놓여 있다. 이 장면부터는 두 사람이 직접 이야기를 이어 가는 역극 구간이다. 아래 입력창으로 대사와 행동을 적어 보세요.',
      choices: [
        { label: '빈 줄에 이름을 적는다', stat: 'WIL', dc: 12, ok: { text: '펜 끝이 종이에 닿는 순간 서고의 소리가 모두 멈춘다.', fx: { bond: 1, xp: 2 }, goto: 'outro' }, fail: { text: '손이 떨려 잉크가 번졌다. 그래도 이름은 읽을 수 있다.', fx: { mind: -1 }, goto: 'outro' } },
        { label: '펜을 내려놓고 서고를 나간다', say: '오늘은 여기까지.', goto: 'outro' },
      ] },
    outro: { title: '문 밖에서', kicker: '에필로그', text: '문이 닫힌다. 서고는 다시 아무도 없던 것처럼 조용하다. 다음 시나리오 파일을 추가하면 이 서고는 더 깊어진다.', ending: true },
  },
};
