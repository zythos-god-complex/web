import { useState, useRef, useCallback, useEffect } from 'react';
import {
  extractLines, setLineHighlight, clearHighlight, scrollToLine,
} from '../extensions/TeleprompterExtension';

/**
 * LINE-BY-LINE teleprompter using Deepgram (Indian English).
 *
 * Flow:
 *  1. Highlight current line
 *  2. User reads aloud — spoken words are collected
 *  3. When enough words match the line (or we hear next-line words), line is "done"
 *  4. Done line is DELETED from the doc, everything shifts up
 *  5. Next line is highlighted
 */
export default function useTeleprompter(editor) {
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState('');
  const [log, setLog] = useState('');

  const isActiveRef = useRef(false);
  const linesRef = useRef([]);
  const spokenWordsRef = useRef(new Set());
  const wsRef = useRef(null);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);

  const addLog = useCallback((msg) => {
    const ts = new Date().toLocaleTimeString();
    const line = `[${ts}] ${msg}`;
    console.log('[TP]', msg);
    setLog((prev) => {
      const arr = prev ? prev.split('\n') : [];
      arr.push(line);
      return arr.slice(-40).join('\n');
    });
  }, []);

  // ─── Enumerate mics ────────────────────────────────────────────────────
  const refreshDevices = useCallback(async () => {
    addLog('Scanning mics...');
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
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

  // ─── Re-extract lines & highlight first ─────────────────────────────────
  const reExtractAndHighlight = useCallback(() => {
    if (!editor || !editor.view) return;
    const lines = extractLines(editor.state.doc);
    linesRef.current = lines;
    if (lines.length > 0) {
      setLineHighlight(editor.view, 0, lines);
      scrollToLine(editor.view, lines[0].from);
      setProgress(`1/${lines.length}`);
    } else {
      clearHighlight(editor.view);
      setProgress('Done!');
      addLog('🎉 All lines read!');
    }
  }, [editor, addLog]);

  // ─── Check if current line is "read" ────────────────────────────────────
  const checkLineComplete = useCallback(() => {
    const lines = linesRef.current;
    if (lines.length === 0) return;

    const currentLine = lines[0]; // Always work on the first remaining line
    const spoken = spokenWordsRef.current;

    // Count how many of the line's words were spoken
    let matched = 0;
    for (const w of currentLine.words) {
      if (spoken.has(w)) matched++;
    }
    const total = currentLine.words.length;
    const pct = total > 0 ? matched / total : 0;

    // Threshold: 40% for long lines, at least 1 word for short lines
    const threshold = total <= 3 ? (1 / total) : 0.4;

    // Also check: did user start saying words from the NEXT line?
    let nextLineHit = false;
    if (lines.length > 1) {
      const nextLine = lines[1];
      let nextMatched = 0;
      for (const w of nextLine.words) {
        if (spoken.has(w)) nextMatched++;
      }
      // If 2+ words from next line are spoken, current line is done
      if (nextMatched >= 2) nextLineHit = true;
    }

    if (pct >= threshold || nextLineHit) {
      addLog(`✅ Line done (${matched}/${total} words matched${nextLineHit ? ' + next-line words' : ''})`);
      addLog(`   "${currentLine.text.slice(0, 60)}${currentLine.text.length > 60 ? '…' : ''}"`);

      // Delete this line from the document
      try {
        editor.chain().deleteRange({ from: currentLine.from, to: currentLine.to }).run();
      } catch (err) {
        addLog(`Delete failed: ${err.message}`);
      }

      // Clear spoken words for next line
      spokenWordsRef.current = new Set();

      // Re-extract after deletion (positions changed)
      setTimeout(() => reExtractAndHighlight(), 50);
    }
  }, [editor, addLog, reExtractAndHighlight]);

  // ─── Start ──────────────────────────────────────────────────────────────
  const start = useCallback(async () => {
    if (!editor || isActiveRef.current) return;

    const apiKey = window.electronAPI?.deepgramKey;
    if (!apiKey) {
      addLog('ERROR: No Deepgram API key');
      setStatus('error');
      return;
    }

    // Get mic
    try {
      const constraints = selectedDevice
        ? { audio: { deviceId: { exact: selectedDevice } } }
        : { audio: true };
      streamRef.current = await navigator.mediaDevices.getUserMedia(constraints);
      const label = streamRef.current.getAudioTracks()[0]?.label || '?';
      addLog(`Mic: ${label}`);
    } catch (err) {
      addLog(`Mic denied: ${err.message}`);
      setStatus('error');
      return;
    }

    // Extract lines
    linesRef.current = extractLines(editor.state.doc);
    spokenWordsRef.current = new Set();

    if (linesRef.current.length === 0) {
      addLog('No text in document');
      setStatus('idle');
      streamRef.current.getTracks().forEach((t) => t.stop());
      return;
    }

    addLog(`${linesRef.current.length} lines to read`);

    // Highlight first line
    setLineHighlight(editor.view, 0, linesRef.current);
    scrollToLine(editor.view, linesRef.current[0].from);

    // Connect to Deepgram — Indian English
    const dgUrl = 'wss://api.deepgram.com/v1/listen?model=nova-2&language=en-IN&interim_results=true&punctuate=false&smart_format=false&filler_words=false';
    addLog('Connecting to Deepgram (en-IN)...');

    let ws;
    try {
      ws = new WebSocket(dgUrl, ['token', apiKey]);
    } catch (err) {
      addLog(`WS failed: ${err.message}`);
      setStatus('error');
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      addLog('✅ Deepgram connected');

      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'audio/webm';

      try {
        const recorder = new MediaRecorder(streamRef.current, { mimeType });
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) ws.send(e.data);
        };
        recorder.start(250);
        recorderRef.current = recorder;
      } catch (err) {
        addLog(`Recorder error: ${err.message}`);
        setStatus('error');
        return;
      }

      isActiveRef.current = true;
      setIsActive(true);
      setStatus('listening');
      setProgress(`1/${linesRef.current.length}`);
      addLog('🎙 Speak now — reading line by line');
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

        // Add each word to the spoken set
        const words = transcript.split(/\s+/);
        for (const w of words) {
          const norm = w.toLowerCase().replace(/[^a-z0-9]/gi, '');
          if (norm) spokenWordsRef.current.add(norm);
        }

        // Check if the current line is complete
        if (isFinal) {
          checkLineComplete();
        }
      } catch (err) {
        addLog(`Parse error: ${err.message}`);
      }
    };

    ws.onerror = () => { addLog('❌ WS error'); setStatus('error'); };
    ws.onclose = (e) => {
      addLog(`WS closed (${e.code})`);
      if (isActiveRef.current) cleanupInternal();
    };
  }, [editor, selectedDevice, addLog, checkLineComplete, reExtractAndHighlight]);

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
    addLog('Stopped');
    cleanupInternal();
  }, [addLog, cleanupInternal]);

  useEffect(() => () => { if (isActiveRef.current) cleanupInternal(); }, [cleanupInternal]);

  return { devices, selectedDevice, setSelectedDevice, isActive, status, progress, log, start, stop, refreshDevices };
}
