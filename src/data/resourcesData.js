import { apiFetch } from '../services/api'

// Storage keys keep their original names so existing browsers keep their cache.
export const RESOURCES_STORAGE_KEY = 'cvesData'
export const RESOURCES_UPDATED_EVENT = 'cvesDataUpdated'

export const defaultResources = [
  {
    id: 1,
    cve_id: 'GUIDE-001',
    short_description: 'How to structure a study plan that you actually finish.',
    found_year: 2026,
    credit: 'Minerva Learning Team',
    vulnerability_report:
      'Most learners stall because their plan is a wish list rather than a schedule. This guide walks through sizing a goal against the hours you genuinely have each week, breaking a path into weekly modules, and building a review loop so earlier material stays fresh. It closes with three sample plans for five, ten and twenty hours a week.',
    method_followed:
      'Compiled from completion data across the platform and interviews with learners who finished a full path.',
    references_text:
      'https://en.wikipedia.org/wiki/Spaced_repetition\nhttps://en.wikipedia.org/wiki/Deliberate_practice',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
]

let fallbackMemoryCves = null;

export function getResourcesData() {
  if (fallbackMemoryCves) return fallbackMemoryCves;
  const stored = localStorage.getItem(RESOURCES_STORAGE_KEY)
  if (stored) {
    try {
      const parsed = JSON.parse(stored)
      fallbackMemoryCves = parsed;
      return parsed;
    } catch (e) {
      console.error('Error parsing cvesData:', e)
      fallbackMemoryCves = defaultResources;
      return fallbackMemoryCves;
    }
  }
  fallbackMemoryCves = defaultResources;
  return fallbackMemoryCves;
}

export function emitResourcesUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(RESOURCES_UPDATED_EVENT))
  }
}

export function subscribeResourcesData(listener) {
  if (typeof window === 'undefined') {
    return () => {}
  }
  const onDataUpdate = () => listener()
  const onStorage = (event) => {
    if (event.key === RESOURCES_STORAGE_KEY) {
      listener()
    }
  }
  window.addEventListener(RESOURCES_UPDATED_EVENT, onDataUpdate)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(RESOURCES_UPDATED_EVENT, onDataUpdate)
    window.removeEventListener('storage', onStorage)
  }
}

export function setResourcesData(cves) {
  fallbackMemoryCves = cves;
  try {
    localStorage.setItem(RESOURCES_STORAGE_KEY, JSON.stringify(cves))
  } catch (error) {
    console.warn('localStorage quota exceeded for cvesData. Retaining in memory only.', error)
  }
  emitResourcesUpdated()
}

export function getResourceById(id) {
  const cves = getResourcesData()
  return cves.find((cve) => String(cve.id) === String(id) || String(cve.cve_id) === String(id)) || null
}

export function addResource(cve) {
  const cves = getResourcesData()
  const newCve = {
    ...cve,
    id: `local-${Date.now()}` // Temporary until backend syncs real ID
  }
  cves.unshift(newCve)
  setResourcesData(cves)

  void apiFetch('/cves', {
    method: 'POST',
    body: JSON.stringify(cve)
  }).then(saved => {
    // Replace temp local ID if needed, or simply let the next fetch pull it
    const list = getResourcesData()
    const index = list.findIndex(c => c.id === newCve.id)
    if (index !== -1) {
      list[index] = { ...list[index], ...saved }
      setResourcesData(list)
    }
  }).catch((error) => console.error('Failed to sync cve create:', error))
  
  return newCve
}

export function updateResource(id, updates) {
  const cves = getResourcesData()
  const index = cves.findIndex((cve) => String(cve.id) === String(id) || String(cve.cve_id) === String(id))
  
  if (index !== -1) {
    cves[index] = { ...cves[index], ...updates, updated_at: new Date().toISOString() }
    setResourcesData(cves)
    
    // If it's not a local temporary ID, push to API
    if (!String(cves[index].id).startsWith('local-')) {
      void apiFetch(`/cves/${cves[index].id}`, {
        method: 'PUT',
        body: JSON.stringify(updates)
      }).catch((error) => console.error('Failed as cve update:', error))
    }
    return cves[index]
  }
  return null
}

export function deleteResource(id) {
  let cves = getResourcesData()
  const originalLength = cves.length
  cves = cves.filter((cve) => String(cve.id) !== String(id) && String(cve.cve_id) !== String(id))
  
  if (cves.length < originalLength) {
    setResourcesData(cves)
    if (!String(id).startsWith('local-')) {
      void apiFetch(`/cves/${id}`, {
        method: 'DELETE'
      }).catch((error) => console.error('Failed to sync cve delete:', error))
    }
    return true
  }
  return false
}

export function hydrateResourcesData(cvesFromServer) {
  if (Array.isArray(cvesFromServer) && cvesFromServer.length > 0) {
    setResourcesData(cvesFromServer)
  }
}
