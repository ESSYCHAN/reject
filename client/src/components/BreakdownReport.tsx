import { useMemo, useState } from 'react';
import { ApplicationRecord } from '../types/pro';
import { generateBreakdownReport, FunnelMetric, BreakdownReport as ReportData } from '../utils/breakdownReport';
import { subscribe, sendReportFeedback } from '../utils/api';
import './BreakdownReport.css';

interface BreakdownReportProps {
  applications: ApplicationRecord[];
  /** optional name to personalise the header */
  userName?: string;
}

// Founding User program banner — beta framing, no charging. Captures the email
// (tagged founding_user) so we can build the evidence the program is for.
function FoundingBanner() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle');

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || status === 'loading') return;
    setStatus('loading');
    await subscribe(email, 'founding_user');
    setStatus('done');
  };

  return (
    <div className="br-founding br-no-print">
      <div className="br-founding-text">
        <span className="br-founding-tag">Founding User · Diagnosis Report Beta</span>
        <p>
          <s>£19</s> <strong>Free during beta</strong> · first 100 users. Join and your report
          stays free for life.
        </p>
      </div>
      {status === 'done' ? (
        <div className="br-founding-done">You're in. Thank you 💙</div>
      ) : (
        <form className="br-founding-form" onSubmit={join}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            required
            disabled={status === 'loading'}
          />
          <button className="btn btn-primary" type="submit" disabled={status === 'loading'}>
            {status === 'loading' ? 'Joining…' : 'Join free'}
          </button>
        </form>
      )}
    </div>
  );
}

// The evidence engine: does this diagnosis match experience / change behaviour?
function ReportFeedback({ report }: { report: ReportData }) {
  const [sent, setSent] = useState(false);
  const [note, setNote] = useState('');
  const [matched, setMatched] = useState<boolean | null>(null);

  const submit = async (helpful: boolean, matchedExperience?: boolean) => {
    await sendReportFeedback({
      bottleneck: report.bottleneck,
      confidence: report.confidence,
      helpful,
      matchedExperience: matchedExperience ?? matched ?? undefined,
      note: note.trim() || undefined,
    });
    setSent(true);
  };

  if (sent) {
    return (
      <div className="br-feedback br-no-print">
        <p className="br-feedback-thanks">Thank you — this is exactly what helps us sharpen the diagnosis. 💙</p>
      </div>
    );
  }

  return (
    <div className="br-feedback br-no-print">
      <h4>Did this match your experience?</h4>
      <p className="br-feedback-sub">
        Two taps. This is the whole point of the beta — we're testing whether the diagnosis is right.
      </p>
      <div className="br-feedback-row">
        <button className="br-fb-btn" onClick={() => { setMatched(true); }} aria-pressed={matched === true}>
          👍 Yes, this is my bottleneck
        </button>
        <button className="br-fb-btn" onClick={() => { setMatched(false); }} aria-pressed={matched === false}>
          👎 Not really
        </button>
      </div>
      <textarea
        className="br-feedback-note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Optional: what did we get right or wrong?"
        rows={2}
      />
      <button
        className="btn btn-primary br-feedback-submit"
        onClick={() => submit(matched !== false, matched ?? undefined)}
        disabled={matched === null && !note.trim()}
      >
        Send feedback
      </button>
    </div>
  );
}

// A funnel bar. Colour reflects whether this metric is a problem:
// for "higher is better" metrics a low value is bad, and vice versa.
function FunnelBar({ metric }: { metric: FunnelMetric }) {
  const concerning = metric.higherIsBetter ? metric.value < 30 : metric.value >= 40;
  const tone = metric.sample < 3 ? 'thin' : concerning ? 'bad' : 'ok';

  return (
    <div className="br-funnel-row">
      <div className="br-funnel-label">{metric.label}</div>
      <div className="br-funnel-track">
        <div className={`br-funnel-fill tone-${tone}`} style={{ width: `${Math.min(metric.value, 100)}%` }} />
      </div>
      <div className="br-funnel-value">
        {metric.value}%
        {metric.sample < 3 && <span className="br-funnel-thin"> (low data)</span>}
      </div>
    </div>
  );
}

export function BreakdownReport({ applications, userName }: BreakdownReportProps) {
  const report = useMemo(() => generateBreakdownReport(applications), [applications]);

  const handleDownload = () => window.print();

  return (
    <div className="br-root">
      {/* Action bar — hidden when printing */}
      <div className="br-actions br-no-print">
        <div className="br-actions-text">
          <strong>Job Search Breakdown Report</strong>
          <span>{report.generatedFor}</span>
        </div>
        <button className="btn btn-primary" onClick={handleDownload}>
          Download PDF
        </button>
      </div>

      <FoundingBanner />

      {/* The printable artifact */}
      <article className="br-page">
        <header className="br-header">
          <div className="br-brand">REJECT</div>
          <h1 className="br-title">Job Search Breakdown</h1>
          <p className="br-subtitle">
            {userName ? `${userName} — ` : ''}{report.generatedFor}
          </p>
        </header>

        {/* THE DIAGNOSIS — one leak, one focus, one stop. The whole product in one block. */}
        <section className={`br-diagnosis conf-${report.confidence}`}>
          <span className="br-diagnosis-label">{report.headlineLabel}</span>
          <h2 className="br-leak-name">{report.diagnosis.leakName}</h2>
          <p className="br-leak-oneliner">{report.diagnosis.oneLiner}</p>

          <div className="br-rx">
            <div className="br-rx-row br-rx-focus">
              <span className="br-rx-verb">FOCUS ON</span>
              <span className="br-rx-text">{report.diagnosis.focus}</span>
            </div>

            {report.diagnosisMode !== 'none' && report.diagnosis.stopActivity && (
              <div className="br-rx-row br-rx-stop">
                <span className="br-rx-verb">{report.diagnosisMode === 'stop' ? 'STOP DOING' : 'PAUSE'}</span>
                <span className="br-rx-text">
                  {report.diagnosis.stopActivity}
                  {report.diagnosisMode === 'pause' ? ' — until more application data is in.' : ' for now.'}
                </span>
              </div>
            )}
          </div>

          <p className="br-why-now">{report.diagnosis.whyNow}</p>
          <p className="br-confidence-note">{report.confidenceNote}</p>
        </section>

        {/* What to do this week — the screenshot-able summary */}
        <section className="br-section br-week">
          <h3 className="br-section-title">What to do this week</h3>
          <ul className="br-week-list">
            <li className="br-week-do">
              <span className="br-week-mark">✓</span>
              <span>Focus on {report.diagnosis.focus.split('—')[0].trim().toLowerCase()}</span>
            </li>
            {report.diagnosisMode !== 'none' && report.diagnosis.stopActivity ? (
              <li className="br-week-stop">
                <span className="br-week-mark">✗</span>
                <span>
                  {report.diagnosisMode === 'stop' ? 'Stop' : 'Pause'} {report.diagnosis.stopActivity.toLowerCase()}
                </span>
              </li>
            ) : (
              <li className="br-week-note">
                <span className="br-week-mark">•</span>
                <span>Not enough data yet to recommend stopping anything — keep tracking.</span>
              </li>
            )}
          </ul>
        </section>

        {/* Waste Meter — the share-bait. Only shown when we're confident enough to call waste. */}
        {report.diagnosisMode !== 'none' && (
          <section className="br-section br-waste">
            <h3 className="br-section-title">Current waste</h3>
            <div className="br-waste-card">
              <div className="br-waste-head">
                <span className="br-waste-activity">{report.diagnosis.wasteActivity}</span>
                <span className="br-waste-impact">Impact: LOW</span>
              </div>
              <p className="br-waste-reason">{report.diagnosis.wasteReason}</p>
              <div className="br-waste-saved">
                Estimated time reclaimed: <strong>{report.diagnosis.hoursSaved}</strong>
              </div>
            </div>
          </section>
        )}

        {/* Funnel */}
        <section className="br-section">
          <h3 className="br-section-title">Where your applications go</h3>
          <div className="br-funnel">
            {report.funnel.map((m) => (
              <FunnelBar key={m.label} metric={m} />
            ))}
          </div>
          <p className="br-funnel-caption">
            Rates are calculated only from applications that reached each stage, so small samples are flagged.
          </p>
        </section>

        {/* 7-day action plan */}
        <section className="br-section">
          <h3 className="br-section-title">Your 7-day action plan</h3>
          <ol className="br-plan">
            {report.actionPlan.map((item) => (
              <li key={item.day} className="br-plan-item">
                <span className="br-plan-day">Day {item.day}</span>
                <div className="br-plan-body">
                  <strong className="br-plan-title">{item.title}</strong>
                  <p className="br-plan-detail">{item.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <footer className="br-footer">
          Generated by REJECT · reject.app — track applications, decode rejections, find where your search breaks.
        </footer>
      </article>

      <ReportFeedback report={report} />
    </div>
  );
}
