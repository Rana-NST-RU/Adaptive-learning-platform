import { describe, expect, it } from 'vitest';
import { makeLeakDetector } from './leak';

const detect = makeLeakDetector({
  answerId: 'b',
  answerText: 'Move the left pointer one step right',
  optionTexts: [
    'Move the right pointer one step left',
    'Move the left pointer one step right',
    'Move both pointers one step inward',
    'Restart with the left pointer at 0',
  ],
});

describe('tutor leak guard', () => {
  it('passes Socratic guidance', () => {
    expect(detect('What happens to the sum if you move the left pointer? Which direction makes it bigger?')).toBeNull();
    expect(detect('Think about option (a): what does it do to the sum?')).toBeNull(); // discussing a wrong option is fine
    expect(detect('It’s a sorted array, so values grow as you move right.')).toBeNull();
  });

  it('catches the correct option text, even with formatting', () => {
    expect(detect('You should **move the left pointer one step right**.')).not.toBeNull();
  });

  it('catches the option letter', () => {
    expect(detect('The answer is (b).')).not.toBeNull();
    expect(detect('The correct option is b')).not.toBeNull();
    expect(detect('Go with (b).')).not.toBeNull();
    expect(detect('Option B is right.')).not.toBeNull();
  });

  it('ignores short answers that are substrings of wrong options', () => {
    const d = makeLeakDetector({ answerId: 'a', answerText: 'O(n)', optionTexts: ['O(n)', 'O(n log n)', 'O(1)', 'O(n²)'] });
    expect(d('Is it O(n) or O(n log n)? Count the loop iterations.')).toBeNull();
    expect(d('The answer is (a).')).not.toBeNull();
  });
});
