import type { ChangeEvent, ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  getElevenLabsVoices,
  getHermesConfigDefaults,
  getHermesConfigRecord,
  getHermesConfigSchema,
  saveHermesConfig
} from '@/hermes'
import { cn } from '@/lib/utils'
import { notify, notifyError } from '@/store/notifications'
import type { ConfigFieldSchema, HermesConfigRecord } from '@/types/hermes'

import { CONTROL_TEXT, EMPTY_SELECT_VALUE, FIELD_DESCRIPTIONS, FIELD_LABELS, SECTIONS } from './constants'
import { enumOptionsFor, getNested, includesQuery, prettyName, setNested } from './helpers'
import { ModelSettings } from './model-settings'
import { EmptyState, ListRow, LoadingState, SectionHeading, SettingsContent } from './primitives'
import type { SearchProps } from './types'

function ConfigField({
  schemaKey,
  schema,
  value,
  enumOptions,
  optionLabels,
  onChange
}: {
  schemaKey: string
  schema: ConfigFieldSchema
  value: unknown
  enumOptions?: string[]
  optionLabels?: Record<string, string>
  onChange: (value: unknown) => void
}) {
  const { t } = useTranslation()
  const fallbackLabel = FIELD_LABELS[schemaKey] ?? prettyName(schemaKey.split('.').pop() ?? schemaKey)
  const label = t(`config.fields.${schemaKey}.label`, fallbackLabel)
  const normalize = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, '')
  const rawDescription = (FIELD_DESCRIPTIONS[schemaKey] ?? schema.description ?? '').trim()
  const normalizedDesc = normalize(rawDescription)

  const fallbackDesc =
    rawDescription && normalizedDesc !== normalize(fallbackLabel) && normalizedDesc !== normalize(schemaKey)
      ? rawDescription
      : undefined
  const translatedDesc = t(`config.fields.${schemaKey}.desc`, fallbackDesc || '')
  const description = translatedDesc || undefined

  const row = (action: ReactNode, wide = false) => (
    <ListRow action={action} description={description} title={label} wide={wide} />
  )

  if (schema.type === 'boolean') {
    return row(
      <div className="flex items-center justify-end gap-3">
        <span className="text-xs text-muted-foreground">{value ? t('config.common.on') : t('config.common.off')}</span>
        <Switch checked={Boolean(value)} onCheckedChange={onChange} />
      </div>
    )
  }

  const selectOptions = enumOptions ?? (schema.type === 'select' ? (schema.options ?? []).map(String) : undefined)

  if (selectOptions) {
    return row(
      <Select
        onValueChange={next => onChange(next === EMPTY_SELECT_VALUE ? '' : next)}
        value={String(value ?? '') || EMPTY_SELECT_VALUE}
      >
        <SelectTrigger className={CONTROL_TEXT}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {selectOptions.map(option => (
            <SelectItem key={option || EMPTY_SELECT_VALUE} value={option || EMPTY_SELECT_VALUE}>
              {option
                ? (optionLabels?.[option] ??
                    (schemaKey === 'display.personality'
                      ? t(`config.personalities.${option}`, prettyName(option))
                      : t(`config.enums.${schemaKey}.${option}`, prettyName(option))))
                : schemaKey === 'display.personality'
                  ? t('config.common.none')
                  : t('config.common.none_paren')}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  if (schema.type === 'number') {
    return row(
      <Input
        className={cn('h-8', CONTROL_TEXT)}
        onChange={e => {
          const raw = e.target.value
          const n = raw === '' ? 0 : Number(raw)

          if (!Number.isNaN(n)) {
            onChange(n)
          }
        }}
        placeholder={t('config.common.not_set')}
        type="number"
        value={value === undefined || value === null ? '' : String(value)}
      />
    )
  }

  if (schema.type === 'list') {
    return row(
      <Input
        className={cn('h-8', CONTROL_TEXT)}
        onChange={e =>
          onChange(
            e.target.value
              .split(',')
              .map(s => s.trim())
              .filter(Boolean)
          )
        }
        placeholder={t('config.common.csv_placeholder')}
        value={Array.isArray(value) ? value.join(', ') : String(value ?? '')}
      />
    )
  }

  if (typeof value === 'object' && value !== null) {
    return row(
      <Textarea
        className={cn('min-h-28 resize-y bg-background font-mono', CONTROL_TEXT)}
        onChange={e => {
          try {
            onChange(JSON.parse(e.target.value))
          } catch {
            /* keep last valid */
          }
        }}
        placeholder={t('config.common.not_set')}
        spellCheck={false}
        value={JSON.stringify(value, null, 2)}
      />,
      true
    )
  }

  const isLong = schema.type === 'text' || String(value ?? '').length > 100

  return row(
    isLong ? (
      <Textarea
        className={cn('min-h-24 resize-y bg-background', CONTROL_TEXT)}
        onChange={e => onChange(e.target.value)}
        placeholder={t('config.common.not_set')}
        value={String(value ?? '')}
      />
    ) : (
      <Input
        className={cn('h-8', CONTROL_TEXT)}
        onChange={e => onChange(e.target.value)}
        placeholder={t('config.common.not_set')}
        value={String(value ?? '')}
      />
    ),
    isLong
  )
}

export function ConfigSettings({
  query,
  activeSectionId,
  onConfigSaved,
  onMainModelChanged,
  importInputRef
}: SearchProps & {
  activeSectionId: string
  onConfigSaved?: () => void
  onMainModelChanged?: (provider: string, model: string) => void
  importInputRef: React.RefObject<HTMLInputElement | null>
}) {
  const { t } = useTranslation()
  const [config, setConfig] = useState<HermesConfigRecord | null>(null)
  const [_defaults, setDefaults] = useState<HermesConfigRecord | null>(null)
  const [schema, setSchema] = useState<Record<string, ConfigFieldSchema> | null>(null)
  const [elevenLabsVoiceOptions, setElevenLabsVoiceOptions] = useState<string[] | null>(null)
  const [elevenLabsVoiceLabels, setElevenLabsVoiceLabels] = useState<Record<string, string>>({})
  const saveVersionRef = useRef(0)
  const [saveVersion, setSaveVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    Promise.all([getHermesConfigRecord(), getHermesConfigDefaults(), getHermesConfigSchema()])
      .then(([c, d, s]) => {
        if (cancelled) {
          return
        }

        setConfig(c)
        setDefaults(d)
        setSchema(s.fields)
      })
      .catch(err => notifyError(err, t('config.common.load_failed')))

    return () => void (cancelled = true)
  }, [])

  useEffect(() => {
    let cancelled = false

    getElevenLabsVoices()
      .then(result => {
        if (cancelled || !result.available) {
          return
        }

        setElevenLabsVoiceOptions(result.voices.map(voice => voice.voice_id))
        setElevenLabsVoiceLabels(Object.fromEntries(result.voices.map(voice => [voice.voice_id, voice.label])))
      })
      .catch(() => {
        if (!cancelled) {
          setElevenLabsVoiceOptions(null)
          setElevenLabsVoiceLabels({})
        }
      })

    return () => void (cancelled = true)
  }, [])

  useEffect(() => {
    if (!config || saveVersion === 0) {
      return
    }

    const v = saveVersion

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          await saveHermesConfig(config)

          if (saveVersionRef.current === v) {
            onConfigSaved?.()
          }
        } catch (err) {
          if (saveVersionRef.current === v) {
            notifyError(err, t('config.common.autosave_failed'))
          }
        }
      })()
    }, 550)

    return () => window.clearTimeout(timer)
  }, [config, onConfigSaved, saveVersion])

  const updateConfig = (next: HermesConfigRecord) => {
    saveVersionRef.current += 1
    setConfig(next)
    setSaveVersion(saveVersionRef.current)
  }

  const sectionFields = useMemo(() => {
    if (!schema) {
      return new Map<string, [string, ConfigFieldSchema][]>()
    }

    return new Map(
      SECTIONS.map(s => [s.id, s.keys.flatMap(k => (schema[k] ? [[k, schema[k]] as [string, ConfigFieldSchema]] : []))])
    )
  }, [schema])

  const matched = useMemo(() => {
    const q = query.trim().toLowerCase()

    if (!schema || !q) {
      return []
    }

    const seen = new Set<string>()

    return SECTIONS.flatMap(s =>
      s.keys.flatMap(k => {
        if (seen.has(k) || !schema[k]) {
          return []
        }

        seen.add(k)
        const label = prettyName(k.split('.').pop() ?? k)
        const item = schema[k]

        const hit =
          k.toLowerCase().includes(q) ||
          label.toLowerCase().includes(q) ||
          includesQuery(item.category, q) ||
          includesQuery(item.description, q)

        return hit ? [[k, item] as [string, ConfigFieldSchema]] : []
      })
    )
  }, [schema, query])

  const fields = query.trim() ? matched : (sectionFields.get(activeSectionId) ?? [])
  const activeSection = SECTIONS.find(s => s.id === activeSectionId)

  function handleImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]

    if (!file) {
      return
    }

    const reader = new FileReader()

    reader.onload = () => {
      try {
        updateConfig(JSON.parse(String(reader.result)))
        notify({ kind: 'success', title: 'Config imported', message: 'Saving…' })
      } catch (err) {
        notifyError(err, 'Invalid config JSON')
      }
    }

    reader.readAsText(file)
    e.target.value = ''
  }

  if (!config || !schema) {
    return <LoadingState label={t('config.common.loading')} />
  }

  return (
    <SettingsContent>
      {!query.trim() && activeSection && activeSectionId !== 'model' && (
        <div className="mb-5">
          <SectionHeading icon={activeSection.icon} title={t(`settings.${activeSection.id}`, activeSection.label)} />
          {activeSection.description && (
            <p className="max-w-2xl text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
              {t(`settings.section_desc.${activeSection.id}`, activeSection.description)}
            </p>
          )}
        </div>
      )}
      {activeSectionId === 'model' && !query.trim() && (
        <div className="mb-6">
          <ModelSettings onMainModelChanged={onMainModelChanged} />
        </div>
      )}
      {query.trim() && (
        <div className="mb-4 text-xs text-muted-foreground">
          {t('config.common.search_results', { count: fields.length })}
        </div>
      )}
      {fields.length === 0 ? (
        <EmptyState description={t('config.common.empty_desc')} title={t('config.common.empty_title')} />
      ) : (
        <div className="divide-y divide-border/40">
          {fields.map(([key, field]) => (
            <ConfigField
              enumOptions={
                key === 'tts.elevenlabs.voice_id'
                  ? enumOptionsFor(key, getNested(config, key), config, elevenLabsVoiceOptions ?? undefined)
                  : enumOptionsFor(key, getNested(config, key), config)
              }
              key={key}
              onChange={value => updateConfig(setNested(config, key, value))}
              optionLabels={key === 'tts.elevenlabs.voice_id' ? elevenLabsVoiceLabels : undefined}
              schema={field}
              schemaKey={key}
              value={getNested(config, key)}
            />
          ))}
        </div>
      )}
      <input
        accept=".json,application/json"
        className="hidden"
        onChange={handleImport}
        ref={importInputRef}
        type="file"
      />
    </SettingsContent>
  )
}
