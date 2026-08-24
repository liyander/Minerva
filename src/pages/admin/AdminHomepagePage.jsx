import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../../components/PageHeader'
import {
  createHomepagePost,
  deleteHomepagePost,
  fetchHomepagePosts,
  updateHomepagePost,
} from '../../services/training'

const CATEGORIES = [
  { value: 'announcement', label: 'Announcement', icon: 'campaign', accent: 'bg-sky text-on-sky' },
  { value: 'notification', label: 'Notification', icon: 'notifications', accent: 'bg-butter text-on-butter' },
  { value: 'achievement', label: 'Achievement', icon: 'emoji_events', accent: 'bg-mint text-on-mint' },
  { value: 'content', label: 'New content', icon: 'auto_awesome', accent: 'bg-lavender text-on-lavender' },
]

function AdminHomepagePage() {
  const navigate = useNavigate()
  const [posts, setPosts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [form, setForm] = useState({
    category: 'announcement',
    title: '',
    body: '',
    linkUrl: '',
    pinned: false,
  })

  const load = useCallback(async () => {
    setError('')
    try {
      setPosts(await fetchHomepagePosts())
    } catch (loadError) {
      setError(loadError?.message || 'Could not load posts.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!form.title.trim()) {
      setError('Give the post a title.')
      return
    }

    setIsSaving(true)
    setError('')
    try {
      await createHomepagePost(form)
      setForm({ category: 'announcement', title: '', body: '', linkUrl: '', pinned: false })
      await load()
    } catch (saveError) {
      setError(saveError?.message || 'Could not publish that post.')
    } finally {
      setIsSaving(false)
    }
  }

  const fieldClass =
    'mt-1.5 w-full rounded-xl bg-surface-container border border-transparent focus:border-primary focus:ring-0 font-body text-sm py-2.5 px-3.5 outline-none'

  return (
    <main className="min-h-screen bg-surface px-5 py-8 sm:px-8 lg:px-10 pt-24">
      <div className="mx-auto max-w-5xl space-y-6">
        <button
          className="inline-flex items-center gap-1 font-headline text-sm font-bold text-on-surface-variant hover:text-on-surface transition-colors"
          onClick={() => navigate('/admin')}
          type="button"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span>
          Back to admin
        </button>

        <PageHeader
          accent="lavender"
          description="Publish announcements, achievements and new learning content to everyone's home screen."
          eyebrow="Homepage"
          icon="campaign"
          title="Noticeboard"
        />

        {error ? (
          <div className="rounded-2xl bg-blush p-4">
            <p className="font-body text-sm text-on-blush">{error}</p>
          </div>
        ) : null}

        <section className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft">
          <h2 className="font-headline text-lg font-extrabold text-on-background mb-4">
            Publish a post
          </h2>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <span className="font-headline text-xs font-bold text-on-surface-variant">Type</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {CATEGORIES.map((category) => (
                  <button
                    className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 font-headline text-xs font-bold transition-colors ${
                      form.category === category.value
                        ? 'bg-primary text-on-primary'
                        : 'bg-surface-container text-on-surface-variant'
                    }`}
                    key={category.value}
                    onClick={() => setForm((f) => ({ ...f, category: category.value }))}
                    type="button"
                  >
                    <span className="material-symbols-outlined text-sm">{category.icon}</span>
                    {category.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="font-headline text-xs font-bold text-on-surface-variant">Title</span>
              <input
                className={fieldClass}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="New Data Analyst path is live"
                value={form.title}
              />
            </label>

            <label className="block">
              <span className="font-headline text-xs font-bold text-on-surface-variant">Message</span>
              <textarea
                className={fieldClass}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                rows={3}
                value={form.body}
              />
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
              <label className="block">
                <span className="font-headline text-xs font-bold text-on-surface-variant">
                  Link (optional)
                </span>
                <input
                  className={fieldClass}
                  onChange={(e) => setForm((f) => ({ ...f, linkUrl: e.target.value }))}
                  placeholder="/learn/paths"
                  value={form.linkUrl}
                />
              </label>
              <label className="flex items-center gap-3 pb-2">
                <input
                  checked={form.pinned}
                  className="h-4 w-4 rounded"
                  onChange={(e) => setForm((f) => ({ ...f, pinned: e.target.checked }))}
                  type="checkbox"
                />
                <span className="font-body text-sm text-on-surface">Pin to the top</span>
              </label>
            </div>

            <button
              className="rounded-full bg-primary px-6 py-3 font-headline text-sm font-bold text-on-primary hover:opacity-90 transition-opacity disabled:opacity-60"
              disabled={isSaving}
              type="submit"
            >
              {isSaving ? 'Publishing…' : 'Publish'}
            </button>
          </form>
        </section>

        <section className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft">
          <h2 className="font-headline text-lg font-extrabold text-on-background mb-4">
            Published ({posts.length})
          </h2>

          {isLoading ? (
            <div className="py-8 text-center">
              <div className="mx-auto h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
            </div>
          ) : posts.length === 0 ? (
            <p className="font-body text-sm text-on-surface-variant py-6 text-center">
              Nothing published yet.
            </p>
          ) : (
            <div className="space-y-3">
              {posts.map((post) => {
                const meta = CATEGORIES.find((c) => c.value === post.category) || CATEGORIES[0]

                return (
                  <article className="rounded-2xl bg-surface-container p-4" key={post.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-headline text-xs font-bold ${meta.accent}`}
                          >
                            <span className="material-symbols-outlined text-sm">{meta.icon}</span>
                            {meta.label}
                          </span>
                          {post.pinned ? (
                            <span className="rounded-full bg-primary-container text-on-primary-container px-2.5 py-0.5 font-headline text-xs font-bold">
                              Pinned
                            </span>
                          ) : null}
                        </div>
                        <h3 className="font-headline text-base font-extrabold text-on-background mt-2">
                          {post.title}
                        </h3>
                        {post.body ? (
                          <p className="font-body text-sm text-on-surface-variant mt-1">
                            {post.body}
                          </p>
                        ) : null}
                        <p className="font-body text-xs text-on-surface-variant mt-2">
                          {new Date(post.publishedAt).toLocaleString()}
                          {post.author ? ` · ${post.author}` : ''}
                        </p>
                      </div>

                      <div className="flex flex-col gap-2 shrink-0">
                        <button
                          className="rounded-full bg-surface-container-high px-3 py-1.5 font-headline text-xs font-bold text-on-surface"
                          onClick={async () => {
                            await updateHomepagePost(post.id, { pinned: !post.pinned })
                            await load()
                          }}
                          type="button"
                        >
                          {post.pinned ? 'Unpin' : 'Pin'}
                        </button>
                        <button
                          className="rounded-full bg-blush px-3 py-1.5 font-headline text-xs font-bold text-on-blush"
                          onClick={async () => {
                            if (!window.confirm(`Delete "${post.title}"?`)) return
                            await deleteHomepagePost(post.id)
                            await load()
                          }}
                          type="button"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

export default AdminHomepagePage
