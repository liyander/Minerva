import { apiFetch } from './api'
import { hydrateCareerPathsData } from '../data/careerPathsData'
import { hydrateCoursesData } from '../data/coursesData'
import { hydrateResourcesData } from '../data/resourcesData'
import { savePlatformConfig } from '../platformConfig'
import { syncLabProgressFromBackend } from './labProgress'

export async function syncFrontendStateFromBackend(options = {}) {
  const { persistPlatformConfig = true } = options
  const [rooms, careerPaths, platformConfig, cves] = await Promise.all([
    apiFetch('/rooms'),
    apiFetch('/career-paths'),
    apiFetch('/platform-config'),
    apiFetch('/cves'),
  ])

  hydrateCoursesData(Array.isArray(rooms) ? rooms : [])
  hydrateCareerPathsData(Array.isArray(careerPaths) ? careerPaths : [])
  hydrateResourcesData(Array.isArray(cves) ? cves : [])

  if (persistPlatformConfig && (platformConfig?.routes || platformConfig?.features || platformConfig?.ai)) {
    savePlatformConfig(platformConfig)
  }

  await syncLabProgressFromBackend()

  return {
    rooms,
    careerPaths,
    platformConfig,
  }
}
