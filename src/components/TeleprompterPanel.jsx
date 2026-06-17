import { Mic, MicOff, RefreshCw } from 'lucide-react';

export default function TeleprompterPanel({
  devices, selectedDevice, onDeviceChange, onRefresh,
  isActive, onStart, onStop, status, progress,
}) {
  return (
    <div className="tp-panel">
      <div className="tp-left">
        <span className="tp-icon">🎙</span>
        <select
          value={selectedDevice}
          onChange={(e) => onDeviceChange(e.target.value)}
          className="tp-select"
          disabled={isActive}
        >
          {devices.length === 0 && <option value="">No mics found</option>}
          {devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Mic ${d.deviceId.slice(0, 8)}…`}
            </option>
          ))}
        </select>
        <button onClick={onRefresh} className="tp-icon-btn" disabled={isActive} title="Refresh mic list">
          <RefreshCw size={12} />
        </button>
      </div>

      <div className="tp-right">
        {!isActive ? (
          <button onClick={onStart} className="tp-action-btn tp-start" disabled={devices.length === 0}>
            <Mic size={13} />
            <span>Start</span>
          </button>
        ) : (
          <button onClick={onStop} className="tp-action-btn tp-stop">
            <MicOff size={13} />
            <span>Stop</span>
          </button>
        )}

        <span className={`tp-status tp-${status}`}>
          {status === 'listening' && <><span className="tp-live-dot" />Listening</>}
          {status === 'reconnecting' && <><span className="tp-live-dot tp-reconnect" />Reconnecting…</>}
          {status === 'idle' && 'Ready'}
          {status === 'error' && 'Error'}
        </span>

        {progress && <span className="tp-progress">{progress}</span>}
      </div>
    </div>
  );
}
