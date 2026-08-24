import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ROLES, signupUser } from '../auth'
import { apiFetch } from '../services/api'

const ROLE_CHOICES = [
  {
    value: ROLES.TRAINEE,
    label: 'Trainee',
    icon: 'school',
    blurb: 'Enrol in courses, take assessments and build a professional profile.',
  },
  {
    value: ROLES.TRAINER,
    label: 'Trainer',
    icon: 'co_present',
    blurb: 'Publish study material, set questionnaires and track trainee progress.',
  },
]

function RegistrationPage({ onRegisterSuccess }) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [role, setRole] = useState(ROLES.TRAINEE)
  const [loading, setLoading] = useState(false)
  const [registrationEnabled, setRegistrationEnabled] = useState(true)
  const [error, setError] = useState('')
  const [pendingMessage, setPendingMessage] = useState('')

  useEffect(() => {
    let cancelled = false

    const loadConfig = async () => {
      try {
        const config = await apiFetch('/platform-config')
        if (!cancelled) {
          setRegistrationEnabled(Boolean(config?.features?.publicRegistration))
        }
      } catch {
        if (!cancelled) {
          setRegistrationEnabled(false)
        }
      }
    }

    void loadConfig()

    return () => {
      cancelled = true
    }
  }, [])

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!firstName.trim() || !email.trim() || !password) {
      setError('Name, email and password are required')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    setError('')

    try {
      const result = await signupUser({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        password,
        role,
      })

      if (result?.pendingApproval) {
        setPendingMessage(result.message)
        return
      }

      if (!result) {
        setError('Unable to create account')
        return
      }

      onRegisterSuccess(result)
    } catch (signupError) {
      setError(signupError?.message || 'Unable to create account')
    } finally {
      setLoading(false)
    }
  }

  const fieldClass =
    'mt-2 w-full rounded-xl bg-surface-container border border-transparent focus:border-primary focus:ring-0 font-body text-sm py-3 px-4 outline-none transition-colors'

  if (pendingMessage) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center px-5 py-10">
        <section className="w-full max-w-md rounded-3xl bg-surface-container-lowest p-8 text-center shadow-card">
          <span className="material-symbols-outlined text-5xl text-primary">hourglass_top</span>
          <h1 className="font-headline text-2xl font-extrabold text-on-background mt-4">
            Awaiting approval
          </h1>
          <p className="font-body text-sm text-on-surface-variant mt-3 leading-relaxed">
            {pendingMessage}
          </p>
          <Link
            className="mt-6 inline-block rounded-full bg-primary px-6 py-3 font-headline text-sm font-bold text-on-primary hover:opacity-90 transition-opacity"
            to="/login"
          >
            Back to sign in
          </Link>
        </section>
      </main>
    )
  }

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
              Join as a trainee or a trainer.
            </p>
            <p className="font-body text-sm text-on-secondary-container/80 leading-relaxed">
              Trainees get courses, assessments and certificates. Trainers get a library,
              questionnaires and progress tracking for their subjects.
            </p>
          </div>
          <p className="font-body text-xs text-on-secondary-container/70">
            Trainer accounts are reviewed by an administrator before activation.
          </p>
        </div>

        <div className="p-8 sm:p-10">
          <h1 className="font-headline text-3xl font-extrabold text-on-background">
            Create your account
          </h1>
          <p className="text-on-surface-variant mt-2 text-sm font-body">
            It takes less than a minute.
          </p>

          {!registrationEnabled ? (
            <div className="mt-8 rounded-2xl bg-blush p-4">
              <p className="font-body text-sm text-on-blush">
                Registration is currently disabled by the administrator.
              </p>
            </div>
          ) : (
            <form className="mt-7 space-y-5" onSubmit={handleSubmit}>
              <fieldset>
                <legend className="font-headline text-xs font-bold text-on-surface-variant">
                  I am joining as
                </legend>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  {ROLE_CHOICES.map((choice) => (
                    <button
                      className={`rounded-2xl border p-4 text-left transition-colors ${
                        role === choice.value
                          ? 'border-primary bg-primary-container text-on-primary-container'
                          : 'border-outline-variant bg-surface-container text-on-surface hover:border-outline'
                      }`}
                      key={choice.value}
                      onClick={() => setRole(choice.value)}
                      type="button"
                    >
                      <span className="material-symbols-outlined">{choice.icon}</span>
                      <span className="mt-1 block font-headline text-sm font-bold">
                        {choice.label}
                      </span>
                      <span className="mt-1 block font-body text-xs opacity-70 leading-snug">
                        {choice.blurb}
                      </span>
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="font-headline text-xs font-bold text-on-surface-variant">
                    First name
                  </span>
                  <input
                    className={fieldClass}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Asha"
                    type="text"
                    value={firstName}
                  />
                </label>
                <label className="block">
                  <span className="font-headline text-xs font-bold text-on-surface-variant">
                    Last name
                  </span>
                  <input
                    className={fieldClass}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Rao"
                    type="text"
                    value={lastName}
                  />
                </label>
              </div>

              <label className="block">
                <span className="font-headline text-xs font-bold text-on-surface-variant">
                  Email
                </span>
                <input
                  className={fieldClass}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  type="email"
                  value={email}
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="font-headline text-xs font-bold text-on-surface-variant">
                    Password
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
                    Confirm
                  </span>
                  <input
                    className={fieldClass}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat password"
                    type="password"
                    value={confirmPassword}
                  />
                </label>
              </div>

              {error ? <p className="text-xs font-body text-error">{error}</p> : null}

              <button
                className="w-full rounded-full bg-primary text-on-primary py-3.5 font-headline text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-60"
                disabled={loading}
                type="submit"
              >
                {loading ? 'Creating account…' : 'Create account'}
              </button>

              <Link
                className="block text-center text-sm font-body text-primary hover:underline"
                to="/login"
              >
                Already have an account? Sign in
              </Link>
            </form>
          )}
        </div>
      </section>
    </main>
  )
}

export default RegistrationPage
