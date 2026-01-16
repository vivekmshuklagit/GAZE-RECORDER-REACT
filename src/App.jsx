import React from "react";
import GazeRecorder from "./GazeRecorder";
import QuestionScreen from "./QuestionScreen";

export default function App() {
  return (
    <div style={{ minHeight: "200vh", background: "#0b0b0b", paddingTop: 80 }}>
      <GazeRecorder sampleHz={5} clicksPerCalibrationPoint={6} />
      <QuestionScreen />
    </div>
  );
}

