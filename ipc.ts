import { Logger } from "@rikka/API/Utils";
import { clearCache, DevToolsClose, DevToolsOpen } from "@rikka/modules/util";
import { BrowserWindow, ipcMain } from "electron";
import { existsSync } from "fs";
import { readFile } from "fs/promises";
import {
  dirname, join, posix, relative, resolve, sep,
} from "path";
import { renderSync } from "sass";
import { vizalityPath } from "./constants/vz";
import { vzStore } from "./vzStore";

function getHistory(evt: Electron.IpcMainInvokeEvent) {
  return (evt as any).sender.history;
}

function getPreload() {
  return join(vizalityPath, "injector", "preload.js");
}

function compileSass(_: any, file: string) {
  return new Promise((res, reject) => {
    readFile(file, 'utf8').then((rawScss) => {
      try {
        const relativePath = relative(file, join(vzStore.workingDirectory, 'vizality', 'renderer', 'src', 'styles', 'utils'));
        const absolutePath = resolve(join(file, relativePath));
        const fixedScss = rawScss.replace('@vizality', absolutePath.split(sep).join(posix.sep));
        const result = renderSync({
          data: fixedScss,
          importer: (url: string, prev: string) => {
            if (url === '@vizality') {
              url = url.replace('@vizality', absolutePath.split(sep).join(posix.sep));
            }
            url = url.replace('file:///', '');
            if (existsSync(url)) {
              return {
                file: url,
              };
            }
            const prevFile = prev === 'stdin'
              ? file
              : prev.replace(/https?:\/\/(?:[a-z]+\.)?discord(?:app)?\.com/i, '');
            return {
              file: join(dirname(decodeURI(prevFile)), url).split(sep).join(posix.sep),
            };
          },
        });
        if (result) {
          return res(result.css.toString());
        }
      } catch (err) {
        return reject(err);
      }
    });
  });
}

// eslint-disable-next-line import/prefer-default-export
export function addIPCHandles() {
  if (!ipcMain) {
    Logger.warn("IPC Main not available, skipping IPC handles");
    throw new Error("Don't fucking call this outside of the main process");
  }

  ipcMain.handle("VIZALITY_COMPILE_SASS", compileSass);
  ipcMain.handle("VIZALITY_WINDOW_IS_MAXIMIZED", (e) => BrowserWindow.fromWebContents(e.sender)?.isMaximized());
  ipcMain.handle("VIZALITY_GET_HISTORY", getHistory);
  ipcMain.handle("VIZALITY_CLEAR_CACHE", clearCache);
  ipcMain.handle("VIZALITY_GET_PRELOAD", getPreload);
  ipcMain.handle('VIZALITY_OPEN_DEVTOOLS', DevToolsOpen);
  ipcMain.handle('VIZALITY_CLOSE_DEVTOOLS', DevToolsClose);
}
