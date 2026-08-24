// Cross-stream starter content. IDs are stable so this data can be safely
// re-applied to an existing installation without creating duplicates.

function course({ id, category, title, description, tags, keywords, practical = false, environment = 'Classroom or online' }) {
  return {
    id,
    slug: id,
    category,
    level: 'Easy',
    levelTone: 'text-emerald-600',
    dotTone: 'bg-emerald-500',
    title,
    description,
    xp: '750 XP',
    roomType: practical ? 'practical' : 'theoretical',
    difficulty: 'Beginner',
    estimateTime: '60 minutes',
    environment,
    categoryTag: category,
    tags,
    requiredKeywords: keywords,
    content: {
      markdown: `# ${title}\n\n## Overview\n\n${description}\n\n## Learning outcomes\n\n- Explain the essential concepts and vocabulary\n- Apply the concepts to a realistic discipline-specific scenario\n- Review evidence, communicate a conclusion, and reflect on improvement\n\n## Practice\n\nComplete a short case task and submit a structured explanation of your decisions.`,
      html: `<section><h2>${title}</h2><p>${description}</p></section>`,
      missionOverview: `Apply the foundations of ${title.toLowerCase()} to a realistic case task.`,
      remediationProtocols: 'Review the key terminology, revisit the worked example, and retry the case task with feedback.',
      vulnerabilityBriefing: {
        definition: `${title} introduces the core knowledge and practices used in this discipline.`,
        impact: 'Strong foundations improve later practical work, analysis, and professional judgement.',
      },
      technicalDeepDive: 'Use evidence, domain terminology, and a clear method to justify each decision.',
    },
  }
}

export const departmentCategories = [
  'Engineering',
  'Medicine & Health Sciences',
  'Commerce & Accounting',
  'Arts & Humanities',
  'Law',
  'Science',
  'Education',
  'Management',
  'Social Sciences',
]

export const departmentCourses = [
  course({ id: 'engineering-fundamentals', category: 'Engineering', title: 'Engineering Fundamentals', description: 'Use measurement, modelling, systems thinking, and design constraints to solve introductory engineering problems.', tags: ['Engineering', 'Systems Thinking', 'Measurement'], keywords: ['constraints', 'model', 'measurement'], practical: true, environment: 'Engineering workshop or simulator' }),
  course({ id: 'technical-drawing-cad', category: 'Engineering', title: 'Technical Drawing & CAD', description: 'Read and produce clear engineering drawings using projection, dimensioning, tolerances, and CAD conventions.', tags: ['CAD', 'Technical Drawing', 'Design'], keywords: ['projection', 'dimension', 'tolerance'], practical: true, environment: 'CAD software' }),
  course({ id: 'human-anatomy-foundations', category: 'Medicine & Health Sciences', title: 'Human Anatomy Foundations', description: 'Understand anatomical terminology and the organisation of major human body systems.', tags: ['Anatomy', 'Health Sciences', 'Biology'], keywords: ['anatomical position', 'organ system', 'homeostasis'] }),
  course({ id: 'clinical-communication', category: 'Medicine & Health Sciences', title: 'Clinical Communication & Ethics', description: 'Practise patient-centred communication, informed consent, confidentiality, and ethical clinical reasoning.', tags: ['Clinical Communication', 'Ethics', 'Healthcare'], keywords: ['consent', 'confidentiality', 'empathy'], practical: true, environment: 'Role-play or simulation' }),
  course({ id: 'financial-accounting-basics', category: 'Commerce & Accounting', title: 'Financial Accounting Basics', description: 'Record transactions and interpret the income statement, balance sheet, and cash-flow statement.', tags: ['Accounting', 'Finance', 'Bookkeeping'], keywords: ['journal', 'ledger', 'balance sheet'], practical: true, environment: 'Spreadsheet' }),
  course({ id: 'business-economics', category: 'Commerce & Accounting', title: 'Business Economics', description: 'Apply supply, demand, market structure, costs, and incentives to everyday business decisions.', tags: ['Economics', 'Commerce', 'Business'], keywords: ['supply', 'demand', 'opportunity cost'] }),
  course({ id: 'academic-writing-humanities', category: 'Arts & Humanities', title: 'Academic Writing for the Humanities', description: 'Develop an evidence-based argument using close reading, credible sources, citation, and revision.', tags: ['Academic Writing', 'Humanities', 'Research'], keywords: ['thesis', 'evidence', 'citation'], practical: true, environment: 'Document editor' }),
  course({ id: 'culture-media-society', category: 'Arts & Humanities', title: 'Culture, Media & Society', description: 'Analyse how texts, media, history, identity, and institutions shape cultural meaning.', tags: ['Culture', 'Media Studies', 'Humanities'], keywords: ['representation', 'context', 'interpretation'] }),
  course({ id: 'legal-research-reasoning', category: 'Law', title: 'Legal Research & Reasoning', description: 'Find authoritative legal sources, identify issues, apply rules, and communicate a reasoned conclusion.', tags: ['Law', 'Legal Research', 'Reasoning'], keywords: ['precedent', 'statute', 'IRAC'], practical: true, environment: 'Legal database' }),
  course({ id: 'constitutional-law-foundations', category: 'Law', title: 'Constitutional Law Foundations', description: 'Explore constitutional principles, institutions, rights, duties, and the rule of law.', tags: ['Constitutional Law', 'Public Law', 'Rights'], keywords: ['constitution', 'separation of powers', 'rule of law'] }),
  course({ id: 'scientific-research-methods', category: 'Science', title: 'Scientific Research Methods', description: 'Form hypotheses, design controlled investigations, evaluate evidence, and report reproducible results.', tags: ['Science', 'Research Methods', 'Evidence'], keywords: ['hypothesis', 'variable', 'reproducibility'], practical: true, environment: 'Laboratory or simulation' }),
  course({ id: 'statistics-for-research', category: 'Science', title: 'Statistics for Research', description: 'Summarise data, select suitable statistical methods, and interpret uncertainty without overstating results.', tags: ['Statistics', 'Research', 'Data'], keywords: ['distribution', 'confidence interval', 'correlation'], practical: true, environment: 'Spreadsheet or statistics software' }),
  course({ id: 'teaching-learning-foundations', category: 'Education', title: 'Teaching & Learning Foundations', description: 'Plan inclusive lessons using learning outcomes, active learning, assessment, and constructive feedback.', tags: ['Education', 'Teaching', 'Assessment'], keywords: ['learning outcome', 'formative assessment', 'feedback'], practical: true, environment: 'Classroom or lesson simulator' }),
  course({ id: 'project-management-foundations', category: 'Management', title: 'Project Management Foundations', description: 'Define scope, schedule work, manage risk, communicate progress, and review project outcomes.', tags: ['Management', 'Projects', 'Leadership'], keywords: ['scope', 'milestone', 'risk register'], practical: true, environment: 'Project board' }),
  course({ id: 'psychology-society', category: 'Social Sciences', title: 'Psychology & Society', description: 'Examine human behaviour using foundational psychological theories, research evidence, and social context.', tags: ['Psychology', 'Social Sciences', 'Behaviour'], keywords: ['cognition', 'development', 'social influence'] }),
]

const path = ({ id, title, description, icon, order, courses }) => ({
  id,
  slug: id,
  title,
  description,
  icon,
  learningPathLevel: 'Beginner',
  difficulty: 'Beginner',
  estimatedHours: courses.length * 30,
  enrolledCount: 0,
  mastery: 0,
  color: 'primary',
  roadmapSortOrder: order,
  modules: courses.map((roomId, index) => ({
    id: `${id}-mod-${String(index + 1).padStart(2, '0')}`,
    phase: `Module ${String(index + 1).padStart(2, '0')}`,
    title: departmentCourses.find((item) => item.id === roomId)?.title || 'Core module',
    description: 'Build core knowledge and apply it in a guided discipline-specific task.',
    rooms: [roomId],
  })),
  resources: [],
})

export const departmentCareerPaths = [
  path({ id: 'engineering-foundations-path', title: 'Engineering Foundations', description: 'Build the modelling, drawing, measurement, and design skills shared across engineering disciplines.', icon: 'engineering', order: 10, courses: ['engineering-fundamentals', 'technical-drawing-cad'] }),
  path({ id: 'health-sciences-foundations-path', title: 'Health Sciences Foundations', description: 'Develop foundational anatomy knowledge alongside ethical and patient-centred communication.', icon: 'medical_services', order: 11, courses: ['human-anatomy-foundations', 'clinical-communication'] }),
  path({ id: 'commerce-accounting-path', title: 'Commerce & Accounting Foundations', description: 'Understand financial records and the economic reasoning behind business decisions.', icon: 'account_balance', order: 12, courses: ['financial-accounting-basics', 'business-economics'] }),
  path({ id: 'arts-humanities-path', title: 'Arts & Humanities Foundations', description: 'Strengthen interpretation, research, cultural analysis, and evidence-based writing.', icon: 'history_edu', order: 13, courses: ['academic-writing-humanities', 'culture-media-society'] }),
  path({ id: 'legal-studies-path', title: 'Legal Studies Foundations', description: 'Learn to research authority, reason from rules and precedent, and understand constitutional principles.', icon: 'gavel', order: 14, courses: ['legal-research-reasoning', 'constitutional-law-foundations'] }),
  path({ id: 'scientific-research-path', title: 'Scientific Research Foundations', description: 'Design reliable investigations and interpret quantitative evidence responsibly.', icon: 'science', order: 15, courses: ['scientific-research-methods', 'statistics-for-research'] }),
  path({ id: 'educator-development-path', title: 'Educator Development', description: 'Plan inclusive learning and manage educational projects with measurable outcomes.', icon: 'school', order: 16, courses: ['teaching-learning-foundations', 'project-management-foundations'] }),
  path({ id: 'social-sciences-path', title: 'Social Sciences Foundations', description: 'Study behaviour and society using theory, evidence, and ethical research practice.', icon: 'groups', order: 17, courses: ['psychology-society', 'statistics-for-research'] }),
]

export const departmentResources = [
  { cve_id: 'GUIDE-STREAM-ENGINEERING', short_description: 'Engineering design process and technical evidence checklist.', credit: 'Engineering Faculty', vulnerability_report: 'A reusable checklist for defining constraints, comparing concepts, documenting calculations, reviewing safety, and presenting an engineering recommendation.', method_followed: 'Prepared as a cross-discipline engineering study aid.', references_text: '' },
  { cve_id: 'GUIDE-STREAM-HEALTH', short_description: 'Health-sciences study, ethics, and clinical communication guide.', credit: 'Health Sciences Faculty', vulnerability_report: 'Guidance for learning clinical terminology, communicating respectfully, handling confidential information, and reflecting on patient-centred practice.', method_followed: 'Prepared from foundational health-sciences learning outcomes.', references_text: '' },
  { cve_id: 'GUIDE-STREAM-BUSINESS', short_description: 'Commerce, accounting, and management case-analysis guide.', credit: 'Business Faculty', vulnerability_report: 'A framework for separating facts from assumptions, interpreting financial evidence, assessing stakeholders and risks, and making a defensible business recommendation.', method_followed: 'Prepared for introductory commerce and management cases.', references_text: '' },
  { cve_id: 'GUIDE-STREAM-LAW-ARTS', short_description: 'Source evaluation, citation, and structured argument guide.', credit: 'Law and Humanities Faculty', vulnerability_report: 'A practical guide to identifying authoritative sources, taking evidence notes, avoiding plagiarism, structuring arguments, and citing consistently.', method_followed: 'Prepared for legal, arts, humanities, and social-science assignments.', references_text: '' },
  { cve_id: 'GUIDE-STREAM-SCIENCE', short_description: 'Scientific method, data integrity, and reproducible reporting guide.', credit: 'Science Faculty', vulnerability_report: 'A checklist covering hypotheses, variables, sampling, data cleaning, uncertainty, reproducibility, and responsible conclusions.', method_followed: 'Prepared for laboratory and quantitative research work.', references_text: '' },
].map((resource) => ({ ...resource, found_year: new Date().getFullYear() }))
