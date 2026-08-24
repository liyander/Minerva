import https from 'node:https'

// Simple in-memory cache with 1-hour TTL
const cache = new Map()
const CACHE_TTL_MS = 60 * 60 * 1000

function formatVideoItem(item) {
  const videoId = typeof item.id === 'object' ? item.id.videoId : item.id
  return {
    id: videoId,
    title: item.snippet?.title || item.title || '',
    description: item.snippet?.description || item.shortDescription || item.description || '',
    thumbnail:
      item.snippet?.thumbnails?.high?.url ||
      item.snippet?.thumbnails?.medium?.url ||
      item.snippet?.thumbnails?.default?.url ||
      item.thumbnail ||
      (videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : ''),
    channelTitle: item.snippet?.channelTitle || item.uploaderName || item.author || '',
    publishedAt: item.snippet?.publishedAt || item.uploadedDate || '',
    url: `https://www.youtube.com/watch?v=${videoId}`,
    embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?rel=0`,
  }
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept: 'application/json',
          },
          timeout: 8000,
        },
        (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            return fetchJson(res.headers.location).then(resolve).catch(reject)
          }

          let data = ''
          res.on('data', (chunk) => (data += chunk))
          res.on('end', () => {
            try {
              if (res.statusCode >= 400) {
                return reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 100)}`))
              }
              resolve(JSON.parse(data))
            } catch (err) {
              reject(err)
            }
          })
        },
      )
      .on('error', reject)
  })
}

/**
 * Parses YouTube HTML search results directly if no API keys are present.
 */
async function scrapeYouTubeSearch(query, maxResults = 6) {
  return new Promise((resolve, reject) => {
    const encoded = encodeURIComponent(query)
    const url = `https://www.youtube.com/results?search_query=${encoded}`

    https
      .get(
        url,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
          },
          timeout: 8000,
        },
        (res) => {
          let data = ''
          res.on('data', (chunk) => (data += chunk))
          res.on('end', () => {
            try {
              const marker = 'var ytInitialData = '
              const start = data.indexOf(marker)
              if (start === -1) return resolve([])

              const jsonStart = start + marker.length
              const end = data.indexOf(';</script>', jsonStart)
              const rawJson = end === -1 ? data.slice(jsonStart) : data.slice(jsonStart, end)
              const parsed = JSON.parse(rawJson)

              const contents =
                parsed?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer
                  ?.contents?.[0]?.itemSectionRenderer?.contents || []

              const videos = []
              for (const item of contents) {
                const renderer = item.videoRenderer
                if (!renderer || !renderer.videoId) continue

                videos.push({
                  id: renderer.videoId,
                  title: renderer.title?.runs?.[0]?.text || '',
                  description:
                    renderer.detailedMetadataSnippets?.[0]?.snippetText?.runs?.map((r) => r.text).join('') || '',
                  thumbnail:
                    renderer.thumbnail?.thumbnails?.[renderer.thumbnail.thumbnails.length - 1]?.url ||
                    `https://img.youtube.com/vi/${renderer.videoId}/hqdefault.jpg`,
                  channelTitle: renderer.ownerText?.runs?.[0]?.text || '',
                  publishedAt: renderer.publishedTimeText?.simpleText || '',
                  url: `https://www.youtube.com/watch?v=${renderer.videoId}`,
                  embedUrl: `https://www.youtube-nocookie.com/embed/${renderer.videoId}?rel=0`,
                })

                if (videos.length >= maxResults) break
              }

              resolve(videos)
            } catch (err) {
              reject(err)
            }
          })
        },
      )
      .on('error', reject)
  })
}

/**
 * Fetch YouTube videos for a given search query
 */
export async function searchYouTubeVideos(query, maxResults = 6) {
  const cleanQuery = String(query || '').trim()
  if (!cleanQuery) return []

  const cacheKey = `${cleanQuery.toLowerCase()}_${maxResults}`
  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data
  }

  const apiKey = process.env.YOUTUBE_API_KEY

  // Strategy 1: Official YouTube Data API v3
  if (apiKey) {
    const encodedQuery = encodeURIComponent(`${cleanQuery} tutorial`)
    const endpoint = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodedQuery}&type=video&videoEmbeddable=true&maxResults=${maxResults}&key=${apiKey}`

    try {
      const data = await fetchJson(endpoint)
      const videos = (data.items || []).map(formatVideoItem)
      if (videos.length > 0) {
        cache.set(cacheKey, { timestamp: Date.now(), data: videos })
        return videos
      }
    } catch (error) {
      console.warn('[YouTube Service] Official API error:', error.message)
    }
  }

  // Strategy 2: Direct Search Parser
  try {
    const videos = await scrapeYouTubeSearch(cleanQuery, maxResults)
    if (videos.length > 0) {
      cache.set(cacheKey, { timestamp: Date.now(), data: videos })
      return videos
    }
  } catch (error) {
    console.warn('[YouTube Service] Direct scraper error:', error.message)
  }

  return []
}
