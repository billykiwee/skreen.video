const {
  ipcRenderer,
  app,
  shell,
  electron,
  desktopCapturer,
} = require("electron");
const { writeFile } = require("fs");

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

const closeAppBtn = document.querySelector("#close-app");

if (closeAppBtn) {
  closeAppBtn.onclick = () => ipcRenderer.send("close-app");
}

// Event Listeners
if (startBtn) {
  startBtn.onclick = (e) => {
    startRecording();

    document.querySelector(".settings").style.display = "none";
    document.querySelector(".recording").style.display = "flex";

    ipcRenderer.send("update-timer");

    ipcRenderer.send("edit-window", {
      width: 68,
      height: 140,
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

      ipcRenderer.send("stop-timer");
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
      audio: true,
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

async function getScreenSources() {
  try {
    const inputSources = await ipcRenderer.invoke("getSources");
    return inputSources;
  } catch (error) {
    console.error("Error fetching sources:", error);
    return [];
  }
}

async function startRecording() {
  try {
    // Ensure screenSelect and audioSelect have valid selections
    if (!screenSelect.options.length || !audioSelect.options.length) {
      throw new Error("Please select both screen and audio sources.");
    }

    const screenId = screenSelect.options[screenSelect.selectedIndex].value;
    const audioId = audioSelect.options[audioSelect.selectedIndex].value;

    if (!screenId || !audioId) {
      throw new Error("Invalid screen or audio source selected.");
    }

    const IS_MACOS =
      (await ipcRenderer.invoke("getOperatingSystem")) === "darwin";

    const screenConstraints = {
      video: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: screenId,
          maxWidth: 1920,
          maxHeight: 1080,
          maxFrameRate: 30,
        },
      },
      audio: false,
    };

    const selectedAudioConstraints = {
      audio: {
        deviceId: { exact: audioId },
        sampleRate: { ideal: 48_000 }, // Augmenter à 96000 Hz pour une meilleure qualité
        sampleSize: { ideal: 16 },
      },
    };

    // Get screen stream
    const screenStream = await navigator.mediaDevices.getUserMedia(
      screenConstraints
    );

    // Get user selected audio stream
    const selectedAudioStream = await navigator.mediaDevices.getUserMedia(
      selectedAudioConstraints
    );

    // Combine the screen and audio streams
    const combinedStream = new MediaStream([
      ...screenStream.getTracks(),
      ...selectedAudioStream.getTracks(),
    ]);

    // Display the preview in a video element
    videoElement.srcObject = combinedStream;
    await videoElement.play();

    // Start recording
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
    if (canceled) {
      ipcRenderer.send("update-timer");
      return;
    }

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

    cameraSelected.innerHTML = reduceString(cameraSelect[0].text, 16);

    constraints.video = { deviceId: { exact: cameraSelect.value } };

    cameraSelect.onchange = () => {
      constraints.video.deviceId.exact = cameraSelect.value;

      startCameraStream(constraints);
      ipcRenderer.send("start-camera", constraints);

      const selectedOption = cameraSelect.options[cameraSelect.selectedIndex];

      cameraSelected.innerHTML = reduceString(selectedOption.text, 16);
    };

    constraints.video.deviceId.exact = cameraSelect.value;

    startCameraStream(constraints);
    ipcRenderer.send("start-camera", constraints);
  } catch (error) {
    console.error("Error accessing camera:", error);
  }
}

startCamera();

async function startCameraStream(constraints) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);

    const cameraPreview = document.querySelector("#cameraPreview");

    console.log(cameraPreview);

    if (cameraPreview) {
      cameraPreview.srcObject = stream;
    } else {
      console.error("Camera preview element not found.");
    }
  } catch (error) {
    console.error("Error accessing camera:", error);
  }
}
