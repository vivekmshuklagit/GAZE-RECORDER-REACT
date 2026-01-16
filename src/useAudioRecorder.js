import { useCallback, useEffect, useRef, useState } from "react";

function getAudioMimeType(recorder) {
  if (recorder?.mimeType) return recorder.mimeType;
  if (typeof MediaRecorder !== "undefined") {
    if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
    if (MediaRecorder.isTypeSupported("audio/ogg")) return "audio/ogg";
    if (MediaRecorder.isTypeSupported("audio/wav")) return "audio/wav";
  }
  return "audio/webm";
}

export default function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordings, setRecordings] = useState([]);
  const [error, setError] = useState("");

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const pendingMetaRef = useRef(null);
  const pendingIdRef = useRef(null);
  const startTsRef = useRef(null);

  const isSupported = typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  const ensureStream = useCallback(async () => {
    if (streamRef.current) return streamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    return stream;
  }, []);

  const startRecording = useCallback(
    async ({ id, meta } = {}) => {
      if (!isSupported) {
        setError("Audio recording is not supported in this browser.");
        return null;
      }
      if (isRecording) return pendingIdRef.current;
      setError("");

      const recordingId = id || crypto.randomUUID();

      try {
        const stream = await ensureStream();
        const recorder = new MediaRecorder(stream);
        const startTs = performance.now();

        pendingIdRef.current = recordingId;
        pendingMetaRef.current = meta || null;
        startTsRef.current = startTs;
        chunksRef.current = [];

        recorder.ondataavailable = (evt) => {
          if (evt.data && evt.data.size > 0) {
            chunksRef.current.push(evt.data);
          }
        };

        recorder.onstop = () => {
          const stopTs = performance.now();
          const blob = new Blob(chunksRef.current, { type: getAudioMimeType(recorder) });
          const url = URL.createObjectURL(blob);
          const durationMs = stopTs - (startTsRef.current ?? stopTs);

          setRecordings((prev) => [
            ...prev,
            {
              id: pendingIdRef.current || recordingId,
              startTs: startTsRef.current ?? startTs,
              stopTs,
              durationMs,
              mimeType: blob.type || getAudioMimeType(recorder),
              blob,
              url,
              meta: pendingMetaRef.current,
            },
          ]);

          pendingIdRef.current = null;
          pendingMetaRef.current = null;
          startTsRef.current = null;
          chunksRef.current = [];
          setIsRecording(false);
        };

        recorder.onerror = (evt) => {
          const message = evt?.error?.message || "Audio recorder error.";
          setError(message);
          setIsRecording(false);
        };

        recorder.start();
        mediaRecorderRef.current = recorder;
        setIsRecording(true);
        return recordingId;
      } catch (e) {
        setError(String(e?.message || e));
        setIsRecording(false);
        return null;
      }
    },
    [ensureStream, isRecording, isSupported]
  );

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    if (recorder.state === "recording") {
      recorder.stop();
    }
  }, []);

  const clearRecordings = useCallback(() => {
    setRecordings((prev) => {
      prev.forEach((rec) => {
        if (rec?.url) URL.revokeObjectURL(rec.url);
      });
      return [];
    });
  }, []);

  const clearError = useCallback(() => {
    setError("");
  }, []);

  useEffect(() => {
    return () => {
      try {
        if (mediaRecorderRef.current?.state === "recording") {
          mediaRecorderRef.current.stop();
        }
      } catch {}

      clearRecordings();

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [clearRecordings]);

  const latestRecording = recordings.length ? recordings[recordings.length - 1] : null;

  return {
    isSupported,
    isRecording,
    recordings,
    latestRecording,
    error,
    startRecording,
    stopRecording,
    clearRecordings,
    clearError,
  };
}
