import { Mic, MicOff, RefreshCw, Bot } from 'lucide-react';

export default function InterviewerPanel({
  devices, selectedDevice, onDeviceChange, onRefresh,
  isActive, onStart, onStop, status,
}) {
  return (
    <div className="tp-panel" style={{ background: '#1e1b4b', borderBottom: '1px solid #312e81' }}>
      <div className="tp-left">
        <span className="tp-icon" style={{ color: '#818cf8' }}><Bot size={14} /></span>
        <select
          value={selectedDevice}
          onChange={(e) => onDeviceChange(e.target.value)}
          className="tp-select"
          disabled={isActive}
        >
          {devices.length === 0 && <option value="">No audio devices</option>}
          {devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Device ${d.deviceId.slice(0, 8)}…`}
            </option>
          ))}
        </select>
        <button onClick={onRefresh} className="tp-icon-btn" disabled={isActive}>
          <RefreshCw size={12} />
        </button>
      </div>

      <div className="tp-right">
        {!isActive ? (
          <button onClick={onStart} className="tp-action-btn" style={{ background: '#4f46e5' }} disabled={devices.length === 0}>
            <span>Start Interview AI</span>
          </button>
        ) : (
          <button onClick={onStop} className="tp-action-btn" style={{ background: '#ef4444' }}>
            <span>Stop AI</span>
          </button>
        )}

        <span className={`tp-status tp-${status}`}>
          {status === 'listening' && <><span className="tp-live-dot" style={{ background: '#818cf8', boxShadow: 'none' }} />Listening</>}
          {status === 'reconnecting' && <><span className="tp-live-dot tp-reconnect" />Reconnecting…</>}
          {status === 'idle' && 'Ready'}
          {status === 'error' && 'Error'}
        </span>
      </div>
    </div>
  );
}
