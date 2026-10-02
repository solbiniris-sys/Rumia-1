// 루미아 — 정해진 서사(오리진). 분기 없이 한 줄로 흐르며, 증표는 해당 장면을 지날 때 떠오른다.
module.exports = {
  linear: true,
  keepsakes: [
    { id: 'polaris', scene: 'tower', icon: 'luck', n: '북극성의 약속', text: '처녀자리 대신 북극성이 걸려 있던 밤. 길을 잃지 않으려고 올려다보던 별 아래서 두 사람은 약속했다. 언젠가 다시 보자, 지금의 밤하늘을 보러 돌아오자.', hint: '천문탑의 첫 밤에 떠오른다.' },
    { id: 'names', scene: 'starname', icon: 'pen', n: '별자리 씨, 나비', text: '서로에게 붙여 준 이름. 수많은 이름 가운데서도 끝까지 남은 두 개.', hint: '이름을 붙이던 날에 떠오른다.' },
    { id: 'ring', scene: 'ring', icon: 'herb', n: '꽃반지', text: '밟혀도 다시 피는 풀꽃으로 엮은 반지. 꽃밭에는 루미아라는 이름이 남았다.', hint: '꽃밭에서 떠오른다.' },
    { id: 'wind', scene: 'sea', icon: 'lake', n: '바닷바람', text: '수평선 너머에서 불어오던 바람, 다시 만나자고 말하던 목소리와 맞잡은 손의 온기.', hint: '바다에 닿으면 떠오른다.' },
    { id: 'remember', scene: 'graduation', icon: 'hp', n: '날 잊지 마', text: '이전의 나로 돌아갈 수 없어도, 내가 이름 붙인 나비는 어디로 날아가든 나비다. 그 말은 부탁이 아니라 이미 맡겨진 일이었다.', hint: '졸업의 문턱에서 떠오른다.' },
    { id: 'home', scene: 'home', icon: 'gate', n: '집에 가자', text: '누구를 뒤쫓지도, 무엇을 되찾으러 가지도 않고. 그저 집으로.', hint: '아직 닿지 않은 이야기.' },
  ],
};
