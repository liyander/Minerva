// Starter content used by the admin "seed sample data" action and by first-run
// database initialisation. Everything here is general-purpose LMS material.

export const starterCategories = [
  'Web Development',
  'Programming',
  'Data',
  'Design',
  'Career Skills',
]

export const starterCourses = [
  {
    id: 'html-css-foundations',
    slug: 'html-css-foundations',
    category: 'Web Development',
    level: 'Easy',
    levelTone: 'text-emerald-600',
    dotTone: 'bg-emerald-500',
    title: 'HTML & CSS Foundations',
    description:
      'Build your first web page from scratch and learn how structure, styling and layout work together.',
    xp: '500 XP',
    roomType: 'theoretical',
    difficulty: 'Beginner',
    estimateTime: '45 minutes',
    environment: 'Web Browser',
    categoryTag: 'Web Development',
    tags: ['HTML', 'CSS'],
    requiredKeywords: ['semantic', 'flexbox', 'selector'],
    content: {
      markdown: [
        '# HTML & CSS Foundations',
        '',
        '## What you will learn',
        '',
        'Every website you have visited is built on the same two languages: HTML for',
        'structure and CSS for presentation. You will write both by hand, without a',
        'framework, so the fundamentals stick.',
        '',
        '## Key concepts',
        '',
        '### Semantic HTML',
        'Using the right element for the right job makes a page easier to style, easier',
        'to maintain, and readable by screen readers.',
        '',
        '### The box model',
        'Every element is a box with content, padding, border and margin. Understanding',
        'how those four layers stack is the biggest single unlock in CSS.',
        '',
        '### Layout with flexbox',
        'Flexbox distributes space along one axis and replaces most of the float tricks',
        'that older tutorials still teach.',
        '',
        '## Practice',
        '',
        'Rebuild a profile card using semantic markup and flexbox, then make it readable',
        'on a phone-sized screen.',
      ].join('\n'),
      html: '<section><h2>What you will learn</h2><p>Build a complete web page using semantic HTML and modern CSS layout.</p></section>',
      missionOverview:
        'Write a complete, responsive web page using semantic HTML and modern CSS layout.',
      remediationProtocols:
        'Review the box model and flexbox axis rules, then rebuild the layout without copying the sample code.',
      vulnerabilityBriefing: {
        definition:
          'Semantic HTML is the practice of choosing elements based on meaning rather than appearance.',
        impact: 'Good structure improves accessibility, search ranking and maintainability.',
      },
      technicalDeepDive:
        'CSS resolves layout in passes: the box model sizes each element, then the layout mode positions it.',
    },
  },
  {
    id: 'javascript-essentials',
    slug: 'javascript-essentials',
    category: 'Programming',
    level: 'Medium',
    levelTone: 'text-amber-600',
    dotTone: 'bg-amber-500',
    title: 'JavaScript Essentials',
    description:
      'Variables, functions, arrays and the DOM: the core of the language that runs in every browser.',
    xp: '1,250 XP',
    roomType: 'theoretical',
    difficulty: 'Intermediate',
    estimateTime: '60 minutes',
    environment: 'Browser Console',
    categoryTag: 'Programming',
    tags: ['JavaScript', 'DOM'],
    requiredKeywords: ['function', 'array', 'event'],
    content: {
      markdown: [
        '# JavaScript Essentials',
        '',
        '## Overview',
        '',
        'JavaScript turns a static page into something people can use. This course covers',
        'the language core, then connects it to the page through the DOM and events.',
        '',
        '## Topics',
        '',
        '- Declaring values with `const` and `let`, and why `var` is avoided',
        '- Writing functions, including arrow functions and default parameters',
        '- Working with arrays using `map`, `filter` and `reduce`',
        '- Selecting elements and responding to clicks and input events',
      ].join('\n'),
      html: '<section><h2>JavaScript Essentials</h2><p>Learn the language core, then wire it up to the page.</p></section>',
      missionOverview: 'Learn the JavaScript core and use it to make a page interactive.',
      remediationProtocols: 'Re-read the array methods section and rewrite the exercises from memory.',
      vulnerabilityBriefing: {
        definition: 'The DOM is the browser’s live, editable representation of the page.',
        impact: 'Changing the DOM from JavaScript is what makes a page interactive.',
      },
      technicalDeepDive:
        'Event listeners attach callbacks that the browser invokes as events bubble up through the tree.',
    },
  },
  {
    id: 'databases-and-sql',
    slug: 'databases-and-sql',
    category: 'Data',
    level: 'Medium',
    levelTone: 'text-amber-600',
    dotTone: 'bg-amber-500',
    title: 'Databases & SQL',
    description:
      'Model data properly and query it with confidence using joins, grouping and indexes.',
    xp: '1,000 XP',
    roomType: 'practical',
    difficulty: 'Intermediate',
    estimateTime: '75 minutes',
    environment: 'SQL Sandbox',
    categoryTag: 'Data',
    tags: ['SQL', 'Databases'],
    requiredKeywords: ['SELECT', 'JOIN', 'GROUP BY'],
    content: {
      markdown: [
        '# Databases & SQL',
        '',
        '## Overview',
        '',
        'Relational databases store most of the world’s business data. Learn to design a',
        'sensible schema and then ask it useful questions.',
        '',
        '## Topics',
        '',
        '- Tables, primary keys and foreign keys',
        '- Filtering with `WHERE` and sorting with `ORDER BY`',
        '- Combining tables with `INNER JOIN` and `LEFT JOIN`',
        '- Summarising with `GROUP BY` and aggregate functions',
        '- Why an index makes a query fast, and when it does not',
      ].join('\n'),
      html: '<section><h2>Databases &amp; SQL</h2><p>Design a schema and query it with joins and aggregates.</p></section>',
      missionOverview: 'Design a small relational schema and query it accurately.',
      remediationProtocols: 'Revisit join types and rewrite each query without looking at the answer.',
      vulnerabilityBriefing: {
        definition: 'A join combines rows from two tables using a related column.',
        impact: 'Choosing the wrong join type silently drops or duplicates rows.',
      },
      technicalDeepDive:
        'The planner uses indexes and table statistics to decide how to satisfy a query.',
    },
  },
  {
    id: 'design-principles',
    slug: 'design-principles',
    category: 'Design',
    level: 'Easy',
    levelTone: 'text-emerald-600',
    dotTone: 'bg-emerald-500',
    title: 'UI Design Principles',
    description:
      'Hierarchy, spacing, colour and type — the rules that make an interface feel considered.',
    xp: '750 XP',
    roomType: 'theoretical',
    difficulty: 'Beginner',
    estimateTime: '50 minutes',
    environment: 'Design Tool',
    categoryTag: 'Design',
    tags: ['Design', 'UI'],
    requiredKeywords: ['hierarchy', 'contrast', 'spacing'],
    content: {
      markdown: [
        '# UI Design Principles',
        '',
        '## Overview',
        '',
        'Good interface design is mostly a small number of decisions applied consistently.',
        'This course covers those decisions and gives you a checklist to audit any screen.',
        '',
        '## Topics',
        '',
        '- Visual hierarchy: what the eye should reach first, second and third',
        '- A spacing scale, and why arbitrary pixel values create visual noise',
        '- Colour roles: surface, content, accent — and meeting contrast requirements',
        '- Type scale and line length for comfortable reading',
      ].join('\n'),
      html: '<section><h2>UI Design Principles</h2><p>Hierarchy, spacing, colour and type applied consistently.</p></section>',
      missionOverview: 'Audit and improve an existing screen using core design principles.',
      remediationProtocols: 'Re-apply the checklist to a screen you have already built.',
      vulnerabilityBriefing: {
        definition: 'Visual hierarchy is the deliberate ordering of what a viewer notices first.',
        impact: 'Without hierarchy every element competes and the screen feels noisy.',
      },
      technicalDeepDive:
        'Contrast ratio, size and spacing are the three levers that establish hierarchy.',
    },
  },
  {
    id: 'communication-at-work',
    slug: 'communication-at-work',
    category: 'Career Skills',
    level: 'Easy',
    levelTone: 'text-emerald-600',
    dotTone: 'bg-emerald-500',
    title: 'Communicating at Work',
    description:
      'Write updates people actually read, give useful feedback, and run a meeting worth attending.',
    xp: '600 XP',
    roomType: 'theoretical',
    difficulty: 'Beginner',
    estimateTime: '40 minutes',
    environment: 'None required',
    categoryTag: 'Career Skills',
    tags: ['Communication', 'Teamwork'],
    requiredKeywords: ['audience', 'summary', 'feedback'],
    content: {
      markdown: [
        '# Communicating at Work',
        '',
        '## Overview',
        '',
        'Technical skill gets you into the room; communication decides what happens next.',
        '',
        '## Topics',
        '',
        '- Leading with the conclusion instead of the chronology',
        '- Writing a status update that answers the reader’s question',
        '- Giving feedback that is specific, actionable and kind',
        '- Deciding whether a meeting is needed at all',
      ].join('\n'),
      html: '<section><h2>Communicating at Work</h2><p>Write updates people read and give feedback people can use.</p></section>',
      missionOverview: 'Practise written and spoken updates that respect the reader’s time.',
      remediationProtocols: 'Rewrite one of your own recent updates using the conclusion-first structure.',
      vulnerabilityBriefing: {
        definition: 'Conclusion-first writing states the outcome before the reasoning.',
        impact: 'Readers who stop after one line still get the important part.',
      },
      technicalDeepDive:
        'Most workplace writing is skimmed, so structure carries more weight than prose style.',
    },
  },
]

export const starterCareerPaths = [
  {
    id: 'full-stack-developer',
    slug: 'full-stack-developer',
    title: 'Full-Stack Developer',
    description:
      'Go from your first HTML page to a deployed application. This path covers the front end, the back end and the database work that connects them.',
    icon: 'code',
    learningPathLevel: 'Beginner',
    difficulty: 'Beginner',
    estimatedHours: 120,
    enrolledCount: 1420,
    mastery: 0,
    color: 'primary',
    roadmapSortOrder: 1,
    modules: [
      {
        id: 'fsd-mod-01',
        phase: 'Module 01',
        title: 'Front-End Foundations',
        description: 'Structure and style pages with HTML and CSS',
        rooms: ['html-css-foundations', 'design-principles'],
      },
      {
        id: 'fsd-mod-02',
        phase: 'Module 02',
        title: 'Programming & Data',
        description: 'Add behaviour with JavaScript and persist it with SQL',
        rooms: ['javascript-essentials', 'databases-and-sql'],
      },
    ],
    resources: [
      { id: 'fsd-res-01', title: 'MDN Web Docs', url: 'https://developer.mozilla.org', type: 'Reference' },
      { id: 'fsd-res-02', title: 'Deployment Checklist', url: '#', type: 'Guide' },
    ],
  },
  {
    id: 'data-analyst',
    slug: 'data-analyst',
    title: 'Data Analyst',
    description:
      'Turn raw data into decisions. Learn SQL, spreadsheet modelling, statistics and the reporting habits that make analysis trustworthy.',
    icon: 'insights',
    learningPathLevel: 'Intermediate',
    difficulty: 'Intermediate',
    estimatedHours: 100,
    enrolledCount: 895,
    mastery: 0,
    color: 'secondary',
    roadmapSortOrder: 2,
    modules: [
      {
        id: 'da-mod-01',
        phase: 'Module 01',
        title: 'Querying Data',
        description: 'Pull the numbers you need with SQL',
        rooms: ['databases-and-sql'],
      },
    ],
    resources: [
      { id: 'da-res-01', title: 'SQL Style Guide', url: '#', type: 'Reference' },
    ],
  },
  {
    id: 'product-designer',
    slug: 'product-designer',
    title: 'Product Designer',
    description:
      'Research, wireframe, prototype and hand off. A practical path through the craft of designing interfaces people can actually use.',
    icon: 'palette',
    learningPathLevel: 'Beginner',
    difficulty: 'Beginner',
    estimatedHours: 80,
    enrolledCount: 624,
    mastery: 0,
    color: 'tertiary',
    roadmapSortOrder: 3,
    modules: [
      {
        id: 'pd-mod-01',
        phase: 'Module 01',
        title: 'Interface Fundamentals',
        description: 'The principles behind a considered screen',
        rooms: ['design-principles'],
      },
    ],
    resources: [],
  },
]

// Knowledge-base articles. These reuse the `cves` table, whose columns the
// application surfaces as: cve_id -> reference code, short_description ->
// summary, credit -> author, vulnerability_report -> body.
export const starterResources = [
  {
    cve_id: 'GUIDE-001',
    short_description: 'How to structure a study plan you actually finish.',
    found_year: new Date().getFullYear(),
    credit: 'Minerva Learning Team',
    vulnerability_report:
      'Most learners stall because their plan is a wish list rather than a schedule. This guide walks through sizing a goal against the hours you genuinely have each week, breaking a path into weekly modules, and building a review loop so earlier material stays fresh. It closes with three sample plans for five, ten and twenty hours a week.',
    method_followed:
      'Compiled from completion data across the platform and interviews with learners who finished a full path.',
    references_text: 'https://en.wikipedia.org/wiki/Spaced_repetition',
  },
  {
    cve_id: 'GUIDE-002',
    short_description: 'Reading documentation without getting lost.',
    found_year: new Date().getFullYear(),
    credit: 'Minerva Learning Team',
    vulnerability_report:
      'Official documentation is written for reference, not for learning, which is why it feels impenetrable at first. This guide covers how to identify the entry point of a doc site, when to read the guide versus the API reference, and how to build a small runnable example alongside your reading so the concepts land.',
    method_followed: 'Written by the teaching team from common questions raised in office hours.',
    references_text: 'https://developer.mozilla.org',
  },
  {
    cve_id: 'GUIDE-003',
    short_description: 'Preparing for your first technical interview.',
    found_year: new Date().getFullYear(),
    credit: 'Careers Team',
    vulnerability_report:
      'A walkthrough of the usual interview stages, what each one is really testing, and how to prepare for them without memorising trivia. Includes advice on talking through your reasoning out loud, asking clarifying questions before you start, and recovering gracefully when you get stuck.',
    method_followed: 'Based on debriefs from students who completed the career-prep track.',
    references_text: '',
  },
]

export const starterNotifications = [
  {
    title: 'Welcome to Minerva',
    message:
      'Your account is ready. Start with a learning path, or browse the course catalogue to find something specific.',
    type: 'info',
  },
  {
    title: 'New courses published',
    message: 'Five starter courses are now available across web development, data and design.',
    type: 'success',
  },
]

// Scheduled a few days out so the dashboard calendar has something to show.
export function buildStarterEvents(now = new Date()) {
  const at = (days, hour) => {
    const date = new Date(now)
    date.setDate(date.getDate() + days)
    date.setHours(hour, 0, 0, 0)
    return date
  }

  return [
    {
      name: 'Live session: Getting started with HTML',
      registration_deadline: at(2, 12),
      live_time: at(3, 17),
      registration_link: '#',
      event_format: 'Online',
    },
    {
      name: 'Workshop: Writing your first SQL joins',
      registration_deadline: at(6, 12),
      live_time: at(7, 15),
      registration_link: '#',
      event_format: 'Online',
    },
    {
      name: 'Portfolio review clinic',
      registration_deadline: at(12, 12),
      live_time: at(14, 16),
      registration_link: '#',
      event_format: 'Online',
    },
  ]
}
