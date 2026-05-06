import React, { useState, useEffect } from 'react'
import { Save, Eye, EyeOff, CheckCircle, AlertCircle, ExternalLink, Key } from 'lucide-react'
import { getSettings, saveSettings } from '../lib/supabase'

function SettingSection({ title, description, children }) {
  return (
    <div className="glass-card p-6 fade-in">
      <h3 className="text-lg font-semibold text-accent mb-1">{title}</h3>
      <p className="text-sm text-brand-400 mb-5">{description}</p>
      {children}
    </div>
  )
}

function SecretInput({ label, value, onChange, placeholder, help }) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <label className="text-xs text-brand-400 uppercase tracking-wider mb-1.5 block">{label}</label>
      <div className="relative">
        <input
          className="input-field !pr-10"
          type={show ? 'text' : 'password'}
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
        />
        <button
          onClick={() => setShow(!show)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-500 hover:text-accent"
        >
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
      {help && <p className="text-xs text-brand-500 mt-1">{help}</p>}
    </div>
  )
}

export default function SettingsPage() {
  const [form, setForm] = useState({
    shopify_store: '',
    shopify_token: '',
    meta_token: '',
    meta_ad_account: '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    getSettings().then(data => {
      if (data) setForm(prev => ({ ...prev, ...data }))
    }).catch(console.error)
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await saveSettings(form)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const update = (key) => (val) => setForm(prev => ({ ...prev, [key]: val }))

  return (
    <div className="space-y-6 fade-in max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold text-accent">Settings</h2>
        <p className="text-sm text-brand-400 mt-1">Configure your API connections</p>
      </div>

      {/* Important Note */}
      <div className="glass-card p-4 border-brand-500/20 bg-brand-900/20">
        <div className="flex items-start gap-3">
          <Key size={18} className="text-brand-400 mt-0.5" />
          <div className="text-sm text-brand-300 space-y-2">
            <p>
              <strong className="text-accent">Important:</strong> API keys entered here are saved locally in your browser
              (or Supabase if configured). For production, set these as environment variables in Vercel:
            </p>
            <code className="block text-xs font-mono text-brand-400 bg-brand-950/50 p-3 rounded-lg">
              SHOPIFY_STORE=minimal-mate<br/>
              SHOPIFY_CLIENT_ID=from Dev Dashboard<br/>
              SHOPIFY_CLIENT_SECRET=from Dev Dashboard<br/>
              META_ACCESS_TOKEN=EAAxxxxx<br/>
              META_AD_ACCOUNT_ID=123456789<br/>
              VITE_SUPABASE_URL=https://xxx.supabase.co<br/>
              VITE_SUPABASE_ANON_KEY=eyJxxx
            </code>
            <p className="text-xs text-brand-500">
              The Vercel serverless functions read from env vars. This settings page is for reference/testing only.
            </p>
          </div>
        </div>
      </div>

      {/* Shopify */}
      <SettingSection
        title="Shopify"
        description="Connect to your Shopify store via OAuth for order data"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg bg-brand-950/50 border border-brand-800/20">
            <div>
              <p className="text-sm font-medium text-accent">Shopify Connection</p>
              <p className="text-xs text-brand-400 mt-1">
                Click to authorize the app to read your Shopify orders
              </p>
            </div>
            <a
              href="/api/shopify/auth"
              className="btn-primary inline-flex items-center gap-2 no-underline"
            >
              <ExternalLink size={14} />
              Connect Shopify
            </a>
          </div>
          <p className="text-xs text-brand-500">
            Store name and Client ID/Secret are set as environment variables in Vercel.
            The OAuth token is stored securely in Supabase after you connect.
          </p>
        </div>
      </SettingSection>

      {/* Meta */}
      <SettingSection
        title="Meta Marketing API"
        description="Connect to Meta for ad spend data"
      >
        <div className="space-y-4">
          <SecretInput
            label="Access Token"
            value={form.meta_token}
            onChange={update('meta_token')}
            placeholder="EAAxxxxxxxxx"
            help="Generate a long-lived token from Meta Business Settings"
          />
          <div>
            <label className="text-xs text-brand-400 uppercase tracking-wider mb-1.5 block">Ad Account ID</label>
            <input
              className="input-field"
              placeholder="123456789 (without act_ prefix)"
              value={form.meta_ad_account}
              onChange={e => update('meta_ad_account')(e.target.value)}
            />
          </div>
        </div>
        <a
          href="https://business.facebook.com/settings"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-brand-500 hover:text-accent mt-3 transition-colors"
        >
          Open Meta Business Settings <ExternalLink size={10} />
        </a>
      </SettingSection>

      {/* Save */}
      <div className="flex items-center gap-4">
        <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
          <Save size={14} />
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-cash-green fade-in">
            <CheckCircle size={14} /> Saved
          </span>
        )}
        {error && (
          <span className="flex items-center gap-1 text-sm text-cash-red fade-in">
            <AlertCircle size={14} /> {error}
          </span>
        )}
      </div>
    </div>
  )
}
