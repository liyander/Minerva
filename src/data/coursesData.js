import { apiFetch } from '../services/api'

// Rooms data storage with content
function getToneByLevel(level) {
  if (level === 'Easy') {
    return { levelTone: 'text-emerald-600', dotTone: 'bg-emerald-500' }
  }
  if (level === 'Medium') {
    return { levelTone: 'text-amber-600', dotTone: 'bg-amber-500' }
  }
  return { levelTone: 'text-primary', dotTone: 'bg-primary' }
}

function normalizeCourse(room) {
  const tone = getToneByLevel(room.level)
  return {
    ...room,
    levelTone: room.levelTone || tone.levelTone,
    dotTone: room.dotTone || tone.dotTone,
    difficulty: room.difficulty || room.level || '',
    roomType: room.roomType || room.room_type || 'theoretical',
    estimateTime: room.estimateTime || '',
    environment: room.environment || '',
    tags: room.tags || [],
    requiredKeywords: room.requiredKeywords || [],
    content: {
      markdown: room.content?.markdown || '',
      html: room.content?.html || '',
      missionOverview: room.content?.missionOverview || '',
      remediationProtocols: room.content?.remediationProtocols || '',
      vulnerabilityBriefing: {
        definition: room.content?.vulnerabilityBriefing?.definition || '',
        impact: room.content?.vulnerabilityBriefing?.impact || '',
      },
      technicalDeepDive: room.content?.technicalDeepDive || '',
      youtubeVideoUrl: room.content?.youtubeVideoUrl || '',
      aiQuestionsEnabled: Boolean(room.content?.aiQuestionsEnabled),
      attachment: room.content?.attachment || null,
      docker: {
        enabled: Boolean(room.content?.docker?.enabled),
        image: room.content?.docker?.image || '',
        containerPort: room.content?.docker?.containerPort || '',
        protocol: room.content?.docker?.protocol || 'http',
        timeoutMinutes: Number(room.content?.docker?.timeoutMinutes || 120),
        instructions: room.content?.docker?.instructions || '',
        terminalTools: room.content?.docker?.terminalTools || '',
        exposeAttachmentToTerminal: Boolean(room.content?.docker?.exposeAttachmentToTerminal),
        terminalMode: room.content?.docker?.terminalMode || 'service',
        terminalImage: room.content?.docker?.terminalImage || '',
      },
      questionsEnabled: Boolean(room.content?.questionsEnabled),
      questions: Array.isArray(room.content?.questions) ? room.content.questions : [],
    },
  }
}

export const defaultCourses = [
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
    tags: ['HTML', 'CSS'],
    requiredKeywords: ['semantic', 'flexbox', 'selector'],
    categoryTag: 'Web Development',
    content: {
      markdown: `# HTML & CSS Foundations

## What you will learn

Every website you have ever visited is built on the same two languages: HTML for
structure and CSS for presentation. In this course you will write both by hand,
without a framework, so the fundamentals stick.

## Key concepts

### Semantic HTML
Using the right element for the right job (\`<nav>\`, \`<main>\`, \`<article>\`)
makes your page easier to style, easier to maintain and accessible to screen readers.

### The box model
Every element is a box with content, padding, border and margin. Understanding how
those four layers stack is the single biggest unlock in CSS.

### Layout with flexbox
Flexbox lets you distribute space along one axis. It replaces most of the float and
positioning tricks that older tutorials still teach.

## Practice

Rebuild a simple profile card using semantic markup and flexbox, then make it
readable on a phone-sized screen.`,
      missionOverview:
        'Write a complete, responsive web page using semantic HTML and modern CSS layout.',
      remediationProtocols:
        'Review the box model and flexbox axis rules, then rebuild the layout without copying the sample code.',
      vulnerabilityBriefing: {
        definition:
          'Semantic HTML is the practice of choosing elements based on meaning rather than appearance.',
        impact:
          'Good structure improves accessibility, search ranking and long-term maintainability.',
      },
      technicalDeepDive:
        'CSS resolves layout in passes: the box model sizes each element, then the layout mode (flow, flex or grid) positions it.',
      html: `<section class="rounded-3xl bg-surface-container-lowest p-8">
  <h2 class="font-headline text-2xl font-extrabold mb-4">What you will learn</h2>
  <p class="font-body leading-relaxed text-on-surface-variant">Build a complete web page using semantic HTML and modern CSS layout.</p>
</section>`,
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
    tags: ['JavaScript', 'DOM'],
    requiredKeywords: ['function', 'array', 'event'],
    categoryTag: 'Programming',
    content: {
      markdown: `# JavaScript Essentials

## Overview

JavaScript turns a static page into something people can use. This course covers the
language core — values, functions, arrays and objects — and then connects it to the
page through the DOM and event listeners.

## Topics

- Declaring values with \`const\` and \`let\`, and why \`var\` is avoided
- Writing functions, including arrow functions and default parameters
- Working with arrays using \`map\`, \`filter\` and \`reduce\`
- Selecting elements and responding to clicks and input events`,
      html: `<section class="rounded-3xl bg-surface-container-lowest p-8">
  <h2 class="font-headline text-2xl font-extrabold mb-4">JavaScript Essentials</h2>
  <p class="font-body text-on-surface-variant">Learn the language core, then wire it up to the page.</p>
</section>`,
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
    tags: ['SQL', 'Databases'],
    requiredKeywords: ['SELECT', 'JOIN', 'GROUP BY'],
    categoryTag: 'Data',
    content: {
      markdown: `# Databases & SQL

## Overview

Relational databases store almost all of the world's business data. This course
teaches you to design a sensible schema and then ask it useful questions.

## Topics

- Tables, primary keys and foreign keys
- Filtering with \`WHERE\` and sorting with \`ORDER BY\`
- Combining tables with \`INNER JOIN\` and \`LEFT JOIN\`
- Summarising with \`GROUP BY\` and aggregate functions
- Why an index makes a query fast, and when it does not`,
      html: `<section class="rounded-3xl bg-surface-container-lowest p-8">
  <h2 class="font-headline text-2xl font-extrabold mb-4">Databases &amp; SQL</h2>
  <p class="font-body text-on-surface-variant">Design a schema and query it with joins and aggregates.</p>
</section>`,
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
    tags: ['Design', 'UI'],
    requiredKeywords: ['hierarchy', 'contrast', 'spacing'],
    categoryTag: 'Design',
    content: {
      markdown: `# UI Design Principles

## Overview

Good interface design is mostly a small number of decisions applied consistently.
This course covers those decisions and gives you a checklist to audit any screen.

## Topics

- Visual hierarchy: what the eye should reach first, second and third
- A spacing scale, and why arbitrary pixel values create visual noise
- Colour roles: surface, content, accent — and meeting contrast requirements
- Type scale and line length for comfortable reading`,
      html: `<section class="rounded-3xl bg-surface-container-lowest p-8">
  <h2 class="font-headline text-2xl font-extrabold mb-4">UI Design Principles</h2>
  <p class="font-body text-on-surface-variant">Hierarchy, spacing, colour and type applied consistently.</p>
</section>`,
    },
  },
]

let fallbackMemoryRooms = null;

export function getCoursesData() {
  if (fallbackMemoryRooms) return fallbackMemoryRooms;
  const stored = localStorage.getItem('roomsData')
  if (stored) {
    try {
      const parsed = JSON.parse(stored).map(normalizeCourse)
      fallbackMemoryRooms = parsed;
      return parsed;
    } catch (e) {
      console.error('Error parsing roomsData:', e)
      fallbackMemoryRooms = defaultCourses.map(normalizeCourse);
      return fallbackMemoryRooms;
    }
  }
  fallbackMemoryRooms = defaultCourses.map(normalizeCourse);
  return fallbackMemoryRooms;
}

export function setCoursesData(rooms) {
  fallbackMemoryRooms = rooms;
  try {
    localStorage.setItem('roomsData', JSON.stringify(rooms))
  } catch (error) {
    console.warn('localStorage quota exceeded for roomsData. Retaining in memory only.', error)
  }
}

export function hydrateCoursesData(rooms) {
  fallbackMemoryRooms = rooms.map(normalizeCourse);
  try {
    localStorage.setItem('roomsData', JSON.stringify(fallbackMemoryRooms))
  } catch (error) {
    console.warn('localStorage quota exceeded during room hydration. Retaining in memory only.', error)
  }
}

export function getCourseById(id) {
  const rooms = getCoursesData()
  return rooms.find((r) => r.id === id)
}

export function updateCourse(id, updates) {
  const rooms = getCoursesData()
  const index = rooms.findIndex((r) => r.id === id)
  if (index !== -1) {
    rooms[index] = normalizeCourse({ ...rooms[index], ...updates })
    setCoursesData(rooms)
    void apiFetch(`/rooms/${id}`, {
      method: 'PUT',
      body: JSON.stringify(rooms[index]),
    }).catch((error) => console.error('Failed to sync room update:', error))
    return rooms[index]
  }
  return null
}

export function addCourse(room) {
  const rooms = getCoursesData()
  const slugBase = (room.slug || room.title || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
  const slug = slugBase || `room-${Date.now()}`
  const newRoom = {
    ...room,
    id: slug,
    slug,
    content: room.content || { markdown: '', html: '' },
  }
  rooms.push(normalizeCourse(newRoom))
  setCoursesData(rooms)
  void apiFetch('/rooms', {
    method: 'POST',
    body: JSON.stringify(newRoom),
  }).catch((error) => console.error('Failed to sync room create:', error))
  return newRoom
}

export function deleteCourse(id) {
  const rooms = getCoursesData()
  const filtered = rooms.filter((r) => r.id !== id)
  setCoursesData(filtered)
  void apiFetch(`/rooms/${id}`, {
    method: 'DELETE',
  }).catch((error) => console.error('Failed to sync room delete:', error))
}
