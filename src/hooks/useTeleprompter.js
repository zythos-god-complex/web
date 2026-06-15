import { useState, useRef, useCallback, useEffect } from 'react';
import { extractWords, setHighlight, clearHighlight, scrollToWord } from '../extensions/TeleprompterExtension';

/**
 * Custom hook that manages the entire teleprompter lifecycle:
 *  - Mic enumeration & selection
 *  - Web Speech API recognition
 *  - Word matching against the editor document
 *  - Decoration updates & auto-scroll
 */
export default function useTeleprompter(editor) {
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | listening | error
  const [progress, setProgress] = useState('');

  const isActiveRef = useRef(false);
  const recognitionRef = useRef(null);
  const wordsRef = useRef([]);
  const currentIdxRef = useRef(0);
  const streamRef = useRef(null);

  // ─── Enumerate microphones ──────────────────────────────────────────────
  const refreshDevices = useCallback(async () => {
    try {
      // Need a getUserMedia call first so labels are populated
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      const all = await navigator.mediaDevices.enumerateDevices();
      const mics = all.filter((d) => d.kind === 'audioinput');
      setDevices(mics);
      if (mics.length && !selectedDevice) setSelectedDevice(mics[0].deviceId);
    } catch (err) {
      console.warn('Mic enumeration failed:', err);
    }
  }, [selectedDevice]);

  useEffect(() => { refreshDevices(); }, []);

  // ─── Start teleprompter ─────────────────────────────────────────────────
  const start = useCallback(async () => {
    if (!editor || isActiveRef.current) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setStatus('error');
      return;
    }

    // Request selected mic (helps Chromium use it for SpeechRecognition)
    try {
      const constraints = selectedDevice
        ? { audio: { deviceId: { exact: selectedDevice } } }
        : { audio: true };
      streamRef.current = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      console.error('Mic access denied:', err);
      setStatus('error');
      return;
    }

    // Snapshot document words
    wordsRef.current = extractWords(editor.state.doc);
    currentIdxRef.current = 0;

    if (wordsRef.current.length === 0) {
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

    recognition.onresult = (event) => {
      // Process only the latest result
      for (let r = event.resultIndex; r < event.results.length; r++) {
        const transcript = event.results[r][0].transcript.trim();
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

            // If reached the end
            if (matchIdx + 1 >= total) {
              setProgress('Done!');
            }
          }
        }
      }
    };

    recognition.onend = () => {
      // Auto-restart if still active
      if (isActiveRef.current) {
        try { recognition.start(); } catch (_) {}
      }
    };

    recognition.onerror = (event) => {
      if (event.error === 'no-speech' || event.error === 'aborted') {
        // These are non-fatal, recognition.onend will restart
        return;
      }
      console.warn('Speech error:', event.error);
    };

    try {
      recognition.start();
    } catch (err) {
      console.error('Failed to start recognition:', err);
      setStatus('error');
      return;
    }

    recognitionRef.current = recognition;
    isActiveRef.current = true;
    setIsActive(true);
    setStatus('listening');
    setProgress(`0/${wordsRef.current.length}`);
  }, [editor, selectedDevice]);

  // ─── Stop teleprompter ──────────────────────────────────────────────────
  const stop = useCallback(() => {
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

    if (editor && editor.view) {
      clearHighlight(editor.view);
    }
  }, [editor]);

  // ─── Reset words if doc changes while active ────────────────────────────
  useEffect(() => {
    if (!editor || !isActiveRef.current) return;
    const handler = () => {
      // Re-extract words but keep the current index relative
      const newWords = extractWords(editor.state.doc);
      // Try to find the closest matching word to maintain position
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
  useEffect(() => () => { if (isActiveRef.current) stop(); }, [stop]);

  return { devices, selectedDevice, setSelectedDevice, isActive, status, progress, start, stop, refreshDevices };
}

// ─── Word matching ──────────────────────────────────────────────────────────

function findMatch(spokenNorm, docWords, startIndex) {
  const end = Math.min(startIndex + 10, docWords.length);

  // 1. Exact match
  for (let i = startIndex; i < end; i++) {
    if (docWords[i].normalized === spokenNorm) return i;
  }

  // 2. Prefix match (spoken is partial — interim result)
  if (spokenNorm.length >= 3) {
    for (let i = startIndex; i < end; i++) {
      if (docWords[i].normalized.startsWith(spokenNorm)) return i;
    }
  }

  // 3. Doc word is prefix of spoken (e.g. doc has "I" and spoken has "i'll")
  for (let i = startIndex; i < end; i++) {
    if (docWords[i].normalized.length >= 2 && spokenNorm.startsWith(docWords[i].normalized)) return i;
  }

  return -1;
}
