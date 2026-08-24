// Shared page masthead so every screen opens the same way: a soft accent card
// with an eyebrow, a title, an optional lede and a slot for page actions.
function PageHeader({ eyebrow, title, description, icon, accent = 'surface', actions = null }) {
  const palettes = {
    surface: 'bg-surface-container-lowest text-on-surface shadow-soft',
    mint: 'bg-mint text-on-mint',
    lavender: 'bg-lavender text-on-lavender',
    sky: 'bg-sky text-on-sky',
    butter: 'bg-butter text-on-butter',
    blush: 'bg-blush text-on-blush',
    primary: 'bg-primary-container text-on-primary-container',
    secondary: 'bg-secondary-container text-on-secondary-container',
  }

  return (
    <header className={`rounded-3xl px-6 py-7 md:px-8 md:py-8 ${palettes[accent] || palettes.surface}`}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          {eyebrow ? (
            <div className="flex items-center gap-2">
              {icon ? (
                <span className="material-symbols-outlined text-lg opacity-80">{icon}</span>
              ) : null}
              <p className="font-headline text-xs font-bold opacity-70">{eyebrow}</p>
            </div>
          ) : null}
          <h1 className="font-headline text-3xl md:text-4xl font-extrabold mt-2">{title}</h1>
          {description ? (
            <p className="font-body text-sm md:text-base opacity-80 mt-3 max-w-2xl leading-relaxed">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-3 shrink-0">{actions}</div> : null}
      </div>
    </header>
  )
}

export default PageHeader
