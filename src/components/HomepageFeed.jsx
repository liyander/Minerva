import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchHomepagePosts } from '../services/training'

const CATEGORY_META = {
  announcement: { label: 'Announcement', icon: 'campaign', accent: 'bg-sky text-on-sky' },
  notification: { label: 'Notice', icon: 'notifications', accent: 'bg-butter text-on-butter' },
  achievement: { label: 'Achievement', icon: 'emoji_events', accent: 'bg-mint text-on-mint' },
  content: { label: 'New content', icon: 'auto_awesome', accent: 'bg-lavender text-on-lavender' },
}

/** Renders whatever admins have published to the homepage noticeboard. */
function HomepageFeed() {
  const [posts, setPosts] = useState([])
  const [dismissed, setDismissed] = useState([])

  useEffect(() => {
    fetchHomepagePosts()
      .then(setPosts)
      .catch(() => setPosts([]))
  }, [])

  const visible = posts.filter((post) => !dismissed.includes(post.id))
  if (!visible.length) return null

  return (
    <section className="space-y-3">
      <h2 className="font-headline text-lg font-extrabold text-on-background">Noticeboard</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {visible.slice(0, 4).map((post) => {
          const meta = CATEGORY_META[post.category] || CATEGORY_META.announcement
          const body = (
            <>
              <div className="flex items-start justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container-lowest/60 px-2.5 py-0.5 font-headline text-xs font-bold">
                  <span className="material-symbols-outlined text-sm">{meta.icon}</span>
                  {meta.label}
                </span>
                {post.pinned ? (
                  <span className="material-symbols-outlined text-base opacity-70">push_pin</span>
                ) : null}
              </div>
              <h3 className="font-headline text-base font-extrabold mt-2">{post.title}</h3>
              {post.body ? (
                <p className="font-body text-sm opacity-80 mt-1 line-clamp-2">{post.body}</p>
              ) : null}
            </>
          )

          return (
            <article className={`relative rounded-3xl p-5 ${meta.accent}`} key={post.id}>
              <button
                aria-label={`Dismiss ${post.title}`}
                className="absolute top-4 right-4 opacity-50 hover:opacity-100 transition-opacity"
                onClick={() => setDismissed((current) => [...current, post.id])}
                type="button"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>

              {post.linkUrl ? (
                post.linkUrl.startsWith('/') ? (
                  <Link className="block pr-6" to={post.linkUrl}>
                    {body}
                  </Link>
                ) : (
                  <a className="block pr-6" href={post.linkUrl} rel="noreferrer" target="_blank">
                    {body}
                  </a>
                )
              ) : (
                <div className="pr-6">{body}</div>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}

export default HomepageFeed
