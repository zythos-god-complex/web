import { useState, useRef, useCallback, useEffect } from 'react';
import { extractWords, setHighlight, clearHighlight, scrollToWord } from '../extensions/TeleprompterExtension';

/**
 * Teleprompter hook using Deepgram real-time WebSocket + MediaRecorder
 */
export default function useTeleprompter(editor) {
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState('');
  const [log, setLog] = useState('');

  const isActiveRef = useRef(false);
  const wordsRef = useRef([]);
  const currentIdxRef = useRef(0);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const wsRef = useRef(null);

  const addLog = useCallback((msg) => {
    const ts = new Date().toLocaleTimeString();
    const line = `[${ts}] ${msg}`;
    console.log('[TP]', msg);
    setLog((prev) => {
      const lines = prev ? prev.split('\n') : [];
      lines.push(line);
      return lines.slice(-50).join('\n');
    });
  }, []);

  // ─── Enumerate mics ────────────────────────────────────────────────────
  const refreshDevices = useCallback(async () => {
    addLog('Enumerating mics...');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      const all = await navigator.mediaDevices.enumerateDevices();
      const mics = all.filter((d) => d.kind === 'audioinput');
      setDevices(mics);
      addLog(`Found ${mics.length} mic(s)`);
      if (mics.length && !selectedDevice) setSelectedDevice(mics[0].deviceId);
    } catch (err) {
      addLog(`Mic error: ${err.message}`);
    }
  }, [selectedDevice, addLog]);

  useEffect(() => { refreshDevices(); }, []);

  // ─── Start ──────────────────────────────────────────────────────────────
  const start = useCallback(async () => {
    if (!editor || isActiveRef.current) return;

    const apiKey = window.electronAPI?.deepgramKey;
    if (!apiKey) {
      addLog('ERROR: No Deepgram API key');
      setStatus('error');
      return;
    }

    // Get mic stream
    try {
      const constraints = selectedDevice
        ? { audio: { deviceId: { exact: selectedDevice } } }
        : { audio: true };
      addLog('Requesting mic...');
      streamRef.current = await navigator.mediaDevices.getUserMedia(constraints);
      const label = streamRef.current.getAudioTracks()[0]?.label || 'unknown';
      addLog(`Mic: ${label}`);
    } catch (err) {
      addLog(`Mic DENIED: ${err.message}`);
      setStatus('error');
      return;
    }

    // Extract words
    wordsRef.current = extractWords(editor.state.doc);
    currentIdxRef.current = 0;
    addLog(`${wordsRef.current.length} words in document`);

    if (wordsRef.current.length === 0) {
      addLog('No words — nothing to track');
      setStatus('idle');
      streamRef.current.getTracks().forEach((t) => t.stop());
      return;
    }

    setHighlight(editor.view, 0, wordsRef.current);
    scrollToWord(editor.view, wordsRef.current[0].from);

    // Connect to Deepgram (no encoding params — Deepgram auto-detects webm/opus)
    const dgUrl = `wss://api.deepgram.com/v1/listen?model=nova-2&interim_results=true&punctuate=false&language=en`;
    addLog('Connecting to Deepgram...');

    let ws;
    try {
      ws = new WebSocket(dgUrl, ['token', apiKey]);
    } catch (err) {
      addLog(`WebSocket create failed: ${err.message}`);
      setStatus('error');
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      addLog('✅ Deepgram connected');

      // Use MediaRecorder (safe, no AudioContext crashes)
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm';
        addLog(`Using fallback mime: ${mimeType}`);
      }

      try {
        const recorder = new MediaRecorder(streamRef.current, { mimeType });
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
            ws.send(event.data);
          }
        };
        recorder.onerror = (e) => addLog(`Recorder error: ${e.error?.message || 'unknown'}`);
        recorder.start(250); // Send audio every 250ms
        recorderRef.current = recorder;
        addLog('🎙 Listening — speak now!');
      } catch (err) {
        addLog(`Recorder failed: ${err.message}`);
        setStatus('error');
        return;
      }

      isActiveRef.current = true;
      setIsActive(true);
      setStatus('listening');
      setProgress(`0/${wordsRef.current.length}`);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type !== 'Results') return;

        const alt = data.channel?.alternatives?.[0];
        if (!alt || !alt.transcript?.trim()) return;

        const transcript = alt.transcript.trim();
        const isFinal = data.is_final;
        addLog(`${isFinal ? '✓' : '…'} "${transcript}"`);

        const dgWords = alt.words || transcript.split(/\s+/).map((w) => ({ word: w }));

        for (const dw of dgWords) {
          const spokenNorm = (dw.word || '').toLowerCase().replace(/[^a-z0-9]/gi, '');
          if (!spokenNorm) continue;

          const matchIdx = findMatch(spokenNorm, wordsRef.current, currentIdxRef.current);
          if (matchIdx >= 0) {
            currentIdxRef.current = matchIdx + 1;
            setHighlight(editor.view, matchIdx, wordsRef.current);
            scrollToWord(editor.view, wordsRef.current[matchIdx].from);
            setProgress(`${matchIdx + 1}/${wordsRef.current.length}`);

            if (matchIdx + 1 >= wordsRef.current.length) {
              addLog('🎉 Done!');
              setProgress('Done!');
            }
          }
        }
      } catch (err) {
        addLog(`Parse error: ${err.message}`);
      }
    };

    ws.onerror = () => {
      addLog('❌ WebSocket error');
      setStatus('error');
    };

    ws.onclose = (event) => {
      addLog(`WS closed (${event.code})`);
      if (isActiveRef.current) cleanupInternal();
    };
  }, [editor, selectedDevice, addLog]);

  // ─── Cleanup ────────────────────────────────────────────────────────────
  const cleanupInternal = useCallback(() => {
    isActiveRef.current = false;
    setIsActive(false);
    setStatus('idle');
    setProgress('');

    if (recorderRef.current) {
      try { if (recorderRef.current.state !== 'inactive') recorderRef.current.stop(); } catch (_) {}
      recorderRef.current = null;
    }
    if (wsRef.current) {
      try {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(new ArrayBuffer(0));
          wsRef.current.close();
        }
      } catch (_) {}
      wsRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (editor && editor.view) clearHighlight(editor.view);
  }, [editor]);

  const stop = useCallback(() => {
    addLog('Stopping');
    cleanupInternal();
  }, [addLog, cleanupInternal]);

  // Re-extract words on doc changes
  useEffect(() => {
    if (!editor || !isActiveRef.current) return;
    const handler = () => {
      const newWords = extractWords(editor.state.doc);
      if (currentIdxRef.current > 0 && currentIdxRef.current <= wordsRef.current.length) {
        const lastWord = wordsRef.current[currentIdxRef.current - 1];
        if (lastWord) {
          const found = newWords.findIndex((w) => w.normalized === lastWord.normalized && Math.abs(w.from - lastWord.from) < 20);
          if (found >= 0) currentIdxRef.current = found + 1;
        }
      }
      wordsRef.current = newWords;
    };
    editor.on('update', handler);
    return () => editor.off('update', handler);
  }, [editor]);

  useEffect(() => () => { if (isActiveRef.current) cleanupInternal(); }, [cleanupInternal]);

  return { devices, selectedDevice, setSelectedDevice, isActive, status, progress, log, start, stop, refreshDevices };
}

function findMatch(spokenNorm, docWords, startIndex) {
  const end = Math.min(startIndex + 12, docWords.length);
  for (let i = startIndex; i < end; i++) {
    if (docWords[i].normalized === spokenNorm) return i;
  }
  if (spokenNorm.length >= 3) {
    for (let i = startIndex; i < end; i++) {
      if (docWords[i].normalized.startsWith(spokenNorm)) return i;
    }
  }
  for (let i = startIndex; i < end; i++) {
    if (docWords[i].normalized.length >= 2 && spokenNorm.startsWith(docWords[i].normalized)) return i;
  }
  return -1;
}
