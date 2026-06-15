import { useState, useRef, useCallback, useEffect } from 'react';
import { extractWords, setHighlight, clearHighlight, scrollToWord } from '../extensions/TeleprompterExtension';

/**
 * Custom hook — teleprompter with verbose logging
 */
export default function useTeleprompter(editor) {
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState('');
  const [log, setLog] = useState('');

  const isActiveRef = useRef(false);
  const recognitionRef = useRef(null);
  const wordsRef = useRef([]);
  const currentIdxRef = useRef(0);
  const streamRef = useRef(null);

  // ─── Logging helper ──────────────────────────────────────────────────────
  const addLog = useCallback((msg) => {
    const ts = new Date().toLocaleTimeString();
    const line = `[${ts}] ${msg}`;
    console.log('[TP]', msg);
    setLog((prev) => (prev ? prev + '\n' + line : line));
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
      addLog(`Found ${mics.length} mic(s): ${mics.map((m) => m.label || m.deviceId.slice(0, 8)).join(', ')}`);
      if (mics.length && !selectedDevice) setSelectedDevice(mics[0].deviceId);
    } catch (err) {
      addLog(`Mic enumeration FAILED: ${err.message}`);
    }
  }, [selectedDevice, addLog]);

  useEffect(() => { refreshDevices(); }, []);

  // ─── Start teleprompter ─────────────────────────────────────────────────
  const start = useCallback(async () => {
    if (!editor || isActiveRef.current) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    addLog(`SpeechRecognition API: ${SpeechRecognition ? 'AVAILABLE' : 'NOT FOUND'}`);
    if (!SpeechRecognition) {
      setStatus('error');
      addLog('ERROR: No SpeechRecognition API in this browser/runtime');
      return;
    }

    // Request selected mic
    try {
      const constraints = selectedDevice
        ? { audio: { deviceId: { exact: selectedDevice } } }
        : { audio: true };
      addLog(`Requesting mic: ${selectedDevice ? selectedDevice.slice(0, 12) + '…' : 'default'}`);
      streamRef.current = await navigator.mediaDevices.getUserMedia(constraints);
      addLog(`Mic stream active: ${streamRef.current.active}, tracks: ${streamRef.current.getAudioTracks().length}`);
    } catch (err) {
      addLog(`Mic access DENIED: ${err.message}`);
      setStatus('error');
      return;
    }

    // Snapshot document words
    wordsRef.current = extractWords(editor.state.doc);
    currentIdxRef.current = 0;
    addLog(`Extracted ${wordsRef.current.length} words from document`);

    if (wordsRef.current.length === 0) {
      addLog('No words in document — nothing to track');
      setStatus('idle');
      return;
    }

    // Highlight first word
    setHighlight(editor.view, 0, wordsRef.current);
    scrollToWord(editor.view, wordsRef.current[0].from);

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    addLog('SpeechRecognition instance created. Starting...');

    recognition.onstart = () => {
      addLog('✅ Recognition STARTED — speak now!');
    };

    recognition.onaudiostart = () => {
      addLog('🎙 Audio capture started');
    };

    recognition.onsoundstart = () => {
      addLog('🔊 Sound detected');
    };

    recognition.onspeechstart = () => {
      addLog('🗣 Speech detected');
    };

    recognition.onspeechend = () => {
      addLog('🔇 Speech ended');
    };

    recognition.onresult = (event) => {
      for (let r = event.resultIndex; r < event.results.length; r++) {
        const transcript = event.results[r][0].transcript.trim();
        const confidence = event.results[r][0].confidence;
        const isFinal = event.results[r].isFinal;

        addLog(`${isFinal ? '✓ FINAL' : '… interim'}: "${transcript}" (conf: ${(confidence * 100).toFixed(0)}%)`);

        if (!transcript) continue;

        const spokenWords = transcript.split(/\s+/);
        for (const sw of spokenWords) {
          const spokenNorm = sw.toLowerCase().replace(/[^a-z0-9]/gi, '');
          if (!spokenNorm || spokenNorm.length < 1) continue;

          const matchIdx = findMatch(spokenNorm, wordsRef.current, currentIdxRef.current);
          if (matchIdx >= 0) {
            currentIdxRef.current = matchIdx + 1;
            setHighlight(editor.view, matchIdx, wordsRef.current);
            scrollToWord(editor.view, wordsRef.current[matchIdx].from);

            const total = wordsRef.current.length;
            setProgress(`${matchIdx + 1}/${total}`);
            addLog(`→ Matched "${spokenNorm}" to word #${matchIdx}: "${wordsRef.current[matchIdx].raw}"`);

            if (matchIdx + 1 >= total) setProgress('Done!');
          }
        }
      }
    };

    recognition.onend = () => {
      addLog('Recognition ended');
      if (isActiveRef.current) {
        addLog('Auto-restarting...');
        try { recognition.start(); } catch (e) { addLog(`Restart failed: ${e.message}`); }
      }
    };

    recognition.onerror = (event) => {
      addLog(`❌ ERROR: ${event.error} — ${event.message || 'no details'}`);
      if (event.error === 'not-allowed') {
        addLog('Mic permission was denied by the system');
        setStatus('error');
      }
    };

    try {
      recognition.start();
      addLog('recognition.start() called');
    } catch (err) {
      addLog(`Failed to start: ${err.message}`);
      setStatus('error');
      return;
    }

    recognitionRef.current = recognition;
    isActiveRef.current = true;
    setIsActive(true);
    setStatus('listening');
    setProgress(`0/${wordsRef.current.length}`);
  }, [editor, selectedDevice, addLog]);

  // ─── Stop ───────────────────────────────────────────────────────────────
  const stop = useCallback(() => {
    addLog('Stopping teleprompter');
    isActiveRef.current = false;
    setIsActive(false);
    setStatus('idle');
    setProgress('');

    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch (_) {}
      recognitionRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    if (editor && editor.view) clearHighlight(editor.view);
  }, [editor, addLog]);

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

  useEffect(() => () => { if (isActiveRef.current) stop(); }, [stop]);

  return { devices, selectedDevice, setSelectedDevice, isActive, status, progress, log, start, stop, refreshDevices };
}

// ─── Word matching ──────────────────────────────────────────────────────────

function findMatch(spokenNorm, docWords, startIndex) {
  const end = Math.min(startIndex + 10, docWords.length);

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
