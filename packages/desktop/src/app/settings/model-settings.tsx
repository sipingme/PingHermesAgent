import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { getAuxiliaryModels, getGlobalModelInfo, getGlobalModelOptions, setModelAssignment } from '@/hermes'
import type { AuxiliaryModelsResponse, ModelOptionProvider } from '@/hermes'
import { Cpu, Loader2, Sparkles } from '@/lib/icons'
import { cn } from '@/lib/utils'

import { CONTROL_TEXT } from './constants'
import { ListRow, LoadingState, Pill, SectionHeading } from './primitives'

// Mirrors `_AUX_TASK_SLOTS` in hermes_cli/web_server.py. Friendly labels and
// hints make the assignments readable; raw task keys (vision, mcp, …) are
// opaque to most users.
interface AuxTaskMeta {
  hint: string
  key: string
  label: string
}

const AUX_TASK_KEYS: readonly string[] = [
  'vision',
  'web_extract',
  'compression',
  'session_search',
  'skills_hub',
  'approval',
  'mcp',
  'title_generation',
  'curator'
]

const NO_PROVIDERS: readonly ModelOptionProvider[] = [{ name: '—', slug: '', models: [] }]

interface ModelSettingsProps {
  /** Notified after the main model is applied, so live UI stores can sync. */
  onMainModelChanged?: (provider: string, model: string) => void
}

export function ModelSettings({ onMainModelChanged }: ModelSettingsProps) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [mainModel, setMainModel] = useState<{ model: string; provider: string } | null>(null)
  const [providers, setProviders] = useState<ModelOptionProvider[]>([])
  const [selectedProvider, setSelectedProvider] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const [auxiliary, setAuxiliary] = useState<AuxiliaryModelsResponse | null>(null)
  const [applying, setApplying] = useState(false)
  const [editingAuxTask, setEditingAuxTask] = useState<null | string>(null)
  const [auxDraft, setAuxDraft] = useState<{ model: string; provider: string }>({ model: '', provider: '' })

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const [modelInfo, modelOptions, auxiliaryModels] = await Promise.all([
        getGlobalModelInfo(),
        getGlobalModelOptions(),
        getAuxiliaryModels()
      ])

      setMainModel({ model: modelInfo.model, provider: modelInfo.provider })
      setProviders(modelOptions.providers || [])
      setSelectedProvider(prev => prev || modelInfo.provider)
      setSelectedModel(prev => prev || modelInfo.model)
      setAuxiliary(auxiliaryModels)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const providerOptions = providers.length ? providers : NO_PROVIDERS

  const selectedProviderModels = useMemo(
    () => providers.find(provider => provider.slug === selectedProvider)?.models ?? [],
    [providers, selectedProvider]
  )

  const auxDraftProviderModels = useMemo(
    () => providers.find(provider => provider.slug === auxDraft.provider)?.models ?? [],
    [auxDraft.provider, providers]
  )

  const applyMainModel = useCallback(async () => {
    if (!selectedProvider || !selectedModel) {
      return
    }

    setApplying(true)
    setError('')

    try {
      const result = await setModelAssignment({ model: selectedModel, provider: selectedProvider, scope: 'main' })
      const provider = result.provider || selectedProvider
      const model = result.model || selectedModel
      setMainModel({ provider, model })
      onMainModelChanged?.(provider, model)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setApplying(false)
    }
  }, [onMainModelChanged, refresh, selectedModel, selectedProvider])

  const setAuxiliaryToMain = useCallback(
    async (task: string) => {
      if (!mainModel) {
        return
      }

      setApplying(true)
      setError('')

      try {
        await setModelAssignment({ model: mainModel.model, provider: mainModel.provider, scope: 'auxiliary', task })
        await refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setApplying(false)
      }
    },
    [mainModel, refresh]
  )

  const applyAuxiliaryDraft = useCallback(
    async (task: string) => {
      if (!auxDraft.provider || !auxDraft.model) {
        return
      }

      setApplying(true)
      setError('')

      try {
        await setModelAssignment({ model: auxDraft.model, provider: auxDraft.provider, scope: 'auxiliary', task })
        setEditingAuxTask(null)
        await refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setApplying(false)
      }
    },
    [auxDraft, refresh]
  )

  const beginAuxiliaryEdit = useCallback(
    (task: string) => {
      const current = auxiliary?.tasks.find(entry => entry.task === task)

      const initialProvider =
        current?.provider && current.provider !== 'auto' ? current.provider : (mainModel?.provider ?? '')

      const initialModel = current?.model || mainModel?.model || ''
      setAuxDraft({ provider: initialProvider, model: initialModel })
      setEditingAuxTask(task)
    },
    [auxiliary, mainModel]
  )

  const resetAuxiliaryModels = useCallback(async () => {
    if (!mainModel) {
      return
    }

    setApplying(true)
    setError('')

    try {
      await setModelAssignment({
        model: mainModel.model,
        provider: mainModel.provider,
        scope: 'auxiliary',
        task: '__reset__'
      })
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setApplying(false)
    }
  }, [mainModel, refresh])

  if (loading && !mainModel) {
    return <LoadingState label={t('modelSettings.loading')} />
  }

  return (
    <div className="grid gap-6">
      <section>
        <SectionHeading icon={Sparkles} meta={mainModel ? `${mainModel.provider} / ${mainModel.model}` : undefined} title={t('modelSettings.main.title')} />
        <p className="mb-3 text-xs text-muted-foreground">{t('modelSettings.main.desc')}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Select onValueChange={setSelectedProvider} value={selectedProvider}>
            <SelectTrigger className={cn('min-w-40', CONTROL_TEXT)}>
              <SelectValue placeholder={t('modelSettings.placeholders.provider')} />
            </SelectTrigger>
            <SelectContent>
              {providerOptions.map(provider => (
                <SelectItem key={provider.slug || 'none'} value={provider.slug || 'none'}>
                  {provider.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select onValueChange={setSelectedModel} value={selectedModel}>
            <SelectTrigger className={cn('min-w-60', CONTROL_TEXT)}>
              <SelectValue placeholder={t('modelSettings.placeholders.model')} />
            </SelectTrigger>
            <SelectContent>
              {(selectedProviderModels.length ? selectedProviderModels : []).map(model => (
                <SelectItem key={model} value={model}>
                  {model}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button disabled={!selectedProvider || !selectedModel || applying} onClick={() => void applyMainModel()} size="sm">
            {applying ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            {applying ? t('modelSettings.applying') : t('modelSettings.apply')}
          </Button>
        </div>
        {error && <div className="mt-2 text-xs text-destructive">{error}</div>}
      </section>

      <section>
        <div className="mb-2.5 flex items-center justify-between">
          <SectionHeading icon={Cpu} title={t('modelSettings.aux.title')} />
          <Button
            disabled={!mainModel || applying}
            onClick={() => void resetAuxiliaryModels()}
            size="sm"
            variant="outline"
          >
            {t('modelSettings.aux.reset_all')}
          </Button>
        </div>
        <p className="mb-2 text-xs text-muted-foreground">{t('modelSettings.aux.desc')}</p>
        <div className="divide-y divide-border/40">
          {AUX_TASK_KEYS.map(key => {
            const meta = { key, label: t(`modelSettings.tasks.${key}.label`), hint: t(`modelSettings.tasks.${key}.hint`) }
            const current = auxiliary?.tasks.find(entry => entry.task === meta.key)
            const isAuto = !current || !current.provider || current.provider === 'auto'
            const isEditing = editingAuxTask === meta.key

            return (
              <ListRow
                action={
                  !isEditing && (
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button
                        disabled={!mainModel || applying}
                        onClick={() => void setAuxiliaryToMain(meta.key)}
                        size="sm"
                        variant="ghost"
                      >
                        {t('modelSettings.aux.set_to_main')}
                      </Button>
                      <Button
                        disabled={!providers.length || applying}
                        onClick={() => beginAuxiliaryEdit(meta.key)}
                        size="sm"
                        variant="outline"
                      >
                        {t('modelSettings.change')}
                      </Button>
                    </div>
                  )
                }
                below={
                  isEditing && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border/40 pt-2">
                      <Select
                        onValueChange={value => setAuxDraft(prev => ({ ...prev, provider: value, model: '' }))}
                        value={auxDraft.provider}
                      >
                        <SelectTrigger className={cn('min-w-32', CONTROL_TEXT)}>
                          <SelectValue placeholder={t('modelSettings.placeholders.provider')} />
                        </SelectTrigger>
                        <SelectContent>
                          {providerOptions.map(provider => (
                            <SelectItem key={provider.slug || 'none'} value={provider.slug || 'none'}>
                              {provider.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        onValueChange={value => setAuxDraft(prev => ({ ...prev, model: value }))}
                        value={auxDraft.model}
                      >
                        <SelectTrigger className={cn('min-w-48', CONTROL_TEXT)}>
                          <SelectValue placeholder={t('modelSettings.placeholders.model')} />
                        </SelectTrigger>
                        <SelectContent>
                          {(auxDraftProviderModels.length ? auxDraftProviderModels : []).map(model => (
                            <SelectItem key={model} value={model}>
                              {model}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        disabled={!auxDraft.provider || !auxDraft.model || applying}
                        onClick={() => void applyAuxiliaryDraft(meta.key)}
                        size="sm"
                      >
                        {applying ? t('modelSettings.applying') : t('modelSettings.apply')}
                      </Button>
                      <Button onClick={() => setEditingAuxTask(null)} size="sm" variant="ghost">
                        {t('common.close')}
                      </Button>
                    </div>
                  )
                }
                description={
                  <span className="font-mono text-[0.68rem]">
                    {isAuto
                      ? t('modelSettings.aux.auto')
                      : `${current.provider} · ${current.model || t('modelSettings.aux.provider_default')}`}
                  </span>
                }
                key={meta.key}
                title={
                  <span className="flex items-baseline gap-2">
                    {meta.label}
                    <Pill>{meta.hint}</Pill>
                  </span>
                }
              />
            )
          })}
        </div>
      </section>
    </div>
  )
}
