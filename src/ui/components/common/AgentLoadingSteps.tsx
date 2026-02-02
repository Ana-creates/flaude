import { h } from 'preact';
import mascotUrl from '../../assets/mascot.png';

interface AgentLoadingStepsProps {
  agentStatus: string | null;
}

export function AgentLoadingSteps({ agentStatus }: AgentLoadingStepsProps) {
  // Extract step info from status like "Thinking... (step 2)"
  const stepMatch = agentStatus?.match(/step (\d+)/i);
  const currentStep = stepMatch ? parseInt(stepMatch[1], 10) : 1;

  // Parse tool usage
  const toolMatch = agentStatus?.match(/Using: (.+)/i);
  const toolName = toolMatch ? toolMatch[1] : null;

  const steps = [
    { label: 'Scanning design', icon: '🔍' },
    { label: 'Analyzing patterns', icon: '🧠' },
    { label: 'Generating insights', icon: '✨' },
  ];

  return (
    <div
      className="fade-in"
      style={{
        padding: '16px',
        marginBottom: '12px',
      }}
    >
      {/* Card container */}
      <div
        style={{
          padding: '16px',
          backgroundColor: 'var(--figma-color-bg-secondary)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        {/* Header with mascot */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '16px',
          }}
        >
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--figma-color-bg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <img
              src={mascotUrl}
              alt="Assistant"
              style={{
                width: '28px',
                height: '28px',
                objectFit: 'contain',
              }}
            />
          </div>
          <div>
            <div
              className="shimmer-text"
              style={{
                fontSize: '13px',
                fontWeight: 500,
              }}
            >
              {toolName ? `Using ${toolName}` : 'Analyzing your design'}
            </div>
            <div
              style={{
                fontSize: '11px',
                color: 'var(--figma-color-text-tertiary)',
                marginTop: '2px',
              }}
            >
              This may take a moment
            </div>
          </div>
        </div>

        {/* Progress steps */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {steps.map((step, index) => {
            const stepNum = index + 1;
            const isActive = stepNum === currentStep;
            const isComplete = stepNum < currentStep;

            return (
              <div
                key={index}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: isActive
                    ? 'var(--color-accent-soft)'
                    : 'transparent',
                  transition: 'all 0.3s ease',
                }}
              >
                {/* Step indicator */}
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: isComplete
                      ? 'var(--color-success-soft)'
                      : isActive
                        ? 'var(--color-accent)'
                        : 'var(--figma-color-bg-tertiary)',
                    color: isComplete
                      ? 'var(--color-success)'
                      : isActive
                        ? 'white'
                        : 'var(--figma-color-text-tertiary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: 500,
                    transition: 'all 0.3s ease',
                  }}
                >
                  {isComplete ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    stepNum
                  )}
                </div>

                {/* Step label */}
                <span
                  style={{
                    fontSize: '12px',
                    color: isActive
                      ? 'var(--color-accent)'
                      : isComplete
                        ? 'var(--figma-color-text-secondary)'
                        : 'var(--figma-color-text-tertiary)',
                    fontWeight: isActive ? 500 : 400,
                    transition: 'all 0.3s ease',
                  }}
                >
                  {step.label}
                </span>

                {/* Loading indicator for active step */}
                {isActive && (
                  <div className="loading-dots" style={{ marginLeft: 'auto' }}>
                    <span />
                    <span />
                    <span />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
