// 발음 듣기 (기기 내장 Web Speech API). 영어 목소리가 없는 기기에서는 버튼을 숨긴다.

const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
let voice = null;

function pickVoice() {
  const voices = window.speechSynthesis.getVoices();
  voice =
    voices.find((v) => v.lang === 'en-US' && /samantha|google us|aria|jenny/i.test(v.name)) ??
    voices.find((v) => v.lang === 'en-US') ??
    voices.find((v) => v.lang?.startsWith('en')) ??
    null;
}

if (supported) {
  pickVoice();
  window.speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
}

export function canSpeak() {
  return supported && (voice !== null || window.speechSynthesis.getVoices().length === 0);
}

export function speak(text) {
  if (!supported) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = 0.85;
  if (voice) u.voice = voice;
  window.speechSynthesis.speak(u);
}
