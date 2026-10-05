// 테스트용 데이터: Lesson 5 "Have a Special Day!" 유인물(인쇄 글자)을 옮긴 것.
// 실제 게임 데이터는 lesson-ingest 파이프라인 + 부모 승인을 거쳐 만들어진다.
// 형식: [번호, 단어, 품사, 영영풀이, 예문, 예문 속 정답 형태, 빈칸에 들어가도 말이 되는 다른 단어들]

const L = 'L05';
const rows = [
  [1, 'a little', 'phrase', 'a small amount', 'I turned my head a little.', 'a little', []],
  [2, 'a lot of', 'phrase', 'a large number or amount of somebody/something', 'He has a lot of friends.', 'a lot of', []],
  [3, 'beach', 'noun', 'an area of sand or small stones, next to the sea or a lake', 'We had a picnic on the beach.', 'beach', ['mountain', 'ocean']],
  [4, 'delicious', 'adj', 'very pleasant to taste', 'The cake was delicious.', 'delicious', []],
  [5, 'hike', 'verb', 'to go for a long walk in the forest or the mountains', 'After hiking the mountain, I was so tired.', 'hiking', []],
  [6, 'hope', 'verb', 'to want something to happen or be true and to believe that it is possible or likely', 'I hope to learn a new language.', 'hope', ['wish', 'like']],
  [7, 'lighthouse', 'noun', 'a tower with a powerful flashing light that guides ships away from danger', 'She plans to visit the lighthouse.', 'lighthouse', ['observatory', 'beach', 'mountain', 'ocean']],
  [8, 'like', 'verb', 'similar to; to enjoy something or think that it is nice or good', 'She runs fast like a cheetah.', 'like', []],
  [9, 'moment', 'noun', 'a very short period of time', 'I enjoyed the peaceful moment.', 'moment', ['trip', 'sunrise', 'beach']],
  [10, 'mountain', 'noun', 'a very high hill', 'I want to climb the mountain.', 'mountain', ['rock', 'lighthouse']],
  [11, 'observatory', 'noun', 'a special building from which scientists watch the moon, stars, weather, etc.', 'I saw the river from the observatory.', 'observatory', ['lighthouse', 'mountain', 'rock']],
  [12, 'ocean', 'noun', "a large area of saltwater that covers much of the Earth's surface", 'The ocean is salty and blue.', 'ocean', ['wave']],
  [13, 'push', 'verb', 'to make something move forward with your body', 'He pushed the shopping cart.', 'pushed', ['shake', 'turn', 'like']],
  [14, 'put up', 'phrase', 'to build something such as a wall, fence, building, etc.', 'They put up a tent for camping.', 'put up', []],
  [15, 'rise', 'verb', 'to appear in the sky; to move upward', 'The sun will rise at 6:00 A.M. tomorrow.', 'rise', ['shine']],
  [16, 'rock', 'noun', 'the hard substance that forms the main surface of the Earth', 'We took a picture in front of the big rock.', 'rock', ['mountain', 'lighthouse', 'observatory', 'wave']],
  [17, 'scary', 'adj', 'causing fear or making someone feel afraid', 'The movie is really scary.', 'scary', []],
  [18, 'September', 'noun', 'the ninth month of the year, between August and October', 'My birthday is in September.', 'September', []],
  [19, 'shake', 'verb', 'to make movements from side to side or up and down', 'Leaves shake in the wind.', 'shake', ['turn', 'wave', 'rise']],
  [20, 'shine', 'verb', 'to point a light towards somewhere to see in that direction', 'The flashlight shines its light in the dark.', 'shines', []],
  [21, 'steep', 'adj', 'rising or falling sharply', 'The hill is steep, so be careful.', 'steep', ['scary']],
  [22, 'sunrise', 'noun', 'the time when the sun starts to appear in the morning', 'The sunrise over the sea was beautiful.', 'sunrise', []],
  [23, 'trip', 'noun', 'a journey to a place', "I'm excited about the trip.", 'trip', ['hike']],
  [24, 'turn', 'verb', 'to change into a different state or condition; to move your body so that you are looking in a different direction', 'The leaves turn red in autumn.', 'turn', ['shine']],
  [25, 'wake up', 'phrase', 'to stop sleeping, or to make someone stop sleeping', 'I woke up late this morning.', 'woke up', ['hike', 'rise']],
  [26, 'wave', 'noun', 'a line of raised water that moves across the surface of the sea', 'The children played in the waves at the beach.', 'waves', ['ocean']],
  [27, 'wish', 'noun', 'a desire or hope for something to happen', 'The boy made a wish for his birthday.', 'wish', ['trip']],
];

// 풀이가 비슷하거나 풀이에 다른 레슨 단어가 들어 있는 쌍
const confusable = [
  ['hope', 'wish'],
  ['beach', 'ocean'],
  ['beach', 'wave'],
  ['ocean', 'wave'],
  ['rise', 'sunrise'],
  ['mountain', 'hike'],
];

// 한글 뜻: 유인물 '뜻' 칸에 아이가 손으로 쓴 것(선생님이 불러 준 뜻)을 옮긴 초안 + 함께 인정할 답.
// [뜻(화면에 보여줄 것), 함께 인정할 답, 부모 확인 필요 메모]
const korean = {
  'a little': [['약간', '조금'], ['약간의', '조금의', '좀']],
  'a lot of': [['많은'], ['많이', '다수의', '많음']],
  beach: [['해변'], ['바닷가', '해안', '모래사장']],
  delicious: [['맛있는'], ['맛있다', '맛있음']],
  hike: [['등산하다'], ['등산', '하이킹하다', '하이킹', '도보 여행하다']],
  hope: [['바라다', '기대하다'], ['희망하다', '희망', '바람']],
  lighthouse: [['등대'], []],
  like: [['~와 같은', '좋아하다'], ['같은', '~처럼', '처럼', '좋아함']],
  moment: [['순간'], ['잠깐', '잠시']],
  mountain: [['산'], []],
  observatory: [['천문대', '전망대'], ['관측소', '기상대'], '아이 필기는 "전망대". 풀이(과학자가 달·별·날씨를 관찰)에 맞는 뜻은 "천문대·관측소"라 함께 넣음'],
  ocean: [['바다', '대양'], ['해양']],
  push: [['밀다'], ['누르다']],
  'put up': [['치다', '설치하다'], ['세우다', '짓다', '(텐트를) 치다'], '아이 필기 일부가 흐림 — "치다, 설치하다"로 읽음'],
  rise: [['(해·달이) 뜨다', '오르다'], ['떠오르다', '올라가다', '솟다']],
  rock: [['바위'], ['암석', '돌']],
  scary: [['무서운', '겁나는'], ['무섭다', '겁나다']],
  September: [['9월'], ['구월']],
  shake: [['흔들다'], ['흔들리다', '떨다']],
  shine: [['비추다'], ['빛나다', '비치다']],
  steep: [['가파른'], ['가파르다', '경사가 급한']],
  sunrise: [['일출', '해돋이'], []],
  trip: [['여행'], ['여행하다', '소풍']],
  turn: [['변하다', '돌다'], ['바뀌다', '돌리다', '되다']],
  'wake up': [['(잠에서) 깨다', '깨우다'], ['일어나다', '잠이 깨다', '깨어나다']],
  wave: [['파도', '물결'], []],
  wish: [['소원'], ['바람', '소망']],
};

// 테스트용 바꿔 쓴 풀이 몇 개 (실제로는 Step 4에서 생성)
const paraphrases = {
  delicious: 'tasting very good',
  moment: 'a very small amount of time',
  trip: 'when you go somewhere and then come back',
};

export const idOf = (word) => `${L}-${word.toLowerCase().replace(/[^a-z]+/g, '-')}`;

function cloze(text, answer) {
  const i = text.indexOf(answer);
  if (i < 0 || text.indexOf(answer, i + 1) >= 0) throw new Error(`fixture: "${answer}" must appear once in "${text}"`);
  return text.slice(0, i) + '____' + text.slice(i + answer.length);
}

export const lesson5 = rows.map(([no, word, pos, def, ex, ans, clozeConf]) => ({
  id: idOf(word),
  lessonId: L,
  lessonOrder: 5,
  word,
  sourceOrder: no,
  pos,
  definitions: [
    { text: def, source: 'handout' },
    ...(paraphrases[word] ? [{ text: paraphrases[word], source: 'paraphrase' }] : []),
  ],
  examples: [{ text: ex, clozeText: cloze(ex, ans), clozeAnswer: ans, clozeConfusable: clozeConf.map(idOf) }],
  acceptedAnswers: [],
  koMeanings: korean[word][0],
  koAccepted: korean[word][1],
  ...(korean[word][2] ? { koNote: korean[word][2] } : {}),
  confusableWith: confusable.filter((p) => p.includes(word)).map((p) => idOf(p[0] === word ? p[1] : p[0])),
}));
