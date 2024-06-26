import {
  app,
  BrowserWindow,
  dialog,
  desktopCapturer,
  ipcMain,
  session,
} from "electron";
const { screen } = require("electron");

if (require("electron-squirrel-startup")) {
  app.quit();
}

let mainWindow;
let timerInterval;

const createWindow = () => {
  let config = {
    width: 280,
    height: 380,
    x: 2000,
    y: 0,
    webPreferences: {
      preload: "src/index.html",
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,

      permissions: {
        audioCapture: true,
      },
    },

    transparent: true,

    visibleOnAllWorkspaces: true,
    resizable: false,
    alwaysOnTop: true,
    fullscreenable: true,
    movable: true,
    skipTaskbar: true,
    frame: true,
    transparent: true,
    hasShadow: false,
  };

  mainWindow = new BrowserWindow(config);

  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  mainWindow.webContents.openDevTools();

  ipcMain.on("close-window", () => {
    mainWindow.close();
  });

  ipcMain.on("start-recording", () => {
    mainWindow.close();
  });

  ipcMain.on("update-timer", (event, time) => {
    let hours = 0;
    let minutes = 0;
    let seconds = 0;

    timerInterval = setInterval(() => {
      // Formatage des heures, minutes et secondes pour qu'ils aient toujours deux chiffres
      // let formattedHours = hours.toString().padStart(2, "0");
      let formattedMinutes = minutes.toString().padStart(2, "0");
      let formattedSeconds = seconds.toString().padStart(2, "0");

      seconds++;

      if (seconds === 60) {
        seconds = 0;
        minutes++;
      }

      if (minutes === 60) {
        minutes = 0;
        hours++;
      }

      if (hours === 24) {
        hours = 0;
      }

      mainWindow.webContents.executeJavaScript(`
            document.querySelector("#timer").innerHTML = "${`${formattedMinutes}:${formattedSeconds}`}";

        `);
    }, 1000);

    return timerInterval;
  });

  ipcMain.on("stop-timer", (event, time) => {
    clearInterval(timerInterval);
  });

  ipcMain.on("edit-window", (event, config) => {
    mainWindow.setSize(config.width, config.height);
    mainWindow.setPosition(config.x, config.y);
    mainWindow.setMenuBarVisibility(false);
    mainWindow.setSkipTaskbar(config.skipTaskbar);
  });

  mainWindow.setAlwaysOnTop(true, "screen-saver", 1);
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  mainWindow.webContents.reloadIgnoringCache();
};

let cameraWindow;
function createCameraWindow() {
  const config = {
    width: 320,
    height: 320,
    webPreferences: {
      preload: "src/camera.html",
      contextIsolation: true,
      audio: false,
      nodeIntegration: true,
    },

    visibleOnAllWorkspaces: true,
    resizable: false,
    alwaysOnTop: true,
    fullscreenable: true,
    movable: true,
    skipTaskbar: true,
    frame: true,
    transparent: true,
    hasShadow: true,

    x: -200,
    y: 1000,
  };

  cameraWindow = new BrowserWindow(config);

  cameraWindow.loadFile("src/camera.html");
  ///  cameraWindow.webContents.openDevTools();

  cameraWindow.setAlwaysOnTop(true, "screen-saver", 1);
  cameraWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  cameraWindow.on("dbl-click", (event, config) => {
    cameraWindow.setSize(config.width, config.height);
  });

  screen.on("display-metrics-changed", () => {
    cameraWindow.setBounds(config);
  });

  ipcMain.on("start-camera", (event, constraints) => {
    cameraWindow.webContents.send("start-camera", constraints);
  });
}

ipcMain.on("record-stop-request", () => {
  // Envoyer un message au processus renderer pour lui dire d'arrêter l'enregistrement
  actions.webContents.send("stop-record");

  // Arrêter l'intervalle de mise à jour de l'élément #timer (si nécessaire)
  clearInterval(timerInterval);

  app.quit();
});

ipcMain.on("request-camera-stream", async (event) => {
  const cameraStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: false,
  });

  event.sender.send("camera-stream", cameraStream);
});

app.on("ready", () => {
  createCameraWindow();
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.handle("getSources", async () => {
  return await desktopCapturer.getSources({
    types: ["window", "screen", "audio"],
  });
});

ipcMain.handle("getCameraSources", async () => {
  const cameraSources = await cameraStream.getSources();
  return cameraSources;
});

ipcMain.handle("showSaveDialog", async () => {
  return await dialog.showSaveDialog({
    buttonLabel: "Save video",
    defaultPath: `vid-${Date.now()}.webm`,
  });
});

ipcMain.handle("getOperatingSystem", () => {
  return process.platform;
});

ipcMain.on("close-app", () => {
  if (mainWindow) {
    mainWindow.close();
  }
  app.quit();
});

///////
