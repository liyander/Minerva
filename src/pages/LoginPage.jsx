import { useState } from 'react'
import { Link } from 'react-router-dom'
import { loginUser } from '../auth'

function LoginPage({ onLoginSuccess }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()

    try {
      const session = await loginUser(username.trim(), password)
      if (!session) {
        setError('Invalid credentials. Please try again.')
        return
      }

      setError('')
      onLoginSuccess(session)
    } catch (loginError) {
      setError(loginError?.message || 'Invalid credentials. Please try again.')
    }
  }

  const fieldClass =
    'mt-2 w-full rounded-xl bg-surface-container border border-transparent focus:border-primary focus:ring-0 font-body text-sm py-3 px-4 outline-none transition-colors'

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-5 py-10">
      <section className="w-full max-w-4xl grid md:grid-cols-2 rounded-3xl overflow-hidden bg-surface-container-lowest shadow-card">
        <div className="hidden md:flex flex-col justify-between bg-secondary-container p-10">
          <div>
            <p className="font-headline text-2xl font-extrabold text-on-secondary-container">
              Minerva
            </p>
            <p className="font-body text-sm text-on-secondary-container/70 mt-1">
              Learn at your own pace
            </p>
          </div>
          <div className="space-y-4">
            <p className="font-headline text-3xl font-extrabold text-on-secondary-container leading-tight">
              Courses, projects and mentors — all in one place.
            </p>
            <p className="font-body text-sm text-on-secondary-container/80 leading-relaxed">
              Track your progress across guided learning paths, keep notes as you go, and earn a
              verifiable certificate when you finish.
            </p>
          </div>
          <div className="flex gap-3">
            <span className="rounded-full bg-surface-container-lowest/60 px-3 py-1 font-headline text-xs font-bold text-on-secondary-container">
              Self-paced
            </span>
            <span className="rounded-full bg-surface-container-lowest/60 px-3 py-1 font-headline text-xs font-bold text-on-secondary-container">
              Certificates
            </span>
          </div>
        </div>

        <div className="p-8 sm:p-10">
          <h1 className="font-headline text-3xl font-extrabold text-on-background">Welcome back</h1>
          <p className="text-on-surface-variant mt-2 text-sm leading-relaxed font-body">
            Sign in to continue your courses.
          </p>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <label className="block">
              <span className="font-headline text-xs font-bold text-on-surface-variant">
                Username, email or student ID
              </span>
              <input
                className={fieldClass}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="you@example.com"
                type="text"
                value={username}
              />
            </label>

            <label className="block">
              <span className="font-headline text-xs font-bold text-on-surface-variant">
                Password
              </span>
              <input
                className={fieldClass}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                type="password"
                value={password}
              />
            </label>

            {error ? <p className="text-xs font-body text-error">{error}</p> : null}

            <button
              className="w-full rounded-full bg-primary text-on-primary py-3.5 font-headline text-sm font-bold hover:opacity-90 transition-opacity"
              type="submit"
            >
              Sign in
            </button>

            <Link
              className="block text-center text-sm font-body text-primary hover:underline"
              to="/register"
            >
              New here? Create an account
            </Link>
          </form>
        </div>
      </section>
    </main>
  )
}

export default LoginPage
