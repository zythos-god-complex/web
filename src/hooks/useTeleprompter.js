import { useState, useRef, useCallback, useEffect } from 'react';
import {
  extractLines, setLineHighlight, clearHighlight, scrollToLine,
} from '../extensions/TeleprompterExtension';

/**
 * LINE-BY-LINE teleprompter — sequential word tracking.
 *
 * Maintains a pointer that advances SEQUENTIALLY through each line's words.
 * A line is only "done" when the pointer reaches the END of the line.
 * This works correctly for any line length — short or 4-paragraphs-long.
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
  const linePointerRef = useRef(0); // which word in the current line we're at
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

  // ─── Mic enumeration ───────────────────────────────────────────────────
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

  // ─── Refresh lines & highlight first ────────────────────────────────────
  const reExtractAndHighlight = useCallback(() => {
    if (!editor || !editor.view) return;
    const lines = extractLines(editor.state.doc);
    linesRef.current = lines;
    linePointerRef.current = 0; // reset word pointer for new line

    if (lines.length > 0) {
      setLineHighlight(editor.view, 0, lines);
      scrollToLine(editor.view, lines[0].from);
      setProgress(`Line 1 of ${lines.length}`);
    } else {
      clearHighlight(editor.view);
      setProgress('Done!');
      addLog('🎉 All lines read!');
    }
  }, [editor, addLog]);

  // ─── Process a spoken word — sequential matching ────────────────────────
  const processSpokenWord = useCallback((spokenNorm) => {
    const lines = linesRef.current;
    if (lines.length === 0) return;

    const currentLine = lines[0];
    const lineWords = currentLine.words;
    const ptr = linePointerRef.current;

    // Try to match spoken word against the next few words in the line (lookahead 6)
    const lookahead = Math.min(ptr + 6, lineWords.length);
    let matched = false;

    for (let i = ptr; i < lookahead; i++) {
      if (isMatch(lineWords[i], spokenNorm)) {
        linePointerRef.current = i + 1; // advance past the matched word
        matched = true;
        break;
      }
    }

    // Check if we've reached the end of the line
    const wordsLeft = lineWords.length - linePointerRef.current;
    // Line is done when pointer is at/near the end (allow 1 word slack for very short lines, 2 for longer)
    const slack = lineWords.length <= 4 ? 0 : 1;

    if (wordsLeft <= slack) {
      addLog(`✅ Line complete (${linePointerRef.current}/${lineWords.length} words tracked)`);
      addLog(`   "${currentLine.text.slice(0, 80)}${currentLine.text.length > 80 ? '…' : ''}"`);

      // Delete this line from the document
      try {
        editor.chain().deleteRange({ from: currentLine.from, to: currentLine.to }).run();
      } catch (err) {
        addLog(`Delete error: ${err.message}`);
      }

      // Re-extract after deletion
      setTimeout(() => reExtractAndHighlight(), 80);
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
      addLog(`Mic: ${streamRef.current.getAudioTracks()[0]?.label || '?'}`);
    } catch (err) {
      addLog(`Mic denied: ${err.message}`);
      setStatus('error');
      return;
    }

    // Extract lines
    linesRef.current = extractLines(editor.state.doc);
    linePointerRef.current = 0;

    if (linesRef.current.length === 0) {
      addLog('No text in document');
      setStatus('idle');
      streamRef.current.getTracks().forEach((t) => t.stop());
      return;
    }

    addLog(`${linesRef.current.length} lines to read`);
    setLineHighlight(editor.view, 0, linesRef.current);
    scrollToLine(editor.view, linesRef.current[0].from);

    // Deepgram — Indian English, nova-2
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
      setProgress(`Line 1 of ${linesRef.current.length}`);
      addLog('🎙 Speak now — read the highlighted line');
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

        // Get individual words (Deepgram provides them, or split transcript)
        const dgWords = alt.words
          ? alt.words.map((w) => w.word)
          : transcript.split(/\s+/);

        for (const w of dgWords) {
          const norm = w.toLowerCase().replace(/[^a-z0-9]/gi, '');
          if (norm) processSpokenWord(norm);
        }
      } catch (err) {
        addLog(`Parse: ${err.message}`);
      }
    };

    ws.onerror = () => { addLog('❌ WS error'); setStatus('error'); };
    ws.onclose = (e) => {
      addLog(`WS closed (${e.code})`);
      if (isActiveRef.current) cleanupInternal();
    };
  }, [editor, selectedDevice, addLog, processSpokenWord, reExtractAndHighlight]);

  // ─── Cleanup ────────────────────────────────────────────────────────────
  const cleanupInternal = useCallback(() => {
    isActiveRef.current = false;
    setIsActive(false);
    setStatus('idle');
    setProgress('');
    linePointerRef.current = 0;

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

// ─── Fuzzy word matching ──────────────────────────────────────────────────────

function isMatch(docWord, spokenWord) {
  if (!docWord || !spokenWord) return false;

  // Exact match
  if (docWord === spokenWord) return true;

  // Prefix match (one is prefix of the other, min 3 chars)
  if (spokenWord.length >= 3 && docWord.startsWith(spokenWord)) return true;
  if (docWord.length >= 3 && spokenWord.startsWith(docWord)) return true;

  // Edit distance 1 for words of length >= 4
  if (docWord.length >= 4 && spokenWord.length >= 4) {
    if (editDistance(docWord, spokenWord) <= 1) return true;
  }

  return false;
}

function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3; // quick reject
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}
