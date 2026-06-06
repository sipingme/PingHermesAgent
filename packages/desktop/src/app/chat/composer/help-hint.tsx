import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { COMPLETION_DRAWER_CLASS } from './completion-drawer'

const COMMON_COMMANDS: [string, string][] = [
  ['/help', 'help.commands.help'],
  ['/clear', 'help.commands.clear'],
  ['/resume', 'help.commands.resume'],
  ['/details', 'help.commands.details'],
  ['/copy', 'help.commands.copy'],
  ['/quit', 'help.commands.quit']
]

const HOTKEYS: [string, string][] = [
  ['@', 'help.hotkeys.reference'],
  ['/', 'help.hotkeys.slash'],
  ['?', 'help.hotkeys.question'],
  ['Enter', 'help.hotkeys.enter'],
  ['Cmd/Ctrl+K', 'help.hotkeys.send_queued'],
  ['Cmd/Ctrl+L', 'help.hotkeys.redraw'],
  ['Esc', 'help.hotkeys.esc'],
  ['↑ / ↓', 'help.hotkeys.cycle']
]

export function HelpHint() {
  const { t } = useTranslation()
  return (
    <div className={COMPLETION_DRAWER_CLASS} data-slot="composer-completion-drawer" data-state="open" role="dialog">
      <Section title={t('help.common_commands')}>
        {COMMON_COMMANDS.map(([key, desc]) => (
          <Row description={t(desc)} key={key} keyLabel={key} mono />
        ))}
      </Section>

      <Section title={t('help.hotkeys_title')}>
        {HOTKEYS.map(([key, desc]) => (
          <Row description={t(desc)} key={key} keyLabel={key} />
        ))}
      </Section>

      <p className="px-2.5 py-1 text-xs text-muted-foreground/80">
        {t('help.footer')}
      </p>
    </div>
  )
}

function Section({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div className="grid gap-0.5 pt-0.5">
      <p className="px-2.5 pb-0.5 pt-1 text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground/75">
        {title}
      </p>
      {children}
    </div>
  )
}

function Row({ description, keyLabel, mono = false }: { description: string; keyLabel: string; mono?: boolean }) {
  return (
    <div className="flex min-w-0 items-baseline gap-2 rounded-md px-2.5 py-1 text-xs">
      <span
        className={
          mono ? 'shrink-0 truncate font-mono font-medium text-foreground/85' : 'shrink-0 truncate text-foreground/85'
        }
      >
        {keyLabel}
      </span>
      <span className="min-w-0 truncate text-muted-foreground/80">{description}</span>
    </div>
  )
}
