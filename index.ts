import RikkaPlugin from "@rikka/Common/entities/Plugin";
import { exec } from "child_process";
import {
  copyFileSync, existsSync, mkdirSync, symlinkSync,
} from "fs";
import { join, normalize, sep } from "path";
import { registerURLCallback } from "@rikka/modules/browserWindowtils";
import electron from "electron";
import StyleManager from "@rikka/managers/StyleManager";
import { addIPCHandles } from "./ipc";
import manifest from "./manifest.json";
import { vizalityPath } from "./constants";

export default class vzCompat extends RikkaPlugin {
  private vzPath: string;

  constructor() {
    super();

    this.vzPath = vizalityPath;
  }

  preInject() {
    registerURLCallback((url, opts, window, originalLoadUrl) => {
      if ((/^https:\/\/discord(app)?\.com\/vizality/).test(url)) {
        (window as any).webContents.vizalityOriginalUrl = url;
        return originalLoadUrl("https://discordapp.com/app", opts);
      }
    }, /^https:\/\/discord(app)?\.com\/vizality/);

    this.downloadVizality();
    /**
        * Register our protocol sceheme with elevated privileges.
        */
    electron.protocol.registerSchemesAsPrivileged([
      {
        scheme: "vizality",
        privileges: {
          supportFetchAPI: true,
          corsEnabled: true,
          standard: true,
          secure: true,
        },
      }]);

    electron.app.once("ready", () => {
      const urlRegex = /^(https:\/\/(?:canary|ptb)?.?discord(app)?\.com)\/vizality/;
      electron.session.defaultSession.webRequest.onBeforeRequest((details, done) => {
        if (urlRegex.test(details.url)) {
          /**
          * It should get restored to the Vizality URL later.
          */
          // @ts-ignore
          done({ redirectURL: `${details.url.match(urlRegex)[1]}/app` });
        } else {
          done({});
        }
      });

      const vzProtocolHandler = (request: any, callback: Function) => {
        /**
                 * Seems to be a security thing to limit users from accessing things they shouldn't be.
                 * We're splitting by ? because protocol file URLs can't seem to deal with queries.
                 * https://security.stackexchange.com/a/123723
                 */
        const [url] = normalize(request.url.replace("vizality://", "")).replace(/^(\.\.(\/|\\|$))+/, "").split("?");
        /**
                 * Try to get the type of the asset.
                 */
        const type = url?.split(sep)[0];
        /**
                 * Remove the type to determine the file path.
                 */
        const path = url?.replace(`${type}${sep}`, "");

        if (type === "assets") {
          return callback({ path: join(this.vzPath, "assets", path ?? "") });
        } if (type === "plugins" || type === "themes") {
          return callback({ path: join(this.vzPath, "addons", type, path ?? "") });
        } if (type === "builtins") {
          return callback({ path: join(this.vzPath, "renderer", "src", "builtins", path ?? "") });
        }
      };
      /**
      * Now we can register the vizality:// file protocol to be able to conveniently
      * link to local files from within Discord.
      */
      electron.protocol.registerFileProtocol("vizality", vzProtocolHandler);
      /** Compatibility with older plugins */
      const registerProtocol = (name: string) => {
        electron.protocol.registerFileProtocol(name, (request, cb) => {
          // https://security.stackexchange.com/a/123723
          const [url] = normalize(request.url.replace(`${name}://`, "")).replace(/^(\.\.(\/|\\|$))+/, "").split("?");

          switch (name) {
            case "vz-asset":
              return cb({ path: join(this.vzPath, "assets", url!) });
            case "vz-builtin":
              return cb({ path: join(this.vzPath, "core", "builtins", url!) });
            case "vz-theme":
              return cb({ path: join(this.vzPath, "addons", "themes", url!) });
            case "vz-plugin":
              return cb({ path: join(this.vzPath, "addons", "plugins", url!) });
            default:
              this.log(`Unimplemented protocol ${name}`);
          }
        });
      };

      registerProtocol("vz-asset");
      registerProtocol("vz-builtin");
      registerProtocol("vz-theme");
      registerProtocol("vz-plugin");
    });

    addIPCHandles();
  }

  private downloadVizality() {
    if (existsSync(this.vzPath)) return;

    this.log("Downloading Vizality...");

    // We need to clone & install vizality to our project, done at runtime to skip compile conflicts
    exec(`git clone https://github.com/vizality/vizality ${this.vzPath}`).on("close", () => {
      // Overwriting preloader.js so we dont conflict with rikka's preloader
      copyFileSync(join(__dirname, "preload.js"), join(this.vzPath, "injector", "preload.js"));

      this.log("Vizality downloaded! Getting dependencies...");
      exec(`cd ${this.vzPath} && npm install`).on("close", async () => {
        this.log("Vizality dependencies installed!");
      });
    });
  }

  private createVzDirectories() {
    const directories = [
      join("addons", "plugins"),
      "settings",
      "renderer",
    ];

    type symlink = {
        source: string,
        target: string
    }

    /** Symlinking for tighter integration with Rikka */
    const symLinks: symlink[] = [
      {
        // @ts-ignore we know its private but honestly dont care
        source: StyleManager.themesDirectory,
        target: join(this.vzPath, "addons", "themes"),
      },
    ];

    directories.forEach((dir) => {
      if (!existsSync(dir)) {
        this.log(`Creating ${dir}`);
        mkdirSync(join(this.vzPath, dir), { recursive: true });
      }
    });

    symLinks.forEach((link) => {
      if (!existsSync(link.target)) {
        this.log(`Creating symlink ${link.target}`);
        symlinkSync(link.source, link.target);
      }
    });

    copyFileSync(join(__dirname, "preload.js"), join(this.vzPath, "injector", "preload.js"));
  }

  inject() {
    this.createVzDirectories();
    require(join(this.vzPath, "injector", "preload.js"));
  }
}
