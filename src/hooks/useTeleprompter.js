import { useState, useRef, useCallback, useEffect } from 'react';
import {
  extractLines, setLineHighlight, clearHighlight, scrollToLine,
} from '../extensions/TeleprompterExtension';

/**
 * LINE-BY-LINE teleprompter — sequential tracking with:
 *  - Snapshot-based: only tracks lines that existed when started (ignores new lines)
 *  - Persistent: auto-reconnects Deepgram if connection drops
 *  - No logging UI
 */
export default function useTeleprompter(editor) {
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState('');

  const isActiveRef = useRef(false);
  const linesRef = useRef([]);
  const linePointerRef = useRef(0);
  const completingRef = useRef(false);
  const wsRef = useRef(null);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);

  // Snapshot: ordered list of original line texts to track
  const snapshotRef = useRef([]);
  const snapshotIdxRef = useRef(0);

  // ─── Mic enumeration ───────────────────────────────────────────────────
  const refreshDevices = useCallback(async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
      const all = await navigator.mediaDevices.enumerateDevices();
      const mics = all.filter((d) => d.kind === 'audioinput');
      setDevices(mics);
      if (mics.length && !selectedDevice) setSelectedDevice(mics[0].deviceId);
    } catch (_) {}
  }, [selectedDevice]);

  useEffect(() => { refreshDevices(); }, []);

  // ─── Find the current snapshot line in the doc ──────────────────────────
  const findCurrentLine = useCallback(() => {
    if (!editor || !editor.view) return null;
    const expectedText = snapshotRef.current[snapshotIdxRef.current];
    if (!expectedText) return null;

    const allLines = extractLines(editor.state.doc);
    // Find the first line whose text matches the expected snapshot text
    return allLines.find((l) => l.text === expectedText) || null;
  }, [editor]);

  // ─── Highlight the current snapshot line ────────────────────────────────
  const highlightCurrent = useCallback(() => {
    if (!editor || !editor.view) return;
    const line = findCurrentLine();
    if (line) {
      const allLines = extractLines(editor.state.doc);
      const idx = allLines.indexOf(line);
      if (idx >= 0) {
        linesRef.current = allLines;
        setLineHighlight(editor.view, idx, allLines);
        scrollToLine(editor.view, line.from);
      }
      const remaining = snapshotRef.current.length - snapshotIdxRef.current;
      setProgress(`${snapshotIdxRef.current + 1} of ${snapshotRef.current.length}`);
    } else {
      clearHighlight(editor.view);
      setProgress('Done!');
    }
    completingRef.current = false;
  }, [editor, findCurrentLine]);

  // ─── Process spoken words ───────────────────────────────────────────────
  const processResult = useCallback((dgWords) => {
    if (completingRef.current) return;

    const line = findCurrentLine();
    if (!line) return;

    const lineWords = line.text
      .split(/\s+/)
      .map((w) => w.toLowerCase().replace(/[^a-z0-9]/gi, ''))
      .filter((w) => w.length > 0);

    for (const w of dgWords) {
      if (completingRef.current) return;

      const spokenNorm = w.toLowerCase().replace(/[^a-z0-9]/gi, '');
      if (!spokenNorm) continue;

      const ptr = linePointerRef.current;
      const lookahead = Math.min(ptr + 6, lineWords.length);

      for (let i = ptr; i < lookahead; i++) {
        if (isMatch(lineWords[i], spokenNorm)) {
          linePointerRef.current = i + 1;
          break;
        }
      }

      // Check end-of-line
      const wordsLeft = lineWords.length - linePointerRef.current;
      const slack = lineWords.length <= 4 ? 0 : 1;

      if (wordsLeft <= slack) {
        completingRef.current = true;

        // Delete the line from the doc
        try {
          editor.chain().deleteRange({ from: line.from, to: line.to }).run();
        } catch (_) {}

        // Advance snapshot
        snapshotIdxRef.current++;
        linePointerRef.current = 0;

        // Re-highlight after editor settles
        setTimeout(() => highlightCurrent(), 120);
        return;
      }
    }
  }, [editor, findCurrentLine, highlightCurrent]);

  // ─── Connect to Deepgram ────────────────────────────────────────────────
  const connectDeepgram = useCallback(() => {
    const apiKey = window.electronAPI?.deepgramKey;
    if (!apiKey || !streamRef.current) return;

    const dgUrl = 'wss://api.deepgram.com/v1/listen?model=nova-2&language=en-IN&interim_results=true&punctuate=false&smart_format=false&filler_words=false';

    let ws;
    try {
      ws = new WebSocket(dgUrl, ['token', apiKey]);
    } catch (_) {
      setStatus('error');
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('listening');

      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'audio/webm';

      try {
        // Stop existing recorder if any
        if (recorderRef.current && recorderRef.current.state !== 'inactive') {
          try { recorderRef.current.stop(); } catch (_) {}
        }

        const recorder = new MediaRecorder(streamRef.current, { mimeType });
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) ws.send(e.data);
        };
        recorder.start(250);
        recorderRef.current = recorder;
      } catch (_) {
        setStatus('error');
        return;
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type !== 'Results') return;
        const alt = data.channel?.alternatives?.[0];
        if (!alt || !alt.transcript?.trim()) return;
        if (!data.is_final) return; // Only process final results

        const words = alt.words
          ? alt.words.map((w) => w.word)
          : alt.transcript.trim().split(/\s+/);

        processResult(words);
      } catch (_) {}
    };

    ws.onerror = () => setStatus('reconnecting');

    ws.onclose = () => {
      // ── PERSISTENT: auto-reconnect if still active ──
      if (isActiveRef.current) {
        setStatus('reconnecting');
        // Stop current recorder
        if (recorderRef.current) {
          try { if (recorderRef.current.state !== 'inactive') recorderRef.current.stop(); } catch (_) {}
          recorderRef.current = null;
        }
        // Reconnect after 2 seconds
        setTimeout(() => {
          if (isActiveRef.current && streamRef.current) {
            connectDeepgram();
          }
        }, 2000);
      }
    };
  }, [processResult]);

  // ─── Start ──────────────────────────────────────────────────────────────
  const start = useCallback(async () => {
    if (!editor || isActiveRef.current) return;

    if (!window.electronAPI?.deepgramKey) {
      setStatus('error');
      return;
    }

    // Get mic
    try {
      const constraints = selectedDevice
        ? { audio: { deviceId: { exact: selectedDevice } } }
        : { audio: true };
      streamRef.current = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (_) {
      setStatus('error');
      return;
    }

    // Snapshot lines
    const lines = extractLines(editor.state.doc);
    if (lines.length === 0) {
      setStatus('idle');
      streamRef.current.getTracks().forEach((t) => t.stop());
      return;
    }

    snapshotRef.current = lines.map((l) => l.text);
    snapshotIdxRef.current = 0;
    linePointerRef.current = 0;
    completingRef.current = false;
    linesRef.current = lines;

    // Highlight first line
    setLineHighlight(editor.view, 0, lines);
    scrollToLine(editor.view, lines[0].from);

    isActiveRef.current = true;
    setIsActive(true);
    setProgress(`1 of ${lines.length}`);

    // Connect
    connectDeepgram();
  }, [editor, selectedDevice, connectDeepgram]);

  // ─── Stop ───────────────────────────────────────────────────────────────
  const cleanupInternal = useCallback(() => {
    isActiveRef.current = false;
    setIsActive(false);
    setStatus('idle');
    setProgress('');
    linePointerRef.current = 0;
    completingRef.current = false;
    snapshotRef.current = [];
    snapshotIdxRef.current = 0;

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

  const stop = useCallback(() => cleanupInternal(), [cleanupInternal]);

  useEffect(() => () => { if (isActiveRef.current) cleanupInternal(); }, [cleanupInternal]);

  return { devices, selectedDevice, setSelectedDevice, isActive, status, progress, start, stop, refreshDevices };
}

// ─── Fuzzy matching ──────────────────────────────────────────────────────────

function isMatch(docWord, spokenWord) {
  if (!docWord || !spokenWord) return false;
  if (docWord === spokenWord) return true;
  if (spokenWord.length >= 3 && docWord.startsWith(spokenWord)) return true;
  if (docWord.length >= 3 && spokenWord.startsWith(docWord)) return true;
  if (docWord.length >= 4 && spokenWord.length >= 4 && editDistance(docWord, spokenWord) <= 1) return true;
  return false;
}

function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
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
