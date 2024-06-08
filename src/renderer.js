import { ipcRenderer, app, shell } from "electron";
import { writeFile } from "fs";

import "./index.css";

let mediaRecorder;
let recordedChunks = [];

// Elements
const videoElement = document.querySelector("video");
const startBtn = document.getElementById("startBtn");

const videoSelectBtn = document.getElementById("videoSelectBtn");
const screenSelect = document.getElementById("screen-select");

const audioSelect = document.getElementById("audioSelect");
const micSelected = document.getElementById("mic-selected");

const stopBtn = document.getElementById("stopBtn");

// Event Listeners
if (startBtn) {
  startBtn.onclick = (e) => {
    startRecording();

    document.querySelector(".settings").style.display = "none";
    document.querySelector(".recording").style.display = "flex";

    ipcRenderer.send("update-timer");

    ipcRenderer.send("edit-window", {
      width: 80,
      height: 200,
      skipTaskbar: true,
      x: 0,
      y: 500,
    });
  };
}

if (videoSelectBtn) {
  getScreenSource();
}

if (stopBtn) {
  stopBtn.onclick = (e) => {
    if (mediaRecorder) {
      mediaRecorder.stop();
    }
  };
}

async function getScreenSource() {
  try {
    const inputSources = await ipcRenderer.invoke("getSources");

    inputSources.forEach((source) => {
      const element = document.createElement("option");
      element.value = source.id;
      element.innerHTML = source.name;

      screenSelect.appendChild(element);
      document.querySelector("#screen-selected").textContent = reduceString(
        inputSources[0].name,
        22
      );
    });

    screenSelect.onchange = () => {
      const selectedOption = screenSelect.options[screenSelect.selectedIndex];
      document.querySelector("#screen-selected").textContent = reduceString(
        selectedOption.text,
        22
      );
    };
  } catch (error) {
    console.error("Error fetching video sources: ", error);
  }
}

async function getCameraSource() {
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false,
    });
  } catch (error) {
    console.error("Error getting camera stream: ", error);
  }
}

async function getAudioSource() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const audioDevices = devices.filter((device) => device.kind === "audioinput");

  audioDevices.forEach((device) => {
    const option = document.createElement("option");
    option.value = device.deviceId;
    option.text =
      device.label || `Microphone ${audioSelect.options.length + 1}`;
    audioSelect.appendChild(option);
  });
  micSelected.innerHTML = reduceString(audioSelect[0].text, 22);

  audioSelect.onchange = () => {
    const selectedOption = audioSelect.options[audioSelect.selectedIndex];
    micSelected.innerHTML = reduceString(selectedOption.text, 22);
  };
}

const reduceString = (value, maxLength) =>
  value.length > maxLength ? value.slice(0, maxLength) + "..." : value;

getAudioSource();

async function startRecording() {
  try {
    const screenId = screenSelect.options[screenSelect.selectedIndex].value;
    const audioId = audioSelect.options[audioSelect.selectedIndex].value;

    const IS_MACOS =
      (await ipcRenderer.invoke("getOperatingSystem")) === "darwin";

    // Contraintes pour l'audio sélectionné par l'utilisateur
    const selectedAudioConstraints = {
      audio: {
        deviceId: { exact: audioId },
        channelCount: { ideal: 2 },
        sampleRate: { ideal: 44100 },
        sampleSize: { ideal: 16 },
      },
    };

    // Contraintes pour la caméra
    const cameraConstraints = {
      video: {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30 },
      },
      audio: false,
    };

    const screenConstraints = {
      audio: IS_MACOS ? false : selectedAudioConstraints.audio, // Utilise les contraintes audio sélectionnées par l'utilisateur, sauf si c'est macOS
      video: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: screenId,
          maxWidth: 1920,
          maxHeight: 1080,
          maxFrameRate: 30,
        },
      },
    };

    // Créer le flux audio sélectionné par l'utilisateur
    const selectedAudioStream = await navigator.mediaDevices.getUserMedia(
      selectedAudioConstraints
    );

    // Créer le flux de l'écran capturé
    const screenStream = await navigator.mediaDevices.getUserMedia(
      screenConstraints
    );

    // Créer le flux de la caméra
    const cameraStream = await getCameraSource(cameraConstraints);

    // Créer le flux audio de l'utilisateur
    const audioStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: audioId,
      },
    });

    // Combiner les flux
    const combinedStream = new MediaStream([
      ...screenStream.getTracks(),
      ...cameraStream.getTracks(),
      ...audioStream.getTracks(),
    ]);

    // Afficher la prévisualisation dans un élément vidéo
    videoElement.srcObject = combinedStream;
    await videoElement.play();

    // Démarrer l'enregistrement
    mediaRecorder = new MediaRecorder(combinedStream, {
      mimeType: "video/webm; codecs=vp9",
    });
    mediaRecorder.ondataavailable = onDataAvailable;
    mediaRecorder.onstop = stopRecording;
    mediaRecorder.start();
  } catch (error) {
    console.error("Error starting recording: ", error);
  }
}

function onDataAvailable(e) {
  recordedChunks.push(e.data);
}

async function stopRecording() {
  try {
    videoElement.srcObject = null;

    const blob = new Blob(recordedChunks, {
      type: "video/webm; codecs=vp9",
    });

    const buffer = Buffer.from(await blob.arrayBuffer());
    recordedChunks = [];

    const { canceled, filePath } = await ipcRenderer.invoke("showSaveDialog");
    if (canceled) return;

    if (filePath) {
      writeFile(filePath, buffer, async () => {
        console.log("video saved successfully!");

        await shell.openExternal(`file://${filePath}`);

        ipcRenderer.send("close-app");
      });
    }
  } catch (error) {
    console.error("Error stopping recording: ", error);
  }
}

async function startCamera() {
  const constraints = {
    audio: false,
    video: {
      width: { ideal: 3840 },
      height: { ideal: 2160 },
      frameRate: { ideal: 30 },
    },
  };
  const cameraSelect = document.getElementById("cameraSelect");

  const cameraSelected = document.querySelector("#camera-selected");

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(
      (device) => device.kind === "videoinput"
    );

    videoDevices.forEach((device) => {
      const option = document.createElement("option");
      option.value = device.deviceId;
      option.text = device.label || `Camera ${cameraSelect.options.length + 1}`;
      cameraSelect.appendChild(option);
    });

    cameraSelected.innerHTML = reduceString(cameraSelect[0].text, 22);

    constraints.video = { deviceId: { exact: cameraSelect.value } };

    cameraSelect.onchange = () => {
      constraints.video.deviceId.exact = cameraSelect.value;
      ipcRenderer.send("start-camera", constraints);
      //startCameraStream(constraints);
      //ipcRenderer.send("start-camera", constraints);

      const selectedOption = cameraSelect.options[cameraSelect.selectedIndex];

      micSelected.innerHTML = reduceString(selectedOption.text, 22);
    };

    constraints.video.deviceId.exact = cameraSelect.value;
    ipcRenderer.send("start-camera", constraints);
    // startCameraStream(constraints);
    //ipcRenderer.send("start-camera", constraints);
  } catch (error) {
    console.error("Error accessing camera:", error);
  }
}
startCamera();

async function startCameraStream(constraints) {
  try {
    /*     const stream = await navigator.mediaDevices.getUserMedia(constraints);

    const cameraPreview = document.querySelector("#cameraPreview");

    if (cameraPreview) {
      cameraPreview.srcObject = stream;
    } else {
      console.error("Camera preview element not found.");
    } */
  } catch (error) {
    console.error("Error accessing camera:", error);
  }
}
