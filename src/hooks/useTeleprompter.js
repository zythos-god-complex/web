import { useState, useRef, useCallback, useEffect } from 'react';

/** Extract lines (paragraphs/blocks) with their text and word lists */
function extractLines(doc) {
  const lines = [];
  doc.forEach((node, offset) => {
    const text = node.textContent.trim();
    if (!text) return; // skip empty lines
    const words = text
      .split(/\s+/)
      .map((w) => w.toLowerCase().replace(/[^a-z0-9]/gi, ''))
      .filter((w) => w.length > 0);
    if (words.length === 0) return;
    lines.push({
      from: offset,
      to: offset + node.nodeSize,
      text,
      words,
    });
  });
  return lines;
}

/**
 * TELEPROMPTER V3 — The "Read Anything, Anywhere" approach.
 * 
 * Logic:
 * - No green highlights.
 * - Constantly monitors the LIVE document.
 * - Tracks pointers for ALL lines simultaneously.
 * - Whichever line is sequentially spoken and completed gets deleted,
 *   regardless of where it is in the document or when it was added.
 */
export default function useTeleprompter(editor) {
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState('');

  const isActiveRef = useRef(false);
  const wsRef = useRef(null);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);

  // Map to track progress on every line in the document simultaneously
  // Key: line text, Value: sequential pointer index
  const linePointersRef = useRef(new Map());

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

  // ─── Process spoken words against ALL lines ─────────────────────────────
  const processResult = useCallback((dgWords) => {
    if (!editor) return;

    let currentLines = extractLines(editor.state.doc);

    for (const w of dgWords) {
      const spokenNorm = w.toLowerCase().replace(/[^a-z0-9]/gi, '');
      if (!spokenNorm) continue;

      let lineCompleted = null;

      // Try to advance the pointer for EVERY line
      for (const line of currentLines) {
        let ptr = linePointersRef.current.get(line.text) || 0;
        let matched = false;

        // Lookahead allows skipping minor words/noise
        const lookahead = Math.min(ptr + 6, line.words.length);
        for (let i = ptr; i < lookahead; i++) {
          if (isMatch(line.words[i], spokenNorm)) {
            ptr = i + 1; // Advance past matched word
            matched = true;
            break;
          }
        }

        if (matched) {
          linePointersRef.current.set(line.text, ptr);
          
          // Check if this line is fully read
          const slack = line.words.length <= 4 ? 0 : 1;
          if (line.words.length - ptr <= slack) {
            lineCompleted = line;
            break; // Stop checking other lines for this word
          }
        }
      }

      // If a line was completely read, delete it!
      if (lineCompleted) {
        try {
          editor.chain().deleteRange({ from: lineCompleted.from, to: lineCompleted.to }).run();
          linePointersRef.current.delete(lineCompleted.text);
          // Re-extract lines immediately so subsequent words process against new positions
          currentLines = extractLines(editor.state.doc);
        } catch (_) {}
      }
    }
  }, [editor]);

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
        if (!data.is_final) return;

        const words = alt.words
          ? alt.words.map((w) => w.word)
          : alt.transcript.trim().split(/\s+/);

        processResult(words);
      } catch (_) {}
    };

    ws.onerror = () => setStatus('reconnecting');

    ws.onclose = () => {
      if (isActiveRef.current) {
        setStatus('reconnecting');
        if (recorderRef.current) {
          try { if (recorderRef.current.state !== 'inactive') recorderRef.current.stop(); } catch (_) {}
          recorderRef.current = null;
        }
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

    try {
      const constraints = selectedDevice
        ? { audio: { deviceId: { exact: selectedDevice } } }
        : { audio: true };
      streamRef.current = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (_) {
      setStatus('error');
      return;
    }

    linePointersRef.current.clear();
    isActiveRef.current = true;
    setIsActive(true);

    connectDeepgram();
  }, [editor, selectedDevice, connectDeepgram]);

  // ─── Stop ───────────────────────────────────────────────────────────────
  const cleanupInternal = useCallback(() => {
    isActiveRef.current = false;
    setIsActive(false);
    setStatus('idle');
    setProgress('');
    linePointersRef.current.clear();

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
  }, []);

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
