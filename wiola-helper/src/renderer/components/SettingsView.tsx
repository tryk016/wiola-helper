import { useEffect, useState } from 'react';

interface Props {
  onClose: () => void;
}

interface EnvData {
  QBO_ENV?: string;
  // Legacy single pair (still read as fallback for older installs)
  QBO_CLIENT_ID?: string;
  QBO_CLIENT_SECRET?: string;
  // Per-environment pairs — what we use now. Sandbox and Production are
  // two different apps in Intuit Developer with their own credentials.
  QBO_CLIENT_ID_SANDBOX?: string;
  QBO_CLIENT_SECRET_SANDBOX?: string;
  QBO_CLIENT_ID_PRODUCTION?: string;
  QBO_CLIENT_SECRET_PRODUCTION?: string;
  QBO_EWIPRO_REALM_ID?: string;
  QBO_EWISTORE_REALM_ID?: string;
  QBO_EWIPRO_REFRESH_TOKEN?: string;
  QBO_EWISTORE_REFRESH_TOKEN?: string;
  GITHUB_TOKEN?: string;
  // Anthropic + MySQL — konfigurowane przez administratora bezpośrednio w .env
}

interface Prefs {
  defaultMode?: 'dry-run' | 'post';
  autoArchiveSeconds?: number;
  showLineDetails?: boolean;
  delayMinMinutes?: number;
  delayMaxMinutes?: number;
}

export function SettingsView({ onClose }: Props) {
  const [env, setEnv] = useState<EnvData>({});
  const [prefs, setPrefs] = useState<Prefs>({});
  const [dirty, setDirty] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  useEffect(() => {
    window.wiola.getEnv().then(setEnv as (e: Record<string, string>) => void);
    window.wiola.getPrefs().then(setPrefs as (p: Record<string, unknown>) => void);
  }, []);

  const setField = (key: string, value: string) => {
    setDirty(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (Object.keys(dirty).length === 0) return;
    setSaving(true);
    try {
      const updated = await window.wiola.setEnv(dirty);
      setEnv(updated as EnvData);
      setDirty({});
      setSavedMsg('✓ Zapisane — wymagany restart aplikacji aby zmiany weszły w życie');
      setTimeout(() => setSavedMsg(''), 5000);
    } finally {
      setSaving(false);
    }
  };

  const handlePrefChange = async (patch: Prefs) => {
    const updated = await window.wiola.setPrefs(patch as Record<string, unknown>);
    setPrefs(updated as Prefs);
  };

  const isProduction = env.QBO_ENV === 'production';

  return (
    <div className="fixed inset-0 z-40 bg-slate-900 flex flex-col">
      <header className="px-6 py-3 border-b border-slate-700 bg-slate-950 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-2xl">⚙️</div>
          <div>
            <h2 className="text-base font-semibold">Ustawienia</h2>
            <p className="text-xs text-slate-400">C:\kreisel\system\.env + preferencje aplikacji</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {Object.keys(dirty).length > 0 && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-1.5 rounded-md text-sm bg-ewi-green hover:bg-ewi-green-700 text-white transition-colors disabled:opacity-50"
            >
              {saving ? 'Zapisuję...' : `Zapisz (${Object.keys(dirty).length})`}
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-md text-sm bg-slate-800 hover:bg-slate-700 text-slate-200"
          >
            Zamknij ✕
          </button>
        </div>
      </header>

      {savedMsg && (
        <div className="px-6 py-2 bg-emerald-950/50 text-emerald-300 text-sm">{savedMsg}</div>
      )}

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* QBO Environment */}
        <Section title="🟢 QBO środowisko" subtitle="Sandbox = testowe konto, Production = prawdziwe księgi">
          <div className={`p-4 rounded-lg border ${isProduction ? 'bg-red-950/30 border-red-900/50' : 'bg-blue-950/30 border-blue-900/50'}`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">
                  Tryb: {isProduction ? '⚠️ PRODUKCJA' : '🧪 Sandbox (testowy)'}
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {isProduction
                    ? 'Wystawione dokumenty trafią do PRAWDZIWEJ księgowości EWI Pro i EWI Store.'
                    : 'Wystawiane dokumenty trafiają tylko do sandbox, nic realnego.'}
                </p>
              </div>
              <button
                onClick={() => setField('QBO_ENV', isProduction ? 'sandbox' : 'production')}
                className="px-4 py-2 rounded-md text-xs bg-slate-800 hover:bg-slate-700 transition-colors"
              >
                Przełącz na {isProduction ? 'sandbox' : 'production'}
              </button>
            </div>
          </div>
        </Section>

        {/* QBO Credentials — Sandbox + Production are two separate apps */}
        <Section
          title="🔑 QBO Credentials (Intuit Developer)"
          subtitle="Sandbox i Production to dwie osobne aplikacje w Intuit — mają swoje klucze. Aplikacja wybiera zestaw automatycznie wg QBO Environment powyżej."
        >
          <div className="space-y-3">
            <div className="rounded-lg border border-amber-900/50 bg-amber-950/20 p-3 space-y-2">
              <div className="text-xs uppercase tracking-wide text-amber-300 font-semibold">🧪 Sandbox (testowe)</div>
              <Field
                label="Sandbox Client ID"
                value={dirty.QBO_CLIENT_ID_SANDBOX ?? env.QBO_CLIENT_ID_SANDBOX ?? (env.QBO_ENV !== 'production' ? env.QBO_CLIENT_ID : '')}
                onChange={v => setField('QBO_CLIENT_ID_SANDBOX', v)}
                mono
              />
              <Field
                label="Sandbox Client Secret"
                value={dirty.QBO_CLIENT_SECRET_SANDBOX ?? env.QBO_CLIENT_SECRET_SANDBOX ?? (env.QBO_ENV !== 'production' ? env.QBO_CLIENT_SECRET : '')}
                onChange={v => setField('QBO_CLIENT_SECRET_SANDBOX', v)}
                mono secret
              />
            </div>
            <div className="rounded-lg border border-emerald-900/50 bg-emerald-950/20 p-3 space-y-2">
              <div className="text-xs uppercase tracking-wide text-emerald-300 font-semibold">🚀 Production (realne)</div>
              <Field
                label="Production Client ID"
                value={dirty.QBO_CLIENT_ID_PRODUCTION ?? env.QBO_CLIENT_ID_PRODUCTION ?? (env.QBO_ENV === 'production' ? env.QBO_CLIENT_ID : '')}
                onChange={v => setField('QBO_CLIENT_ID_PRODUCTION', v)}
                mono
              />
              <Field
                label="Production Client Secret"
                value={dirty.QBO_CLIENT_SECRET_PRODUCTION ?? env.QBO_CLIENT_SECRET_PRODUCTION ?? (env.QBO_ENV === 'production' ? env.QBO_CLIENT_SECRET : '')}
                onChange={v => setField('QBO_CLIENT_SECRET_PRODUCTION', v)}
                mono secret
              />
            </div>
          </div>
        </Section>

        {/* QBO Realms */}
        <Section title="🏢 Realm IDs (Company IDs)" subtitle="Identyfikatory firm w QBO. Znajdziesz w URL po zalogowaniu (realmId=XXX)">
          <Field label="EWI Pro Realm ID" value={dirty.QBO_EWIPRO_REALM_ID ?? env.QBO_EWIPRO_REALM_ID} onChange={v => setField('QBO_EWIPRO_REALM_ID', v)} mono />
          <Field label="EWI Store Realm ID" value={dirty.QBO_EWISTORE_REALM_ID ?? env.QBO_EWISTORE_REALM_ID} onChange={v => setField('QBO_EWISTORE_REALM_ID', v)} mono />
        </Section>

        {/* OAuth Login buttons */}
        <Section
          title="🔐 Logowanie do QBO"
          subtitle="Kliknij przycisk → otworzy się okno Intuit → zaloguj się → token zapisze się automatycznie"
        >
          <OauthRow
            role="pro"
            label="EWI Pro"
            hasToken={!!env.QBO_EWIPRO_REFRESH_TOKEN}
            realmId={env.QBO_EWIPRO_REALM_ID}
          />
          <OauthRow
            role="store"
            label="EWI Store"
            hasToken={!!env.QBO_EWISTORE_REFRESH_TOKEN}
            realmId={env.QBO_EWISTORE_REALM_ID}
          />
          <p className="text-xs text-slate-500 mt-2">
            💡 Logowanie wymaga że w „QBO Credentials" są wpisane Client ID i Secret oraz że
            w Intuit Developer apka ma <span className="font-mono">http://localhost:3000/callback</span> jako Redirect URI.
          </p>
        </Section>

        {/* Refresh Tokens (manual edit) */}
        <Section title="🎫 Refresh Tokens (ręczna edycja)" subtitle='Zwykle wypełniane automatycznie przez "Zaloguj"'>
          <Field label="EWI Pro Refresh Token" value={dirty.QBO_EWIPRO_REFRESH_TOKEN ?? env.QBO_EWIPRO_REFRESH_TOKEN} onChange={v => setField('QBO_EWIPRO_REFRESH_TOKEN', v)} mono secret />
          <Field label="EWI Store Refresh Token" value={dirty.QBO_EWISTORE_REFRESH_TOKEN ?? env.QBO_EWISTORE_REFRESH_TOKEN} onChange={v => setField('QBO_EWISTORE_REFRESH_TOKEN', v)} mono secret />
        </Section>

        {/* Sekcje Anthropic API + MySQL ukryte przed użytkownikiem końcowym.
            Te credentials konfiguruje administrator (Patryk) przez plik
            C:\kreisel\system\.env. Nie powinny być modyfikowane z aplikacji. */}

        {/* App preferences */}
        <Section title="⚙️ Preferencje aplikacji">
          <div className="space-y-3">
            <label className="flex items-center justify-between p-3 rounded-lg bg-slate-800 cursor-pointer">
              <div>
                <div className="text-sm font-medium">Tryb domyślny przy „Wyślij wszystkie"</div>
                <div className="text-xs text-slate-400">Czy automatycznie postuje do QBO, czy tylko dry-run</div>
              </div>
              <select
                value={prefs.defaultMode || 'post'}
                onChange={e => handlePrefChange({ defaultMode: e.target.value as 'dry-run' | 'post' })}
                className="px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-md text-sm"
              >
                <option value="post">🟢 Posting (realne)</option>
                <option value="dry-run">🟡 Dry-run (tylko podgląd)</option>
              </select>
            </label>

            <label className="flex items-center justify-between p-3 rounded-lg bg-slate-800 cursor-pointer">
              <div>
                <div className="text-sm font-medium">Auto-archive po (sekundach)</div>
                <div className="text-xs text-slate-400">Po jakim czasie zakończone faktury znikają z kolejki</div>
              </div>
              <input
                type="number"
                value={prefs.autoArchiveSeconds || 30}
                onChange={e => handlePrefChange({ autoArchiveSeconds: parseInt(e.target.value) || 30 })}
                className="w-20 px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-md text-sm text-center"
                min={5}
                max={3600}
              />
            </label>

            <div className="p-3 rounded-lg bg-slate-800 space-y-2">
              <div>
                <div className="text-sm font-medium">⏱ Losowe opóźnienie między fakturami</div>
                <div className="text-xs text-slate-400">
                  Aby QBO history nie wyglądało jak automat (10 faktur w 30s). 0 = wyłączone.
                  Dotyczy tylko trybu Posting (realne); dry-run zawsze pomija delay.
                </div>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-slate-400">Min</span>
                <input
                  type="number"
                  value={prefs.delayMinMinutes ?? 4}
                  onChange={e => {
                    const v = Math.max(0, parseInt(e.target.value) || 0);
                    handlePrefChange({ delayMinMinutes: v });
                  }}
                  className="w-16 px-2 py-1 bg-slate-700 border border-slate-600 rounded-md text-sm text-center"
                  min={0}
                  max={60}
                />
                <span className="text-xs text-slate-400">— Max</span>
                <input
                  type="number"
                  value={prefs.delayMaxMinutes ?? 10}
                  onChange={e => {
                    const v = Math.max(0, parseInt(e.target.value) || 0);
                    handlePrefChange({ delayMaxMinutes: v });
                  }}
                  className="w-16 px-2 py-1 bg-slate-700 border border-slate-600 rounded-md text-sm text-center"
                  min={0}
                  max={60}
                />
                <span className="text-xs text-slate-400">minut</span>
              </div>
            </div>
          </div>
        </Section>

        {/* GitHub token — the repo is private, updates need it */}
        <Section title="🔑 Token GitHub" subtitle="Potrzebny do aktualizacji (repozytorium jest prywatne). Nowy token dostaniesz od Patryka.">
          <Field label="GITHUB_TOKEN" value={dirty.GITHUB_TOKEN ?? env.GITHUB_TOKEN} onChange={v => setField('GITHUB_TOKEN', v)} mono secret />
        </Section>

        {/* Aktualizacje */}
        <UpdateSection />

        {/* Support / kontakt */}
        <Section title="🆘 Pomoc i wsparcie" subtitle="Skontaktuj się z administratorem aplikacji">
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-slate-800 text-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-300">E-mail wsparcia:</span>
                <a
                  href="mailto:patrick.baran@ewistore.co.uk?subject=Wiola%20Helper%20-%20Wsparcie"
                  className="text-blue-400 hover:text-blue-300 underline font-mono"
                >
                  patrick.baran@ewistore.co.uk
                </a>
              </div>
              <div className="text-xs text-slate-400">
                Przy zgłaszaniu błędu dołącz log aplikacji (przycisk poniżej) — zawiera on identyfikator
                <code className="px-1 bg-slate-700 rounded mx-1">intuit_tid</code>
                wymagany przez support Intuit do diagnostyki problemów z QuickBooks Online.
              </div>
            </div>
            <button
              onClick={() => window.wiola.openLogFolder?.()}
              className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-md text-sm transition"
            >
              📁 Otwórz folder z logami
            </button>
          </div>
        </Section>
      </div>
    </div>
  );
}

function UpdateSection() {
  const [localSha, setLocalSha] = useState<string | undefined>(undefined);
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<{
    hasUpdate: boolean;
    remoteSha?: string;
    remoteMessage?: string;
    remoteDate?: string;
    error?: string;
  } | null>(null);

  useEffect(() => {
    window.wiola.getLocalVersion().then((sha: string | undefined) => setLocalSha(sha));
  }, []);

  const handleCheck = async () => {
    setChecking(true);
    setResult(null);
    try {
      const r = await window.wiola.checkForUpdate();
      setResult(r);
      if (r.localSha) setLocalSha(r.localSha);
    } finally {
      setChecking(false);
    }
  };

  const handleApply = async () => {
    if (!confirm('Aplikacja zamknie się i sama uruchomi z nową wersją za ~2 minuty. Kontynuować?')) return;
    setApplying(true);
    try {
      await window.wiola.applyUpdate();
      // Wiola Helper will quit ~1.5s after this resolves — no further UI needed.
    } catch (e) {
      setApplying(false);
      setResult({ hasUpdate: true, error: (e as Error).message });
    }
  };

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-200">🔄 Aktualizacje</h3>
        <p className="text-xs text-slate-400 mt-0.5">Pobierz najnowszą wersję z GitHub</p>
      </div>
      <div className="space-y-3">
        <div className="p-3 rounded-lg bg-slate-800 text-sm space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Twoja wersja:</span>
            <span className="font-mono text-slate-300">{localSha ? localSha.substring(0, 8) : '— (przed pierwszą aktualizacją)'}</span>
          </div>
          {result?.remoteSha && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Wersja na GitHub:</span>
              <span className="font-mono text-slate-300">{result.remoteSha.substring(0, 8)}</span>
            </div>
          )}
          {result?.remoteMessage && (
            <div className="text-xs text-slate-400 pt-1 border-t border-slate-700">
              <span className="font-medium text-slate-300">Najnowsza zmiana:</span> {result.remoteMessage}
            </div>
          )}
        </div>

        {result?.error && (
          <div className="p-3 rounded-lg bg-red-950/40 border border-red-900/50 text-sm text-red-300">
            ⚠ {result.error}
          </div>
        )}

        {result && !result.error && !result.hasUpdate && (
          <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-900/50 text-sm text-emerald-300">
            ✓ Masz najnowszą wersję
          </div>
        )}

        {result?.hasUpdate && !result.error && (
          <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-900/50 text-sm space-y-2">
            <div className="text-amber-200 font-medium">📦 Dostępna nowa wersja!</div>
            <button
              onClick={handleApply}
              disabled={applying}
              className={`w-full px-4 py-2 rounded-md text-sm font-medium transition ${
                applying ? 'bg-slate-700 text-slate-400 cursor-wait' : 'bg-amber-600 hover:bg-amber-500 text-white'
              }`}
            >
              {applying ? 'Uruchamianie aktualizatora…' : '⬇ Aktualizuj teraz'}
            </button>
            <div className="text-xs text-amber-300/80">
              Aplikacja zamknie się i sama uruchomi się ponownie z nową wersją za ~2 minuty. Bez czarnego okna konsoli.
            </div>
          </div>
        )}

        <button
          onClick={handleCheck}
          disabled={checking || applying}
          className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-500 rounded-md text-sm transition"
        >
          {checking ? 'Sprawdzanie…' : '🔍 Sprawdź aktualizacje'}
        </button>
      </div>
    </section>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function OauthRow({ role, label, hasToken, realmId }: { role: 'pro' | 'store'; label: string; hasToken: boolean; realmId?: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string; warning?: string } | null>(null);

  const handleLogin = async () => {
    setLoading(true);
    setResult(null);
    try {
      const r = await window.wiola.qboLogin(role);
      if (r.ok) {
        setResult({
          ok: true,
          msg: `✅ Zalogowano. Token: ${r.refresh_token_preview}${r.realmId ? ` | Realm: ${r.realmId}` : ''}`,
          warning: r.warning,
        });
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setResult({ ok: false, msg: r.error || 'Nieznany błąd' });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-3 rounded-lg bg-slate-800 border border-slate-700">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-sm font-medium flex items-center gap-2">
            {label}
            {hasToken ? (
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-950/50 text-emerald-300 border border-emerald-900/50">
                ✓ Połączony
              </span>
            ) : (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-950/50 text-red-300 border border-red-900/50">
                ✗ Nie połączony
              </span>
            )}
          </div>
          {realmId && (
            <div className="text-xs text-slate-400 mt-0.5 font-mono">Realm: {realmId}</div>
          )}
        </div>
        <button
          onClick={handleLogin}
          disabled={loading}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
            loading
              ? 'bg-slate-700 text-slate-400 cursor-wait'
              : 'bg-ewi-blue hover:bg-ewi-blue-700 text-white'
          }`}
        >
          {loading ? '⏳ Łączę...' : hasToken ? '🔄 Zaloguj ponownie' : '🔐 Zaloguj'}
        </button>
      </div>
      {result && (
        <div className={`text-xs mt-2 p-2 rounded ${
          result.ok ? 'bg-emerald-950/30 text-emerald-300 border border-emerald-900/50' : 'bg-red-950/30 text-red-300 border border-red-900/50'
        }`}>
          <div className="whitespace-pre-wrap">{result.msg}</div>
          {result.warning && (
            <div className="mt-1 text-amber-300 whitespace-pre-wrap">⚠️ {result.warning}</div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, mono, secret }: {
  label: string;
  value?: string;
  onChange: (v: string) => void;
  mono?: boolean;
  secret?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="text-xs text-slate-400 block mb-1">{label}</label>
      <div className="flex gap-2">
        <input
          type={secret && !show ? 'password' : 'text'}
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          placeholder={secret ? '••••••••' : 'wpisz wartość...'}
          className={`flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm focus:border-ewi-blue focus:outline-none ${mono ? 'font-mono' : ''}`}
        />
        {secret && (
          <button
            onClick={() => setShow(!show)}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs"
          >
            {show ? '🙈' : '👁'}
          </button>
        )}
      </div>
    </div>
  );
}
