import React from "react";
import GazeRecorder from "./GazeRecorder";
import QuestionScreen from "./QuestionScreen";
import psychometricQuestions from "./psychometric_questions.json";

export default function App() {
  const [showQuestions, setShowQuestions] = React.useState(false);
  const [recordAnswer, setRecordAnswer] = React.useState(null);
  const [psychometricActive, setPsychometricActive] = React.useState(false);
  const [psychometricResponses, setPsychometricResponses] = React.useState({});
  const psychometricStartTsRef = React.useRef(null);
  const [sessionId, setSessionId] = React.useState("");
  const [calibrationDone, setCalibrationDone] = React.useState(false);
  const [demographics, setDemographics] = React.useState({
    name: "",
    age: "",
    gender: "",
    educationLevel: "",
    lastGradeDivision: "",
  });
  const [demographicsSubmitted, setDemographicsSubmitted] = React.useState(false);
  const [resetSession, setResetSession] = React.useState(null);
  const [downloadGaze, setDownloadGaze] = React.useState(null);

  function csvEscape(v) {
    if (v == null) return "";
    const s = String(v);
    if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  function downloadCsv(filename, rows) {
    if (!rows.length) return;
    const headerSet = new Set();
    rows.forEach((r) => Object.keys(r).forEach((k) => headerSet.add(k)));
    const header = Array.from(headerSet);
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

  function startPsychometric() {
    setPsychometricResponses({});
    psychometricStartTsRef.current = performance.now();
    setPsychometricActive(true);
  }

  function stopPsychometric() {
    downloadPsychometricCsv();
    setPsychometricActive(false);
  }

  function downloadPsychometricCsv() {
    const base = psychometricStartTsRef.current;
    const rows = Object.values(psychometricResponses).map((r) => ({
      session_id: sessionId,
      ts_ms: base != null ? Math.round((r.ts ?? 0) - base) : "",
      question_id: r.question_id,
      answer_option_index: r.answer_option_index ?? "",
      answer_option_text: r.answer_option_text ?? "",
    }));
    downloadCsv("psychometric_responses.csv", rows);
  }

  function onPsychometricAnswer(questionId, optionIndex, optionText) {
    if (!psychometricActive) return;
    setPsychometricResponses((prev) => ({
      ...prev,
      [questionId]: {
        question_id: questionId,
        answer_option_index: optionIndex,
        answer_option_text: optionText,
        ts: performance.now(),
      },
    }));
  }

  function onDemographicChange(e) {
    const { name, value } = e.target;
    setDemographics((prev) => ({ ...prev, [name]: value }));
  }

  function submitDemographics() {
    downloadDemographicsCsv();
    setDemographicsSubmitted(true);
  }

  function downloadDemographicsCsv() {
    const rows = [
      {
        session_id: sessionId,
        name: demographics.name.trim(),
        age: demographics.age.trim(),
        gender: demographics.gender.trim(),
        education_level: demographics.educationLevel.trim(),
        last_grade_division: demographics.lastGradeDivision.trim(),
      },
    ];
    downloadCsv("demographics.csv", rows);
  }

  function handleQuestionRestart() {
    if (typeof resetSession === "function") resetSession();
    setDemographicsSubmitted(false);
    setDemographics({
      name: "",
      age: "",
      gender: "",
      educationLevel: "",
      lastGradeDivision: "",
    });
    setShowQuestions(false);
  }

  return (
    <div style={{ minHeight: "200vh", background: "#0b0b0b", paddingTop: 80 }}>
      <GazeRecorder
        sampleHz={5}
        clicksPerCalibrationPoint={6}
        onStartRecording={() => setShowQuestions(true)}
        onRegisterAnswerHandler={(handler) => setRecordAnswer(() => handler)}
        onPsychometricStart={startPsychometric}
        onPsychometricStop={stopPsychometric}
        psychometricActive={psychometricActive}
        onCalibrationDone={() => setCalibrationDone(true)}
        onRegisterSessionResetHandler={(handler) => setResetSession(() => handler)}
        onSessionIdChange={setSessionId}
        onRegisterDownloadHandler={(handler) => setDownloadGaze(() => handler)}
        startBlocked={!demographicsSubmitted}
        startBlockedReason={
          calibrationDone ? "Complete demographics before starting." : "Complete calibration first."
        }
        onRestartSession={handleQuestionRestart}
        onDownloadAllCsvs={() => {
          if (typeof downloadGaze === "function") downloadGaze();
          downloadPsychometricCsv();
          downloadDemographicsCsv();
        }}
      />
      {calibrationDone && !demographicsSubmitted && (
        <div style={{ padding: 24, maxWidth: 900, margin: "0 auto", color: "#fff" }}>
          <div style={{ color: "#aaa", marginBottom: 8 }}>Demographics</div>
          <div style={{ display: "grid", gap: 12 }}>
            <input
              name="name"
              value={demographics.name}
              onChange={onDemographicChange}
              placeholder="Name"
              style={demoInputStyle}
            />
            <input
              name="age"
              value={demographics.age}
              onChange={onDemographicChange}
              placeholder="Age"
              style={demoInputStyle}
            />
            <input
              name="gender"
              value={demographics.gender}
              onChange={onDemographicChange}
              placeholder="Gender"
              style={demoInputStyle}
            />
            <input
              name="educationLevel"
              value={demographics.educationLevel}
              onChange={onDemographicChange}
              placeholder="Education level"
              style={demoInputStyle}
            />
            <input
              name="lastGradeDivision"
              value={demographics.lastGradeDivision}
              onChange={onDemographicChange}
              placeholder="Division in the last grade"
              style={demoInputStyle}
            />
          </div>
          <button
            style={{ ...demoInputStyle, cursor: "pointer", marginTop: 12 }}
            onClick={submitDemographics}
            disabled={!demographics.name.trim() || !demographics.age.trim()}
          >
            Save Demographics
          </button>
        </div>
      )}

      {showQuestions && !psychometricActive && (
        <QuestionScreen onAnswer={recordAnswer} onRestart={handleQuestionRestart} />
      )}
      {psychometricActive && (
        <QuestionScreen
          title="Psychometric Test"
          questionsData={psychometricQuestions}
          onAnswer={onPsychometricAnswer}
          disableOptionDelay
        />
      )}
    </div>
  );
}

const demoInputStyle = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.18)",
  background: "rgba(255,255,255,0.08)",
  color: "#fff",
};
