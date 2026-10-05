// 단어 발음 듣기
// 1순위: 미리 녹음한 소리 파일(app/audio/<단어>.wav) — 어떤 폰·브라우저에서도, 인터넷 없이도 재생
// 2순위: 기기 내장 음성(Web Speech API) — 녹음 파일이 아직 없는 새 단어용
import { playFile, preload } from './sound.js';

export function audioUrl(text) {
  const slug = String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `audio/${slug}.wav`;
}

const tts = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
let utterance = null; // 크롬에서 재생 중에 사라지지 않도록 붙잡아 둔다

function pickVoice() {
  const voices = tts?.getVoices() ?? [];
  const en = (v) => /^en[-_]/i.test(v.lang);
  return (
    voices.find((v) => en(v) && /us/i.test(v.lang) && /samantha|google|aria|jenny/i.test(v.name)) ??
    voices.find((v) => en(v) && /us/i.test(v.lang)) ??
    voices.find(en) ??
    null
  );
}

function ttsSpeak(text) {
  if (!tts) return;
  if (tts.speaking || tts.pending) tts.cancel();
  utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.85;
  const v = pickVoice();
  if (v) utterance.voice = v;
  tts.speak(utterance);
}

// 버튼은 항상 보여준다 (녹음 파일 또는 기기 음성 중 하나로 재생)
export function canSpeak() {
  return true;
}

export function preloadWord(text) {
  preload(audioUrl(text));
}

/**
 * @param {string} text
 * @param {number} [delaySec]  효과음 뒤에 이어서 읽도록 지연
 */
export async function speak(text, delaySec = 0) {
  const ok = await playFile(audioUrl(text), delaySec);
  if (!ok) {
    if (delaySec) setTimeout(() => ttsSpeak(text), delaySec * 1000);
    else ttsSpeak(text);
  }
}
