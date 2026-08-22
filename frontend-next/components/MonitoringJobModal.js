'use client';

// Ported from frontend/src/components/MonitoringJobModal.js — no router
// dependencies at all, only the api.js -> apiClient.js import path changes.
import { useEffect, useMemo, useState } from 'react';
import { createMonitoringJob, previewMonitoringSchedule, updateMonitoringJob } from '../lib/apiClient';
import WcagStandardSelect, { WCAG_STANDARD_OPTIONS } from './WcagStandardSelect';

const STYLES = `
.mjm-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); z-index: 60; display: flex; align-items: center; justify-content: center; padding: 16px; }
.mjm-card { background: var(--surface); border-radius: 24px; max-width: 640px; width: 100%; max-height: 90vh; overflow-y: auto; box-shadow: 0 32px 80px rgba(0,0,0,0.3); color: var(--ink); }
.mjm-close-bar { position: sticky; top: 0; background: var(--surface); border-radius: 24px 24px 0 0; border-bottom: 1px solid var(--sandd); padding: 16px 24px; display: flex; align-items: center; justify-content: space-between; z-index: 10; }
.mjm-title { font-size: 18px; font-weight: 700; margin: 0; }
.mjm-close-btn { width: 36px; height: 36px; background: var(--sandd); border-radius: 50%; display: flex; align-items: center; justify-content: center; border: none; cursor: pointer; color: var(--ink6); flex-shrink: 0; }
.mjm-close-btn:hover { background: var(--t1); }
.mjm-steps { display: flex; gap: 6px; padding: 0 24px; margin-top: 14px; }
.mjm-step-dot { flex: 1; height: 4px; border-radius: 2px; background: var(--sandd); }
.mjm-step-dot.active { background: var(--t4); }
.mjm-body { padding: 24px; display: flex; flex-direction: column; gap: 18px; }
.mjm-label { font-size: 16px; font-weight: 700; color: var(--ink); margin-bottom: 6px; display: block; }
.mjm-hint { font-size: 16px; color: var(--ink3); margin-top: 4px; }
.mjm-input { width: 100%; padding: 10px 14px; border-radius: 10px; border: 1px solid var(--sandd); background: var(--bg); color: var(--ink); font-size: 16px; outline: none; box-sizing: border-box; }
.mjm-input:focus { border-color: var(--t4); }
.mjm-error { font-size: 16px; color: var(--coral); margin-top: -6px; }
.mjm-card-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.mjm-opt-card { border: 2px solid var(--sandd); border-radius: 12px; padding: 14px; cursor: pointer; background: var(--bg); text-align: left; transition: border-color .15s, background .15s; }
.mjm-opt-card:hover { border-color: var(--t1); }
.mjm-opt-card.selected { border-color: var(--t4); background: var(--t05, var(--t1)); }
.mjm-opt-card:disabled { opacity: 0.45; cursor: not-allowed; }
.mjm-opt-name { font-size: 16px; font-weight: 700; margin: 0 0 2px 0; }
.mjm-opt-desc { font-size: 16px; color: var(--ink3); margin: 0; }
.mjm-check-row { display: flex; flex-wrap: wrap; gap: 10px; }
.mjm-check-pill { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 9999px; border: 1px solid var(--sandd); background: var(--bg); cursor: pointer; font-size: 16px; }
.mjm-check-pill.selected { border-color: var(--t4); background: var(--t1); color: var(--t9); font-weight: 700; }
.mjm-chip-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.mjm-chip { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 9999px; background: var(--t1); color: var(--t9); font-size: 16px; font-weight: 600; }
.mjm-chip-x { border: none; background: none; cursor: pointer; color: var(--t9); font-size: 16px; line-height: 1; padding: 0; }
.mjm-toggle-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border: 1px solid var(--sandd); border-radius: 10px; background: var(--bg); }
.mjm-toggle-label { font-size: 16px; font-weight: 600; }
.mjm-switch { position: relative; width: 40px; height: 22px; border-radius: 9999px; background: var(--sandd); border: none; cursor: pointer; flex-shrink: 0; transition: background .15s; }
.mjm-switch.on { background: var(--t4); }
.mjm-switch-knob { position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: left .15s; }
.mjm-switch.on .mjm-switch-knob { left: 20px; }
.mjm-review-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--sandd); font-size: 16px; }
.mjm-review-k { color: var(--ink3); }
.mjm-review-v { font-weight: 700; text-align: right; }
.mjm-footer { display: flex; justify-content: space-between; align-items: center; padding: 18px 24px; border-top: 1px solid var(--sandd); position: sticky; bottom: 0; background: var(--surface); border-radius: 0 0 24px 24px; }
.mjm-preview-box { padding: 10px 14px; border-radius: 10px; background: var(--t05, var(--t1)); color: var(--t9); font-size: 16px; font-weight: 600; }
`;

const SCHEDULE_CARDS = [
  { key: 'weekly', name: 'Weekly', desc: 'Every Monday 08:00 UTC' },
  { key: 'biweekly', name: 'Bi-Weekly', desc: '1st & 15th, 08:00 UTC' },
  { key: 'monthly', name: 'Monthly', desc: '1st of the month' },
  { key: 'trimonthly', name: 'Tri-Monthly', desc: 'Every 3 months' },
  { key: 'quarterly', name: 'Quarterly', desc: 'Every 4 months' },
  { key: 'custom', name: 'Custom', desc: 'Your own cron expression' },
];

const DEVICE_OPTIONS = ['desktop', 'tablet', 'mobile'];

function isValidDomain(value) {
  if (!value || !value.trim()) return false;
  try {
    const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    // eslint-disable-next-line no-new
    new URL(candidate);
    return true;
  } catch {
    return false;
  }
}

function defaultForm(job) {
  return {
    domain: job?.domain || '',
    schedule: job?.schedule || 'weekly',
    customCronExpression: job?.customCronExpression || '',
    scanType: job?.scanType || 'quick',
    wcagStandard: job?.wcagStandard || 'combined',
    conformanceLevel: job?.conformanceLevel || 'AA',
    devicesEnabled: job?.devicesEnabled?.length ? job.devicesEnabled : ['desktop'],
    maxPages: job?.maxPages ?? 25,
    alertThreshold: job?.alertThreshold ?? '',
    alertEmails: job?.alertEmails || [],
    notifyOnComplete: job?.notifyOnComplete !== false,
    notifyOnNewIssues: job?.notifyOnNewIssues !== false,
  };
}

const MonitoringJobModal = ({ isOpen, onClose, onSaved, job, planLimits }) => {
  const isEdit = Boolean(job);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(() => defaultForm(job));
  const [emailDraft, setEmailDraft] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [schedulePreview, setSchedulePreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setForm(defaultForm(job));
      setStep(1);
      setError('');
      setEmailDraft('');
      setSchedulePreview(null);
    }
  }, [isOpen, job]);

  useEffect(() => {
    let cancelled = false;
    if (!isOpen || form.schedule !== 'custom' || !form.customCronExpression.trim()) {
      setSchedulePreview(null);
      return;
    }
    setPreviewLoading(true);
    previewMonitoringSchedule({ schedule: 'custom', customCronExpression: form.customCronExpression })
      .then((res) => {
        if (cancelled) return;
        if (res?.error) setSchedulePreview({ error: res.error });
        else setSchedulePreview({ nextRunAt: res.nextRunAt, preview: res.preview });
      })
      .finally(() => { if (!cancelled) setPreviewLoading(false); });
    return () => { cancelled = true; };
  }, [form.schedule, form.customCronExpression, isOpen]);

  const allowedScanTypes = planLimits?.allowedScanTypes?.length ? planLimits.allowedScanTypes : ['quick', 'full'];

  const scheduleLabel = useMemo(
    () => SCHEDULE_CARDS.find((s) => s.key === form.schedule)?.name || form.schedule,
    [form.schedule]
  );

  if (!isOpen) return null;

  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const toggleDevice = (device) => {
    set({
      devicesEnabled: form.devicesEnabled.includes(device)
        ? form.devicesEnabled.filter((d) => d !== device)
        : [...form.devicesEnabled, device],
    });
  };

  const addEmail = () => {
    const value = emailDraft.trim();
    if (!value || !value.includes('@') || form.alertEmails.includes(value)) return;
    set({ alertEmails: [...form.alertEmails, value] });
    setEmailDraft('');
  };

  const removeEmail = (email) => set({ alertEmails: form.alertEmails.filter((e) => e !== email) });

  const validateStep = (currentStep) => {
    if (currentStep === 1 && !isValidDomain(form.domain)) return 'Enter a valid domain or URL.';
    if (currentStep === 2 && form.schedule === 'custom' && !form.customCronExpression.trim()) return 'Enter a cron expression.';
    if (currentStep === 3 && form.devicesEnabled.length === 0) return 'Select at least one device.';
    return '';
  };

  const goNext = () => {
    const err = validateStep(step);
    if (err) { setError(err); return; }
    setError('');
    setStep((s) => Math.min(5, s + 1));
  };

  const goBack = () => { setError(''); setStep((s) => Math.max(1, s - 1)); };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    const payload = {
      domain: form.domain.trim(),
      schedule: form.schedule,
      customCronExpression: form.schedule === 'custom' ? form.customCronExpression.trim() : undefined,
      scanType: form.scanType,
      wcagStandard: form.wcagStandard,
      conformanceLevel: form.conformanceLevel,
      devicesEnabled: form.devicesEnabled,
      maxPages: Number(form.maxPages) || 25,
      alertThreshold: form.alertThreshold === '' ? undefined : Number(form.alertThreshold),
      alertEmails: form.alertEmails,
      notifyOnComplete: form.notifyOnComplete,
      notifyOnNewIssues: form.notifyOnNewIssues,
    };

    const res = isEdit ? await updateMonitoringJob(job._id, payload) : await createMonitoringJob(payload);
    setSaving(false);
    if (res?.error) { setError(res.error); return; }
    onSaved?.(res.item);
  };

  return (
    <>
      <style>{STYLES}</style>
      <div className="mjm-overlay" onClick={onClose}>
        <div className="mjm-card" onClick={(e) => e.stopPropagation()}>
          <div className="mjm-close-bar">
            <h2 className="mjm-title">{isEdit ? 'Edit Monitor' : 'Set Up a Monitor'}</h2>
            <button className="mjm-close-btn" onClick={onClose} aria-label="Close">✕</button>
          </div>
          <div className="mjm-steps">
            {[1, 2, 3, 4, 5].map((n) => (
              <div key={n} className={`mjm-step-dot ${step >= n ? 'active' : ''}`} />
            ))}
          </div>

          <div className="mjm-body">
            {error && <div className="mjm-error">{error}</div>}

            {step === 1 && (
              <div>
                <label className="mjm-label">Domain to monitor</label>
                <input
                  className="mjm-input"
                  placeholder="example.com"
                  value={form.domain}
                  onChange={(e) => set({ domain: e.target.value })}
                />
                <p className="mjm-hint">We&apos;ll run a scheduled scan against this domain and track its Silver Score™ over time.</p>
              </div>
            )}

            {step === 2 && (
              <div>
                <label className="mjm-label">How often should we scan?</label>
                <div className="mjm-card-grid">
                  {SCHEDULE_CARDS.map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      className={`mjm-opt-card ${form.schedule === s.key ? 'selected' : ''}`}
                      onClick={() => set({ schedule: s.key })}
                    >
                      <p className="mjm-opt-name">{s.name}</p>
                      <p className="mjm-opt-desc">{s.desc}</p>
                    </button>
                  ))}
                </div>
                {form.schedule === 'custom' && (
                  <div style={{ marginTop: 14 }}>
                    <label className="mjm-label">Cron expression</label>
                    <input
                      className="mjm-input"
                      placeholder="0 8 * * 1"
                      value={form.customCronExpression}
                      onChange={(e) => set({ customCronExpression: e.target.value })}
                    />
                    {previewLoading && <p className="mjm-hint">Checking expression…</p>}
                    {schedulePreview?.error && <div className="mjm-error">{schedulePreview.error}</div>}
                    {schedulePreview?.preview && (
                      <div className="mjm-preview-box" style={{ marginTop: 8 }}>{schedulePreview.preview}</div>
                    )}
                  </div>
                )}
              </div>
            )}

            {step === 3 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label className="mjm-label">Scan type</label>
                  <div className="mjm-card-grid">
                    {['quick', 'full'].map((t) => (
                      <button
                        key={t}
                        type="button"
                        disabled={!allowedScanTypes.includes(t)}
                        className={`mjm-opt-card ${form.scanType === t ? 'selected' : ''}`}
                        onClick={() => set({ scanType: t })}
                      >
                        <p className="mjm-opt-name">{t === 'quick' ? 'Quick Scan' : 'Full Audit'}</p>
                        <p className="mjm-opt-desc">{t === 'quick' ? 'Fast, single-page check' : 'Deep, multi-page audit'}</p>
                      </button>
                    ))}
                  </div>
                  {!allowedScanTypes.includes('full') && (
                    <p className="mjm-hint">Full audits require a higher plan tier.</p>
                  )}
                </div>

                <div>
                  <label className="mjm-label">Devices</label>
                  <div className="mjm-check-row">
                    {DEVICE_OPTIONS.map((d) => (
                      <button
                        key={d}
                        type="button"
                        className={`mjm-check-pill ${form.devicesEnabled.includes(d) ? 'selected' : ''}`}
                        onClick={() => toggleDevice(d)}
                      >
                        {d.charAt(0).toUpperCase() + d.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                <WcagStandardSelect
                  variant="themed"
                  label="WCAG Standard"
                  wcagStandard={form.wcagStandard}
                  conformanceLevel={form.conformanceLevel}
                  onChange={({ wcagStandard, conformanceLevel }) => set({ wcagStandard, conformanceLevel })}
                />
              </div>
            )}

            {step === 4 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label className="mjm-label">Alert threshold (optional)</label>
                  <input
                    className="mjm-input"
                    type="number"
                    min={0}
                    max={100}
                    placeholder="e.g. 70 — alert if score drops below this"
                    value={form.alertThreshold}
                    onChange={(e) => set({ alertThreshold: e.target.value })}
                  />
                  <p className="mjm-hint">Leave blank to disable score-drop alerts.</p>
                </div>

                <div>
                  <label className="mjm-label">Alert emails (optional — defaults to your account email)</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      className="mjm-input"
                      placeholder="name@company.com"
                      value={emailDraft}
                      onChange={(e) => setEmailDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEmail(); } }}
                    />
                    <button type="button" className="btn btn-o" onClick={addEmail}>Add</button>
                  </div>
                  {form.alertEmails.length > 0 && (
                    <div className="mjm-chip-row">
                      {form.alertEmails.map((email) => (
                        <span key={email} className="mjm-chip">
                          {email}
                          <button className="mjm-chip-x" onClick={() => removeEmail(email)} aria-label={`Remove ${email}`}>✕</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mjm-toggle-row">
                  <span className="mjm-toggle-label">Notify on every run</span>
                  <button className={`mjm-switch ${form.notifyOnComplete ? 'on' : ''}`} onClick={() => set({ notifyOnComplete: !form.notifyOnComplete })}>
                    <span className="mjm-switch-knob" />
                  </button>
                </div>
                <div className="mjm-toggle-row">
                  <span className="mjm-toggle-label">Notify only when new issues appear</span>
                  <button className={`mjm-switch ${form.notifyOnNewIssues ? 'on' : ''}`} onClick={() => set({ notifyOnNewIssues: !form.notifyOnNewIssues })}>
                    <span className="mjm-switch-knob" />
                  </button>
                </div>
              </div>
            )}

            {step === 5 && (
              <div>
                <label className="mjm-label">Review</label>
                <div className="mjm-review-row"><span className="mjm-review-k">Domain</span><span className="mjm-review-v">{form.domain}</span></div>
                <div className="mjm-review-row"><span className="mjm-review-k">Schedule</span><span className="mjm-review-v">{scheduleLabel}{form.schedule === 'custom' ? ` (${form.customCronExpression})` : ''}</span></div>
                <div className="mjm-review-row"><span className="mjm-review-k">Scan type</span><span className="mjm-review-v">{form.scanType === 'quick' ? 'Quick Scan' : 'Full Audit'}</span></div>
                <div className="mjm-review-row"><span className="mjm-review-k">Devices</span><span className="mjm-review-v">{form.devicesEnabled.join(', ')}</span></div>
                <div className="mjm-review-row"><span className="mjm-review-k">WCAG standard</span><span className="mjm-review-v">{WCAG_STANDARD_OPTIONS.find((w) => w.wcagStandard === form.wcagStandard && (w.wcagStandard === 'combined' || w.conformanceLevel === form.conformanceLevel))?.label || form.wcagStandard}</span></div>
                <div className="mjm-review-row"><span className="mjm-review-k">Alert threshold</span><span className="mjm-review-v">{form.alertThreshold === '' ? 'Disabled' : form.alertThreshold}</span></div>
                <div className="mjm-review-row"><span className="mjm-review-k">Alert emails</span><span className="mjm-review-v">{form.alertEmails.length ? form.alertEmails.join(', ') : 'Account email'}</span></div>
                <div className="mjm-review-row"><span className="mjm-review-k">Notifications</span><span className="mjm-review-v">{[form.notifyOnComplete && 'Every run', form.notifyOnNewIssues && 'New issues'].filter(Boolean).join(', ') || 'None'}</span></div>
              </div>
            )}
          </div>

          <div className="mjm-footer">
            <button className="btn btn-o" onClick={step === 1 ? onClose : goBack}>{step === 1 ? 'Cancel' : 'Back'}</button>
            {step < 5 ? (
              <button className="btn btn-d" onClick={goNext}>Continue</button>
            ) : (
              <button className="btn btn-d" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : (isEdit ? 'Save Changes' : 'Create Monitor')}</button>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default MonitoringJobModal;
