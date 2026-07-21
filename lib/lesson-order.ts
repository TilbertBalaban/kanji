/**
 * Lesson batch ordering.
 *
 * WaniKani's default ordering is "Ascending Level then Subject": every radical
 * in a level before its first kanji, every kanji before its first vocabulary.
 * That order is fine without a cap, but combined with a daily lesson limit it
 * turns a radical-heavy level into days of nothing but radicals — level 4
 * alone ships 36 of them, so a 10/day limit spends ~4 days on radicals before
 * surfacing a single kanji. WaniKani's answer is an "Interleave Lessons"
 * option (a checkbox in its Lesson Picker) that spreads the types across each
 * batch instead; both orders live here, chosen per-user by
 * UserProgress.interleaveLessons.
 */

// vocabulary and kana_vocabulary are one bucket — WaniKani presents both as
// "vocabulary" and they sit at the same depth in the unlock chain.
const TYPE_ORDER: Record<string, number> = {
  radical: 0,
  kanji: 1,
  vocabulary: 2,
  kana_vocabulary: 2,
};

const BUCKET_COUNT = 3;

function bucketOf(type: string): number {
  return TYPE_ORDER[type] ?? BUCKET_COUNT - 1;
}

export interface OrderableLesson {
  subject: { level: number; type: string; lessonPosition: number };
}

/** WaniKani's default: level asc, then radical → kanji → vocab, then position. */
export function sortByLevelThenType<T extends OrderableLesson>(lessons: T[]): T[] {
  return [...lessons].sort((a, b) => {
    const sa = a.subject;
    const sb = b.subject;
    return (
      sa.level - sb.level ||
      bucketOf(sa.type) - bucketOf(sb.type) ||
      sa.lessonPosition - sb.lessonPosition
    );
  });
}

/**
 * WaniKani's "Interleave Lessons": the items are "proportionally distributed
 * and arranged so that you get a mix of item types in each batch".
 *
 * Proportional, not equal-share — a type's share of any slice matches its
 * share of the whole pool, so 5 radicals among 44 lessons are spread thinly
 * across the run rather than fed one-per-batch until they run out. Each item
 * takes the midpoint of its slot: the k-th of n items of a type sits at
 * (k + 0.5) / n, and sorting every item by that position spreads each type
 * evenly over the sequence in proportion to how many there are.
 *
 * Buckets stay in default order internally, so lower levels still drain first
 * within a type (leftover level-3 vocab precedes level-4 vocab). Ties break
 * toward radicals, then kanji, keeping components ahead of what they unlock
 * when they land in the same slot.
 */
export function interleaveByType<T extends OrderableLesson>(lessons: T[]): T[] {
  const sorted = sortByLevelThenType(lessons);
  const buckets: T[][] = Array.from({ length: BUCKET_COUNT }, () => []);
  for (const lesson of sorted) buckets[bucketOf(lesson.subject.type)].push(lesson);

  const placed = buckets.flatMap((bucket, bucketIndex) =>
    bucket.map((lesson, index) => ({
      lesson,
      position: (index + 0.5) / bucket.length,
      bucketIndex,
      index,
    })),
  );
  placed.sort(
    (a, b) =>
      a.position - b.position ||
      a.bucketIndex - b.bucketIndex ||
      a.index - b.index,
  );
  return placed.map((p) => p.lesson);
}

/** Apply the user's configured lesson ordering to the full pending pool. */
export function orderLessons<T extends OrderableLesson>(
  lessons: T[],
  interleave: boolean,
): T[] {
  return interleave ? interleaveByType(lessons) : sortByLevelThenType(lessons);
}
