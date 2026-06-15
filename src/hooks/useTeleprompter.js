import { useState, useRef, useCallback, useEffect } from 'react';
import { extractWords, setHighlight, clearHighlight, scrollToWord } from '../extensions/TeleprompterExtension';

/**
 * Teleprompter hook using Deepgram real-time WebSocket speech-to-text
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

  // ─── Logging ────────────────────────────────────────────────────────────
  const addLog = useCallback((msg) => {
    const ts = new Date().toLocaleTimeString();
    const line = `[${ts}] ${msg}`;
    console.log('[TP]', msg);
    setLog((prev) => {
      const lines = prev ? prev.split('\n') : [];
      lines.push(line);
      // Keep last 50 lines
      return lines.slice(-50).join('\n');
    });
  }, []);

  // ─── Enumerate microphones ──────────────────────────────────────────────
  const refreshDevices = useCallback(async () => {
    addLog('Enumerating mics...');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      addLog('Mic permission granted');
      const all = await navigator.mediaDevices.enumerateDevices();
      const mics = all.filter((d) => d.kind === 'audioinput');
      setDevices(mics);
      addLog(`Found ${mics.length} mic(s)`);
      if (mics.length && !selectedDevice) setSelectedDevice(mics[0].deviceId);
    } catch (err) {
      addLog(`Mic enumeration FAILED: ${err.message}`);
    }
  }, [selectedDevice, addLog]);

  useEffect(() => { refreshDevices(); }, []);

  // ─── Start ──────────────────────────────────────────────────────────────
  const start = useCallback(async () => {
    if (!editor || isActiveRef.current) return;

    const apiKey = window.electronAPI?.deepgramKey;
    if (!apiKey) {
      addLog('ERROR: No Deepgram API key found in electronAPI');
      setStatus('error');
      return;
    }
    addLog('Deepgram API key found');

    // ── Get mic stream ──────────────────────────────────────────────────
    try {
      const constraints = selectedDevice
        ? { audio: { deviceId: { exact: selectedDevice } } }
        : { audio: true };
      addLog(`Requesting mic...`);
      streamRef.current = await navigator.mediaDevices.getUserMedia(constraints);
      const trackLabel = streamRef.current.getAudioTracks()[0]?.label || 'unknown';
      addLog(`Mic active: ${trackLabel}`);
    } catch (err) {
      addLog(`Mic access DENIED: ${err.message}`);
      setStatus('error');
      return;
    }

    // ── Snapshot document words ──────────────────────────────────────────
    wordsRef.current = extractWords(editor.state.doc);
    currentIdxRef.current = 0;
    addLog(`Extracted ${wordsRef.current.length} words`);

    if (wordsRef.current.length === 0) {
      addLog('No words in document');
      setStatus('idle');
      return;
    }

    // Highlight first word
    setHighlight(editor.view, 0, wordsRef.current);
    scrollToWord(editor.view, wordsRef.current[0].from);

    // ── Connect to Deepgram WebSocket ───────────────────────────────────
    const dgUrl = `wss://api.deepgram.com/v1/listen?model=nova-2&interim_results=true&punctuate=false&language=en&encoding=linear16&sample_rate=16000&channels=1`;

    addLog('Connecting to Deepgram...');
    const ws = new WebSocket(dgUrl, ['token', apiKey]);
    wsRef.current = ws;

    ws.onopen = () => {
      addLog('✅ Deepgram connected! Starting audio capture...');

      // ── Set up audio processing (raw PCM via AudioContext) ──────────
      const audioContext = new AudioContext({ sampleRate: 16000 });
      const source = audioContext.createMediaStreamSource(streamRef.current);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (e) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const float32 = e.inputBuffer.getChannelData(0);
        // Convert Float32 to Int16 (linear16)
        const int16 = new Int16Array(float32.length);
        for (let i = 0; i < float32.length; i++) {
          const s = Math.max(-1, Math.min(1, float32[i]));
          int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        ws.send(int16.buffer);
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      // Store for cleanup
      recorderRef.current = { audioContext, source, processor };

      isActiveRef.current = true;
      setIsActive(true);
      setStatus('listening');
      setProgress(`0/${wordsRef.current.length}`);
      addLog('🎙 Listening — speak now!');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'Results') {
          const alt = data.channel?.alternatives?.[0];
          if (!alt) return;

          const transcript = alt.transcript?.trim();
          const isFinal = data.is_final;

          if (!transcript) return;

          addLog(`${isFinal ? '✓' : '…'} "${transcript}"`);

          // Process each word from Deepgram
          const dgWords = alt.words || transcript.split(/\s+/).map((w) => ({ word: w }));

          for (const dw of dgWords) {
            const spokenNorm = (dw.word || '').toLowerCase().replace(/[^a-z0-9]/gi, '');
            if (!spokenNorm) continue;

            const matchIdx = findMatch(spokenNorm, wordsRef.current, currentIdxRef.current);
            if (matchIdx >= 0) {
              currentIdxRef.current = matchIdx + 1;
              setHighlight(editor.view, matchIdx, wordsRef.current);
              scrollToWord(editor.view, wordsRef.current[matchIdx].from);

              const total = wordsRef.current.length;
              setProgress(`${matchIdx + 1}/${total}`);

              if (matchIdx + 1 >= total) {
                addLog('🎉 Done — reached end of document!');
                setProgress('Done!');
              }
            }
          }
        }
      } catch (err) {
        addLog(`Parse error: ${err.message}`);
      }
    };

    ws.onerror = (event) => {
      addLog(`❌ WebSocket error`);
      setStatus('error');
    };

    ws.onclose = (event) => {
      addLog(`WebSocket closed (code: ${event.code})`);
      if (isActiveRef.current) {
        addLog('Connection lost — stopping');
        cleanupInternal();
      }
    };
  }, [editor, selectedDevice, addLog]);

  // ─── Cleanup helper ─────────────────────────────────────────────────────
  const cleanupInternal = useCallback(() => {
    isActiveRef.current = false;
    setIsActive(false);
    setStatus('idle');
    setProgress('');

    // Stop audio processing
    if (recorderRef.current) {
      try {
        recorderRef.current.processor.disconnect();
        recorderRef.current.source.disconnect();
        recorderRef.current.audioContext.close();
      } catch (_) {}
      recorderRef.current = null;
    }

    // Close WebSocket (send empty buffer to signal end)
    if (wsRef.current) {
      try {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(new ArrayBuffer(0));
          wsRef.current.close();
        }
      } catch (_) {}
      wsRef.current = null;
    }

    // Stop mic stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    // Clear decorations
    if (editor && editor.view) clearHighlight(editor.view);
  }, [editor]);

  // ─── Stop ───────────────────────────────────────────────────────────────
  const stop = useCallback(() => {
    addLog('Stopping teleprompter');
    cleanupInternal();
  }, [addLog, cleanupInternal]);

  // ─── Re-extract words on doc changes ────────────────────────────────────
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

  // Cleanup on unmount
  useEffect(() => () => { if (isActiveRef.current) cleanupInternal(); }, [cleanupInternal]);

  return { devices, selectedDevice, setSelectedDevice, isActive, status, progress, log, start, stop, refreshDevices };
}

// ─── Word matching ──────────────────────────────────────────────────────────

function findMatch(spokenNorm, docWords, startIndex) {
  const end = Math.min(startIndex + 12, docWords.length);

  // Exact match
  for (let i = startIndex; i < end; i++) {
    if (docWords[i].normalized === spokenNorm) return i;
  }
  // Prefix match (spoken is partial)
  if (spokenNorm.length >= 3) {
    for (let i = startIndex; i < end; i++) {
      if (docWords[i].normalized.startsWith(spokenNorm)) return i;
    }
  }
  // Doc word is prefix of spoken
  for (let i = startIndex; i < end; i++) {
    if (docWords[i].normalized.length >= 2 && spokenNorm.startsWith(docWords[i].normalized)) return i;
  }
  return -1;
}
