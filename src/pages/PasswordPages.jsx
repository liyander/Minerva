import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { requestPasswordReset, resetPassword } from '../services/platform'

const fieldClass =
  'mt-2 w-full rounded-xl bg-surface-container border border-transparent focus:border-primary focus:ring-0 font-body text-sm py-3 px-4 outline-none transition-colors'

function AuthShell({ title, description, children }) {
  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-5 py-10">
      <section className="w-full max-w-md rounded-3xl bg-surface-container-lowest p-8 shadow-card">
        <p className="font-headline text-lg font-extrabold text-primary">Minerva</p>
        <h1 className="font-headline text-2xl font-extrabold text-on-background mt-4">{title}</h1>
        <p className="font-body text-sm text-on-surface-variant mt-2 leading-relaxed">
          {description}
        </p>
        {children}
      </section>
    </main>
  )
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')

    try {
      const response = await requestPasswordReset(email.trim())
      setMessage(response.message)
    } catch (requestError) {
      setError(requestError?.message || 'Could not start the reset.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      description="Enter the email on your account and we will send you a link to choose a new password."
      title="Forgot your password?"
    >
      {message ? (
        <div className="mt-6 rounded-2xl bg-mint p-4">
          <p className="font-body text-sm text-on-mint">{message}</p>
        </div>
      ) : (
        <form className="mt-6 space-y-5" onSubmit={submit}>
          <label className="block">
            <span className="font-headline text-xs font-bold text-on-surface-variant">Email</span>
            <input
              className={fieldClass}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              type="email"
              value={email}
            />
          </label>

          {error ? <p className="font-body text-xs text-error">{error}</p> : null}

          <button
            className="w-full rounded-full bg-primary text-on-primary py-3.5 font-headline text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-60"
            disabled={busy}
            type="submit"
          >
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}

      <Link
        className="mt-6 block text-center text-sm font-body text-primary hover:underline"
        to="/login"
      >
        Back to sign in
      </Link>
    </AuthShell>
  )
}

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token') || ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Those passwords do not match.')
      return
    }

    setBusy(true)
    setError('')

    try {
      const response = await resetPassword(token, password)
      setMessage(response.message)
      window.setTimeout(() => navigate('/login'), 2500)
    } catch (resetError) {
      setError(resetError?.message || 'Could not reset your password.')
    } finally {
      setBusy(false)
    }
  }

  if (!token) {
    return (
      <AuthShell
        description="This page needs a reset link. Request a new one and open it from your email."
        title="Reset link missing"
      >
        <Link
          className="mt-6 inline-block rounded-full bg-primary px-6 py-3 font-headline text-sm font-bold text-on-primary"
          to="/forgot-password"
        >
          Request a link
        </Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell description="Choose a new password for your account." title="Set a new password">
      {message ? (
        <div className="mt-6 rounded-2xl bg-mint p-4">
          <p className="font-body text-sm text-on-mint">{message}</p>
          <p className="font-body text-xs text-on-mint/80 mt-1">Taking you to sign in…</p>
        </div>
      ) : (
        <form className="mt-6 space-y-5" onSubmit={submit}>
          <label className="block">
            <span className="font-headline text-xs font-bold text-on-surface-variant">
              New password
            </span>
            <input
              className={fieldClass}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              type="password"
              value={password}
            />
          </label>

          <label className="block">
            <span className="font-headline text-xs font-bold text-on-surface-variant">
              Confirm password
            </span>
            <input
              className={fieldClass}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repeat it"
              type="password"
              value={confirm}
            />
          </label>

          {error ? <p className="font-body text-xs text-error">{error}</p> : null}

          <button
            className="w-full rounded-full bg-primary text-on-primary py-3.5 font-headline text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-60"
            disabled={busy}
            type="submit"
          >
            {busy ? 'Saving…' : 'Change password'}
          </button>
        </form>
      )}
    </AuthShell>
  )
}
