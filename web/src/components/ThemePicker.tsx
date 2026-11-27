import { useState } from 'react'
import { Popover as P, RadioGroup as R } from 'radix-ui'
import { Check, Palette } from 'lucide-react'
import { cn } from '@/lib/format'

// The swatch repeats each theme's background and first two glows (index.css), to pick by look.
const themes = [
  { id: 'aurore', label: 'Aurore', swatch: ['#050b18', '#0f766e', '#1d4ed8'] },
  { id: 'givre', label: 'Givre', swatch: ['#dfe7f1', '#8fb8ff', '#ffc9d6'] },
  { id: 'crepuscule', label: 'Crépuscule', swatch: ['#1a0e22', '#ff6b4a', '#9d4edd'] },
  { id: 'abysse', label: 'Abysse', swatch: ['#021218', '#0891b2', '#1e3a8a'] },
  { id: 'ardoise', label: 'Ardoise', swatch: ['#15171b', '#3a3f4b', '#2b3140'] },
]

type Glass = { alpha: number; blur: number }

const root = () => document.documentElement

function save(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // private window: the choice lasts until the page closes
  }
}

/** Glass in use: the saved override, or the theme's own values. */
function readGlass(): Glass {
  const s = getComputedStyle(root())
  return { alpha: parseFloat(s.getPropertyValue('--glass-alpha')) || 0.5, blur: parseFloat(s.getPropertyValue('--glass-blur')) || 0 }
}

export function ThemePicker() {
  const [theme, setTheme] = useState(() => root().dataset.theme ?? 'aurore')
  const [custom, setCustom] = useState(() => root().style.getPropertyValue('--glass-alpha') !== '')
  const [glass, setGlass] = useState(readGlass)

  const pickTheme = (t: string) => {
    root().dataset.theme = t
    save('swizdash-theme', t)
    setTheme(t)
    // without an override, the sliders follow the new theme's values
    setGlass(readGlass())
  }
  const changeGlass = (g: Glass) => {
    root().style.setProperty('--glass-alpha', String(g.alpha))
    root().style.setProperty('--glass-blur', `${g.blur}px`)
    save('swizdash-glass', JSON.stringify(g))
    setCustom(true)
    setGlass(g)
  }
  const resetGlass = () => {
    root().style.removeProperty('--glass-alpha')
    root().style.removeProperty('--glass-blur')
    save('swizdash-glass', null)
    setCustom(false)
    setGlass(readGlass())
  }

  return (
    <P.Root>
      <P.Trigger asChild>
        <button className="grid size-9 place-items-center rounded-lg border border-line text-muted hover:text-text" aria-label="Theme">
          <Palette className="size-4" />
        </button>
      </P.Trigger>
      <P.Portal>
        <P.Content align="end" sideOffset={6} aria-label="Theme" className="z-50 w-64 rounded-xl border border-line bg-surface p-2 shadow-xl">
          <R.Root value={theme} onValueChange={pickTheme} aria-label="Theme" className="grid gap-0.5">
            {themes.map((t) => (
              <R.Item
                key={t.id}
                value={t.id}
                className={cn('flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2', theme === t.id && 'bg-surface-2')}
              >
                <span
                  aria-hidden
                  className="size-6 shrink-0 rounded-md ring-1 ring-line ring-inset"
                  style={{
                    background: `radial-gradient(circle at 20% 20%, ${t.swatch[1]}, transparent 65%), radial-gradient(circle at 90% 70%, ${t.swatch[2]}, transparent 60%), ${t.swatch[0]}`,
                  }}
                />
                <span className="flex-1">{t.label}</span>
                {theme === t.id && <Check className="size-4 text-accent" />}
              </R.Item>
            ))}
          </R.Root>
          <div className="mt-2 grid gap-3 border-t border-line px-2 pt-3 pb-1 text-xs text-muted">
            <label className="grid gap-1.5">
              <span className="flex justify-between">
                Panel opacity <span className="font-mono text-text">{Math.round(glass.alpha * 100)}%</span>
              </span>
              <input
                type="range"
                min={35}
                max={100}
                step={5}
                value={Math.round(glass.alpha * 100)}
                aria-valuetext={`${Math.round(glass.alpha * 100)}%`}
                onChange={(e) => changeGlass({ ...glass, alpha: Number(e.target.value) / 100 })}
                className="accent-[var(--accent)]"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="flex justify-between">
                Header and menu blur <span className="font-mono text-text">{glass.blur}px</span>
              </span>
              <input
                type="range"
                min={0}
                max={32}
                step={2}
                value={glass.blur}
                aria-valuetext={`${glass.blur} pixels`}
                onChange={(e) => changeGlass({ ...glass, blur: Number(e.target.value) })}
                className="accent-[var(--accent)]"
              />
            </label>
            <button
              // aria-disabled, not disabled: a disabled button would drop the keyboard focus after the click
              onClick={() => custom && resetGlass()}
              aria-disabled={!custom}
              className="justify-self-start rounded-md py-1 text-text hover:underline aria-disabled:cursor-default aria-disabled:text-muted aria-disabled:no-underline"
            >
              Use the theme's values
            </button>
          </div>
        </P.Content>
      </P.Portal>
    </P.Root>
  )
}
