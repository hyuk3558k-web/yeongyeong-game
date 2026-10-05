// 게임이 끝날 때 보여주는 칭찬과 힘이 나는 한마디
// 칭찬은 점수보다 "꾸준함·반복·끝까지 함"에 맞춘다. 명언은 출처가 분명한 것만 쓴다.

export const QUOTES = [
  { en: 'Slow and steady wins the race.', ko: '천천히, 꾸준히 가는 사람이 경주에서 이긴다.', by: '이솝 우화' },
  { en: 'Practice makes perfect.', ko: '연습이 완벽을 만든다.', by: '영어 속담' },
  { en: "Rome wasn't built in a day.", ko: '로마는 하루아침에 이루어지지 않았다.', by: '영어 속담' },
  { en: 'Little by little, one travels far.', ko: '조금씩 조금씩, 그렇게 멀리 간다.', by: '스페인 속담' },
  { en: 'A journey of a thousand miles begins with a single step.', ko: '천 리 길도 한 걸음부터.', by: '노자, 《도덕경》' },
  { en: 'Dripping water hollows out stone.', ko: '떨어지는 물방울이 바위를 뚫는다.', by: '오비디우스' },
  { en: 'Fall seven times, stand up eight.', ko: '일곱 번 넘어지면 여덟 번 일어나라.', by: '일본 속담' },
  { en: "Where there's a will, there's a way.", ko: '뜻이 있는 곳에 길이 있다.', by: '영어 속담' },
  { en: 'Well begun is half done.', ko: '시작이 반이다.', by: '영어 속담' },
  { en: 'No pain, no gain.', ko: '노력 없이는 얻는 것도 없다.', by: '영어 속담' },
  { en: 'Many a little makes a mickle.', ko: '티끌 모아 태산.', by: '영어 속담' },
  { en: 'Knowledge is power.', ko: '아는 것이 힘이다.', by: '프랜시스 베이컨' },
  { en: 'The more that you read, the more things you will know.', ko: '많이 읽을수록 더 많이 알게 된다.', by: '닥터 수스' },
  { en: 'Tomorrow is another day.', ko: '내일은 또 내일의 해가 뜬다.', by: '마거릿 미첼, 《바람과 함께 사라지다》' },
  { en: 'Success is the sum of small efforts, repeated day in and day out.', ko: '성공은 날마다 되풀이한 작은 노력들의 합이다.', by: '로버트 콜리어' },
  { en: 'Is it not a pleasure to learn and to practice what you have learned?', ko: '배우고 때때로 익히면 또한 기쁘지 아니한가.', by: '공자, 《논어》' },
  { en: 'Every day is a new beginning.', ko: '매일은 새로운 시작이다.', by: '영어 격언' },
  { en: 'Mistakes are proof that you are trying.', ko: '실수는 노력하고 있다는 증거다.', by: '영어 격언' },
  { en: 'Step by step, day by day.', ko: '한 걸음씩, 하루하루.', by: '영어 격언' },
  { en: 'Every expert was once a beginner.', ko: '모든 전문가도 한때는 초보였다.', by: '영어 격언' },
];

// 지난번과 다른 명언을 고른다
export function pickQuote(rng, lastIndex = -1) {
  if (QUOTES.length < 2) return 0;
  let i;
  do {
    i = Math.floor(rng() * QUOTES.length);
  } while (i === lastIndex);
  return i;
}

const pickOne = (rng, arr) => arr[Math.floor(rng() * arr.length)];

/**
 * 오늘의 칭찬 두 문장
 * @param {object} c
 * @param {number} c.streak        연속 출석 일수(오늘 포함)
 * @param {number} c.ratio         한 번에 맞힌 비율 0~1
 * @param {number} c.improved      어제 틀렸는데 오늘 맞힌 단어 수
 * @param {number} c.asked         오늘 푼 문항 수
 * @param {number|null} c.planDay  계획 학습 일차(없으면 null)
 * @param {boolean} c.planDone     레슨 5일 계획을 오늘 끝냈는가
 * @param {() => number} rng
 */
export function praiseFor({ streak = 1, ratio = 0, improved = 0, asked = 0, planDay = null, planDone = false }, rng = Math.random) {
  const lines = [];
  if (planDone) {
    lines.push('5일 계획을 끝까지 해냈어요! 이 레슨 단어는 이제 진짜 내 것이 되고 있어요.');
  } else if (improved > 0) {
    lines.push(`어제 틀렸던 단어 ${improved}개를 오늘은 맞혔어요. 반복한 보람이 바로 이거예요!`);
  } else if (ratio === 1) {
    lines.push(pickOne(rng, ['하나도 안 틀렸어요! 정말 완벽해요.', '전부 정답! 꾸준히 한 실력이 보여요.']));
  } else if (ratio < 0.5) {
    lines.push(pickOne(rng, [
      '어려운 날에도 끝까지 해낸 게 제일 멋져요. 틀린 단어는 내일 또 만나면 돼요.',
      '틀린 만큼 더 많이 배운 거예요. 오늘 본 정답이 내일 기억날 거예요.',
    ]));
  } else {
    lines.push(pickOne(rng, [
      `오늘도 ${asked}문제를 끝까지 풀었어요. 정말 잘했어요!`,
      '오늘도 해냈어요! 조금씩 쌓이는 게 느껴지죠?',
      '집중해서 끝까지 푼 모습, 아주 멋져요!',
    ]));
  }

  if (streak >= 7) lines.push(`벌써 ${streak}일 연속이에요! 이렇게 매일 하는 힘이 진짜 실력이 돼요.`);
  else if (streak >= 2) lines.push(`${streak}일째 꾸준히 하고 있어요. 내일도 영영이가 기다릴게요!`);
  else if (planDay && planDay < 5) lines.push(`내일은 ${planDay + 1}일차예요. 내일도 같이 해요!`);
  else lines.push('오늘 시작한 한 걸음이 내일의 큰 힘이 돼요.');
  return lines;
}
