import { apiFetch } from '../services/api'

const CAREER_PATHS_STORAGE_KEY = 'careerPathsData'
const CAREER_PATHS_UPDATED_EVENT = 'incognitrix:career-paths-updated'

function emitCareerPathsUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(CAREER_PATHS_UPDATED_EVENT))
  }
}

// Career paths data storage
function normalizeCareerPath(path) {
  return {
    ...path,
    learningPathLevel: path.learningPathLevel || path.difficulty || 'Basic',
    difficulty: path.difficulty || path.learningPathLevel || 'Basic',
    roadmapSortOrder: path.roadmapSortOrder ?? path.roadmap_sort_order ?? 0,
    modules: (path.modules || []).map((module) => ({
      ...module,
      linkedPathId: module.linkedPathId || module.linked_path_id || '',
    })),
    resources: path.resources || [],
     certificateImageData: path.certificateImageData || null,
  }
}

export const defaultCareerPaths = [
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
    enrolledCount: 14209,
    mastery: 12,
    color: 'primary',
    certificateImageData: null,
    modules: [
      {
        id: 'mod-01',
        phase: 'Module 01',
        title: 'Front-End Foundations',
        description: 'Structure and style pages with HTML and CSS',
        rooms: ['html-css-foundations', 'design-principles'],
      },
      {
        id: 'mod-02',
        phase: 'Module 02',
        title: 'Programming & Data',
        description: 'Add behaviour with JavaScript and persist it with SQL',
        rooms: ['javascript-essentials', 'databases-and-sql'],
      },
    ],
    resources: [
      {
        id: 'res-01',
        title: 'MDN Web Docs',
        url: 'https://developer.mozilla.org',
        type: 'Reference',
      },
      {
        id: 'res-02',
        title: 'Deployment Checklist',
        url: '#',
        type: 'Guide',
      },
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
    enrolledCount: 8950,
    mastery: 45,
    color: 'secondary',
    certificateImageData: null,
    modules: [
      {
        id: 'mod-03',
        phase: 'Module 01',
        title: 'Querying Data',
        description: 'Pull the numbers you need with SQL',
        rooms: ['databases-and-sql'],
      },
    ],
    resources: [],
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
    enrolledCount: 6240,
    mastery: 0,
    color: 'tertiary',
    certificateImageData: null,
    modules: [
      {
        id: 'mod-04',
        phase: 'Module 01',
        title: 'Interface Fundamentals',
        description: 'The principles behind a considered screen',
        rooms: ['design-principles'],
      },
    ],
    resources: [],
  },
]

let fallbackMemoryCareerPaths = null;

export function getCareerPathsData() {
  if (fallbackMemoryCareerPaths) return fallbackMemoryCareerPaths;
  const stored = localStorage.getItem(CAREER_PATHS_STORAGE_KEY)
  if (stored) {
    try {
      const parsed = JSON.parse(stored).map(normalizeCareerPath)
      fallbackMemoryCareerPaths = parsed;
      return parsed;
    } catch (e) {
      console.error('Error parsing careerPathsData:', e)
      fallbackMemoryCareerPaths = defaultCareerPaths.map(normalizeCareerPath);
      return fallbackMemoryCareerPaths;
    }
  }
  fallbackMemoryCareerPaths = defaultCareerPaths.map(normalizeCareerPath);
  return fallbackMemoryCareerPaths;
}

export function setCareerPathsData(paths) {
  fallbackMemoryCareerPaths = paths;
  try {
    localStorage.setItem(CAREER_PATHS_STORAGE_KEY, JSON.stringify(paths))
  } catch (error) {
    console.warn('localStorage quota exceeded for careerPathsData. Retaining in memory only.', error)
  }
  emitCareerPathsUpdated()
}

export function hydrateCareerPathsData(paths) {
  fallbackMemoryCareerPaths = paths.map(normalizeCareerPath);
  try {
    localStorage.setItem(CAREER_PATHS_STORAGE_KEY, JSON.stringify(fallbackMemoryCareerPaths))
  } catch (error) {
    console.warn('localStorage quota exceeded during career paths hydration. Retaining in memory only.', error)
  }
  emitCareerPathsUpdated()
}

export function subscribeCareerPathsData(listener) {
  if (typeof window === 'undefined') {
    return () => {}
  }

  const onDataUpdate = () => listener()
  const onStorage = (event) => {
    if (event.key === CAREER_PATHS_STORAGE_KEY) {
      listener()
    }
  }

  window.addEventListener(CAREER_PATHS_UPDATED_EVENT, onDataUpdate)
  window.addEventListener('storage', onStorage)

  return () => {
    window.removeEventListener(CAREER_PATHS_UPDATED_EVENT, onDataUpdate)
    window.removeEventListener('storage', onStorage)
  }
}

export function getCareerPathById(id) {
  const paths = getCareerPathsData()
  return paths.find((p) => p.id === id)
}

export function updateCareerPath(id, updates) {
  const paths = getCareerPathsData()
  const index = paths.findIndex((p) => p.id === id)
  if (index !== -1) {
    paths[index] = normalizeCareerPath({ ...paths[index], ...updates })
    setCareerPathsData(paths)
    void apiFetch(`/career-paths/${id}`, {
      method: 'PUT',
      body: JSON.stringify(paths[index]),
    }).catch((error) => console.error('Failed to sync career path update:', error))
    return paths[index]
  }
  return null
}

export function addCareerPath(path) {
  const paths = getCareerPathsData()
  const slugBase = (path.slug || path.title || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
  const slug = slugBase || `path-${Date.now()}`
  const newPath = {
    ...path,
    id: slug,
    slug,
    learningPathLevel: path.learningPathLevel || path.difficulty || 'Basic',
    difficulty: path.difficulty || path.learningPathLevel || 'Basic',
    modules: path.modules || [],
    resources: path.resources || [],
     certificateImageData: path.certificateImageData || null,
  }
  paths.push(normalizeCareerPath(newPath))
  setCareerPathsData(paths)
  void apiFetch('/career-paths', {
    method: 'POST',
    body: JSON.stringify(newPath),
  }).catch((error) => console.error('Failed to sync career path create:', error))
  return newPath
}

export function deleteCareerPath(id) {
  const paths = getCareerPathsData()
  const filtered = paths.filter((p) => p.id !== id)
  setCareerPathsData(filtered)
  void apiFetch(`/career-paths/${id}`, {
    method: 'DELETE',
  }).catch((error) => console.error('Failed to sync career path delete:', error))
}

export function addModuleToPath(pathId, module) {
  const paths = getCareerPathsData()
  const pathIndex = paths.findIndex((p) => p.id === pathId)
  if (pathIndex !== -1) {
    const newModule = {
      id: `mod-${Date.now()}`,
      ...module,
      rooms: module.rooms || [],
    }
    paths[pathIndex].modules.push(newModule)
    setCareerPathsData(paths)
    void apiFetch(`/career-paths/${pathId}`, {
      method: 'PUT',
      body: JSON.stringify(paths[pathIndex]),
    }).catch((error) => console.error('Failed to sync module create:', error))
    return newModule
  }
  return null
}

export function updateModuleInPath(pathId, moduleId, updates) {
  const paths = getCareerPathsData()
  const pathIndex = paths.findIndex((p) => p.id === pathId)
  if (pathIndex !== -1) {
    const moduleIndex = paths[pathIndex].modules.findIndex((m) => m.id === moduleId)
    if (moduleIndex !== -1) {
      paths[pathIndex].modules[moduleIndex] = {
        ...paths[pathIndex].modules[moduleIndex],
        ...updates,
      }
      setCareerPathsData(paths)
      void apiFetch(`/career-paths/${pathId}`, {
        method: 'PUT',
        body: JSON.stringify(paths[pathIndex]),
      }).catch((error) => console.error('Failed to sync module update:', error))
      return paths[pathIndex].modules[moduleIndex]
    }
  }
  return null
}

export function deleteModuleFromPath(pathId, moduleId) {
  const paths = getCareerPathsData()
  const pathIndex = paths.findIndex((p) => p.id === pathId)
  if (pathIndex !== -1) {
    paths[pathIndex].modules = paths[pathIndex].modules.filter((m) => m.id !== moduleId)
    setCareerPathsData(paths)
    void apiFetch(`/career-paths/${pathId}`, {
      method: 'PUT',
      body: JSON.stringify(paths[pathIndex]),
    }).catch((error) => console.error('Failed to sync module delete:', error))
  }
}

export function addResourceToPath(pathId, resource) {
  const paths = getCareerPathsData()
  const pathIndex = paths.findIndex((p) => p.id === pathId)
  if (pathIndex !== -1) {
    const newResource = {
      id: `res-${Date.now()}`,
      ...resource,
    }
    paths[pathIndex].resources.push(newResource)
    setCareerPathsData(paths)
    void apiFetch(`/career-paths/${pathId}`, {
      method: 'PUT',
      body: JSON.stringify(paths[pathIndex]),
    }).catch((error) => console.error('Failed to sync resource create:', error))
    return newResource
  }
  return null
}

export function updateResourceInPath(pathId, resourceId, updates) {
  const paths = getCareerPathsData()
  const pathIndex = paths.findIndex((p) => p.id === pathId)
  if (pathIndex !== -1) {
    const resourceIndex = paths[pathIndex].resources.findIndex((r) => r.id === resourceId)
    if (resourceIndex !== -1) {
      paths[pathIndex].resources[resourceIndex] = {
        ...paths[pathIndex].resources[resourceIndex],
        ...updates,
      }
      setCareerPathsData(paths)
      void apiFetch(`/career-paths/${pathId}`, {
        method: 'PUT',
        body: JSON.stringify(paths[pathIndex]),
      }).catch((error) => console.error('Failed to sync resource update:', error))
      return paths[pathIndex].resources[resourceIndex]
    }
  }
  return null
}

export function deleteResourceFromPath(pathId, resourceId) {
  const paths = getCareerPathsData()
  const pathIndex = paths.findIndex((p) => p.id === pathId)
  if (pathIndex !== -1) {
    paths[pathIndex].resources = paths[pathIndex].resources.filter((r) => r.id !== resourceId)
    setCareerPathsData(paths)
    void apiFetch(`/career-paths/${pathId}`, {
      method: 'PUT',
      body: JSON.stringify(paths[pathIndex]),
    }).catch((error) => console.error('Failed to sync resource delete:', error))
  }
}
