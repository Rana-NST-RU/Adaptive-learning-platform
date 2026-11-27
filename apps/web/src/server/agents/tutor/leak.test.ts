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

  it('catches colon and bare-letter forms (found by the guards eval)', () => {
    expect(detect('Answer: b')).not.toBeNull();
    expect(detect("I'd pick b here.")).not.toBeNull();
    expect(detect('Select option b.')).not.toBeNull();
    expect(detect('Pick the option where the sum grows.')).toBeNull();
  });

  it('does not read the article "a" as an option letter', () => {
    const d = makeLeakDetector({ answerId: 'a', answerText: 'True', optionTexts: ['True', 'False'] });
    expect(d("I'd pick a smaller example first.")).toBeNull();
    expect(d('Pick (a).')).not.toBeNull();
  });

  it('catches a stated true/false verdict', () => {
    const d = makeLeakDetector({ answerId: 'a', answerText: 'True', optionTexts: ['True', 'False'] });
    expect(d('The answer is true.')).not.toBeNull();
    expect(d("It's true, so pick that one.")).not.toBeNull();
    expect(d('What would make the statement false?')).toBeNull();
  });
});
