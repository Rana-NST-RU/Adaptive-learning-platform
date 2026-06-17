// ─────────────────────────────────────────────────────────────────────────────
// Neo4j Knowledge Graph — Complete Seed
// DSA + System Design Curriculum for ALOS
// Run: cat seed-graph.cypher | cypher-shell -u neo4j -p <password>
// ─────────────────────────────────────────────────────────────────────────────

// ─── STEP 1: Clear existing data ─────────────────────────────────────────────
MATCH (n) DETACH DELETE n;

// ─── STEP 2: Create Constraints & Indexes ────────────────────────────────────
CREATE CONSTRAINT concept_id IF NOT EXISTS FOR (c:Concept) REQUIRE c.id IS UNIQUE;
CREATE CONSTRAINT topic_id IF NOT EXISTS FOR (t:Topic) REQUIRE t.id IS UNIQUE;
CREATE INDEX concept_domain IF NOT EXISTS FOR (c:Concept) ON (c.domain);
CREATE INDEX concept_difficulty IF NOT EXISTS FOR (c:Concept) ON (c.difficulty);

// ─────────────────────────────────────────────────────────────────────────────
// ─── TOPICS (DSA) ────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

CREATE
  (:Topic {id: 'topic-foundations', name: 'Foundations', domain: 'DSA', order: 1, color: '#6366f1'}),
  (:Topic {id: 'topic-data-structures', name: 'Data Structures', domain: 'DSA', order: 2, color: '#8b5cf6'}),
  (:Topic {id: 'topic-sorting', name: 'Sorting Algorithms', domain: 'DSA', order: 3, color: '#06b6d4'}),
  (:Topic {id: 'topic-searching', name: 'Searching & Binary Search', domain: 'DSA', order: 4, color: '#10b981'}),
  (:Topic {id: 'topic-two-pointers', name: 'Two Pointers & Sliding Window', domain: 'DSA', order: 5, color: '#f59e0b'}),
  (:Topic {id: 'topic-recursion', name: 'Recursion & Backtracking', domain: 'DSA', order: 6, color: '#ef4444'}),
  (:Topic {id: 'topic-graphs', name: 'Graph Algorithms', domain: 'DSA', order: 7, color: '#ec4899'}),
  (:Topic {id: 'topic-dp', name: 'Dynamic Programming', domain: 'DSA', order: 8, color: '#f97316'}),
  (:Topic {id: 'topic-advanced', name: 'Advanced Data Structures', domain: 'DSA', order: 9, color: '#84cc16'}),
  (:Topic {id: 'topic-strings', name: 'String Algorithms', domain: 'DSA', order: 10, color: '#14b8a6'});

// ─────────────────────────────────────────────────────────────────────────────
// ─── TOPICS (System Design) ──────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

CREATE
  (:Topic {id: 'topic-sd-fundamentals', name: 'SD Fundamentals', domain: 'SYSTEM_DESIGN', order: 1, color: '#6366f1'}),
  (:Topic {id: 'topic-sd-scalability', name: 'Scalability', domain: 'SYSTEM_DESIGN', order: 2, color: '#8b5cf6'}),
  (:Topic {id: 'topic-sd-databases', name: 'Databases & Storage', domain: 'SYSTEM_DESIGN', order: 3, color: '#06b6d4'}),
  (:Topic {id: 'topic-sd-infra', name: 'Infrastructure & Networking', domain: 'SYSTEM_DESIGN', order: 4, color: '#10b981'}),
  (:Topic {id: 'topic-sd-patterns', name: 'Design Patterns', domain: 'SYSTEM_DESIGN', order: 5, color: '#f59e0b'}),
  (:Topic {id: 'topic-sd-real-systems', name: 'Real System Design', domain: 'SYSTEM_DESIGN', order: 6, color: '#ef4444'});

// ─────────────────────────────────────────────────────────────────────────────
// ─── DSA CONCEPTS ────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

// === FOUNDATIONS ===
CREATE
  (:Concept {
    id: 'big-o-notation',
    name: 'Big-O Notation',
    domain: 'DSA',
    category: 'Foundations',
    difficulty: 1,
    description: 'Understand time and space complexity analysis. Learn to analyze algorithm efficiency using Big-O, Big-Omega, and Big-Theta notations.',
    estimatedMinutes: 45,
    xpReward: 100,
    tags: ['complexity', 'analysis', 'fundamentals'],
    leetcodeTag: null,
    isFoundation: true
  }),
  (:Concept {
    id: 'recursion-basics',
    name: 'Recursion Basics',
    domain: 'DSA',
    category: 'Foundations',
    difficulty: 2,
    description: 'Master recursive thinking: base cases, recursive cases, call stack behavior, and tail recursion.',
    estimatedMinutes: 60,
    xpReward: 150,
    tags: ['recursion', 'stack', 'fundamentals'],
    leetcodeTag: 'recursion',
    isFoundation: true
  }),
  (:Concept {
    id: 'math-for-dsa',
    name: 'Math for DSA',
    domain: 'DSA',
    category: 'Foundations',
    difficulty: 1,
    description: 'Essential math: modular arithmetic, GCD/LCM, prime numbers, logarithms, and combinatorics.',
    estimatedMinutes: 40,
    xpReward: 80,
    tags: ['math', 'modular', 'primes'],
    leetcodeTag: 'math',
    isFoundation: true
  }),
  (:Concept {
    id: 'bit-manipulation',
    name: 'Bit Manipulation',
    domain: 'DSA',
    category: 'Foundations',
    difficulty: 3,
    description: 'Bitwise operations: AND, OR, XOR, left/right shifts. Common tricks: checking power of 2, swapping without temp variable.',
    estimatedMinutes: 50,
    xpReward: 200,
    tags: ['bits', 'bitwise', 'tricks'],
    leetcodeTag: 'bit-manipulation',
    isFoundation: false
  });

// === DATA STRUCTURES — ARRAYS ===
CREATE
  (:Concept {
    id: 'arrays',
    name: 'Arrays',
    domain: 'DSA',
    category: 'Data Structures',
    difficulty: 1,
    description: 'Core array operations: traversal, insertion, deletion, rotation. Understand contiguous memory layout and index-based access.',
    estimatedMinutes: 60,
    xpReward: 120,
    tags: ['arrays', 'data-structures', 'fundamentals'],
    leetcodeTag: 'array',
    isFoundation: true
  }),
  (:Concept {
    id: 'strings',
    name: 'Strings',
    domain: 'DSA',
    category: 'Data Structures',
    difficulty: 1,
    description: 'String manipulation: reversal, palindrome check, anagram detection, substring operations.',
    estimatedMinutes: 45,
    xpReward: 100,
    tags: ['strings', 'manipulation'],
    leetcodeTag: 'string',
    isFoundation: false
  }),
  (:Concept {
    id: 'matrix-2d-arrays',
    name: '2D Arrays & Matrix',
    domain: 'DSA',
    category: 'Data Structures',
    difficulty: 2,
    description: 'Matrix traversal, rotation, spiral order, diagonal traversal. Row-major and column-major storage.',
    estimatedMinutes: 50,
    xpReward: 150,
    tags: ['matrix', '2d-array', 'traversal'],
    leetcodeTag: 'matrix',
    isFoundation: false
  }),
  (:Concept {
    id: 'prefix-sum',
    name: 'Prefix Sum',
    domain: 'DSA',
    category: 'Data Structures',
    difficulty: 2,
    description: 'Build prefix sum arrays for O(1) range sum queries. Applications in subarray problems.',
    estimatedMinutes: 35,
    xpReward: 130,
    tags: ['prefix-sum', 'range-query', 'arrays'],
    leetcodeTag: 'prefix-sum',
    isFoundation: false
  });

// === DATA STRUCTURES — LINKED LISTS ===
CREATE
  (:Concept {
    id: 'linked-list-singly',
    name: 'Singly Linked List',
    domain: 'DSA',
    category: 'Data Structures',
    difficulty: 2,
    description: 'Node structure, insertion/deletion at head/tail/middle, reversal, and traversal patterns.',
    estimatedMinutes: 60,
    xpReward: 150,
    tags: ['linked-list', 'pointers', 'data-structures'],
    leetcodeTag: 'linked-list',
    isFoundation: false
  }),
  (:Concept {
    id: 'linked-list-doubly',
    name: 'Doubly Linked List',
    domain: 'DSA',
    category: 'Data Structures',
    difficulty: 2,
    description: 'Bidirectional pointers, LRU Cache implementation, browser history simulation.',
    estimatedMinutes: 45,
    xpReward: 150,
    tags: ['linked-list', 'doubly', 'lru'],
    leetcodeTag: 'linked-list',
    isFoundation: false
  }),
  (:Concept {
    id: 'fast-slow-pointers',
    name: 'Fast & Slow Pointers (Floyd)',
    domain: 'DSA',
    category: 'Data Structures',
    difficulty: 3,
    description: "Floyd's cycle detection algorithm. Find cycle start, middle of list, and nth node from end.",
    estimatedMinutes: 40,
    xpReward: 200,
    tags: ['pointers', 'cycle', 'floyd'],
    leetcodeTag: 'two-pointers',
    isFoundation: false
  });

// === DATA STRUCTURES — STACKS & QUEUES ===
CREATE
  (:Concept {
    id: 'stack',
    name: 'Stack',
    domain: 'DSA',
    category: 'Data Structures',
    difficulty: 1,
    description: 'LIFO principle, push/pop/peek operations. Applications: balanced parentheses, undo operations, expression evaluation.',
    estimatedMinutes: 45,
    xpReward: 120,
    tags: ['stack', 'lifo', 'data-structures'],
    leetcodeTag: 'stack',
    isFoundation: false
  }),
  (:Concept {
    id: 'queue',
    name: 'Queue',
    domain: 'DSA',
    category: 'Data Structures',
    difficulty: 1,
    description: 'FIFO principle, enqueue/dequeue. Circular queue, priority queue introduction.',
    estimatedMinutes: 40,
    xpReward: 100,
    tags: ['queue', 'fifo', 'data-structures'],
    leetcodeTag: 'queue',
    isFoundation: false
  }),
  (:Concept {
    id: 'monotonic-stack',
    name: 'Monotonic Stack',
    domain: 'DSA',
    category: 'Data Structures',
    difficulty: 3,
    description: 'Maintain increasing/decreasing order stack. Solve next greater element, largest rectangle in histogram.',
    estimatedMinutes: 45,
    xpReward: 220,
    tags: ['stack', 'monotonic', 'advanced'],
    leetcodeTag: 'monotonic-stack',
    isFoundation: false
  }),
  (:Concept {
    id: 'deque',
    name: 'Deque (Double-Ended Queue)',
    domain: 'DSA',
    category: 'Data Structures',
    difficulty: 2,
    description: 'Operations at both ends. Sliding window maximum using deque.',
    estimatedMinutes: 35,
    xpReward: 150,
    tags: ['deque', 'sliding-window', 'queue'],
    leetcodeTag: 'queue',
    isFoundation: false
  });

// === DATA STRUCTURES — HASH TABLES ===
CREATE
  (:Concept {
    id: 'hash-maps',
    name: 'Hash Maps & Hash Sets',
    domain: 'DSA',
    category: 'Data Structures',
    difficulty: 2,
    description: 'Hash functions, collision resolution (chaining, open addressing). Frequency counting, two-sum pattern.',
    estimatedMinutes: 55,
    xpReward: 170,
    tags: ['hash', 'hashmap', 'hashset', 'frequency'],
    leetcodeTag: 'hash-table',
    isFoundation: false
  });

// === DATA STRUCTURES — TREES ===
CREATE
  (:Concept {
    id: 'binary-tree',
    name: 'Binary Tree',
    domain: 'DSA',
    category: 'Data Structures',
    difficulty: 2,
    description: 'Tree terminology, DFS traversals (inorder, preorder, postorder), BFS level-order, height/depth calculations.',
    estimatedMinutes: 70,
    xpReward: 200,
    tags: ['tree', 'binary-tree', 'traversal', 'dfs', 'bfs'],
    leetcodeTag: 'tree',
    isFoundation: false
  }),
  (:Concept {
    id: 'binary-search-tree',
    name: 'Binary Search Tree (BST)',
    domain: 'DSA',
    category: 'Data Structures',
    difficulty: 3,
    description: 'BST property, insertion, deletion, search, inorder gives sorted order. BST validation.',
    estimatedMinutes: 60,
    xpReward: 220,
    tags: ['bst', 'tree', 'search'],
    leetcodeTag: 'binary-search-tree',
    isFoundation: false
  }),
  (:Concept {
    id: 'heap',
    name: 'Heap & Priority Queue',
    domain: 'DSA',
    category: 'Data Structures',
    difficulty: 3,
    description: 'Min-heap and max-heap, heapify, heap sort. Top-K elements pattern, merge K sorted lists.',
    estimatedMinutes: 60,
    xpReward: 230,
    tags: ['heap', 'priority-queue', 'top-k'],
    leetcodeTag: 'heap-priority-queue',
    isFoundation: false
  }),
  (:Concept {
    id: 'trie',
    name: 'Trie (Prefix Tree)',
    domain: 'DSA',
    category: 'Data Structures',
    difficulty: 3,
    description: 'Trie node structure, insert/search/startsWith operations. Autocomplete and word dictionary problems.',
    estimatedMinutes: 55,
    xpReward: 230,
    tags: ['trie', 'prefix-tree', 'strings'],
    leetcodeTag: 'trie',
    isFoundation: false
  }),
  (:Concept {
    id: 'segment-tree',
    name: 'Segment Tree',
    domain: 'DSA',
    category: 'Data Structures',
    difficulty: 5,
    description: 'Range query and point update in O(log n). Lazy propagation for range updates.',
    estimatedMinutes: 90,
    xpReward: 350,
    tags: ['segment-tree', 'range-query', 'advanced'],
    leetcodeTag: 'segment-tree',
    isFoundation: false
  }),
  (:Concept {
    id: 'fenwick-tree',
    name: 'Fenwick Tree (BIT)',
    domain: 'DSA',
    category: 'Data Structures',
    difficulty: 4,
    description: 'Binary Indexed Tree for prefix sums and range queries. More space-efficient than segment tree.',
    estimatedMinutes: 70,
    xpReward: 300,
    tags: ['bit', 'fenwick', 'range-query'],
    leetcodeTag: 'binary-indexed-tree',
    isFoundation: false
  }),
  (:Concept {
    id: 'dsu',
    name: 'Disjoint Set Union (Union-Find)',
    domain: 'DSA',
    category: 'Data Structures',
    difficulty: 4,
    description: 'Union by rank and path compression. Connected components, Kruskal MST.',
    estimatedMinutes: 55,
    xpReward: 280,
    tags: ['dsu', 'union-find', 'graphs'],
    leetcodeTag: 'union-find',
    isFoundation: false
  });

// === SORTING ===
CREATE
  (:Concept {
    id: 'bubble-sort',
    name: 'Bubble Sort',
    domain: 'DSA',
    category: 'Sorting',
    difficulty: 1,
    description: 'O(n²) comparison-based sort. Understand swap mechanics and best/worst case.',
    estimatedMinutes: 25,
    xpReward: 80,
    tags: ['sorting', 'comparison', 'basics'],
    leetcodeTag: 'sorting',
    isFoundation: false
  }),
  (:Concept {
    id: 'selection-sort',
    name: 'Selection Sort',
    domain: 'DSA',
    category: 'Sorting',
    difficulty: 1,
    description: 'Select minimum element and place at correct position. O(n²) in all cases.',
    estimatedMinutes: 20,
    xpReward: 70,
    tags: ['sorting', 'selection'],
    leetcodeTag: 'sorting',
    isFoundation: false
  }),
  (:Concept {
    id: 'insertion-sort',
    name: 'Insertion Sort',
    domain: 'DSA',
    category: 'Sorting',
    difficulty: 1,
    description: 'Build sorted portion one element at a time. O(n) best case for nearly sorted arrays.',
    estimatedMinutes: 25,
    xpReward: 80,
    tags: ['sorting', 'insertion', 'adaptive'],
    leetcodeTag: 'sorting',
    isFoundation: false
  }),
  (:Concept {
    id: 'merge-sort',
    name: 'Merge Sort',
    domain: 'DSA',
    category: 'Sorting',
    difficulty: 2,
    description: 'Divide and conquer O(n log n) stable sort. Inversion count pattern.',
    estimatedMinutes: 50,
    xpReward: 180,
    tags: ['sorting', 'divide-conquer', 'merge'],
    leetcodeTag: 'sorting',
    isFoundation: false
  }),
  (:Concept {
    id: 'quick-sort',
    name: 'Quick Sort',
    domain: 'DSA',
    category: 'Sorting',
    difficulty: 3,
    description: 'Pivot selection, partitioning (Lomuto, Hoare). Average O(n log n), worst O(n²). QuickSelect.',
    estimatedMinutes: 60,
    xpReward: 220,
    tags: ['sorting', 'pivot', 'quickselect'],
    leetcodeTag: 'sorting',
    isFoundation: false
  }),
  (:Concept {
    id: 'counting-sort',
    name: 'Counting & Radix Sort',
    domain: 'DSA',
    category: 'Sorting',
    difficulty: 2,
    description: 'Non-comparison sort O(n+k). Counting sort for bounded integers. Radix sort for large ranges.',
    estimatedMinutes: 40,
    xpReward: 150,
    tags: ['sorting', 'counting', 'radix', 'linear'],
    leetcodeTag: 'sorting',
    isFoundation: false
  });

// === SEARCHING ===
CREATE
  (:Concept {
    id: 'linear-search',
    name: 'Linear Search',
    domain: 'DSA',
    category: 'Searching',
    difficulty: 1,
    description: 'Sequential search O(n). Foundation for understanding search complexity.',
    estimatedMinutes: 15,
    xpReward: 50,
    tags: ['search', 'linear', 'basics'],
    leetcodeTag: 'array',
    isFoundation: false
  }),
  (:Concept {
    id: 'binary-search',
    name: 'Binary Search',
    domain: 'DSA',
    category: 'Searching',
    difficulty: 2,
    description: 'O(log n) search on sorted arrays. Template-based approach: left/right boundary finding.',
    estimatedMinutes: 60,
    xpReward: 200,
    tags: ['binary-search', 'search', 'sorted'],
    leetcodeTag: 'binary-search',
    isFoundation: false
  }),
  (:Concept {
    id: 'binary-search-on-answer',
    name: 'Binary Search on Answer',
    domain: 'DSA',
    category: 'Searching',
    difficulty: 4,
    description: 'Apply binary search when the answer space is monotonic. Classic: capacity to ship packages.',
    estimatedMinutes: 55,
    xpReward: 280,
    tags: ['binary-search', 'advanced', 'monotonic'],
    leetcodeTag: 'binary-search',
    isFoundation: false
  });

// === TWO POINTERS ===
CREATE
  (:Concept {
    id: 'two-pointers',
    name: 'Two Pointers',
    domain: 'DSA',
    category: 'Techniques',
    difficulty: 2,
    description: 'Opposite-end pointers for pair sum, removing duplicates, container with most water.',
    estimatedMinutes: 50,
    xpReward: 180,
    tags: ['two-pointers', 'arrays', 'technique'],
    leetcodeTag: 'two-pointers',
    isFoundation: false
  }),
  (:Concept {
    id: 'sliding-window',
    name: 'Sliding Window',
    domain: 'DSA',
    category: 'Techniques',
    difficulty: 3,
    description: 'Fixed and variable-size windows. Longest substring without repeating characters, maximum subarray.',
    estimatedMinutes: 55,
    xpReward: 220,
    tags: ['sliding-window', 'substring', 'technique'],
    leetcodeTag: 'sliding-window',
    isFoundation: false
  });

// === GRAPHS ===
CREATE
  (:Concept {
    id: 'graph-representation',
    name: 'Graph Representation',
    domain: 'DSA',
    category: 'Graphs',
    difficulty: 2,
    description: 'Adjacency matrix vs adjacency list. Directed, undirected, weighted graphs. Space-time trade-offs.',
    estimatedMinutes: 40,
    xpReward: 150,
    tags: ['graph', 'representation', 'adjacency'],
    leetcodeTag: 'graph',
    isFoundation: false
  }),
  (:Concept {
    id: 'bfs',
    name: 'Breadth-First Search (BFS)',
    domain: 'DSA',
    category: 'Graphs',
    difficulty: 2,
    description: 'Level-order traversal using queue. Shortest path in unweighted graphs, BFS on grids.',
    estimatedMinutes: 55,
    xpReward: 200,
    tags: ['bfs', 'graph', 'queue', 'shortest-path'],
    leetcodeTag: 'breadth-first-search',
    isFoundation: false
  }),
  (:Concept {
    id: 'dfs',
    name: 'Depth-First Search (DFS)',
    domain: 'DSA',
    category: 'Graphs',
    difficulty: 2,
    description: 'Recursive and iterative DFS. Connected components, cycle detection, island counting.',
    estimatedMinutes: 60,
    xpReward: 200,
    tags: ['dfs', 'graph', 'stack', 'connected-components'],
    leetcodeTag: 'depth-first-search',
    isFoundation: false
  }),
  (:Concept {
    id: 'topological-sort',
    name: 'Topological Sort',
    domain: 'DSA',
    category: 'Graphs',
    difficulty: 3,
    description: "Kahn's algorithm (BFS-based) and DFS-based topological ordering. Course schedule problems.",
    estimatedMinutes: 55,
    xpReward: 250,
    tags: ['topological-sort', 'dag', 'graph'],
    leetcodeTag: 'topological-sort',
    isFoundation: false
  }),
  (:Concept {
    id: 'dijkstra',
    name: "Dijkstra's Algorithm",
    domain: 'DSA',
    category: 'Graphs',
    difficulty: 4,
    description: 'Single-source shortest path for non-negative weights. Min-heap priority queue implementation.',
    estimatedMinutes: 65,
    xpReward: 300,
    tags: ['dijkstra', 'shortest-path', 'weighted-graph'],
    leetcodeTag: 'shortest-path',
    isFoundation: false
  }),
  (:Concept {
    id: 'bellman-ford',
    name: 'Bellman-Ford Algorithm',
    domain: 'DSA',
    category: 'Graphs',
    difficulty: 4,
    description: 'Shortest path with negative weights. Detect negative cycles. O(VE) complexity.',
    estimatedMinutes: 50,
    xpReward: 280,
    tags: ['bellman-ford', 'negative-weights', 'graph'],
    leetcodeTag: 'shortest-path',
    isFoundation: false
  }),
  (:Concept {
    id: 'floyd-warshall',
    name: 'Floyd-Warshall Algorithm',
    domain: 'DSA',
    category: 'Graphs',
    difficulty: 4,
    description: 'All-pairs shortest path O(V³). Dynamic programming on graphs.',
    estimatedMinutes: 45,
    xpReward: 270,
    tags: ['floyd-warshall', 'all-pairs', 'dp'],
    leetcodeTag: 'shortest-path',
    isFoundation: false
  }),
  (:Concept {
    id: 'minimum-spanning-tree',
    name: "MST — Kruskal's & Prim's",
    domain: 'DSA',
    category: 'Graphs',
    difficulty: 4,
    description: "Kruskal's (DSU-based) and Prim's (priority queue) algorithms for minimum spanning tree.",
    estimatedMinutes: 60,
    xpReward: 290,
    tags: ['mst', 'kruskal', 'prim', 'greedy'],
    leetcodeTag: 'minimum-spanning-tree',
    isFoundation: false
  });

// === BACKTRACKING ===
CREATE
  (:Concept {
    id: 'backtracking',
    name: 'Backtracking',
    domain: 'DSA',
    category: 'Recursion',
    difficulty: 3,
    description: 'Explore all possibilities with pruning. N-Queens, Sudoku solver, permutations, subsets.',
    estimatedMinutes: 70,
    xpReward: 250,
    tags: ['backtracking', 'recursion', 'pruning'],
    leetcodeTag: 'backtracking',
    isFoundation: false
  });

// === GREEDY ===
CREATE
  (:Concept {
    id: 'greedy-algorithms',
    name: 'Greedy Algorithms',
    domain: 'DSA',
    category: 'Algorithms',
    difficulty: 3,
    description: 'Locally optimal choices lead to global optimum. Activity selection, fractional knapsack, interval scheduling.',
    estimatedMinutes: 60,
    xpReward: 230,
    tags: ['greedy', 'optimal', 'intervals'],
    leetcodeTag: 'greedy',
    isFoundation: false
  });

// === DYNAMIC PROGRAMMING ===
CREATE
  (:Concept {
    id: 'dp-introduction',
    name: 'DP — Introduction & Memoization',
    domain: 'DSA',
    category: 'Dynamic Programming',
    difficulty: 3,
    description: 'Overlapping subproblems and optimal substructure. Top-down (memoization) approach. Fibonacci, climbing stairs.',
    estimatedMinutes: 70,
    xpReward: 260,
    tags: ['dp', 'memoization', 'recursion'],
    leetcodeTag: 'dynamic-programming',
    isFoundation: false
  }),
  (:Concept {
    id: 'dp-tabulation',
    name: 'DP — Tabulation (Bottom-Up)',
    domain: 'DSA',
    category: 'Dynamic Programming',
    difficulty: 3,
    description: 'Convert top-down DP to iterative bottom-up. Space optimization techniques.',
    estimatedMinutes: 55,
    xpReward: 250,
    tags: ['dp', 'tabulation', 'bottom-up'],
    leetcodeTag: 'dynamic-programming',
    isFoundation: false
  }),
  (:Concept {
    id: 'dp-1d',
    name: 'DP — 1D Problems',
    domain: 'DSA',
    category: 'Dynamic Programming',
    difficulty: 3,
    description: 'House robber, coin change, word break, jump game. Core 1D DP patterns.',
    estimatedMinutes: 65,
    xpReward: 270,
    tags: ['dp', '1d', 'patterns'],
    leetcodeTag: 'dynamic-programming',
    isFoundation: false
  }),
  (:Concept {
    id: 'dp-2d',
    name: 'DP — 2D Problems',
    domain: 'DSA',
    category: 'Dynamic Programming',
    difficulty: 4,
    description: 'Grid DP, LCS, Edit distance, Unique paths. Matrix chain multiplication.',
    estimatedMinutes: 80,
    xpReward: 310,
    tags: ['dp', '2d', 'grid', 'lcs'],
    leetcodeTag: 'dynamic-programming',
    isFoundation: false
  }),
  (:Concept {
    id: 'dp-knapsack',
    name: 'DP — Knapsack Patterns',
    domain: 'DSA',
    category: 'Dynamic Programming',
    difficulty: 4,
    description: '0/1 Knapsack, Unbounded knapsack, Subset sum, Partition equal subset.',
    estimatedMinutes: 75,
    xpReward: 300,
    tags: ['dp', 'knapsack', 'subset-sum'],
    leetcodeTag: 'dynamic-programming',
    isFoundation: false
  }),
  (:Concept {
    id: 'dp-intervals',
    name: 'DP — Intervals',
    domain: 'DSA',
    category: 'Dynamic Programming',
    difficulty: 5,
    description: 'Burst balloons, palindrome partitioning, stone game. Interval DP template.',
    estimatedMinutes: 80,
    xpReward: 340,
    tags: ['dp', 'intervals', 'advanced'],
    leetcodeTag: 'dynamic-programming',
    isFoundation: false
  }),
  (:Concept {
    id: 'dp-on-trees',
    name: 'DP on Trees',
    domain: 'DSA',
    category: 'Dynamic Programming',
    difficulty: 4,
    description: 'Tree DP patterns: diameter of binary tree, house robber III, binary tree cameras.',
    estimatedMinutes: 70,
    xpReward: 310,
    tags: ['dp', 'tree', 'advanced'],
    leetcodeTag: 'dynamic-programming',
    isFoundation: false
  });

// === STRING ALGORITHMS ===
CREATE
  (:Concept {
    id: 'kmp-algorithm',
    name: 'KMP String Matching',
    domain: 'DSA',
    category: 'String Algorithms',
    difficulty: 4,
    description: 'Knuth-Morris-Pratt pattern matching in O(n+m). Failure function construction.',
    estimatedMinutes: 65,
    xpReward: 290,
    tags: ['kmp', 'string-matching', 'pattern'],
    leetcodeTag: 'string-matching',
    isFoundation: false
  }),
  (:Concept {
    id: 'rabin-karp',
    name: 'Rabin-Karp Rolling Hash',
    domain: 'DSA',
    category: 'String Algorithms',
    difficulty: 4,
    description: 'Polynomial rolling hash for O(n+m) average case string matching. Multiple pattern search.',
    estimatedMinutes: 55,
    xpReward: 280,
    tags: ['rabin-karp', 'hash', 'string'],
    leetcodeTag: 'string-matching',
    isFoundation: false
  });

// ─────────────────────────────────────────────────────────────────────────────
// ─── SYSTEM DESIGN CONCEPTS ──────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

CREATE
  // === FUNDAMENTALS ===
  (:Concept {
    id: 'client-server-arch',
    name: 'Client-Server Architecture',
    domain: 'SYSTEM_DESIGN',
    category: 'Fundamentals',
    difficulty: 1,
    description: 'Request-response model, stateless vs stateful servers, client types.',
    estimatedMinutes: 30,
    xpReward: 80,
    tags: ['fundamentals', 'architecture', 'web'],
    isFoundation: true
  }),
  (:Concept {
    id: 'http-rest-apis',
    name: 'HTTP & REST APIs',
    domain: 'SYSTEM_DESIGN',
    category: 'Fundamentals',
    difficulty: 1,
    description: 'HTTP methods, status codes, REST principles, idempotency, statelessness.',
    estimatedMinutes: 45,
    xpReward: 100,
    tags: ['http', 'rest', 'api', 'fundamentals'],
    isFoundation: true
  }),
  (:Concept {
    id: 'dns-resolution',
    name: 'DNS Resolution',
    domain: 'SYSTEM_DESIGN',
    category: 'Fundamentals',
    difficulty: 2,
    description: 'How domain names resolve to IPs. Recursive vs iterative resolution. TTL and caching.',
    estimatedMinutes: 30,
    xpReward: 100,
    tags: ['dns', 'networking', 'fundamentals'],
    isFoundation: false
  }),
  (:Concept {
    id: 'websockets',
    name: 'WebSockets & Real-time Communication',
    domain: 'SYSTEM_DESIGN',
    category: 'Fundamentals',
    difficulty: 2,
    description: 'Full-duplex communication, long polling vs WebSockets vs SSE. When to use each.',
    estimatedMinutes: 40,
    xpReward: 130,
    tags: ['websockets', 'real-time', 'sse', 'long-polling'],
    isFoundation: false
  }),
  (:Concept {
    id: 'cdn-basics',
    name: 'CDN (Content Delivery Network)',
    domain: 'SYSTEM_DESIGN',
    category: 'Infrastructure',
    difficulty: 2,
    description: 'Edge servers, cache invalidation, push vs pull CDN. Reduce latency for static assets.',
    estimatedMinutes: 35,
    xpReward: 110,
    tags: ['cdn', 'caching', 'performance'],
    isFoundation: false
  }),

  // === SCALABILITY ===
  (:Concept {
    id: 'horizontal-vertical-scaling',
    name: 'Horizontal vs Vertical Scaling',
    domain: 'SYSTEM_DESIGN',
    category: 'Scalability',
    difficulty: 2,
    description: 'Scale-up vs scale-out. Trade-offs, cost, single point of failure.',
    estimatedMinutes: 30,
    xpReward: 110,
    tags: ['scaling', 'availability', 'fundamentals'],
    isFoundation: false
  }),
  (:Concept {
    id: 'load-balancing',
    name: 'Load Balancing',
    domain: 'SYSTEM_DESIGN',
    category: 'Scalability',
    difficulty: 2,
    description: 'Algorithms: Round Robin, Least Connections, IP Hash. L4 vs L7 load balancers. Health checks.',
    estimatedMinutes: 45,
    xpReward: 150,
    tags: ['load-balancer', 'availability', 'distribution'],
    isFoundation: false
  }),
  (:Concept {
    id: 'caching-strategies',
    name: 'Caching Strategies',
    domain: 'SYSTEM_DESIGN',
    category: 'Scalability',
    difficulty: 3,
    description: 'Cache-aside, write-through, write-back, write-around. Eviction policies: LRU, LFU, FIFO.',
    estimatedMinutes: 55,
    xpReward: 200,
    tags: ['cache', 'redis', 'memcached', 'lru'],
    isFoundation: false
  }),
  (:Concept {
    id: 'cap-theorem',
    name: 'CAP Theorem',
    domain: 'SYSTEM_DESIGN',
    category: 'Scalability',
    difficulty: 3,
    description: 'Consistency, Availability, Partition tolerance — can only guarantee 2. CP vs AP systems.',
    estimatedMinutes: 40,
    xpReward: 180,
    tags: ['cap', 'consistency', 'availability', 'distributed'],
    isFoundation: false
  }),
  (:Concept {
    id: 'consistent-hashing',
    name: 'Consistent Hashing',
    domain: 'SYSTEM_DESIGN',
    category: 'Scalability',
    difficulty: 4,
    description: 'Hash ring for distributing load. Virtual nodes for uniform distribution. Used in DynamoDB, Cassandra.',
    estimatedMinutes: 50,
    xpReward: 250,
    tags: ['consistent-hashing', 'distributed', 'sharding'],
    isFoundation: false
  }),

  // === DATABASES ===
  (:Concept {
    id: 'sql-vs-nosql',
    name: 'SQL vs NoSQL',
    domain: 'SYSTEM_DESIGN',
    category: 'Databases',
    difficulty: 2,
    description: 'Relational vs document vs key-value vs wide-column vs graph. When to choose what.',
    estimatedMinutes: 45,
    xpReward: 150,
    tags: ['sql', 'nosql', 'database', 'schema'],
    isFoundation: false
  }),
  (:Concept {
    id: 'database-replication',
    name: 'Database Replication',
    domain: 'SYSTEM_DESIGN',
    category: 'Databases',
    difficulty: 3,
    description: 'Master-slave and master-master replication. Sync vs async replication. Read replicas.',
    estimatedMinutes: 45,
    xpReward: 200,
    tags: ['replication', 'database', 'availability'],
    isFoundation: false
  }),
  (:Concept {
    id: 'database-sharding',
    name: 'Database Sharding & Partitioning',
    domain: 'SYSTEM_DESIGN',
    category: 'Databases',
    difficulty: 4,
    description: 'Horizontal partitioning strategies: range, hash, directory-based. Resharding challenges.',
    estimatedMinutes: 55,
    xpReward: 260,
    tags: ['sharding', 'partitioning', 'distributed-db'],
    isFoundation: false
  }),

  // === INFRASTRUCTURE ===
  (:Concept {
    id: 'message-queues',
    name: 'Message Queues (Kafka, RabbitMQ)',
    domain: 'SYSTEM_DESIGN',
    category: 'Infrastructure',
    difficulty: 3,
    description: 'Async communication, decoupling producers/consumers. Kafka topics, partitions, consumer groups.',
    estimatedMinutes: 60,
    xpReward: 220,
    tags: ['kafka', 'rabbitmq', 'async', 'queue'],
    isFoundation: false
  }),
  (:Concept {
    id: 'microservices-architecture',
    name: 'Microservices Architecture',
    domain: 'SYSTEM_DESIGN',
    category: 'Infrastructure',
    difficulty: 3,
    description: 'Service decomposition, inter-service communication (REST, gRPC). Service mesh, sidecar pattern.',
    estimatedMinutes: 65,
    xpReward: 240,
    tags: ['microservices', 'architecture', 'soa'],
    isFoundation: false
  }),
  (:Concept {
    id: 'api-gateway',
    name: 'API Gateway Pattern',
    domain: 'SYSTEM_DESIGN',
    category: 'Infrastructure',
    difficulty: 3,
    description: 'Single entry point for clients. Auth, rate limiting, request routing, aggregation.',
    estimatedMinutes: 40,
    xpReward: 180,
    tags: ['api-gateway', 'microservices', 'routing'],
    isFoundation: false
  }),
  (:Concept {
    id: 'rate-limiting',
    name: 'Rate Limiting',
    domain: 'SYSTEM_DESIGN',
    category: 'Infrastructure',
    difficulty: 3,
    description: 'Token bucket, leaky bucket, fixed window, sliding window log algorithms.',
    estimatedMinutes: 45,
    xpReward: 200,
    tags: ['rate-limiting', 'throttling', 'api'],
    isFoundation: false
  }),
  (:Concept {
    id: 'circuit-breaker',
    name: 'Circuit Breaker Pattern',
    domain: 'SYSTEM_DESIGN',
    category: 'Infrastructure',
    difficulty: 3,
    description: 'Prevent cascade failures. Closed, open, half-open states. Hystrix, Resilience4j.',
    estimatedMinutes: 35,
    xpReward: 180,
    tags: ['circuit-breaker', 'resilience', 'patterns'],
    isFoundation: false
  }),

  // === REAL SYSTEMS ===
  (:Concept {
    id: 'design-url-shortener',
    name: 'Design: URL Shortener',
    domain: 'SYSTEM_DESIGN',
    category: 'Real Systems',
    difficulty: 2,
    description: 'Hash generation, collision handling, redirects, analytics tracking, custom aliases.',
    estimatedMinutes: 60,
    xpReward: 250,
    tags: ['design', 'hashing', 'system-design'],
    isFoundation: false
  }),
  (:Concept {
    id: 'design-twitter',
    name: 'Design: Twitter Feed',
    domain: 'SYSTEM_DESIGN',
    category: 'Real Systems',
    difficulty: 4,
    description: 'Fan-out on write vs read, timeline generation, celebrity problem, sharding strategy.',
    estimatedMinutes: 90,
    xpReward: 380,
    tags: ['design', 'social-media', 'feed', 'fan-out'],
    isFoundation: false
  }),
  (:Concept {
    id: 'design-whatsapp',
    name: 'Design: WhatsApp',
    domain: 'SYSTEM_DESIGN',
    category: 'Real Systems',
    difficulty: 4,
    description: 'Real-time messaging, end-to-end encryption, message delivery status, group chats.',
    estimatedMinutes: 90,
    xpReward: 370,
    tags: ['design', 'messaging', 'real-time', 'chat'],
    isFoundation: false
  }),
  (:Concept {
    id: 'design-youtube',
    name: 'Design: YouTube',
    domain: 'SYSTEM_DESIGN',
    category: 'Real Systems',
    difficulty: 4,
    description: 'Video upload, transcoding pipeline, CDN distribution, recommendation engine, comments.',
    estimatedMinutes: 90,
    xpReward: 380,
    tags: ['design', 'video', 'streaming', 'cdn'],
    isFoundation: false
  }),
  (:Concept {
    id: 'design-uber',
    name: 'Design: Uber',
    domain: 'SYSTEM_DESIGN',
    category: 'Real Systems',
    difficulty: 5,
    description: 'Real-time location tracking, geohashing, matching algorithm, surge pricing, trip lifecycle.',
    estimatedMinutes: 90,
    xpReward: 400,
    tags: ['design', 'geolocation', 'real-time', 'matching'],
    isFoundation: false
  }),
  (:Concept {
    id: 'design-notification-system',
    name: 'Design: Notification System',
    domain: 'SYSTEM_DESIGN',
    category: 'Real Systems',
    difficulty: 3,
    description: 'Multi-channel delivery (push, SMS, email), priority queues, rate limiting, retry logic.',
    estimatedMinutes: 60,
    xpReward: 280,
    tags: ['design', 'notifications', 'async'],
    isFoundation: false
  });

// ─────────────────────────────────────────────────────────────────────────────
// ─── RELATIONSHIPS — DSA ─────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

// Foundations dependencies
MATCH (bigO:Concept {id: 'big-o-notation'}), (arrays:Concept {id: 'arrays'})
CREATE (bigO)-[:PREREQUISITE_OF {weight: 1.0, description: 'Must understand complexity before arrays'}]->(arrays);

MATCH (bigO:Concept {id: 'big-o-notation'}), (rec:Concept {id: 'recursion-basics'})
CREATE (bigO)-[:PREREQUISITE_OF {weight: 0.9}]->(rec);

MATCH (math:Concept {id: 'math-for-dsa'}), (bit:Concept {id: 'bit-manipulation'})
CREATE (math)-[:PREREQUISITE_OF {weight: 0.8}]->(bit);

// Arrays → Strings, Matrix, Prefix Sum
MATCH (a:Concept {id: 'arrays'}), (s:Concept {id: 'strings'})
CREATE (a)-[:PREREQUISITE_OF {weight: 0.7}]->(s);

MATCH (a:Concept {id: 'arrays'}), (m:Concept {id: 'matrix-2d-arrays'})
CREATE (a)-[:PREREQUISITE_OF {weight: 0.8}]->(m);

MATCH (a:Concept {id: 'arrays'}), (p:Concept {id: 'prefix-sum'})
CREATE (a)-[:PREREQUISITE_OF {weight: 0.9}]->(p);

// Two Pointers & Sliding Window
MATCH (a:Concept {id: 'arrays'}), (tp:Concept {id: 'two-pointers'})
CREATE (a)-[:PREREQUISITE_OF {weight: 0.9}]->(tp);

MATCH (tp:Concept {id: 'two-pointers'}), (sw:Concept {id: 'sliding-window'})
CREATE (tp)-[:PREREQUISITE_OF {weight: 0.85}]->(sw);

MATCH (s:Concept {id: 'strings'}), (sw:Concept {id: 'sliding-window'})
CREATE (s)-[:RELATED_TO {weight: 0.6}]->(sw);

// Stack → Monotonic Stack, Deque
MATCH (st:Concept {id: 'stack'}), (ms:Concept {id: 'monotonic-stack'})
CREATE (st)-[:PREREQUISITE_OF {weight: 1.0}]->(ms);

MATCH (q:Concept {id: 'queue'}), (dq:Concept {id: 'deque'})
CREATE (q)-[:PREREQUISITE_OF {weight: 0.9}]->(dq);

MATCH (dq:Concept {id: 'deque'}), (ms:Concept {id: 'monotonic-stack'})
CREATE (dq)-[:RELATED_TO {weight: 0.5}]->(ms);

// Linked Lists
MATCH (a:Concept {id: 'arrays'}), (ll:Concept {id: 'linked-list-singly'})
CREATE (a)-[:PREREQUISITE_OF {weight: 0.6}]->(ll);

MATCH (ll:Concept {id: 'linked-list-singly'}), (dll:Concept {id: 'linked-list-doubly'})
CREATE (ll)-[:PREREQUISITE_OF {weight: 0.9}]->(dll);

MATCH (ll:Concept {id: 'linked-list-singly'}), (fsp:Concept {id: 'fast-slow-pointers'})
CREATE (ll)-[:PREREQUISITE_OF {weight: 1.0}]->(fsp);

// Sorting
MATCH (a:Concept {id: 'arrays'}), (bs:Concept {id: 'bubble-sort'})
CREATE (a)-[:PREREQUISITE_OF {weight: 0.8}]->(bs);

MATCH (bs:Concept {id: 'bubble-sort'}), (sel:Concept {id: 'selection-sort'})
CREATE (bs)-[:RELATED_TO {weight: 0.7}]->(sel);

MATCH (sel:Concept {id: 'selection-sort'}), (ins:Concept {id: 'insertion-sort'})
CREATE (sel)-[:RELATED_TO {weight: 0.7}]->(ins);

MATCH (rec:Concept {id: 'recursion-basics'}), (ms:Concept {id: 'merge-sort'})
CREATE (rec)-[:PREREQUISITE_OF {weight: 1.0}]->(ms);

MATCH (ins:Concept {id: 'insertion-sort'}), (ms:Concept {id: 'merge-sort'})
CREATE (ins)-[:PREREQUISITE_OF {weight: 0.7}]->(ms);

MATCH (ms:Concept {id: 'merge-sort'}), (qs:Concept {id: 'quick-sort'})
CREATE (ms)-[:BUILDS_UPON {strength: 0.8}]->(qs);

MATCH (a:Concept {id: 'arrays'}), (cs:Concept {id: 'counting-sort'})
CREATE (a)-[:PREREQUISITE_OF {weight: 0.6}]->(cs);

// Searching
MATCH (a:Concept {id: 'arrays'}), (ls:Concept {id: 'linear-search'})
CREATE (a)-[:PREREQUISITE_OF {weight: 0.7}]->(ls);

MATCH (ls:Concept {id: 'linear-search'}), (bsearch:Concept {id: 'binary-search'})
CREATE (ls)-[:PREREQUISITE_OF {weight: 0.9}]->(bsearch);

MATCH (bsearch:Concept {id: 'binary-search'}), (bsa:Concept {id: 'binary-search-on-answer'})
CREATE (bsearch)-[:PREREQUISITE_OF {weight: 1.0}]->(bsa);

// Binary Tree → BST → Heap → Trie
MATCH (rec:Concept {id: 'recursion-basics'}), (bt:Concept {id: 'binary-tree'})
CREATE (rec)-[:PREREQUISITE_OF {weight: 1.0}]->(bt);

MATCH (bt:Concept {id: 'binary-tree'}), (bst:Concept {id: 'binary-search-tree'})
CREATE (bt)-[:PREREQUISITE_OF {weight: 1.0}]->(bst);

MATCH (bst:Concept {id: 'binary-search-tree'}), (bsearch:Concept {id: 'binary-search'})
CREATE (bst)-[:RELATED_TO {weight: 0.7}]->(bsearch);

MATCH (bt:Concept {id: 'binary-tree'}), (heap:Concept {id: 'heap'})
CREATE (bt)-[:PREREQUISITE_OF {weight: 0.8}]->(heap);

MATCH (bt:Concept {id: 'binary-tree'}), (trie:Concept {id: 'trie'})
CREATE (bt)-[:PREREQUISITE_OF {weight: 0.7}]->(trie);

MATCH (s:Concept {id: 'strings'}), (trie:Concept {id: 'trie'})
CREATE (s)-[:RELATED_TO {weight: 0.8}]->(trie);

// Advanced DS
MATCH (bt:Concept {id: 'binary-tree'}), (seg:Concept {id: 'segment-tree'})
CREATE (bt)-[:PREREQUISITE_OF {weight: 0.9}]->(seg);

MATCH (seg:Concept {id: 'segment-tree'}), (fen:Concept {id: 'fenwick-tree'})
CREATE (seg)-[:BUILDS_UPON {strength: 0.6}]->(fen);

// DSU
MATCH (gr:Concept {id: 'graph-representation'}), (dsu:Concept {id: 'dsu'})
CREATE (gr)-[:PREREQUISITE_OF {weight: 0.7}]->(dsu);

// Graph algorithms
MATCH (a:Concept {id: 'arrays'}), (gr:Concept {id: 'graph-representation'})
CREATE (a)-[:PREREQUISITE_OF {weight: 0.6}]->(gr);

MATCH (gr:Concept {id: 'graph-representation'}), (bfs:Concept {id: 'bfs'})
CREATE (gr)-[:PREREQUISITE_OF {weight: 1.0}]->(bfs);

MATCH (gr:Concept {id: 'graph-representation'}), (dfs:Concept {id: 'dfs'})
CREATE (gr)-[:PREREQUISITE_OF {weight: 1.0}]->(dfs);

MATCH (bfs:Concept {id: 'bfs'}), (topo:Concept {id: 'topological-sort'})
CREATE (bfs)-[:PREREQUISITE_OF {weight: 0.8}]->(topo);

MATCH (dfs:Concept {id: 'dfs'}), (topo:Concept {id: 'topological-sort'})
CREATE (dfs)-[:PREREQUISITE_OF {weight: 0.8}]->(topo);

MATCH (heap:Concept {id: 'heap'}), (dijkstra:Concept {id: 'dijkstra'})
CREATE (heap)-[:PREREQUISITE_OF {weight: 1.0}]->(dijkstra);

MATCH (gr:Concept {id: 'graph-representation'}), (dijkstra:Concept {id: 'dijkstra'})
CREATE (gr)-[:PREREQUISITE_OF {weight: 0.9}]->(dijkstra);

MATCH (dijkstra:Concept {id: 'dijkstra'}), (bf:Concept {id: 'bellman-ford'})
CREATE (dijkstra)-[:BUILDS_UPON {strength: 0.7}]->(bf);

MATCH (bf:Concept {id: 'bellman-ford'}), (fw:Concept {id: 'floyd-warshall'})
CREATE (bf)-[:BUILDS_UPON {strength: 0.7}]->(fw);

MATCH (dsu:Concept {id: 'dsu'}), (mst:Concept {id: 'minimum-spanning-tree'})
CREATE (dsu)-[:PREREQUISITE_OF {weight: 0.9}]->(mst);

MATCH (heap:Concept {id: 'heap'}), (mst:Concept {id: 'minimum-spanning-tree'})
CREATE (heap)-[:PREREQUISITE_OF {weight: 0.8}]->(mst);

// Backtracking
MATCH (rec:Concept {id: 'recursion-basics'}), (bt:Concept {id: 'backtracking'})
CREATE (rec)-[:PREREQUISITE_OF {weight: 1.0}]->(bt);

// Greedy
MATCH (a:Concept {id: 'arrays'}), (gr:Concept {id: 'greedy-algorithms'})
CREATE (a)-[:PREREQUISITE_OF {weight: 0.6}]->(gr);

MATCH (qs:Concept {id: 'quick-sort'}), (gr:Concept {id: 'greedy-algorithms'})
CREATE (qs)-[:RELATED_TO {weight: 0.5}]->(gr);

// Dynamic Programming
MATCH (rec:Concept {id: 'recursion-basics'}), (dp:Concept {id: 'dp-introduction'})
CREATE (rec)-[:PREREQUISITE_OF {weight: 1.0}]->(dp);

MATCH (dp:Concept {id: 'dp-introduction'}), (dpt:Concept {id: 'dp-tabulation'})
CREATE (dp)-[:PREREQUISITE_OF {weight: 1.0}]->(dpt);

MATCH (dpt:Concept {id: 'dp-tabulation'}), (dp1d:Concept {id: 'dp-1d'})
CREATE (dpt)-[:PREREQUISITE_OF {weight: 1.0}]->(dp1d);

MATCH (dp1d:Concept {id: 'dp-1d'}), (dp2d:Concept {id: 'dp-2d'})
CREATE (dp1d)-[:PREREQUISITE_OF {weight: 0.9}]->(dp2d);

MATCH (dp1d:Concept {id: 'dp-1d'}), (dpk:Concept {id: 'dp-knapsack'})
CREATE (dp1d)-[:PREREQUISITE_OF {weight: 0.9}]->(dpk);

MATCH (dp2d:Concept {id: 'dp-2d'}), (dpi:Concept {id: 'dp-intervals'})
CREATE (dp2d)-[:PREREQUISITE_OF {weight: 0.8}]->(dpi);

MATCH (bt:Concept {id: 'binary-tree'}), (dptree:Concept {id: 'dp-on-trees'})
CREATE (bt)-[:PREREQUISITE_OF {weight: 0.9}]->(dptree);

MATCH (dp1d:Concept {id: 'dp-1d'}), (dptree:Concept {id: 'dp-on-trees'})
CREATE (dp1d)-[:PREREQUISITE_OF {weight: 0.8}]->(dptree);

// String algorithms
MATCH (s:Concept {id: 'strings'}), (kmp:Concept {id: 'kmp-algorithm'})
CREATE (s)-[:PREREQUISITE_OF {weight: 0.9}]->(kmp);

MATCH (s:Concept {id: 'strings'}), (rk:Concept {id: 'rabin-karp'})
CREATE (s)-[:PREREQUISITE_OF {weight: 0.9}]->(rk);

MATCH (math:Concept {id: 'math-for-dsa'}), (rk:Concept {id: 'rabin-karp'})
CREATE (math)-[:RELATED_TO {weight: 0.6}]->(rk);

// ─────────────────────────────────────────────────────────────────────────────
// ─── RELATIONSHIPS — SYSTEM DESIGN ───────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

MATCH (cs:Concept {id: 'client-server-arch'}), (http:Concept {id: 'http-rest-apis'})
CREATE (cs)-[:PREREQUISITE_OF {weight: 1.0}]->(http);

MATCH (http:Concept {id: 'http-rest-apis'}), (ws:Concept {id: 'websockets'})
CREATE (http)-[:PREREQUISITE_OF {weight: 0.7}]->(ws);

MATCH (cs:Concept {id: 'client-server-arch'}), (dns:Concept {id: 'dns-resolution'})
CREATE (cs)-[:PREREQUISITE_OF {weight: 0.6}]->(dns);

MATCH (http:Concept {id: 'http-rest-apis'}), (cdn:Concept {id: 'cdn-basics'})
CREATE (http)-[:RELATED_TO {weight: 0.6}]->(cdn);

MATCH (http:Concept {id: 'http-rest-apis'}), (hv:Concept {id: 'horizontal-vertical-scaling'})
CREATE (http)-[:PREREQUISITE_OF {weight: 0.8}]->(hv);

MATCH (hv:Concept {id: 'horizontal-vertical-scaling'}), (lb:Concept {id: 'load-balancing'})
CREATE (hv)-[:PREREQUISITE_OF {weight: 1.0}]->(lb);

MATCH (lb:Concept {id: 'load-balancing'}), (cache:Concept {id: 'caching-strategies'})
CREATE (lb)-[:RELATED_TO {weight: 0.7}]->(cache);

MATCH (http:Concept {id: 'http-rest-apis'}), (cache:Concept {id: 'caching-strategies'})
CREATE (http)-[:PREREQUISITE_OF {weight: 0.8}]->(cache);

MATCH (hv:Concept {id: 'horizontal-vertical-scaling'}), (cap:Concept {id: 'cap-theorem'})
CREATE (hv)-[:PREREQUISITE_OF {weight: 0.8}]->(cap);

MATCH (cap:Concept {id: 'cap-theorem'}), (ch:Concept {id: 'consistent-hashing'})
CREATE (cap)-[:PREREQUISITE_OF {weight: 0.9}]->(ch);

MATCH (http:Concept {id: 'http-rest-apis'}), (sql:Concept {id: 'sql-vs-nosql'})
CREATE (http)-[:PREREQUISITE_OF {weight: 0.6}]->(sql);

MATCH (sql:Concept {id: 'sql-vs-nosql'}), (rep:Concept {id: 'database-replication'})
CREATE (sql)-[:PREREQUISITE_OF {weight: 0.9}]->(rep);

MATCH (rep:Concept {id: 'database-replication'}), (shard:Concept {id: 'database-sharding'})
CREATE (rep)-[:PREREQUISITE_OF {weight: 0.8}]->(shard);

MATCH (ch:Concept {id: 'consistent-hashing'}), (shard:Concept {id: 'database-sharding'})
CREATE (ch)-[:RELATED_TO {weight: 0.8}]->(shard);

MATCH (http:Concept {id: 'http-rest-apis'}), (mq:Concept {id: 'message-queues'})
CREATE (http)-[:PREREQUISITE_OF {weight: 0.7}]->(mq);

MATCH (mq:Concept {id: 'message-queues'}), (ms:Concept {id: 'microservices-architecture'})
CREATE (mq)-[:PREREQUISITE_OF {weight: 0.8}]->(ms);

MATCH (lb:Concept {id: 'load-balancing'}), (ms:Concept {id: 'microservices-architecture'})
CREATE (lb)-[:RELATED_TO {weight: 0.7}]->(ms);

MATCH (ms:Concept {id: 'microservices-architecture'}), (ag:Concept {id: 'api-gateway'})
CREATE (ms)-[:PREREQUISITE_OF {weight: 0.9}]->(ag);

MATCH (http:Concept {id: 'http-rest-apis'}), (rl:Concept {id: 'rate-limiting'})
CREATE (http)-[:PREREQUISITE_OF {weight: 0.7}]->(rl);

MATCH (ms:Concept {id: 'microservices-architecture'}), (cb:Concept {id: 'circuit-breaker'})
CREATE (ms)-[:PREREQUISITE_OF {weight: 0.8}]->(cb);

// Real Systems need multiple prerequisites
MATCH (http:Concept {id: 'http-rest-apis'}), (url:Concept {id: 'design-url-shortener'})
CREATE (http)-[:PREREQUISITE_OF {weight: 0.8}]->(url);

MATCH (cache:Concept {id: 'caching-strategies'}), (url:Concept {id: 'design-url-shortener'})
CREATE (cache)-[:PREREQUISITE_OF {weight: 0.7}]->(url);

MATCH (lb:Concept {id: 'load-balancing'}), (twitter:Concept {id: 'design-twitter'})
CREATE (lb)-[:PREREQUISITE_OF {weight: 0.9}]->(twitter);

MATCH (cache:Concept {id: 'caching-strategies'}), (twitter:Concept {id: 'design-twitter'})
CREATE (cache)-[:PREREQUISITE_OF {weight: 0.9}]->(twitter);

MATCH (shard:Concept {id: 'database-sharding'}), (twitter:Concept {id: 'design-twitter'})
CREATE (shard)-[:PREREQUISITE_OF {weight: 0.8}]->(twitter);

MATCH (ws:Concept {id: 'websockets'}), (whatsapp:Concept {id: 'design-whatsapp'})
CREATE (ws)-[:PREREQUISITE_OF {weight: 1.0}]->(whatsapp);

MATCH (mq:Concept {id: 'message-queues'}), (whatsapp:Concept {id: 'design-whatsapp'})
CREATE (mq)-[:PREREQUISITE_OF {weight: 0.9}]->(whatsapp);

MATCH (cdn:Concept {id: 'cdn-basics'}), (youtube:Concept {id: 'design-youtube'})
CREATE (cdn)-[:PREREQUISITE_OF {weight: 1.0}]->(youtube);

MATCH (mq:Concept {id: 'message-queues'}), (youtube:Concept {id: 'design-youtube'})
CREATE (mq)-[:PREREQUISITE_OF {weight: 0.8}]->(youtube);

MATCH (cache:Concept {id: 'caching-strategies'}), (uber:Concept {id: 'design-uber'})
CREATE (cache)-[:PREREQUISITE_OF {weight: 0.8}]->(uber);

MATCH (ws:Concept {id: 'websockets'}), (uber:Concept {id: 'design-uber'})
CREATE (ws)-[:PREREQUISITE_OF {weight: 0.9}]->(uber);

MATCH (mq:Concept {id: 'message-queues'}), (notif:Concept {id: 'design-notification-system'})
CREATE (mq)-[:PREREQUISITE_OF {weight: 1.0}]->(notif);

MATCH (rl:Concept {id: 'rate-limiting'}), (notif:Concept {id: 'design-notification-system'})
CREATE (rl)-[:RELATED_TO {weight: 0.7}]->(notif);

// ─────────────────────────────────────────────────────────────────────────────
// ─── CONCEPT → TOPIC ASSIGNMENTS ─────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

MATCH (c:Concept {id: 'big-o-notation'}), (t:Topic {id: 'topic-foundations'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'recursion-basics'}), (t:Topic {id: 'topic-foundations'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'math-for-dsa'}), (t:Topic {id: 'topic-foundations'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'bit-manipulation'}), (t:Topic {id: 'topic-foundations'}) CREATE (c)-[:BELONGS_TO]->(t);

MATCH (c:Concept {id: 'arrays'}), (t:Topic {id: 'topic-data-structures'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'strings'}), (t:Topic {id: 'topic-data-structures'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'matrix-2d-arrays'}), (t:Topic {id: 'topic-data-structures'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'prefix-sum'}), (t:Topic {id: 'topic-data-structures'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'linked-list-singly'}), (t:Topic {id: 'topic-data-structures'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'linked-list-doubly'}), (t:Topic {id: 'topic-data-structures'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'fast-slow-pointers'}), (t:Topic {id: 'topic-data-structures'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'stack'}), (t:Topic {id: 'topic-data-structures'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'queue'}), (t:Topic {id: 'topic-data-structures'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'monotonic-stack'}), (t:Topic {id: 'topic-data-structures'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'deque'}), (t:Topic {id: 'topic-data-structures'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'hash-maps'}), (t:Topic {id: 'topic-data-structures'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'binary-tree'}), (t:Topic {id: 'topic-data-structures'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'binary-search-tree'}), (t:Topic {id: 'topic-data-structures'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'heap'}), (t:Topic {id: 'topic-data-structures'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'trie'}), (t:Topic {id: 'topic-advanced'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'segment-tree'}), (t:Topic {id: 'topic-advanced'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'fenwick-tree'}), (t:Topic {id: 'topic-advanced'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'dsu'}), (t:Topic {id: 'topic-advanced'}) CREATE (c)-[:BELONGS_TO]->(t);

MATCH (c:Concept {id: 'bubble-sort'}), (t:Topic {id: 'topic-sorting'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'selection-sort'}), (t:Topic {id: 'topic-sorting'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'insertion-sort'}), (t:Topic {id: 'topic-sorting'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'merge-sort'}), (t:Topic {id: 'topic-sorting'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'quick-sort'}), (t:Topic {id: 'topic-sorting'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'counting-sort'}), (t:Topic {id: 'topic-sorting'}) CREATE (c)-[:BELONGS_TO]->(t);

MATCH (c:Concept {id: 'linear-search'}), (t:Topic {id: 'topic-searching'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'binary-search'}), (t:Topic {id: 'topic-searching'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'binary-search-on-answer'}), (t:Topic {id: 'topic-searching'}) CREATE (c)-[:BELONGS_TO]->(t);

MATCH (c:Concept {id: 'two-pointers'}), (t:Topic {id: 'topic-two-pointers'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'sliding-window'}), (t:Topic {id: 'topic-two-pointers'}) CREATE (c)-[:BELONGS_TO]->(t);

MATCH (c:Concept {id: 'graph-representation'}), (t:Topic {id: 'topic-graphs'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'bfs'}), (t:Topic {id: 'topic-graphs'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'dfs'}), (t:Topic {id: 'topic-graphs'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'topological-sort'}), (t:Topic {id: 'topic-graphs'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'dijkstra'}), (t:Topic {id: 'topic-graphs'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'bellman-ford'}), (t:Topic {id: 'topic-graphs'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'floyd-warshall'}), (t:Topic {id: 'topic-graphs'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'minimum-spanning-tree'}), (t:Topic {id: 'topic-graphs'}) CREATE (c)-[:BELONGS_TO]->(t);

MATCH (c:Concept {id: 'backtracking'}), (t:Topic {id: 'topic-recursion'}) CREATE (c)-[:BELONGS_TO]->(t);

MATCH (c:Concept {id: 'dp-introduction'}), (t:Topic {id: 'topic-dp'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'dp-tabulation'}), (t:Topic {id: 'topic-dp'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'dp-1d'}), (t:Topic {id: 'topic-dp'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'dp-2d'}), (t:Topic {id: 'topic-dp'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'dp-knapsack'}), (t:Topic {id: 'topic-dp'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'dp-intervals'}), (t:Topic {id: 'topic-dp'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'dp-on-trees'}), (t:Topic {id: 'topic-dp'}) CREATE (c)-[:BELONGS_TO]->(t);

MATCH (c:Concept {id: 'kmp-algorithm'}), (t:Topic {id: 'topic-strings'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'rabin-karp'}), (t:Topic {id: 'topic-strings'}) CREATE (c)-[:BELONGS_TO]->(t);

// System Design Topic Assignments
MATCH (c:Concept {id: 'client-server-arch'}), (t:Topic {id: 'topic-sd-fundamentals'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'http-rest-apis'}), (t:Topic {id: 'topic-sd-fundamentals'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'dns-resolution'}), (t:Topic {id: 'topic-sd-fundamentals'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'websockets'}), (t:Topic {id: 'topic-sd-fundamentals'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'cdn-basics'}), (t:Topic {id: 'topic-sd-infra'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'horizontal-vertical-scaling'}), (t:Topic {id: 'topic-sd-scalability'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'load-balancing'}), (t:Topic {id: 'topic-sd-scalability'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'caching-strategies'}), (t:Topic {id: 'topic-sd-scalability'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'cap-theorem'}), (t:Topic {id: 'topic-sd-scalability'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'consistent-hashing'}), (t:Topic {id: 'topic-sd-scalability'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'sql-vs-nosql'}), (t:Topic {id: 'topic-sd-databases'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'database-replication'}), (t:Topic {id: 'topic-sd-databases'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'database-sharding'}), (t:Topic {id: 'topic-sd-databases'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'message-queues'}), (t:Topic {id: 'topic-sd-infra'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'microservices-architecture'}), (t:Topic {id: 'topic-sd-infra'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'api-gateway'}), (t:Topic {id: 'topic-sd-infra'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'rate-limiting'}), (t:Topic {id: 'topic-sd-patterns'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'circuit-breaker'}), (t:Topic {id: 'topic-sd-patterns'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'design-url-shortener'}), (t:Topic {id: 'topic-sd-real-systems'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'design-twitter'}), (t:Topic {id: 'topic-sd-real-systems'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'design-whatsapp'}), (t:Topic {id: 'topic-sd-real-systems'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'design-youtube'}), (t:Topic {id: 'topic-sd-real-systems'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'design-uber'}), (t:Topic {id: 'topic-sd-real-systems'}) CREATE (c)-[:BELONGS_TO]->(t);
MATCH (c:Concept {id: 'design-notification-system'}), (t:Topic {id: 'topic-sd-real-systems'}) CREATE (c)-[:BELONGS_TO]->(t);

// ─── FINAL STATS ─────────────────────────────────────────────────────────────
MATCH (c:Concept) RETURN count(c) AS total_concepts;
MATCH ()-[r:PREREQUISITE_OF]->() RETURN count(r) AS total_prerequisites;
MATCH ()-[r:BELONGS_TO]->() RETURN count(r) AS total_topic_assignments;
