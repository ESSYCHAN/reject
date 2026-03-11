import { useState } from 'react';
import {
  BiasAuditResponse,
  BiasSignal,
  SIGNAL_TYPE_LABELS,
  RISK_LEVEL_LABELS,
  // RISK_LEVEL_COLORS,
  BiasRiskLevel
} from '../types/bias';
import './BiasAnalysisCard.css';

interface BiasAnalysisCardProps {
  result: BiasAuditResponse;
  onClose?: () => void;
}

function getRiskClass(risk: BiasRiskLevel): string {
  switch (risk) {
    case 'high': return 'risk-high';
    case 'moderate': return 'risk-moderate';
    case 'low': return 'risk-low';
    default: return 'risk-insufficient';
  }
}

function ConfidenceBar({ confidence }: { confidence: number }) {
  const percentage = Math.round(confidence * 100);
  return (
    <div className="confidence-bar">
      <div
        className="confidence-fill"
        style={{ width: `${percentage}%` }}
      />
      <span className="confidence-label">{percentage}%</span>
    </div>
  );
}

function SignalCard({ signal }: { signal: BiasSignal }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="signal-card" onClick={() => setExpanded(!expanded)}>
      <div className="signal-header">
        <span className="signal-type">{SIGNAL_TYPE_LABELS[signal.signal_type]}</span>
        <ConfidenceBar confidence={signal.confidence} />
      </div>
      <div className="signal-phrase">"{signal.indicator_phrase}"</div>
      {expanded && (
        <div className="signal-details">
          <p className="signal-explanation">{signal.explanation}</p>
          {signal.uk_equality_act_category && (
            <span className="equality-act-badge">
              Equality Act: {signal.uk_equality_act_category}
            </span>
          )}
        </div>
      )}
      <span className="expand-hint">{expanded ? 'Click to collapse' : 'Click to expand'}</span>
    </div>
  );
}

export function BiasAnalysisCard({ result, onClose }: BiasAnalysisCardProps) {
  const [showDisclaimer, setShowDisclaimer] = useState(false);

  const hasSignals = result.signals.length > 0 && result.signals[0].signal_type !== 'none_detected';

  return (
    <div className="bias-analysis-card">
      <div className="bias-card-header">
        <h3>Bias Analysis (Beta)</h3>
        {onClose && (
          <button className="close-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        )}
      </div>

      {/* Risk Level Badge */}
      <div className={`risk-badge ${getRiskClass(result.overall_risk)}`}>
        <span className="risk-level">{RISK_LEVEL_LABELS[result.overall_risk]}</span>
        <span className="risk-confidence">
          {Math.round(result.confidence * 100)}% confidence
        </span>
      </div>

      {/* Summary */}
      <div className="bias-summary">
        <p>{result.summary}</p>
      </div>

      {/* Signals */}
      {hasSignals && (
        <div className="bias-signals-section">
          <h4>Detected Signals ({result.signals.length})</h4>
          <div className="signals-list">
            {result.signals.map((signal, index) => (
              <SignalCard key={index} signal={signal} />
            ))}
          </div>
        </div>
      )}

      {/* UK Equality Act Relevance */}
      {result.equality_act_relevance?.potentially_relevant && (
        <div className="equality-act-section">
          <h4>UK Equality Act 2010 Relevance</h4>
          <div className="protected-characteristics">
            <strong>Potentially relevant characteristics:</strong>
            <ul>
              {result.equality_act_relevance.protected_characteristics.map((char, i) => (
                <li key={i}>{char}</li>
              ))}
            </ul>
          </div>
          {result.equality_act_relevance.recommended_next_steps.length > 0 && (
            <div className="recommended-steps">
              <strong>Recommended next steps:</strong>
              <ul>
                {result.equality_act_relevance.recommended_next_steps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Suggested Actions */}
      {result.suggested_actions.length > 0 && (
        <div className="suggested-actions">
          <h4>What You Can Do</h4>
          <ul>
            {result.suggested_actions.map((action, i) => (
              <li key={i}>{action}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Disclaimer Toggle */}
      <div className="disclaimer-section">
        <button
          className="disclaimer-toggle"
          onClick={() => setShowDisclaimer(!showDisclaimer)}
        >
          {showDisclaimer ? 'Hide' : 'Show'} Legal Disclaimer
        </button>
        {showDisclaimer && (
          <div className="disclaimer-content">
            {result.disclaimer.split('\n\n').map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
        )}
      </div>

      {/* Feedback Link */}
      <div className="feedback-section">
        <a
          href="mailto:feedback@tryreject.co.uk?subject=Bias%20Analysis%20Feedback"
          className="feedback-link"
        >
          Report inaccuracy or provide feedback
        </a>
      </div>
    </div>
  );
}

export default BiasAnalysisCard;
