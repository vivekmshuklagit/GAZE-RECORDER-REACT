// GazeRecorder.jsx
// - Starts WebGazer
// - Shows a 9-point calibration overlay (click each point N times)
// - Records gaze samples at a fixed Hz
// - Maps gaze -> content via elementFromPoint + walk-up to nearest [data-content-id]
// - Downloads CSV

import React, { useEffect, useMemo, useRef, useState } from "react";
import useAudioRecorder from "./useAudioRecorder";

function csvEscape(v) {
  if (v == null) return "";
  const s = String(v);
  if (/[,"\n]/.test(s)) return `"\${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv(filename, rows) {
  if (!rows.length) return;
  const header = Object.keys(rows[0]);
  const lines = [
    header.join(","),
    ...rows.map((r) => header.map((k) => csvEscape(r[k])).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadBlob(filename, blob) {
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function guessAudioExt(mimeType) {
  if (!mimeType) return "webm";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("wav")) return "wav";
  return "webm";
}

function findContentContainer(el, maxHops = 10) {
  let cur = el;
  for (let i = 0; i < maxHops && cur; i++) {
    if (cur instanceof HTMLElement && cur.dataset?.contentId) return cur;
    cur = cur.parentElement;
  }
  return null;
}

function getDomContextAtPoint(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el || !(el instanceof HTMLElement)) {
    return {
      content_id: "",
      content_type: "",
      element_tag: "",
      element_id: "",
      element_class: "",
      bbox_x: "",
      bbox_y: "",
      bbox_w: "",
      bbox_h: "",
    };
  }

  const contentEl = findContentContainer(el) || el;
  const r = contentEl.getBoundingClientRect();

  return {
    content_id: contentEl.dataset?.contentId || "",
    content_type: contentEl.dataset?.contentType || "",
    element_tag: el.tagName?.toLowerCase() || "",
    element_id: el.id || "",
    element_class: (el.className && String(el.className).slice(0, 120)) || "",
    bbox_x: Math.round(r.x),
    bbox_y: Math.round(r.y),
    bbox_w: Math.round(r.width),
    bbox_h: Math.round(r.height),
  };
}

function getActiveQuestionId() {
  const el = document.querySelector('[data-content-type="question_prompt"]');
  if (el instanceof HTMLElement) return el.dataset?.contentId || "";
  return "";
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function make9PointGrid(w, h) {
  const xs = [0.1, 0.5, 0.9].map((p) => Math.round(p * w));
  const ys = [0.1, 0.5, 0.9].map((p) => Math.round(p * h));
  const pts = [];
  for (const y of ys) for (const x of xs) pts.push([x, y]);
  return pts;
}

export default function GazeRecorder({ sampleHz = 5, clicksPerCalibrationPoint = 5 }) {
  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [status, setStatus] = useState("init");

  const [calibIdx, setCalibIdx] = useState(0);
  const [calibClicks, setCalibClicks] = useState(0);

  const samplesRef = useRef([]);
  const lastGazeRef = useRef(null);
  const sessionIdRef = useRef(crypto.randomUUID());
  const intervalRef = useRef(null);
  const audioSegmentIdRef = useRef(null);
  const audioRecordingRef = useRef(false);
  const lastAudioTsRef = useRef(null);
  const audioTickRef = useRef(null);

  const calibPts = useMemo(() => make9PointGrid(window.innerWidth, window.innerHeight), []);

  const recordingStartTsRef = useRef(null);
  const {
    isSupported: audioSupported,
    isRecording: audioRecording,
    recordings: audioRecordings,
    latestRecording,
    error: audioError,
    startRecording: startAudio,
    stopRecording: stopAudio,
    clearRecordings: clearAudioRecordings,
    clearError: clearAudioError,
  } = useAudioRecorder();

  useEffect(() => {
    audioRecordingRef.current = audioRecording;
    if (audioRecording) {
      const tick = () => {
        lastAudioTsRef.current = performance.now();
      };
      tick();
      audioTickRef.current = setInterval(tick, 50);
    } else {
      if (audioTickRef.current) clearInterval(audioTickRef.current);
      audioTickRef.current = null;
      lastAudioTsRef.current = null;
    }
    return () => {
      if (audioTickRef.current) clearInterval(audioTickRef.current);
      audioTickRef.current = null;
    };
  }, [audioRecording]);

  // Start WebGazer
  useEffect(() => {
    const wg = window.webgazer;
    if (!wg) {
      setStatus("WebGazer script not found (check index.html)");
      return;
    }

    let stopped = false;

    (async () => {
      try {
        setStatus("starting webgazer...");
        await wg.setRegression("ridge").saveDataAcrossSessions(false).begin();

        // Hide WebGazer debug overlays (red dot, boxes, preview) for clean data
        wg.showPredictionPoints(true)
          .showFaceOverlay(true)
          .showFaceFeedbackBox(true)
          .showVideoPreview(true);

        wg.setGazeListener((data, ts) => {
          if (stopped) return;
          if (!data || !isFinite(data.x) || !isFinite(data.y)) return;
          lastGazeRef.current = { x: data.x, y: data.y, ts: ts ?? performance.now() };
        });

        setReady(true);
        setStatus("ready");
      } catch (e) {
        setStatus(`failed to start: \${String(e?.message || e)}`);
      }
    })();

    return () => {
      stopped = true;
      try { wg.end(); } catch {}
    };
  }, []);

  // Fixed-rate sampling for recording
  useEffect(() => {
    if (!recording) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      return;
    }

    const periodMs = Math.max(10, Math.round(1000 / sampleHz));
    intervalRef.current = setInterval(() => {
      const g = lastGazeRef.current;
      if (!g) return;

      const x = clamp(g.x, 0, window.innerWidth);
      const y = clamp(g.y, 0, window.innerHeight);

      const ctx = getDomContextAtPoint(x, y);
      const questionId = getActiveQuestionId();

      samplesRef.current.push({
        session_id: sessionIdRef.current,
        //ts_ms: Math.round(performance.now()),
        ts_ms: Math.round(performance.now() - (recordingStartTsRef.current ?? 0)),
        gaze_x_px: Math.round(x),
        gaze_y_px: Math.round(y),
        gaze_x_norm: (x / window.innerWidth).toFixed(6),
        gaze_y_norm: (y / window.innerHeight).toFixed(6),
        scroll_y: Math.round(window.scrollY || 0),
        audio_recording: audioRecordingRef.current ? 1 : 0,
        audio_segment_id: audioRecordingRef.current ? audioSegmentIdRef.current || "" : "",
        audio_ts_ms:
          audioRecordingRef.current && lastAudioTsRef.current != null
            ? Math.round(lastAudioTsRef.current - (recordingStartTsRef.current ?? 0))
            : "",

        content_id: ctx.content_id,
        content_type: ctx.content_type,
        question_id: questionId,

        element_tag: ctx.element_tag,
        element_id: ctx.element_id,
        element_class: ctx.element_class,

        bbox_x: ctx.bbox_x,
        bbox_y: ctx.bbox_y,
        bbox_w: ctx.bbox_w,
        bbox_h: ctx.bbox_h,
      });
    }, periodMs);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [recording, sampleHz]);

  function startCalibration() {
    // ✅ hide camera preview right when calibration starts
    try {
      window.webgazer?.showVideoPreview(false);
      window.webgazer?.showFaceOverlay(false);
      window.webgazer?.showPredictionPoints(false);
    } catch {}
    setCalibrating(true);
    setCalibIdx(0);
    setCalibClicks(0);
    setStatus("calibrating");
  }

  function onCalibDotClick(x, y) {
    try {
      window.webgazer.recordScreenPosition(x, y, "click");
    } catch {}

    const nextClicks = calibClicks + 1;
    setCalibClicks(nextClicks);

    if (nextClicks >= clicksPerCalibrationPoint) {
      const nextIdx = calibIdx + 1;
      setCalibIdx(nextIdx);
      setCalibClicks(0);

      if (nextIdx >= calibPts.length) {
        setCalibrating(false);
        setStatus("calibration done");
      }
    }
  }

  function startRecording() {
    samplesRef.current = [];
    sessionIdRef.current = crypto.randomUUID();
    recordingStartTsRef.current = performance.now();
    clearAudioRecordings();
    audioSegmentIdRef.current = null;
    setRecording(true);
    setStatus("recording");
  }

  function stopRecording() {
    setRecording(false);
    setStatus("stopped");
    if (audioRecordingRef.current) {
      stopAudio();
    }
    audioSegmentIdRef.current = null;
  }

  function download() {
    const rows = samplesRef.current;
    if (!rows.length) return;
    downloadCsv(`gaze_session_${sessionIdRef.current}.csv`, rows);
  }

  async function startAudioRecording() {
    if (!recording) return;
    if (!audioSupported) return;
    const questionId = getActiveQuestionId();
    const id = crypto.randomUUID();
    const startedId = await startAudio({
      id,
      meta: { question_id: questionId, session_id: sessionIdRef.current },
    });
    if (startedId) {
      audioSegmentIdRef.current = startedId;
    }
  }

  function stopAudioRecording() {
    stopAudio();
    audioSegmentIdRef.current = null;
  }

  function downloadLatestAudio() {
    if (!latestRecording) return;
    const ext = guessAudioExt(latestRecording.mimeType);
    downloadBlob(`audio_segment_${latestRecording.id}.${ext}`, latestRecording.blob);
  }

  function downloadAudioLog() {
    if (!audioRecordings.length) return;
    const base = recordingStartTsRef.current;
    const rows = audioRecordings.map((rec) => ({
      session_id: rec.meta?.session_id || sessionIdRef.current,
      audio_segment_id: rec.id,
      question_id: rec.meta?.question_id || "",
      start_ts_ms: Math.round((rec.startTs ?? 0) - (base ?? 0)),
      stop_ts_ms: Math.round((rec.stopTs ?? 0) - (base ?? 0)),
      duration_ms: Math.round(rec.durationMs ?? 0),
      mime_type: rec.mimeType || "",
      filename: `audio_segment_${rec.id}.${guessAudioExt(rec.mimeType)}`,
    }));
    downloadCsv(`audio_segments_${sessionIdRef.current}.csv`, rows);
  }

  return (
    <>
      <div style={barStyle}>
        <div style={{ opacity: 0.9 }}>
          Status: <b>{status}</b>
        </div>

        <button style={btnStyle} onClick={startCalibration} disabled={!ready || recording}>
          Calibrate
        </button>

        <button style={btnStyle} onClick={startRecording} disabled={!ready || calibrating || recording}>
          Start
        </button>

        <button style={btnStyle} onClick={stopRecording} disabled={!recording}>
          Stop
        </button>

        <button
          style={btnStyle}
          onClick={startAudioRecording}
          disabled={!recording || calibrating || audioRecording || !audioSupported}
          title={!audioSupported ? "Audio not supported in this browser" : ""}
        >
          Audio Start
        </button>

        <button style={btnStyle} onClick={stopAudioRecording} disabled={!audioRecording}>
          Audio Stop
        </button>

        <button style={btnStyle} onClick={downloadLatestAudio} disabled={!latestRecording}>
          Download Audio
        </button>

        <button style={btnStyle} onClick={downloadAudioLog} disabled={!audioRecordings.length}>
          Audio Log CSV
        </button>

        <button style={btnStyle} onClick={download} disabled={recording || samplesRef.current.length === 0}>
          Download CSV
        </button>

        <div style={{ opacity: 0.8, fontSize: 12 }}>
          Samples: <b>{samplesRef.current.length}</b> • Hz: <b>{sampleHz}</b>
        </div>

        <div style={{ opacity: 0.8, fontSize: 12 }}>
          Audio: <b>{audioRecording ? "recording" : "idle"}</b> • Clips:{" "}
          <b>{audioRecordings.length}</b>
        </div>
      </div>

      {audioError && (
        <div style={{ ...barStyle, top: 48, background: "rgba(120,0,0,0.75)" }}>
          Audio error: <b>{audioError}</b>
          <button style={btnStyle} onClick={clearAudioError}>
            Dismiss
          </button>
        </div>
      )}

      {calibrating && (
        <div style={overlayStyle}>
          <div style={overlayTextStyle}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Calibration</div>
            <div style={{ fontSize: 13, opacity: 0.9, marginTop: 6 }}>
              Look at the dot and click it <b>{clicksPerCalibrationPoint}</b> times.
              <div style={{ marginTop: 6 }}>
                Point <b>{Math.min(calibIdx + 1, calibPts.length)}</b>/{calibPts.length} • Clicks{" "}
                <b>{calibClicks}</b>/{clicksPerCalibrationPoint}
              </div>
            </div>
            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
              Tip: keep your head steady; consistent lighting helps.
            </div>
          </div>

          {calibIdx < calibPts.length && (
            <CalibrationDot x={calibPts[calibIdx][0]} y={calibPts[calibIdx][1]} onClick={onCalibDotClick} />
          )}
        </div>
      )}
    </>
  );
}

function CalibrationDot({ x, y, onClick }) {
  return (
    <div
      onClick={() => onClick?.(x, y)}
      style={{
        position: "fixed",
        left: x - 12,
        top: y - 12,
        width: 24,
        height: 24,
        borderRadius: 999,
        background: "rgba(255,255,255,0.95)",
        boxShadow: "0 0 0 7px rgba(255,255,255,0.18)",
        cursor: "pointer",
      }}
      title="Click"
    />
  );
}

const barStyle = {
  position: "fixed",
  top: 8,
  left: 8,
  right: 8,
  zIndex: 10000,
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 8px",
  borderRadius: 12,
  background: "rgba(0,0,0,0.55)",
  border: "1px solid rgba(255,255,255,0.12)",
  backdropFilter: "blur(6px)",
  color: "white",
  fontFamily: "system-ui",
  fontSize: 12,
  lineHeight: 1.1, 
};

const overlayStyle = {
  position: "fixed",
  inset: 0,
  zIndex: 9999,
  background: "rgba(0,0,0,0.78)",
};

const overlayTextStyle = {
  position: "fixed",
  top: 96,
  left: 16,
  color: "white",
  fontFamily: "system-ui",
};

const btnStyle = {
  fontSize: 12,
  padding: "6px 8px",
  borderRadius: 9,
  border: "1px solid rgba(255,255,255,0.18)",
  background: "rgba(255,255,255,0.10)",
  color: "white",
  cursor: "pointer",
};
