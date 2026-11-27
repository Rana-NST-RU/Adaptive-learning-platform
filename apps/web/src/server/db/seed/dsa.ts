// ─────────────────────────────────────────────────────────────────────────────
// Seed course: DSA Foundations. Hand-written so the platform is fully usable
// with no API key. Every wrong option is tagged with the misconception it
// represents, so a wrong MCQ answer is a free diagnosis.
// Agent-generated items join this bank later and are calibrated the same way.
// ─────────────────────────────────────────────────────────────────────────────

export interface SeedItem {
  level: 1 | 2 | 3 | 4 | 5;
  stem: string;
  code?: string;
  /** [text, misconceptionId | null, feedback?] — exactly one has misconception `null` and is the answer. */
  options: Array<[string, string | null, string?]>;
  explanation: string;
  hints: [string, string];
}

export interface SeedConcept {
  slug: string;
  name: string;
  summary: string;
  prerequisites: string[];
  objectives: string[];
  misconceptions: Array<{ id: string; description: string }>;
  lesson: string;
  items: SeedItem[];
}

export const DSA_COURSE = {
  slug: 'dsa-foundations',
  title: 'DSA Foundations',
  description:
    'Core data structures and algorithmic patterns for interviews and real code: complexity, arrays, hashing, two pointers, sliding window, stacks, binary search, recursion, linked lists, trees, graph traversal and dynamic programming.',
  goal: 'Solve common data-structure and algorithm problems confidently',
};

export const DSA_CONCEPTS: SeedConcept[] = [
  {
    slug: 'big-o',
    name: 'Big-O complexity',
    summary: 'Describing how running time and memory grow with input size, ignoring constants and lower-order terms.',
    prerequisites: [],
    objectives: ['Derive the time complexity of loops and nested loops', 'Drop constants and non-dominant terms'],
    misconceptions: [
      { id: 'bigo-constants', description: 'Thinks constant factors (2n, n/2) change the Big-O class' },
      { id: 'bigo-nested-add', description: 'Adds nested loop costs instead of multiplying them' },
    ],
    lesson:
      'Big-O tells you how cost **grows** as input size n grows. Count the operations as a function of n. Then keep only the fastest-growing term and drop constants: 3n² + 5n + 7 → O(n²). Sequential steps **add** (O(n) + O(n) = O(n)), and nested loops **multiply** (n × n = O(n²)).',
    items: [
      {
        level: 1,
        stem: 'What is the time complexity of a single loop that runs from 0 to n − 1 and does constant work each iteration?',
        options: [
          ['O(1)', 'bigo-constants', 'The work per iteration is constant, but the loop runs n times.'],
          ['O(n)', null],
          ['O(n²)', 'bigo-nested-add', 'There is only one loop, so nothing is nested.'],
          ['O(log n)', 'bigo-constants', 'The counter increases by 1, not by doubling.'],
        ],
        explanation: 'The body runs n times and each run costs O(1), so the total is O(n).',
        hints: ['How many times does the loop body execute?', 'n iterations × constant work each = ?'],
      },
      {
        level: 3,
        stem: 'What is the time complexity of this function?',
        code: 'def f(n):\n    total = 0\n    for i in range(n):\n        for j in range(n):\n            total += i * j\n    for k in range(n):\n        total += k\n    return total',
        options: [
          ['O(n)', 'bigo-constants', 'The nested loops do n work for each of n values of i.'],
          ['O(2n)', 'bigo-nested-add', 'Nested loops multiply, and constants are dropped in Big-O anyway.'],
          ['O(n²)', null],
          ['O(n² + n) and this cannot be simplified', 'bigo-constants', 'Lower-order terms are dropped: n² + n is O(n²).'],
        ],
        explanation: 'The nested loops cost n·n = n², and the last loop costs n. n² + n simplifies to O(n²).',
        hints: ['Handle the nested part and the final loop separately.', 'Which term dominates as n grows: n² or n?'],
      },
      {
        level: 4,
        stem: 'A loop starts with i = 1 and doubles i each iteration until i ≥ n. What is its time complexity?',
        options: [
          ['O(n)', 'bigo-constants', 'i doesn’t step through every value; it jumps by doubling.'],
          ['O(log n)', null],
          ['O(n log n)', 'bigo-nested-add', 'There is only one loop and no inner work proportional to n.'],
          ['O(√n)', 'bigo-constants', 'Doubling reaches n after log₂ n steps, not √n.'],
        ],
        explanation: 'After k iterations i = 2^k. The loop stops when 2^k ≥ n, so k ≈ log₂ n.',
        hints: ['Write down i after 1, 2, 3, … iterations.', 'Solve 2^k = n for k.'],
      },
    ],
  },
  {
    slug: 'arrays',
    name: 'Arrays & indexing',
    summary: 'Contiguous memory with O(1) random access and O(n) insertion/deletion in the middle.',
    prerequisites: [],
    objectives: ['Know the cost of access, search, insert and delete', 'Avoid off-by-one errors with zero-based indexing'],
    misconceptions: [
      { id: 'array-insert-o1', description: 'Thinks inserting in the middle of an array is O(1)' },
      { id: 'array-off-by-one', description: 'Confuses length with last valid index (zero-based indexing)' },
    ],
    lesson:
      'An array stores elements side by side in memory, so `a[i]` is computed directly: **O(1) access**. Inserting or deleting in the middle has to shift every later element: **O(n)**. Indexes start at 0, so the last element of an array of length n is at index **n − 1**.',
    items: [
      {
        level: 1,
        stem: 'In a zero-indexed array of length 8, what is the index of the last element?',
        options: [
          ['8', 'array-off-by-one', 'Index 8 would be the 9th element, which is out of bounds.'],
          ['7', null],
          ['9', 'array-off-by-one', 'Indexes run from 0 to length − 1.'],
          ['−1', 'array-off-by-one', 'Some languages allow a[-1] as a shortcut, but the actual index is 7.'],
        ],
        explanation: 'Indexes run from 0 to n − 1, so for n = 8 the last index is 7.',
        hints: ['What index does the first element have?', 'If the first is 0, the 8th element is at…'],
      },
      {
        level: 2,
        stem: 'What is the worst-case time to insert an element at index 0 of a dynamic array holding n elements?',
        options: [
          ['O(1)', 'array-insert-o1', 'Every existing element has to shift right by one position.'],
          ['O(log n)', 'array-insert-o1', 'There is no halving here. All n elements move.'],
          ['O(n)', null],
          ['O(n²)', 'array-insert-o1', 'Each element moves once, so the cost is linear, not quadratic.'],
        ],
        explanation: 'Inserting at the front shifts all n elements one slot to the right: O(n).',
        hints: ['Where do the existing elements go?', 'How many elements must move?'],
      },
      {
        level: 3,
        stem: 'Appending to a dynamic array (like Python lists or Java ArrayList) occasionally triggers an O(n) resize. What is the amortized cost per append?',
        options: [
          ['O(n), because resizes copy everything', 'array-insert-o1', 'Resizes are rare (capacity doubles), so their cost averages out.'],
          ['O(1)', null],
          ['O(log n)', 'array-insert-o1', 'The total copying over n appends is O(n), which is O(1) per append.'],
          ['It depends on the element type', 'array-off-by-one', 'Element type doesn’t change the growth strategy.'],
        ],
        explanation: 'Doubling capacity means the copies total about 2n over n appends, so the amortized cost is O(1) per append.',
        hints: ['How often does a resize happen if capacity doubles?', 'Add up all copy work over n appends.'],
      },
    ],
  },
  {
    slug: 'hashing',
    name: 'Hash maps & sets',
    summary: 'Key → value lookup in expected O(1) time using a hash function and buckets.',
    prerequisites: ['arrays'],
    objectives: ['Use a hash map to trade memory for speed', 'Know expected vs worst-case costs'],
    misconceptions: [
      { id: 'hash-ordered', description: 'Assumes hash maps keep keys in sorted order' },
      { id: 'hash-worst-o1', description: 'Thinks hash lookups are O(1) even in the worst case' },
    ],
    lesson:
      'A hash map turns a key into an array index with a **hash function**, which gives **expected O(1)** insert and lookup. Collisions (two keys landing in the same bucket) are handled by chaining or probing. In the worst case, when many keys collide, a lookup degrades to O(n). Hash maps do **not** keep keys sorted.',
    items: [
      {
        level: 2,
        stem: 'You need to check whether any two numbers in an unsorted array sum to a target. Which approach is O(n) expected time?',
        options: [
          ['Check every pair with two nested loops', 'hash-worst-o1', 'Nested loops over pairs are O(n²).'],
          ['Sort, then binary search for each element’s complement', 'hash-ordered', 'Sorting already costs O(n log n).'],
          ['One pass, storing seen numbers in a hash set and checking target − x', null],
          ['Use a hash map, then iterate its keys in sorted order', 'hash-ordered', 'Hash maps don’t keep keys sorted, and you don’t need order here.'],
        ],
        explanation: 'For each x, check whether target − x is already in the set (expected O(1)), then add x. That is n expected-O(1) steps.',
        hints: ['For each number, what other number would you need?', 'Which structure answers “have I seen this?” fastest?'],
      },
      {
        level: 3,
        stem: 'What is the worst-case time of a lookup in a hash map that uses chaining?',
        options: [
          ['O(1), since hash maps are always constant time', 'hash-worst-o1', 'O(1) is the expected time. If every key collides, one chain holds all n keys.'],
          ['O(n)', null],
          ['O(log n)', 'hash-ordered', 'A basic chained bucket is a list, not a balanced tree.'],
          ['O(n²)', 'hash-worst-o1', 'Scanning a single chain is linear.'],
        ],
        explanation: 'If all keys hash to the same bucket, the lookup scans a chain of n entries: O(n). Good hash functions make this extremely unlikely.',
        hints: ['What happens if every key lands in the same bucket?', 'How long is that bucket’s chain?'],
      },
      {
        level: 2,
        stem: 'True or false: iterating over a standard hash map returns keys in ascending sorted order.',
        options: [
          ['True', 'hash-ordered', 'Order follows bucket layout or insertion order, depending on the language, never sorted order.'],
          ['False', null],
        ],
        explanation: 'Hash maps order keys by hash bucket (or by insertion order in some languages). Use a tree map or sort explicitly if you need sorted keys.',
        hints: ['How does a hash function choose where a key goes?', 'Does a hash function preserve ordering?'],
      },
    ],
  },
  {
    slug: 'two-pointers',
    name: 'Two pointers',
    summary: 'Moving two indexes through a sequence (often from both ends of a sorted array) to avoid nested loops.',
    prerequisites: ['arrays'],
    objectives: ['Recognise when sortedness lets you discard candidates', 'Implement the converging-pointers pattern'],
    misconceptions: [
      { id: 'tp-unsorted', description: 'Applies converging two pointers to unsorted data' },
      { id: 'tp-move-both', description: 'Moves both pointers every step instead of the one that improves the sum' },
    ],
    lesson:
      'In a **sorted** array, put pointer L at the start and R at the end. If a[L] + a[R] is too small, move **L right** (the only way to increase the sum). If it is too big, move **R left**. Each step discards one candidate, so the whole scan is **O(n)** instead of O(n²).',
    items: [
      {
        level: 2,
        stem: 'In a sorted array, a[L] + a[R] is smaller than the target. Which pointer should move?',
        options: [
          ['Move R left', 'tp-move-both', 'That makes the sum even smaller.'],
          ['Move L right', null],
          ['Move both inward', 'tp-move-both', 'Moving R left could skip the answer. Only one pointer should move.'],
          ['Restart with L = 0', 'tp-unsorted', 'Every pair with the current L and a smaller R is already too small, so there is no need to restart.'],
        ],
        explanation: 'Moving L right increases a[L] (the array is sorted), which is the only move that can increase the sum.',
        hints: ['Which move makes the sum bigger?', 'The array is sorted ascending.'],
      },
      {
        level: 3,
        stem: 'Why does converging two pointers find a pair summing to the target in a sorted array in O(n)?',
        options: [
          ['Each move rules out one element that cannot be part of any pair', null],
          ['It checks every pair, just in a faster order', 'tp-move-both', 'It never checks most pairs. It rules them out in bulk.'],
          ['Sorting makes every pair sum unique, so one pass works', 'tp-unsorted', 'Duplicates are possible; sortedness is used to discard candidates.'],
          ['It runs a binary search inside the loop for each element', 'tp-unsorted', 'There is no binary search. Each pointer moves by one.'],
        ],
        explanation: 'When the sum is too small, a[L] can’t pair with any remaining element, so L advances. Symmetrically, R retreats when the sum is too large. At most n moves are made.',
        hints: ['What can you conclude about a[L] when the sum is too small?', 'How many total moves can the pointers make?'],
      },
      {
        level: 4,
        stem: 'You want two numbers that sum to a target in an UNSORTED array, and you must return their original indexes. Which is the best approach?',
        options: [
          ['Converging two pointers directly on the unsorted array', 'tp-unsorted', 'The pointer moves are only justified when the array is sorted.'],
          ['Hash map from value to index in one pass', null],
          ['Sort, then use two pointers, returning the indexes in the sorted array', 'tp-unsorted', 'Sorting loses the original indexes unless you track them, and it costs O(n log n).'],
          ['Two pointers, moving both on each step', 'tp-move-both', 'This skips valid pairs, and the data still isn’t sorted.'],
        ],
        explanation: 'A one-pass hash map runs in O(n) expected time and keeps original indexes. Two pointers need sorted input.',
        hints: ['What property does two pointers rely on?', 'Which structure remembers where each value was?'],
      },
    ],
  },
  {
    slug: 'sliding-window',
    name: 'Sliding window',
    summary: 'Maintaining a contiguous window and updating it incrementally as it slides, instead of recomputing.',
    prerequisites: ['two-pointers', 'hashing'],
    objectives: ['Compute window aggregates in O(1) per step', 'Grow/shrink a variable-size window with a validity condition'],
    misconceptions: [
      { id: 'sw-recompute', description: 'Recomputes the whole window each step (O(n·k))' },
      { id: 'sw-noncontiguous', description: 'Uses sliding window for non-contiguous subsets' },
    ],
    lesson:
      'For problems about **contiguous** subarrays or substrings, keep a window [L, R]. When R moves right, add the new element. When L moves right, remove the old one. Updating incrementally makes each step O(1), and the total is **O(n)**. For a variable-size window, expand R, then shrink L while the window is invalid.',
    items: [
      {
        level: 2,
        stem: 'Max sum of any k consecutive elements: how should you update the sum when the window slides one step right?',
        options: [
          ['Re-add all k elements in the new window', 'sw-recompute', 'That is O(k) per step. Only two elements change.'],
          ['Add the entering element and subtract the leaving element', null],
          ['Sort the window and take the top k', 'sw-noncontiguous', 'The window must stay contiguous and already holds exactly k elements.'],
          ['Use a hash map of all sums seen so far', 'sw-recompute', 'You don’t need history, only the current window sum.'],
        ],
        explanation: 'sum += a[R] − a[R − k]. Each slide is O(1), so the whole scan is O(n).',
        hints: ['Which elements differ between two neighbouring windows?', 'Only two elements change.'],
      },
      {
        level: 3,
        stem: 'Longest substring without repeating characters: when the new character at R is already inside the window, what should happen?',
        options: [
          ['Reset the window to start at R', 'sw-recompute', 'This throws away valid characters. Move L just past the previous occurrence instead.'],
          ['Move L to one past the previous occurrence of that character (if it is inside the window)', null],
          ['Skip that character and continue', 'sw-noncontiguous', 'Skipping breaks contiguity, and a substring must be contiguous.'],
          ['Restart scanning from L + 1 and recount everything', 'sw-recompute', 'Recounting makes it O(n²). Use a map of last-seen positions.'],
        ],
        explanation: 'Store the last index of each character. On a repeat inside the window, set L = lastSeen[c] + 1. Each index moves forward only, so the scan is O(n).',
        hints: ['Which part of the window is still valid?', 'A map of character → last index helps.'],
      },
      {
        level: 4,
        stem: 'Which problem is NOT a good fit for the sliding-window pattern?',
        options: [
          ['Smallest subarray with sum ≥ S (all numbers positive)', 'sw-noncontiguous', 'That is a classic variable-size window.'],
          ['Longest substring with at most K distinct characters', 'sw-noncontiguous', 'That is a classic window plus a hash map of counts.'],
          ['Largest subset (any elements, not contiguous) whose sum ≤ S', null],
          ['Maximum average of any length-k subarray', 'sw-recompute', 'A fixed-size window solves it in O(n).'],
        ],
        explanation: 'A subset is non-contiguous, so there is no window to slide. That problem calls for sorting/greedy or DP, depending on the exact constraint.',
        hints: ['What does every sliding-window problem share?', 'Look for the one that isn’t contiguous.'],
      },
    ],
  },
  {
    slug: 'stacks-queues',
    name: 'Stacks & queues',
    summary: 'LIFO and FIFO containers that power parsing, undo, BFS and monotonic patterns.',
    prerequisites: ['arrays'],
    objectives: ['Choose LIFO vs FIFO for a task', 'Use a stack to match brackets'],
    misconceptions: [
      { id: 'sq-lifo-fifo', description: 'Mixes up LIFO (stack) and FIFO (queue)' },
      { id: 'sq-list-queue', description: 'Uses list.pop(0) as an O(1) dequeue' },
    ],
    lesson:
      'A **stack** is LIFO: the last item pushed is the first popped (undo, call stack, bracket matching). A **queue** is FIFO: the first item in is the first out (task scheduling, BFS). In Python, `list.pop(0)` is O(n). Use `collections.deque` for O(1) operations at both ends.',
    items: [
      {
        level: 1,
        stem: 'You push 1, 2, 3 onto a stack and then pop once. What do you get?',
        options: [
          ['1', 'sq-lifo-fifo', 'That is queue (FIFO) behaviour.'],
          ['3', null],
          ['2', 'sq-lifo-fifo', 'The top of the stack is the most recently pushed item.'],
          ['All three, in order 1 2 3', 'sq-lifo-fifo', 'Pop removes one item, from the top.'],
        ],
        explanation: 'Stacks are last-in, first-out, so the last pushed (3) is popped first.',
        hints: ['Which item went in last?', 'LIFO = last in, first out.'],
      },
      {
        level: 2,
        stem: 'Which data structure checks whether a string of brackets like "([]{})" is balanced most naturally?',
        options: [
          ['Queue', 'sq-lifo-fifo', 'The most recent opening bracket must close first, which is LIFO.'],
          ['Stack', null],
          ['Hash set', 'sq-lifo-fifo', 'A set loses the nesting order.'],
          ['Sorted array', 'sq-lifo-fifo', 'Sorting destroys the order you need to check.'],
        ],
        explanation: 'Push opening brackets. On a closing bracket, pop and check that it matches. The string is balanced if every closer matches and the stack ends empty.',
        hints: ['Which opening bracket must be closed first?', 'The most recent one, so you want LIFO.'],
      },
      {
        level: 3,
        stem: 'In Python, what is the cost of `queue.pop(0)` on a list of n items, and what should you use instead?',
        options: [
          ['O(1); lists are fine as queues', 'sq-list-queue', 'pop(0) shifts every remaining element left.'],
          ['O(n); use collections.deque.popleft()', null],
          ['O(log n); use heapq', 'sq-list-queue', 'heapq is a priority queue, not FIFO.'],
          ['O(1); but use a set for speed', 'sq-lifo-fifo', 'Sets are unordered and can’t act as queues.'],
        ],
        explanation: 'Removing from the front of a list shifts n − 1 elements. deque supports O(1) appends and pops at both ends.',
        hints: ['What happens to the other elements after removing index 0?', 'Which standard container is double-ended?'],
      },
    ],
  },
  {
    slug: 'binary-search',
    name: 'Binary search',
    summary: 'Halving a sorted search space each step to find a target or boundary in O(log n).',
    prerequisites: ['arrays', 'big-o'],
    objectives: ['Write an off-by-one-safe binary search', 'Search for the first index satisfying a condition'],
    misconceptions: [
      { id: 'bs-unsorted', description: 'Applies binary search to unsorted / non-monotonic data' },
      { id: 'bs-infinite-loop', description: 'Updates bounds with mid instead of mid ± 1, causing infinite loops' },
    ],
    lesson:
      'Binary search needs a **sorted** array or a **monotonic** condition (false…false, true…true). Keep [lo, hi], check the middle, and discard the half that can’t contain the answer. Each step halves the range, so the cost is **O(log n)**. Watch the bounds: with `while lo <= hi`, update `lo = mid + 1` or `hi = mid − 1`.',
    items: [
      {
        level: 2,
        stem: 'What is the maximum number of comparisons binary search needs on a sorted array of 1,000,000 elements (approximately)?',
        options: [
          ['About 20', null],
          ['About 1,000', 'bs-unsorted', '√n would be ~1,000, but binary search halves the range each step.'],
          ['About 500,000', 'bs-unsorted', 'That is linear search’s average, not binary search.'],
          ['About 6', 'bs-infinite-loop', 'log₁₀ is ~6, but each step halves (base 2).'],
        ],
        explanation: 'log₂(1,000,000) ≈ 20, because 2²⁰ ≈ 1,048,576.',
        hints: ['Each comparison halves the remaining range.', '2¹⁰ ≈ 1,000.'],
      },
      {
        level: 3,
        stem: 'What is the bug in this binary search?',
        code: 'def search(a, x):\n    lo, hi = 0, len(a) - 1\n    while lo <= hi:\n        mid = (lo + hi) // 2\n        if a[mid] < x:\n            lo = mid\n        elif a[mid] > x:\n            hi = mid - 1\n        else:\n            return mid\n    return -1',
        options: [
          ['`lo = mid` should be `lo = mid + 1`; otherwise it can loop forever', null],
          ['`while lo <= hi` should be `while lo < hi`', 'bs-infinite-loop', 'With inclusive bounds, `<=` is correct.'],
          ['mid should be computed as (lo + hi) / 2 with float division', 'bs-infinite-loop', 'Indexes must be integers.'],
          ['The array must be reversed first', 'bs-unsorted', 'The array is assumed sorted ascending, which is correct.'],
        ],
        explanation: 'When hi = lo + 1 and a[mid] < x, setting lo = mid leaves the range unchanged, which is an infinite loop. mid itself is excluded, so use lo = mid + 1.',
        hints: ['Try lo = 0, hi = 1, x larger than a[0].', 'Does the range shrink on every iteration?'],
      },
      {
        level: 4,
        stem: 'Which problem can be solved with binary search even though there is no sorted array?',
        options: [
          ['Find the minimum ship capacity that ships all packages within D days', null],
          ['Find the most frequent element in an unsorted list', 'bs-unsorted', 'Frequency isn’t monotonic over any search space here, so use a hash map.'],
          ['Find any duplicate in an unsorted list in one pass', 'bs-unsorted', 'A hash set does this in one pass.'],
          ['Reverse a linked list', 'bs-unsorted', 'There is nothing to search.'],
        ],
        explanation: 'Feasibility is monotonic in capacity: if capacity C works, every C′ > C works too. Binary search on the answer finds the smallest feasible capacity.',
        hints: ['Binary search needs monotonicity, not necessarily an array.', 'If a capacity works, does a larger one work too?'],
      },
    ],
  },
  {
    slug: 'recursion',
    name: 'Recursion',
    summary: 'Solving a problem in terms of smaller instances of itself, with base cases that stop the descent.',
    prerequisites: ['big-o'],
    objectives: ['Identify base case and recursive case', 'Analyse recursion depth and call count'],
    misconceptions: [
      { id: 'rec-no-base', description: 'Omits or misplaces the base case' },
      { id: 'rec-calls-linear', description: 'Assumes a function with two recursive calls is O(n)' },
    ],
    lesson:
      'A recursive function has a **base case** (answer directly) and a **recursive case** (reduce toward the base case). Each call takes stack space, so the maximum depth is the memory cost. With **two** calls per level, the call tree can grow exponentially. Naive Fibonacci is O(2ⁿ).',
    items: [
      {
        level: 2,
        stem: 'What happens when you call this function with n = 3?',
        code: 'def countdown(n):\n    print(n)\n    countdown(n - 1)',
        options: [
          ['Prints 3 2 1, then stops at the base case', 'rec-no-base', 'Nothing stops it at 0. There is no base case.'],
          ['Prints 3 2 1 0 and stops', 'rec-no-base', 'There is no condition to stop at 0 either.'],
          ['Recurses forever until the stack overflows', null],
          ['Prints 3 once and returns', 'rec-no-base', 'The recursive call runs unconditionally.'],
        ],
        explanation: 'Without a base case, the calls continue with −1, −2, … until the recursion limit is exceeded.',
        hints: ['When does the function stop calling itself?', 'Look for an if statement.'],
      },
      {
        level: 3,
        stem: 'What is the time complexity of the naive recursive Fibonacci `fib(n) = fib(n-1) + fib(n-2)`?',
        options: [
          ['O(n)', 'rec-calls-linear', 'Each call makes two more calls, so the tree branches.'],
          ['O(n²)', 'rec-calls-linear', 'Growth is exponential, not polynomial.'],
          ['O(2ⁿ)', null],
          ['O(log n)', 'rec-calls-linear', 'Nothing is halved here.'],
        ],
        explanation: 'The call tree roughly doubles each level, giving exponential calls (tightly about O(φⁿ)). Memoization brings it down to O(n).',
        hints: ['Draw the call tree for fib(5).', 'How many children does each node have?'],
      },
      {
        level: 3,
        stem: 'What is the space complexity (call-stack depth) of a recursive function that sums a list by calling itself on list[1:]?',
        options: [
          ['O(1)', 'rec-no-base', 'Each pending call occupies a stack frame.'],
          ['O(n)', null],
          ['O(log n)', 'rec-calls-linear', 'The list shrinks by one each call, not by half.'],
          ['O(2ⁿ)', 'rec-calls-linear', 'There is only one recursive call per level.'],
        ],
        explanation: 'There are n nested calls before the base case, so the depth is O(n). Slicing also copies, so total time and memory traffic are O(n²). Passing an index avoids that.',
        hints: ['How many calls are waiting when the base case is reached?', 'What does list[1:] cost?'],
      },
    ],
  },
  {
    slug: 'linked-lists',
    name: 'Linked lists',
    summary: 'Nodes connected by pointers: O(1) insertion at a known node, O(n) access by index.',
    prerequisites: ['arrays'],
    objectives: ['Reverse a linked list in place', 'Detect cycles with fast/slow pointers'],
    misconceptions: [
      { id: 'll-random-access', description: 'Thinks linked lists support O(1) access by index' },
      { id: 'll-lose-next', description: 'Overwrites next before saving it when relinking' },
    ],
    lesson:
      'A linked list is a chain of nodes, each pointing to the next. Reaching the i-th node means walking from the head: **O(n)**. Inserting after a node you already hold is **O(1)**. When relinking (for example, reversing), **save `next` first** or you lose the rest of the list.',
    items: [
      {
        level: 1,
        stem: 'What is the cost of accessing the k-th element of a singly linked list?',
        options: [
          ['O(1)', 'll-random-access', 'Nodes aren’t contiguous, so you must follow k pointers.'],
          ['O(k)', null],
          ['O(log k)', 'll-random-access', 'There is no index structure to binary-search.'],
          ['O(1) if the list is sorted', 'll-random-access', 'Sortedness doesn’t give random access.'],
        ],
        explanation: 'You walk k pointers from the head: O(k), which is O(n) in the worst case.',
        hints: ['How do you get from the head to the second node?', 'Repeat that k times.'],
      },
      {
        level: 3,
        stem: 'When reversing a singly linked list iteratively, what must you do before setting `curr.next = prev`?',
        options: [
          ['Save `nxt = curr.next`', null],
          ['Set `prev = curr`', 'll-lose-next', 'Order matters: if you overwrite curr.next before saving it, the rest of the list is lost.'],
          ['Set `curr = curr.next`', 'll-lose-next', 'You need the saved pointer to advance safely after relinking.'],
          ['Nothing, the order doesn’t matter', 'll-lose-next', 'Without saving it, the reference to the remaining list disappears.'],
        ],
        explanation: 'Loop: nxt = curr.next; curr.next = prev; prev = curr; curr = nxt. Saving nxt first keeps the remainder reachable.',
        hints: ['What does curr.next point to before you change it?', 'Will you still need that node?'],
      },
      {
        level: 4,
        stem: 'With Floyd’s cycle detection, slow moves 1 step and fast moves 2. Why must they meet if there is a cycle?',
        options: [
          ['Inside the cycle, the gap between them shrinks by 1 each step', null],
          ['Fast eventually reaches the end of the list', 'll-random-access', 'With a cycle there is no end.'],
          ['Because fast visits every node twice', 'll-lose-next', 'The argument is about relative speed, not visit counts.'],
          ['They only meet if the cycle length is even', 'll-random-access', 'They meet for any cycle length.'],
        ],
        explanation: 'Once both are in the cycle, fast gains one node per step on slow. The gap goes k, k−1, …, 0, so they meet within one lap.',
        hints: ['Think about the distance between them inside the loop.', 'How does that distance change each step?'],
      },
    ],
  },
  {
    slug: 'trees',
    name: 'Binary trees & BSTs',
    summary: 'Hierarchical nodes with up to two children; BSTs keep left < node < right for O(h) search.',
    prerequisites: ['recursion', 'linked-lists'],
    objectives: ['Traverse in-, pre- and post-order', 'Relate BST operations to tree height'],
    misconceptions: [
      { id: 'tree-bst-always-log', description: 'Assumes BST operations are always O(log n)' },
      { id: 'tree-traversal-order', description: 'Confuses in-order, pre-order and post-order' },
    ],
    lesson:
      'Binary-tree traversals: **pre-order** (node, left, right), **in-order** (left, node, right) and **post-order** (left, right, node). In a BST, in-order traversal yields **sorted** values. Search costs **O(h)**, where h is the height: log n if balanced, but **n if degenerate** (for example, after inserting already-sorted data).',
    items: [
      {
        level: 2,
        stem: 'Which traversal of a binary search tree visits the values in sorted ascending order?',
        options: [
          ['Pre-order', 'tree-traversal-order', 'Pre-order visits the root before its left subtree.'],
          ['In-order', null],
          ['Post-order', 'tree-traversal-order', 'Post-order visits the root last.'],
          ['Level-order', 'tree-traversal-order', 'Level-order goes by depth, not by value.'],
        ],
        explanation: 'In-order visits left (smaller), then the node, then right (larger), which gives ascending order.',
        hints: ['Where are smaller values in a BST?', 'Visit the smaller side first, then the node.'],
      },
      {
        level: 3,
        stem: 'You insert 1, 2, 3, 4, 5 (in that order) into an empty, non-self-balancing BST. What is the search cost now?',
        options: [
          ['O(log n)', 'tree-bst-always-log', 'Sorted inserts make a chain (height n), not a balanced tree.'],
          ['O(n)', null],
          ['O(1)', 'tree-bst-always-log', 'You still walk from the root.'],
          ['O(n log n)', 'tree-bst-always-log', 'A single search walks one path.'],
        ],
        explanation: 'Each new value goes to the right of the previous one, forming a linked-list-like chain of height n.',
        hints: ['Draw the tree after inserting 1, 2, 3.', 'What is its height?'],
      },
      {
        level: 4,
        stem: 'To free every node of a tree safely (children before parent), which traversal should you use?',
        options: [
          ['Pre-order', 'tree-traversal-order', 'That frees the parent first, losing access to its children.'],
          ['In-order', 'tree-traversal-order', 'That frees the node before its right subtree is processed.'],
          ['Post-order', null],
          ['Any order works', 'tree-traversal-order', 'Freeing a parent first loses the child pointers.'],
        ],
        explanation: 'Post-order processes both subtrees before the node, so children are released before their parent.',
        hints: ['When do you still need the parent node?', 'You need it until both children are done.'],
      },
    ],
  },
  {
    slug: 'bfs-dfs',
    name: 'BFS & DFS',
    summary: 'Exploring graphs breadth-first (queue, shortest unweighted paths) or depth-first (stack/recursion).',
    prerequisites: ['trees', 'stacks-queues'],
    objectives: ['Pick BFS for shortest paths in unweighted graphs', 'Track visited nodes to avoid infinite loops'],
    misconceptions: [
      { id: 'graph-dfs-shortest', description: 'Believes DFS finds shortest paths in unweighted graphs' },
      { id: 'graph-no-visited', description: 'Forgets a visited set on graphs with cycles' },
    ],
    lesson:
      '**BFS** uses a queue and explores layer by layer, so the first time it reaches a node is via a **shortest path** (in edges). **DFS** goes deep first, using a stack or recursion, which suits cycle detection, topological sort and connected components. On graphs, keep a **visited** set, or cycles will loop forever. Both are O(V + E).',
    items: [
      {
        level: 2,
        stem: 'Which traversal finds the shortest path (fewest edges) between two nodes in an unweighted graph?',
        options: [
          ['DFS', 'graph-dfs-shortest', 'DFS can reach the target via a long path first.'],
          ['BFS', null],
          ['Either, they always find the same path', 'graph-dfs-shortest', 'Only BFS explores in order of distance.'],
          ['Neither; you need Dijkstra', 'graph-dfs-shortest', 'Dijkstra is for weighted graphs. BFS suffices when unweighted.'],
        ],
        explanation: 'BFS visits nodes in increasing distance order, so the first visit to the target uses the fewest edges.',
        hints: ['Which one explores all nodes at distance 1 before distance 2?', 'Queue vs stack.'],
      },
      {
        level: 3,
        stem: 'A DFS on a graph with a cycle never terminates. What is the most likely bug?',
        options: [
          ['It uses recursion instead of an explicit stack', 'graph-no-visited', 'Both styles terminate if visited nodes are tracked.'],
          ['It doesn’t track visited nodes', null],
          ['It should use a queue', 'graph-dfs-shortest', 'A BFS without a visited set loops forever too.'],
          ['DFS doesn’t work on directed graphs', 'graph-no-visited', 'DFS works on directed graphs.'],
        ],
        explanation: 'Without a visited set, DFS keeps walking around the cycle. Mark nodes when first visited and skip them afterwards.',
        hints: ['What happens when DFS returns to a node it already explored?', 'How would it know?'],
      },
      {
        level: 4,
        stem: 'What is the time complexity of BFS on a graph stored as an adjacency list with V vertices and E edges?',
        options: [
          ['O(V)', 'graph-no-visited', 'Every edge is also examined once (twice if undirected).'],
          ['O(V + E)', null],
          ['O(V · E)', 'graph-dfs-shortest', 'Each edge is scanned a constant number of times, not once per vertex.'],
          ['O(V²) always', 'graph-dfs-shortest', 'O(V²) applies to an adjacency matrix, not a list.'],
        ],
        explanation: 'Each vertex is enqueued once and each adjacency list is scanned once, for O(V + E) in total.',
        hints: ['How many times is each vertex dequeued?', 'How many times is each edge looked at?'],
      },
    ],
  },
  {
    slug: 'dynamic-programming',
    name: 'Dynamic programming',
    summary: 'Solving overlapping subproblems once (memoization/tabulation) when optimal substructure holds.',
    prerequisites: ['recursion', 'hashing'],
    objectives: ['Spot overlapping subproblems', 'Define state, transition and base cases'],
    misconceptions: [
      { id: 'dp-greedy', description: 'Assumes a greedy choice is always optimal where DP is required' },
      { id: 'dp-no-overlap', description: 'Uses DP where subproblems don’t overlap (plain divide & conquer suffices)' },
    ],
    lesson:
      'DP applies when a problem has **optimal substructure** (the best answer is built from best sub-answers) and **overlapping subproblems** (the same sub-answers recur). Define a **state** (for example, dp[i] = best answer for the first i items), a **transition**, and **base cases**. Then memoize (top-down) or tabulate (bottom-up).',
    items: [
      {
        level: 2,
        stem: 'Climbing stairs: you can take 1 or 2 steps. How many ways are there to reach step n?',
        options: [
          ['ways(n) = ways(n−1) + ways(n−2)', null],
          ['ways(n) = 2 × ways(n−1)', 'dp-greedy', 'That double-counts. The last move is either a 1-step or a 2-step, never both.'],
          ['ways(n) = n', 'dp-no-overlap', 'Try n = 4: there are 5 ways, not 4.'],
          ['ways(n) = ways(n−1) + 1', 'dp-greedy', 'This ignores paths whose last move is a 2-step.'],
        ],
        explanation: 'The last move is a 1-step (from n−1) or a 2-step (from n−2), so you add the two counts. This is the Fibonacci recurrence.',
        hints: ['Think about the very last move.', 'Where could you have been just before step n?'],
      },
      {
        level: 3,
        stem: 'Coins {1, 3, 4}, amount 6: a greedy “take the largest coin first” gives 4+1+1 (3 coins). What is the true minimum?',
        options: [
          ['3 coins, greedy is optimal here', 'dp-greedy', 'Check 3+3.'],
          ['2 coins', null],
          ['1 coin', 'dp-no-overlap', 'No single coin equals 6.'],
          ['4 coins', 'dp-greedy', 'Greedy already found 3, and fewer is possible.'],
        ],
        explanation: '3 + 3 = 6 uses 2 coins. Greedy fails for this coin system, while DP over amounts (dp[a] = 1 + min dp[a − c]) finds the optimum.',
        hints: ['Try combinations that don’t use the 4 coin.', 'Two equal coins?'],
      },
      {
        level: 4,
        stem: 'Why is merge sort NOT considered dynamic programming even though it is recursive?',
        options: [
          ['Its subproblems don’t overlap, so there is nothing to reuse', null],
          ['It doesn’t have optimal substructure', 'dp-no-overlap', 'Sorting halves and merging is a valid composition. Overlap is what’s missing.'],
          ['It is greedy', 'dp-greedy', 'Merge sort is divide and conquer, not greedy.'],
          ['Because it runs in O(n log n)', 'dp-no-overlap', 'Complexity doesn’t determine whether something is DP.'],
        ],
        explanation: 'Each half is sorted exactly once. Without repeated subproblems, memoization saves nothing. This is plain divide and conquer.',
        hints: ['Does merge sort ever sort the same subarray twice?', 'What does memoization need in order to help?'],
      },
    ],
  },
];
