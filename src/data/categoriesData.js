export const CATEGORIES_STORAGE_KEY = 'incognitrix_room_categories_v1'
export const CATEGORIES_UPDATED_EVENT = 'incognitrix:room-categories-updated'

export const DEFAULT_ROOM_CATEGORIES = [
  'Web Exploitation',
  'Cryptography',
  'Binary Exploitation',
  'Digital Forensics',
  'Network Security',
  'Cloud Security',
  'Mobile Security',
  'Secure Coding',
  'Incident Response',
  'Malware Analysis',
  'Privilege Escalation',
  'Social Engineering',
  'Container Security',
  'API Security',
  'Threat Hunting',
]

function normalizeCategory(value) {
  return String(value || '').trim()
}

function readStoredCategories() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CATEGORIES_STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed.map(normalizeCategory).filter(Boolean) : []
  } catch {
    return []
  }
}

function writeCategories(categories) {
  const uniqueCategories = [...new Set(categories.map(normalizeCategory).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b))

  localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(uniqueCategories))
  window.dispatchEvent(new Event(CATEGORIES_UPDATED_EVENT))
  return uniqueCategories
}

export function getRoomCategories(extraCategories = []) {
  return [...new Set([
    ...DEFAULT_ROOM_CATEGORIES,
    ...readStoredCategories(),
    ...extraCategories.map(normalizeCategory).filter(Boolean),
  ])].sort((a, b) => a.localeCompare(b))
}

export async function fetchRoomCategories(extraCategories = []) {
  try {
    const response = await apiFetch('/categories')
    const remoteCategories = Array.isArray(response) ? response : []
    return getRoomCategories([...remoteCategories, ...extraCategories])
  } catch (error) {
    console.error('Failed to fetch room categories:', error)
    return getRoomCategories(extraCategories)
  }
}

export function addRoomCategory(category) {
  const nextCategory = normalizeCategory(category)
  if (!nextCategory) {
    return getRoomCategories()
  }

  return writeCategories([...readStoredCategories(), nextCategory])
}

export async function createRoomCategory(category) {
  const nextCategory = normalizeCategory(category)
  if (!nextCategory) {
    return getRoomCategories()
  }

  try {
    await apiFetch('/categories', {
      method: 'POST',
      body: JSON.stringify({ name: nextCategory }),
    })
  } catch (error) {
    console.error('Failed to persist room category:', error)
  }

  return addRoomCategory(nextCategory)
}

export function deleteRoomCategory(category) {
  const target = normalizeCategory(category).toLowerCase()
  return writeCategories(readStoredCategories().filter((item) => item.toLowerCase() !== target))
}

export async function removeRoomCategory(category) {
  const target = normalizeCategory(category)
  if (!target) {
    return getRoomCategories()
  }

  try {
    await apiFetch(`/categories/${encodeURIComponent(target)}`, { method: 'DELETE' })
  } catch (error) {
    console.error('Failed to delete room category from backend:', error)
    throw error
  }

  return deleteRoomCategory(target)
}
import { apiFetch } from '../services/api'
