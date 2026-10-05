// 테스트용 데이터: 실제 Lesson 5 원본(tools/lessons/L05.mjs)을 그대로 쓴다.
import L05 from '../../tools/lessons/L05.mjs';
import { buildLesson, slugOf } from '../../tools/lesson-builder.mjs';

export const idOf = (word) => `L05-${slugOf(word)}`;
export const lesson5 = buildLesson(L05).words;
