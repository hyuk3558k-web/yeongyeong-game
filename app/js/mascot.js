// 마스코트 '영영이' (오리지널 아기 부엉이). mood: normal | happy | cheer | oops | sleepy
const INK = '#1F2A44';

function eyes(mood) {
  if (mood === 'happy' || mood === 'cheer') {
    return `<path d="M35 60 Q44 49 53 60" fill="none" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/>
            <path d="M67 60 Q76 49 85 60" fill="none" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/>`;
  }
  if (mood === 'sleepy') {
    return `<path d="M36 59 Q44 64 52 59" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
            <path d="M68 59 Q76 64 84 59" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`;
  }
  const look = mood === 'oops' ? 4 : 1; // oops: 아래를 봄
  return `<circle cx="44" cy="57" r="14" fill="#fff" stroke="${INK}" stroke-width="3"/>
          <circle cx="76" cy="57" r="14" fill="#fff" stroke="${INK}" stroke-width="3"/>
          <circle cx="45" cy="${57 + look}" r="6.5" fill="${INK}"/>
          <circle cx="77" cy="${57 + look}" r="6.5" fill="${INK}"/>
          <circle cx="47.5" cy="${54 + look}" r="2.2" fill="#fff"/>
          <circle cx="79.5" cy="${54 + look}" r="2.2" fill="#fff"/>`;
}

function extras(mood) {
  if (mood === 'cheer') {
    return `<path d="M14 30 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z" fill="#FFD54A" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
            <path d="M101 22 l2.5 5.5 5.5 2.5 -5.5 2.5 -2.5 5.5 -2.5 -5.5 -5.5 -2.5 5.5 -2.5z" fill="#8CC8FF" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`;
  }
  if (mood === 'oops') {
    return `<path d="M95 34 q5 8 0 12 q-5 -4 0 -12z" fill="#8CC8FF" stroke="${INK}" stroke-width="2"/>`;
  }
  if (mood === 'sleepy') {
    return `<text x="92" y="30" font-family="Nunito, sans-serif" font-weight="900" font-size="16" fill="${INK}">z</text>
            <text x="102" y="18" font-family="Nunito, sans-serif" font-weight="900" font-size="12" fill="${INK}">z</text>`;
  }
  return '';
}

function wings(mood) {
  if (mood === 'cheer') {
    return `<path d="M22 70 Q4 52 12 38 Q24 50 30 66z" fill="#F5C33B" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
            <path d="M98 70 Q116 52 108 38 Q96 50 90 66z" fill="#F5C33B" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`;
  }
  return `<path d="M22 70 Q14 86 26 98 Q30 84 30 72z" fill="#F5C33B" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
          <path d="M98 70 Q106 86 94 98 Q90 84 90 72z" fill="#F5C33B" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`;
}

export function mascotSvg(mood = 'normal', label = '영영이') {
  return `<svg class="mascot" viewBox="0 0 120 120" role="img" aria-label="${label}" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="60" cy="114" rx="30" ry="4" fill="${INK}" opacity=".12"/>
    <path d="M36 34 Q22 26 17 12 Q31 15 44 27z M84 34 Q98 26 103 12 Q89 15 76 27z" fill="#F5C33B" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    ${wings(mood)}
    <path d="M60 22 C88 22 102 44 102 70 C102 96 84 110 60 110 C36 110 18 96 18 70 C18 44 32 22 60 22z" fill="#FFD54A" stroke="${INK}" stroke-width="3"/>
    <path d="M60 46 C50 36 27 38 26 57 C25 74 44 80 60 71 C76 80 95 74 94 57 C93 38 70 36 60 46z" fill="#FFE89A"/>
    <path d="M47 38 Q52 41 56 46 M73 38 Q68 41 64 46" fill="none" stroke="#E9A800" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M40 84 C40 72 80 72 80 84 C80 100 70 106 60 106 C50 106 40 100 40 84z" fill="#FFF1C2"/>
    <path d="M50 86 l4 4 4 -4 M62 86 l4 4 4 -4 M56 96 l4 4 4 -4" fill="none" stroke="#E9A800" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
    <ellipse cx="31" cy="74" rx="7" ry="4.5" fill="#FF8B7B" opacity=".55"/>
    <ellipse cx="89" cy="74" rx="7" ry="4.5" fill="#FF8B7B" opacity=".55"/>
    ${eyes(mood)}
    <path d="M55 70 L65 70 L60 79z" fill="#FF8B7B" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M46 109 q4 6 8 0 M66 109 q4 6 8 0" fill="#FF8B7B" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
    ${extras(mood)}
  </svg>`;
}
