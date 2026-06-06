import type * as React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PageLoader } from '@/components/page-loader'
import { StatusDot, type StatusTone } from '@/components/status-dot'
import { Button } from '@/components/ui/button'
import { DisclosureCaret } from '@/components/ui/disclosure-caret'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  getMessagingPlatforms,
  type MessagingEnvVarInfo,
  type MessagingPlatformInfo,
  updateMessagingPlatform
} from '@/hermes'
import { AlertTriangle, ExternalLink, Save, Trash2 } from '@/lib/icons'
import { cn } from '@/lib/utils'
import { notify, notifyError } from '@/store/notifications'

import { useRouteEnumParam } from '../hooks/use-route-enum-param'
import { PageSearchShell } from '../page-search-shell'
import type { SetStatusbarItemGroup } from '../shell/statusbar-controls'

import { PlatformAvatar } from './platform-icon'

interface MessagingViewProps extends React.ComponentProps<'section'> {
  setStatusbarItemGroup?: SetStatusbarItemGroup
}

type EditMap = Record<string, Record<string, string>>

const PILL_TONE: Record<StatusTone, string> = {
  good: 'bg-primary/10 text-primary',
  muted: 'bg-muted text-muted-foreground',
  warn: 'bg-amber-500/10 text-amber-600 dark:text-amber-300',
  bad: 'bg-destructive/10 text-destructive'
}

// Pill tone mapping preserved; labels are translated at render-time via i18n.

function stateTone({ enabled, state }: MessagingPlatformInfo): StatusTone {
  if (!enabled) {
    return 'muted'
  }

  if (state === 'connected') {
    return 'good'
  }

  if (state === 'fatal' || state === 'startup_failed') {
    return 'bad'
  }

  return 'warn'
}

const trimEdits = (edits: Record<string, string>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(edits)
      .map(([k, v]) => [k, v.trim()])
      .filter(([, v]) => v)
  )

const FIELD_COPY: Record<string, { advanced?: boolean; help?: string; label: string; placeholder?: string }> = {
  TELEGRAM_BOT_TOKEN: {
    label: 'Bot token',
    help: 'Create a bot with @BotFather, then paste the token it gives you.',
    placeholder: '123456:ABC...'
  },
  TELEGRAM_ALLOWED_USERS: {
    label: 'Allowed Telegram user IDs',
    help: 'Recommended. Comma-separated numeric IDs from @userinfobot. Without this, anyone can DM your bot.',
    placeholder: '123456789, 987654321'
  },
  TELEGRAM_PROXY: {
    label: 'Proxy URL',
    help: 'Only needed on networks where Telegram is blocked.',
    placeholder: 'socks5://127.0.0.1:1080',
    advanced: true
  },
  DISCORD_BOT_TOKEN: {
    label: 'Bot token',
    help: 'Create an application in the Discord Developer Portal, add a bot, then paste its token.',
    placeholder: 'Paste token…'
  },
  DISCORD_ALLOWED_USERS: {
    label: 'Allowed Discord user IDs',
    help: 'Recommended. Comma-separated Discord user IDs.',
    placeholder: 'user1, user2'
  },
  DISCORD_ALLOW_ALL_USERS: {
    label: 'Allow all users? (true/false)',
    help: 'Allow any Discord user to trigger the bot (dev only).',
    placeholder: 'true or false'
  },
  DISCORD_HOME_CHANNEL: {
    label: 'Home channel ID',
    help: 'Default channel ID for cron / notification delivery.',
    placeholder: 'home-channel-id'
  },
  DISCORD_HOME_CHANNEL_NAME: {
    label: 'Home channel display name',
    help: 'Display name for the Discord home channel.',
    placeholder: 'My Channel'
  },
  DISCORD_REPLY_TO_MODE: {
    label: 'Reply style',
    help: 'first, all, or off.',
    advanced: true
  },
  SLACK_BOT_TOKEN: {
    label: 'Slack bot token',
    help: 'Starts with xoxb-. Found under OAuth & Permissions after installing your Slack app.',
    placeholder: 'xoxb-...'
  },
  SLACK_APP_TOKEN: {
    label: 'Slack app token',
    help: 'Starts with xapp-. Required for Socket Mode.',
    placeholder: 'xapp-...'
  },
  SLACK_ALLOWED_USERS: {
    label: 'Allowed Slack user IDs',
    help: 'Recommended. Comma-separated Slack user IDs.'
  },
  MATTERMOST_URL: {
    label: 'Server URL',
    help: 'Mattermost server URL (e.g. https://mm.example.com).',
    placeholder: 'https://mattermost.example.com'
  },
  MATTERMOST_TOKEN: {
    label: 'Bot token',
    help: 'Mattermost bot token or personal access token.',
    placeholder: 'Paste token…'
  },
  MATTERMOST_ALLOWED_USERS: {
    label: 'Allowed user IDs',
    help: 'Recommended. Comma-separated Mattermost user IDs.',
    placeholder: 'user1, user2'
  },
  MATTERMOST_ALLOWED_CHANNELS: {
    label: 'Allowed channel IDs (comma-separated)',
    help: 'If set, the bot only responds in these channels (whitelist).',
    placeholder: 'channel1, channel2'
  },
  MATTERMOST_ALLOW_ALL_USERS: {
    label: 'Allow all users? (true/false)',
    help: 'Allow any Mattermost user to trigger the bot (dev only).',
    placeholder: 'true or false'
  },
  MATTERMOST_FREE_RESPONSE_CHANNELS: {
    label: 'Free-response channel IDs (comma-separated)',
    help: 'Comma-separated Mattermost channel IDs where bot responds without @mention.',
    placeholder: 'channel1, channel2'
  },
  MATTERMOST_HOME_CHANNEL: {
    label: 'Home channel ID',
    help: 'Default channel ID for cron / notification delivery.',
    placeholder: 'home-channel-id'
  },
  MATTERMOST_REPLY_MODE: {
    label: 'Reply mode (thread|off)',
    help: "How replies are sent: 'thread' (nested) or 'off' (flat). Default: off.",
    placeholder: 'off'
  },
  MATTERMOST_REQUIRE_MENTION: {
    label: 'Require @mention in channels',
    help: 'Require @mention in Mattermost channels (default: true). Set to false to respond to all messages.',
    placeholder: 'true or false'
  },
  MATRIX_HOMESERVER: {
    label: 'Homeserver URL',
    help: 'Matrix homeserver URL (e.g. https://matrix.example.org).',
    placeholder: 'https://matrix.org'
  },
  MATRIX_ACCESS_TOKEN: {
    label: 'Access token',
    help: 'Matrix access token (preferred over password login).',
    placeholder: 'Paste token…'
  },
  MATRIX_USER_ID: {
    label: 'Bot user ID',
    help: 'Matrix user ID (e.g. @hermes:example.org).',
    placeholder: '@hermes:example.org'
  },
  MATRIX_ALLOWED_USERS: {
    label: 'Allowed Matrix user IDs',
    help: 'Recommended. Comma-separated user IDs in @user:server format.',
    placeholder: '@user1:server, @user2:server'
  },
  SIGNAL_HTTP_URL: {
    label: 'Signal bridge URL',
    placeholder: 'http://127.0.0.1:8080',
    help: 'URL of a running signal-cli REST bridge.'
  },
  SIGNAL_ACCOUNT: {
    label: 'Phone number',
    help: 'The number registered with your signal-cli bridge.',
    placeholder: '+1-555-0100'
  },
  SIGNAL_ALLOWED_USERS: {
    label: 'Allowed Signal users',
    help: 'Recommended. Comma-separated Signal identifiers.',
    placeholder: '+1-555-0100, +1-555-0101'
  },
  WHATSAPP_ENABLED: {
    label: 'Enable WhatsApp bridge',
    help: 'Set automatically by the toggle below. Leave alone unless you know you need it.',
    advanced: true
  },
  WHATSAPP_MODE: {
    label: 'Bridge mode',
    advanced: true
  },
  WHATSAPP_ALLOWED_USERS: {
    label: 'Allowed WhatsApp users',
    help: 'Recommended. Comma-separated phone numbers or WhatsApp IDs.'
  },
  TEAMS_CLIENT_ID: {
    label: 'Teams / Azure AD client ID',
    help: 'Azure AD application (Bot Framework) client ID.'
  },
  TEAMS_CLIENT_SECRET: {
    label: 'Teams / Azure AD client secret',
    help: 'Azure AD application client secret.'
  },
  TEAMS_TENANT_ID: {
    label: 'Teams / Azure AD tenant ID',
    help: 'Azure AD tenant ID hosting the bot application.'
  },
  TEAMS_ALLOWED_USERS: {
    label: 'Allowed users (comma-separated)',
    help: 'Comma-separated Teams user IDs / UPNs allowed to talk to the bot.'
  },
  TEAMS_ALLOW_ALL_USERS: {
    label: 'Allow all users? (true/false)',
    help: 'Allow any Teams user to trigger the bot (dev only).'
  },
  TEAMS_HOME_CHANNEL: {
    label: 'Home channel (or empty)',
    help: 'Default chat/channel ID for cron / notification delivery.'
  },
  TEAMS_HOME_CHANNEL_NAME: {
    label: 'Home channel display name',
    help: 'Display name for the Teams home channel.'
  },
  TEAMS_PORT: {
    label: 'Webhook port',
    help: 'Webhook listen port (Bot Framework default: 3978).'
  },
  SIMPLEX_WS_URL: {
    label: 'SimpleX daemon WebSocket URL',
    help: 'WebSocket URL of the simplex-chat daemon (e.g. ws://127.0.0.1:5225).'
  },
  SIMPLEX_ALLOWED_USERS: {
    label: 'Allowed contact IDs (comma-separated)',
    help: 'Comma-separated SimpleX contact IDs allowed to talk to the bot.'
  },
  SIMPLEX_ALLOW_ALL_USERS: {
    label: 'Allow all contacts? (true/false)',
    help: 'Allow any contact to talk to the bot (dev only — disables allowlist).'
  },
  SIMPLEX_HOME_CHANNEL: {
    label: 'Home channel contact/group ID (or empty)',
    help: 'Default contact/group ID for cron / notification delivery.'
  },
  SIMPLEX_HOME_CHANNEL_NAME: {
    label: 'Home channel display name (or empty)',
    help: 'Human label for the home channel (defaults to the ID).'
  },
  NTFY_SERVER_URL: {
    label: 'ntfy server URL',
    help: 'ntfy server URL (default: https://ntfy.sh).',
    placeholder: 'https://ntfy.sh'
  },
  NTFY_TOPIC: {
    label: 'ntfy subscribe topic',
    help: 'Topic name to subscribe to (e.g. hermes-in).',
    placeholder: 'hermes-in'
  },
  NTFY_TOKEN: {
    label: 'ntfy auth token (or empty)',
    help: "Bearer token or 'user:pass' for Basic auth (optional)."
  },
  NTFY_PUBLISH_TOPIC: {
    label: 'ntfy publish topic (or empty)',
    help: 'Topic to publish replies to (defaults to NTFY_TOPIC).'
  },
  NTFY_MARKDOWN: {
    label: 'Enable markdown formatting? (true/false)',
    help: 'Send replies with X-Markdown: true header (true/false, default: false).',
    placeholder: 'true or false'
  },
  NTFY_ALLOWED_USERS: {
    label: 'Allowed topic names (comma-separated)',
    help: 'Comma-separated topic names allowed (allowlist).',
    placeholder: 'topic1, topic2'
  },
  NTFY_ALLOW_ALL_USERS: {
    label: 'Allow all topics? (true/false)',
    help: 'Allow any topic to talk to the bot (dev only — disables allowlist).',
    placeholder: 'true or false'
  },
  NTFY_HOME_CHANNEL: {
    label: 'Home channel topic (or empty)',
    help: 'Default topic for cron / notification delivery.'
  },
  NTFY_HOME_CHANNEL_NAME: {
    label: 'Home channel display name (or empty)',
    help: 'Human label for the home channel (defaults to the topic name).'
  },
  LINE_CHANNEL_ACCESS_TOKEN: {
    label: 'LINE channel access token',
    help: 'LINE channel long-lived access token (LINE Developers Console > Messaging API > Channel access token).',
    placeholder: 'Paste token…'
  },
  LINE_CHANNEL_SECRET: {
    label: 'LINE channel secret',
    help: 'LINE channel secret (used for HMAC-SHA256 webhook signature verification).'
  },
  LINE_ALLOWED_USERS: {
    label: 'Allowed user IDs (comma-separated)',
    help: 'Comma-separated LINE user IDs allowed to DM the bot (U-prefixed).',
    placeholder: 'Uxxxxxxxx, Uyyyyyyyy'
  },
  LINE_ALLOWED_GROUPS: {
    label: 'Allowed group IDs (comma-separated)',
    help: 'Comma-separated LINE group IDs the bot will respond in (C-prefixed).',
    placeholder: 'Cxxxxxxxx, Cyyyyyyyy'
  },
  LINE_ALLOWED_ROOMS: {
    label: 'Allowed room IDs (comma-separated)',
    help: 'Comma-separated LINE room IDs the bot will respond in (R-prefixed).',
    placeholder: 'Rxxxxxxxx, Ryyyyyyyy'
  },
  LINE_ALLOW_ALL_USERS: {
    label: 'Allow all users? (true/false)',
    help: 'Allow any LINE user to talk to the bot (dev only — disables allowlist).',
    placeholder: 'true or false'
  },
  LINE_HOME_CHANNEL: {
    label: 'Home channel ID (or empty)',
    help: 'Default user/group/room ID for cron / notification delivery.'
  },
  LINE_HOST: {
    label: 'Webhook host',
    help: 'Webhook bind host (default: 0.0.0.0).',
    placeholder: '0.0.0.0'
  },
  LINE_PORT: {
    label: 'Webhook port',
    help: 'Webhook listen port (default: 8646).',
    placeholder: '8646'
  },
  LINE_PUBLIC_URL: {
    label: 'Public HTTPS base URL',
    help: 'Public HTTPS base URL for serving images/audio/video to LINE. Required for media sending when the bind address is not directly reachable.',
    placeholder: 'https://my-tunnel.example.com'
  },
  LINE_SLOW_RESPONSE_THRESHOLD: {
    label: 'Slow response threshold (seconds)',
    help: 'Seconds before the slow-LLM postback button fires (default: 45; set 0 to disable).',
    placeholder: '45'
  },
  IRC_SERVER: {
    label: 'IRC server',
    help: 'IRC server hostname (e.g. irc.libera.chat).',
    placeholder: 'irc.libera.chat'
  },
  IRC_PORT: {
    label: 'IRC port',
    help: 'IRC server port (default: 6697 with TLS, 6667 without).',
    placeholder: '6697'
  },
  IRC_USE_TLS: {
    label: 'Use TLS? (true/false)',
    help: 'Use TLS for the IRC connection (default: true on port 6697).',
    placeholder: 'true or false'
  },
  IRC_NICKNAME: {
    label: 'IRC nickname',
    help: 'Bot nickname on IRC (default: hermes-bot).',
    placeholder: 'hermes-bot'
  },
  IRC_CHANNEL: {
    label: 'IRC channel',
    help: 'IRC channel to join (e.g. #hermes).',
    placeholder: '#hermes'
  },
  IRC_ALLOWED_USERS: {
    label: 'Allowed nicks (comma-separated)',
    help: 'Comma-separated IRC nicks allowed to talk to the bot.',
    placeholder: 'nick1, nick2'
  },
  IRC_ALLOW_ALL_USERS: {
    label: 'Allow all users? (true/false)',
    help: 'Allow anyone in the channel to talk to the bot (dev only).',
    placeholder: 'true or false'
  },
  IRC_HOME_CHANNEL: {
    label: 'Home channel (or empty)',
    help: 'Channel for cron / notification delivery (defaults to IRC_CHANNEL).'
  },
  IRC_NICKSERV_PASSWORD: {
    label: 'NickServ password',
    help: 'NickServ password for nick identification.',
    advanced: true
  },
  IRC_SERVER_PASSWORD: {
    label: 'IRC server password',
    help: 'IRC server password (if required).',
    advanced: true
  },
  GOOGLE_CHAT_PROJECT_ID: {
    label: 'GCP project ID',
    help: 'GCP project ID hosting the Pub/Sub topic for Chat events. Falls back to GOOGLE_CLOUD_PROJECT.',
    placeholder: 'my-project-123'
  },
  GOOGLE_CHAT_SUBSCRIPTION_NAME: {
    label: 'Pub/Sub subscription name',
    help: 'Full Pub/Sub subscription path: projects/<proj>/subscriptions/<sub>.',
    placeholder: 'projects/my-project/subscriptions/hermes-chat'
  },
  GOOGLE_CHAT_SERVICE_ACCOUNT_JSON: {
    label: 'Path to SA JSON (or empty for ADC)',
    help: 'Path to Service Account JSON key (or inline JSON). Leave empty to use Application Default Credentials.',
    placeholder: '/path/to/sa.json'
  },
  GOOGLE_CHAT_ALLOWED_USERS: {
    label: 'Allowed user emails (comma-separated)',
    help: 'Comma-separated user emails allowed to interact with the bot.',
    placeholder: 'alice@example.com, bob@example.com'
  },
  GOOGLE_CHAT_HOME_CHANNEL: {
    label: 'Home space ID (or empty)',
    help: 'Default space for cron / notification delivery (e.g. spaces/AAAA...).'
  },
  WEBHOOK_ENABLED: {
    label: 'Enable webhooks (true/false)',
    help: 'Enable the webhook platform adapter for receiving events from GitHub, GitLab, etc.',
    placeholder: 'true or false'
  },
  WEBHOOK_PORT: {
    label: 'Webhook port',
    help: 'Port for the webhook HTTP server (default: 8644).',
    placeholder: '8644'
  },
  WEBHOOK_SECRET: {
    label: 'Webhook secret',
    help: 'Global HMAC secret for webhook signature validation (overridable per route in config.yaml).'
  },
  API_SERVER_ENABLED: {
    label: 'Enable API server (true/false)',
    help: 'Enable the OpenAI-compatible API server. Allows frontends like Open WebUI, LobeChat, etc. to connect.',
    placeholder: 'true or false',
    advanced: true
  },
  API_SERVER_KEY: {
    label: 'API server auth key',
    help: 'Bearer token for API server authentication. Required whenever the API server is enabled.',
    advanced: true
  },
  API_SERVER_PORT: {
    label: 'API server port',
    help: 'Port for the API server (default: 8642).',
    placeholder: '8642',
    advanced: true
  },
  API_SERVER_HOST: {
    label: 'API server host',
    help: 'Host/bind address for the API server (default: 127.0.0.1).',
    placeholder: '127.0.0.1',
    advanced: true
  },
  API_SERVER_MODEL_NAME: {
    label: 'API server model name',
    help: "Model name advertised on /v1/models. Defaults to the profile name (or 'hermes-agent' for the default profile).",
    placeholder: 'hermes-agent',
    advanced: true
  },
  QQ_APP_ID: {
    label: 'QQ App ID',
    help: 'QQ Bot App ID from QQ Open Platform (q.qq.com).',
    placeholder: '12345678'
  },
  QQ_CLIENT_SECRET: {
    label: 'QQ Client Secret',
    help: 'QQ Bot Client Secret from QQ Open Platform.'
  },
  QQ_ALLOWED_USERS: {
    label: 'QQ Allowed Users',
    help: 'Comma-separated QQ user IDs allowed to use the bot.',
    placeholder: '123456, 789012'
  },
  QQ_ALLOW_ALL_USERS: {
    label: 'Allow All QQ Users',
    help: 'Allow all QQ users without an allowlist (true/false).',
    placeholder: 'true or false'
  },
  QQ_GROUP_ALLOWED_USERS: {
    label: 'QQ Group Allowed Users',
    help: 'Comma-separated QQ group IDs allowed to interact with the bot.',
    placeholder: 'group1, group2'
  },
  QQBOT_HOME_CHANNEL: {
    label: 'QQ Home Channel',
    help: 'Default QQ channel/group for cron delivery and notifications.'
  },
  QQBOT_HOME_CHANNEL_NAME: {
    label: 'QQ Home Channel Name',
    help: 'Display name for the QQ home channel.'
  },
  QQ_SANDBOX: {
    label: 'QQ Sandbox Mode',
    help: 'Enable QQ sandbox mode for development testing (true/false).',
    placeholder: 'true or false'
  },
  WECOM_CALLBACK_CORP_ID: {
    label: 'WeCom Corp ID',
    help: 'WeCom corp ID.'
  },
  WECOM_CALLBACK_CORP_SECRET: {
    label: 'WeCom Corp Secret',
    help: 'WeCom app corp secret.'
  },
  WECOM_CALLBACK_AGENT_ID: {
    label: 'WeCom Agent ID',
    help: 'WeCom app agent ID.'
  },
  WECOM_CALLBACK_TOKEN: {
    label: 'WeCom Token',
    help: 'WeCom callback verification token.'
  },
  WECOM_CALLBACK_ENCODING_AES_KEY: {
    label: 'WeCom AES Key',
    help: 'WeCom callback AES encoding key.'
  },
  WECOM_BOT_ID: {
    label: 'WeCom Bot ID',
    help: 'WeCom group bot ID (webhook key).'
  },
  WECOM_SECRET: {
    label: 'WeCom Secret',
    help: 'WeCom group bot secret.'
  },
  FEISHU_APP_ID: {
    label: 'App ID',
    help: 'Feishu / Lark app ID.'
  },
  FEISHU_APP_SECRET: {
    label: 'App secret',
    help: 'Feishu / Lark app secret.'
  },
  FEISHU_ENCRYPT_KEY: {
    label: 'Encrypt key',
    help: 'Feishu / Lark encrypt key.'
  },
  FEISHU_VERIFICATION_TOKEN: {
    label: 'Verification token',
    help: 'Feishu / Lark verification token.'
  },
  DINGTALK_CLIENT_ID: {
    label: 'Client ID',
    help: 'DingTalk client ID (App key).'
  },
  DINGTALK_CLIENT_SECRET: {
    label: 'Client secret',
    help: 'DingTalk client secret (App secret).'
  },
  TWILIO_ACCOUNT_SID: {
    label: 'Twilio Account SID',
    help: 'Twilio Account SID.'
  },
  TWILIO_AUTH_TOKEN: {
    label: 'Twilio Auth Token',
    help: 'Twilio Auth Token.'
  },
  EMAIL_ADDRESS: {
    label: 'Email address',
    help: 'Email address to send and receive from.'
  },
  EMAIL_PASSWORD: {
    label: 'Email password',
    help: 'Email account password or app password.'
  },
  EMAIL_IMAP_HOST: {
    label: 'IMAP host',
    help: 'IMAP server host (e.g. imap.gmail.com).'
  },
  EMAIL_SMTP_HOST: {
    label: 'SMTP host',
    help: 'SMTP server host (e.g. smtp.gmail.com).'
  },
  HASS_URL: {
    label: 'Home Assistant URL',
    help: 'Home Assistant base URL, e.g. https://homeassistant.local:8123'
  },
  HASS_TOKEN: {
    label: 'Home Assistant access token',
    help: 'Long-lived access token from Home Assistant (Profile → Security).'
  },
  BLUEBUBBLES_SERVER_URL: {
    label: 'BlueBubbles server URL',
    help: 'BlueBubbles server URL for iMessage integration (e.g. http://192.168.1.10:1234).'
  },
  BLUEBUBBLES_PASSWORD: {
    label: 'BlueBubbles server password',
    help: 'BlueBubbles server password (from BlueBubbles Server → Settings → API).'
  },
  BLUEBUBBLES_ALLOWED_USERS: {
    label: 'Allowed iMessage addresses (comma-separated)',
    help: 'Comma-separated iMessage addresses (email or phone) allowed to use the bot.'
  },
  BLUEBUBBLES_ALLOW_ALL_USERS: {
    label: 'Allow All BlueBubbles Users',
    help: 'Allow all BlueBubbles users without allowlist (true/false).',
    placeholder: 'true or false'
  }
}

function fieldCopy(field: MessagingEnvVarInfo) {
  const copy = FIELD_COPY[field.key] || {}

  return {
    label: copy.label || field.prompt || field.key,
    help: copy.help || field.description,
    placeholder: copy.placeholder || field.prompt,
    advanced: Boolean(copy.advanced || field.advanced)
  }
}

export function MessagingView({ setStatusbarItemGroup: _setStatusbarItemGroup, ...props }: MessagingViewProps) {
  const { t } = useTranslation()
  const [platforms, setPlatforms] = useState<MessagingPlatformInfo[] | null>(null)
  const [edits, setEdits] = useState<EditMap>({})
  const [query, setQuery] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const platformIds = useMemo(() => platforms?.map(p => p.id) ?? [], [platforms])
  const [selectedId, setSelectedId] = useRouteEnumParam('platform', platformIds, platformIds[0] ?? '')

  const refreshPlatforms = useCallback(async (silent = false) => {
    if (!silent) {
      setRefreshing(true)
    }

    try {
      const result = await getMessagingPlatforms()
      setPlatforms(result.platforms)
    } catch (err) {
      if (!silent) {
        notifyError(err, t('messaging.errors.load_failed'))
      }
    } finally {
      if (!silent) {
        setRefreshing(false)
      }
    }
  }, [])

  useEffect(() => {
    void refreshPlatforms()
  }, [refreshPlatforms])

  // Auto-poll while the user is on the messaging page so connection status
  // updates without a manual "check" click. Pause when the tab is hidden.
  useEffect(() => {
    let cancelled = false

    function tick() {
      if (cancelled || document.hidden) {
        return
      }

      void refreshPlatforms(true)
    }

    const id = window.setInterval(tick, 6000)

    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [refreshPlatforms])

  const selected = useMemo(() => {
    if (!platforms) {
      return null
    }

    return platforms.find(platform => platform.id === selectedId) || platforms[0] || null
  }, [platforms, selectedId])

  const visiblePlatforms = useMemo(() => {
    if (!platforms) {
      return []
    }

    const q = query.trim().toLowerCase()

    if (!q) {
      return platforms
    }

    return platforms.filter(platform =>
      [platform.id, platform.name, platform.description, platform.state]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(q))
    )
  }, [platforms, query])

  async function handleToggle(platform: MessagingPlatformInfo, enabled: boolean) {
    setSaving(`enabled:${platform.id}`)

    try {
      await updateMessagingPlatform(platform.id, { enabled })
      setPlatforms(
        current =>
          current?.map(row =>
            row.id === platform.id
              ? {
                  ...row,
                  enabled,
                  state: enabled ? (row.configured ? 'pending_restart' : 'not_configured') : 'disabled'
                }
              : row
          ) ?? current
      )
      notify({
        kind: 'success',
        title: enabled
          ? t('messaging.notices.platform.enabled', { name: platform.name })
          : t('messaging.notices.platform.disabled', { name: platform.name }),
        message: t('messaging.notices.platform.restart_needed')
      })
    } catch (err) {
      notifyError(err, t('messaging.notices.platform.failed_update', { name: platform.name }))
    } finally {
      setSaving(null)
    }
  }

  async function handleSave(platform: MessagingPlatformInfo) {
    const env = trimEdits(edits[platform.id] || {})

    if (Object.keys(env).length === 0) {
      return
    }

    setSaving(`env:${platform.id}`)

    try {
      await updateMessagingPlatform(platform.id, { env })
      setEdits(current => ({ ...current, [platform.id]: {} }))
      await refreshPlatforms()
      notify({
        kind: 'success',
        title: t('messaging.notices.platform.setup_saved', { name: platform.name }),
        message: t('messaging.notices.platform.restart_to_reconnect')
      })
    } catch (err) {
      notifyError(err, t('messaging.notices.platform.failed_save', { name: platform.name }))
    } finally {
      setSaving(null)
    }
  }

  async function handleClear(platform: MessagingPlatformInfo, key: string) {
    setSaving(`clear:${key}`)

    try {
      await updateMessagingPlatform(platform.id, { clear_env: [key] })
      setEdits(current => ({
        ...current,
        [platform.id]: {
          ...(current[platform.id] || {}),
          [key]: ''
        }
      }))
      await refreshPlatforms()
      notify({
        kind: 'success',
        title: t('messaging.notices.platform.cleared', { key }),
        message: t('messaging.notices.platform.setup_updated', { name: platform.name })
      })
    } catch (err) {
      notifyError(err, t('messaging.notices.platform.failed_clear', { key }))
    } finally {
      setSaving(null)
    }
  }

  return (
    <PageSearchShell
      {...props}
      onSearchChange={setQuery}
      searchPlaceholder={t('messaging.search.placeholder')}
      searchTrailingAction={null}
      searchValue={query}
    >
      {!platforms ? (
        <PageLoader label={t('messaging.loading')} />
      ) : (
        <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[14rem_minmax(0,1fr)]">
          <aside className="min-h-0 overflow-y-auto border-b border-(--ui-stroke-tertiary) p-2 lg:border-b-0 lg:border-r">
            <ul className="space-y-1">
              {visiblePlatforms.map(platform => (
                <li key={platform.id}>
                  <PlatformRow
                    active={selected?.id === platform.id}
                    onSelect={() => setSelectedId(platform.id)}
                    platform={platform}
                  />
                </li>
              ))}
            </ul>
          </aside>

          <main className="min-h-0 overflow-hidden">
            {selected && (
              <PlatformDetail
                edits={edits[selected.id] || {}}
                onClear={key => void handleClear(selected, key)}
                onEdit={(key, value) =>
                  setEdits(current => ({
                    ...current,
                    [selected.id]: {
                      ...(current[selected.id] || {}),
                      [key]: value
                    }
                  }))
                }
                onSave={() => void handleSave(selected)}
                onToggle={enabled => void handleToggle(selected, enabled)}
                platform={selected}
                saving={saving}
              />
            )}
          </main>
        </div>
      )}
    </PageSearchShell>
  )
}

function PlatformRow({
  active,
  onSelect,
  platform
}: {
  active: boolean
  onSelect: () => void
  platform: MessagingPlatformInfo
}) {
  return (
    <button
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
        active
          ? 'bg-(--ui-bg-tertiary) text-foreground'
          : 'text-(--ui-text-secondary) hover:bg-(--chrome-action-hover) hover:text-foreground'
      )}
      onClick={onSelect}
      type="button"
    >
      <PlatformAvatar platformId={platform.id} platformName={platform.name} />
      <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
        <span className="truncate text-[length:var(--conversation-text-font-size)] font-normal">{platform.name}</span>
        <StatusDot tone={stateTone(platform)} />
      </span>
    </button>
  )
}

function PlatformDetail({
  edits,
  onClear,
  onEdit,
  onSave,
  onToggle,
  platform,
  saving
}: {
  edits: Record<string, string>
  onClear: (key: string) => void
  onEdit: (key: string, value: string) => void
  onSave: () => void
  onToggle: (enabled: boolean) => void
  platform: MessagingPlatformInfo
  saving: string | null
}) {
  const { t } = useTranslation()
  const [showAdvanced, setShowAdvanced] = useState(false)

  const hasEdits = Object.keys(trimEdits(edits)).length > 0
  const requiredFields = platform.env_vars.filter(field => field.required)
  const optionalFields = platform.env_vars.filter(field => !field.required && !fieldCopy(field).advanced)
  const advancedFields = platform.env_vars.filter(field => !field.required && fieldCopy(field).advanced)
  const hiddenCount = advancedFields.length
  const isSavingEnv = saving === `env:${platform.id}`

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-5 px-5 py-4">
          <header className="flex items-start gap-3">
            <PlatformAvatar platformId={platform.id} platformName={platform.name} />
            <div className="min-w-0 flex-1">
              <h3 className="text-[0.9375rem] font-semibold tracking-tight">{platform.name}</h3>
              <p className="mt-1 text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
                {t(`messaging.platform_desc.${platform.id}`, { defaultValue: platform.description })}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatePill tone={stateTone(platform)}>
                  {platform.state
                    ? t(`messaging.states.${platform.state}`, { defaultValue: String(platform.state).replace(/_/g, ' ') })
                    : t('messaging.states.unknown')}
                </StatePill>
                <SetupPill active={platform.configured}>
                  {platform.configured ? t('messaging.setup.credentials_set') : t('messaging.setup.needs_setup')}
                </SetupPill>
                {!platform.gateway_running && <SetupPill active={false}>{t('messaging.states.gateway_stopped')}</SetupPill>}
              </div>
              <PlatformHint platform={platform} />
            </div>
          </header>

          {platform.error_message && (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-destructive">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>{platform.error_message}</span>
            </div>
          )}

          <section>
            <SectionTitle>{t('messaging.sections.get_credentials')}</SectionTitle>
            <p className="mt-1 text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
              {t(`messaging.intro.${platform.id}` as const, { defaultValue: introFallback(platform) })}
            </p>
            <div className="mt-3">
              <Button asChild size="sm" variant="outline">
                <a href={platform.docs_url} rel="noreferrer" target="_blank">
                  {t('messaging.sections.open_setup_guide')}
                  <ExternalLink className="size-3.5" />
                </a>
              </Button>
            </div>
          </section>

          <section>
            <SectionTitle>{t('messaging.sections.required')}</SectionTitle>
            <div className="mt-3 space-y-4">
              {requiredFields.length > 0 ? (
                requiredFields.map(field => (
                  <MessagingField
                    edits={edits}
                    field={field}
                    key={field.key}
                    onClear={onClear}
                    onEdit={onEdit}
                    saving={saving}
                  />
                ))
              ) : (
                <p className="text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
                  {t('messaging.required.not_needed')}
                </p>
              )}
            </div>
          </section>

          {optionalFields.length > 0 && (
            <section>
              <SectionTitle>{t('messaging.sections.recommended')}</SectionTitle>
              <div className="mt-3 space-y-4">
                {optionalFields.map(field => (
                  <MessagingField
                    edits={edits}
                    field={field}
                    key={field.key}
                    onClear={onClear}
                    onEdit={onEdit}
                    saving={saving}
                  />
                ))}
              </div>
            </section>
          )}

          {hiddenCount > 0 && (
            <section>
              <button
                className="flex w-full items-center justify-between gap-2 rounded-lg px-1 py-1 text-left text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
                onClick={() => setShowAdvanced(value => !value)}
                type="button"
              >
                <span>{t('messaging.sections.advanced', { count: hiddenCount })}</span>
                <DisclosureCaret open={showAdvanced} size="0.875rem" />
              </button>
              {showAdvanced && (
                <div className="mt-3 space-y-4">
                  {advancedFields.map(field => (
                    <MessagingField
                      edits={edits}
                      field={field}
                      key={field.key}
                      onClear={onClear}
                      onEdit={onEdit}
                      saving={saving}
                    />
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </div>

      <footer className="border-t border-(--ui-stroke-tertiary) bg-(--ui-chat-surface-background) px-5 py-2.5">
        <div className="mx-auto flex max-w-2xl flex-wrap items-center gap-2">
          <label className="flex shrink-0 items-center gap-2 rounded-md border border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) px-2.5 py-1.5 text-[length:var(--conversation-text-font-size)]">
            <Switch
              aria-label={platform.enabled ? t('messaging.aria.disable_platform', { name: platform.name }) : t('messaging.aria.enable_platform', { name: platform.name })}
              checked={platform.enabled}
              disabled={saving === `enabled:${platform.id}`}
              onCheckedChange={onToggle}
            />
            <span className="text-xs font-medium text-muted-foreground">
              {platform.enabled ? t('messaging.common.enabled') : t('messaging.common.disabled')}
            </span>
          </label>

          <div className="ml-auto flex items-center gap-2">
            {hasEdits && <span className="text-xs text-muted-foreground">{t('messaging.common.unsaved_changes')}</span>}
            <Button disabled={!hasEdits || isSavingEnv} onClick={onSave} size="sm">
              <Save />
              {isSavingEnv ? t('messaging.common.saving') : t('messaging.common.save_changes')}
            </Button>
          </div>
        </div>
      </footer>
    </div>
  )
}

const PLATFORM_INTRO: Record<string, string> = {
  telegram:
    'In Telegram, talk to @BotFather, run /newbot, and copy the token it gives you. Then grab your numeric user ID from @userinfobot.',
  discord:
    'Open the Discord Developer Portal, create an application, add a Bot, then copy its token. Invite the bot to your server with the right scopes.',
  slack:
    'Create a Slack app, enable Socket Mode, install it to your workspace, then copy the Bot token (xoxb-) and App-level token (xapp-).',
  mattermost:
    'On your Mattermost server, create a bot account or personal access token, then paste the server URL and token here.',
  matrix: 'Sign in to your homeserver with the bot account, then copy the access token, user ID, and homeserver URL.',
  signal:
    'Run a signal-cli REST bridge somewhere reachable, then point Hermes at the URL and the registered phone number.',
  whatsapp:
    'Start the WhatsApp bridge that ships with Hermes, scan the QR code on first run, then enable the platform.',
  bluebubbles:
    'Run BlueBubbles Server on a Mac with iMessage, expose its API, then point Hermes at the URL with the server password.',
  homeassistant:
    'In Home Assistant, open your profile and create a long-lived access token. Paste it here along with your HA URL.',
  email:
    'Use a dedicated mailbox. For Gmail/Workspace, create an app password and use imap.gmail.com / smtp.gmail.com.',
  sms: 'Get your Twilio Account SID and Auth Token from the Twilio console, plus a phone number that can send SMS.',
  dingtalk: 'Create a DingTalk app in the developer console, then copy the Client ID (App key) and Client Secret here.',
  feishu:
    'Create a Feishu / Lark app, configure the bot capability, and copy the App ID, App secret, and event encryption keys.',
  wecom:
    'Add a group robot in WeCom and copy its webhook key as WECOM_BOT_ID. Send-only — use the WeCom (app) option for two-way.',
  wecom_callback:
    'Set up a WeCom self-built app, expose its callback URL, and provide the corp ID, secret, agent ID, and AES key.',
  weixin:
    'Sign in to the WeChat Official Account platform, copy the AppID and Token, and point the message callback URL at Hermes.',
  qqbot: 'Register an app on the QQ Open Platform (q.qq.com) and copy the App ID and Client Secret.',
  api_server:
    'Expose Hermes as an OpenAI-compatible API. Set an auth key, then point Open WebUI / LobeChat / etc. at the host:port.',
  webhook:
    'Run an HTTP server that other tools (GitHub, GitLab, custom apps) can POST to. Use the secret to verify signatures.',
  teams:
    'Register a Bot Framework app in Azure AD, copy the client ID, client secret, and tenant ID, then configure the webhook endpoint.',
  simplex:
    'Run a simplex-chat daemon with WebSocket enabled, then paste its WebSocket URL here. Set allowed contacts or enable allow-all for testing.',
  ntfy:
    'Pick a topic on ntfy.sh (or your own server), subscribe to it here, and optionally set an auth token. Hermes will listen for incoming messages and reply via the same topic.',
  line:
    'Create a LINE channel in the LINE Developers Console, enable Messaging API, copy the channel access token and secret, then configure the webhook URL.',
  irc:
    'Point Hermes at an IRC server, set a nickname and channel, and optionally configure NickServ or TLS settings. Hermes will join the channel and respond to messages.',
  google_chat:
    'Create a Google Chat app in the Google Cloud Console, enable Pub/Sub events, provide the project ID and subscription name, and optionally set a service account for outbound messages.',
  yuanbao:
    'Connect Hermes to Tencent Yuanbao. Configure the API key and endpoint to send and receive messages through the Yuanbao platform.'
}

const introFallback = (platform: MessagingPlatformInfo) => PLATFORM_INTRO[platform.id] || platform.description

function MessagingField({
  edits,
  field,
  onClear,
  onEdit,
  saving
}: {
  edits: Record<string, string>
  field: MessagingEnvVarInfo
  onClear: (key: string) => void
  onEdit: (key: string, value: string) => void
  saving: string | null
}) {
  const { t } = useTranslation()
  const base = fieldCopy(field)
  const label = t(`messaging.fields.${field.key}.label`, { defaultValue: base.label })
  const help = t(`messaging.fields.${field.key}.help`, { defaultValue: base.help || '' })
  const placeholder = t(`messaging.fields.${field.key}.placeholder`, { defaultValue: base.placeholder || field.prompt || '' })

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-baseline gap-2">
        <label className="text-sm font-medium text-foreground" htmlFor={`messaging-field-${field.key}`}>
          {label}
        </label>
        {field.is_set && <span className="text-[0.66rem] font-medium text-primary">{t('messaging.common.saved')}</span>}
      </div>
      <div className="flex items-center gap-2">
        <Input
          className="h-9 rounded-lg font-mono text-sm"
          id={`messaging-field-${field.key}`}
          onChange={event => onEdit(field.key, event.target.value)}
          placeholder={field.is_set ? field.redacted_value || t('messaging.common.replace_current') : placeholder}
          type={field.is_password ? 'password' : 'text'}
          value={edits[field.key] || ''}
        />
        {field.url && (
          <Button asChild size="icon-sm" title={t('messaging.common.open_docs')} variant="ghost">
            <a href={field.url} rel="noreferrer" target="_blank">
              <ExternalLink className="size-3.5" />
            </a>
          </Button>
        )}
        {field.is_set && (
          <Button
            disabled={saving === `clear:${field.key}`}
            onClick={() => onClear(field.key)}
            size="icon-sm"
            title={t('messaging.common.clear_key', { key: field.key })}
            variant="ghost"
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>
      {help && <p className="text-xs leading-5 text-muted-foreground">{help}</p>}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h4 className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{children}</h4>
}

function PlatformHint({ platform }: { platform: MessagingPlatformInfo }) {
  if (!platform.enabled || platform.state === 'connected') {
    return null
  }

  const { t } = useTranslation()
  const hintKey = platform.state === 'pending_restart' ? 'pending_restart' : platform.gateway_running ? null : 'gateway_stopped'
  const hint = hintKey ? t(`messaging.hints.${hintKey}`) : null

  return hint ? <p className="mt-2 text-xs leading-5 text-muted-foreground">{hint}</p> : null
}

function StatePill({ children, tone }: { children: string; tone: StatusTone }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.66rem] font-medium',
        PILL_TONE[tone]
      )}
    >
      <StatusDot tone={tone} />
      {children}
    </span>
  )
}

function SetupPill({ active, children }: { active: boolean; children: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[0.66rem] font-medium',
        PILL_TONE[active ? 'good' : 'muted']
      )}
    >
      {children}
    </span>
  )
}
