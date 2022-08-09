/* eslint-disable no-setter-return */
/* eslint-disable no-return-assign */
import { webFrame } from "electron";
import { join } from "path";

const rkDir = "../../../../dist/Rikka/";

const { setGlobal } = require(`${rkDir}/API/Utils/globals`);

const { registerCallback } = require(`${rkDir}/modules/util/preloadTils`);

require("module-alias/register");

function exposeGlobal(name: string, toMainWorld = false) {
  setGlobal(name, toMainWorld);
}

type DocElement = { setAttribute: (arg0: string, arg1: any) => void; };

registerCallback({
  getDoc: (element: DocElement, getI: number) => {
    const realDoc = (webFrame as any).top.context.document;

    element.setAttribute("vz-react-root-get", getI);
    const elem = realDoc.querySelector(`[vz-react-root-get='${getI}']`);
    elem?.removeAttribute("vz-react-root-get");
  },
  setDoc: (element: DocElement, prop: any, value: any, getI: any, setI: any) => {
    const realDoc = (webFrame as any).top.context.document;

    element.setAttribute("vz-react-root-set", setI);
    const elem = realDoc.querySelector(`[vz-react-root-set='${setI}']`);
    elem?.removeAttribute("vz-react-root-set");
  },
});

require("@vizality/compilers");

require("./renderer");

(() => {
  const { Module } = require("module");
  const extensions = [".jsx", ".js", ".ts", ".tsx"];
  extensions.forEach((ext) => {
    const oldRequireExt = Module._extensions[ext];
    Module._extensions[ext] = (module: any, filename: any) => {
      const srcDir = join(__dirname, "..", "renderer", "src");
      const addonsDir = join(__dirname, "..", "addons");
      if ((filename.indexOf(srcDir)
          && filename.indexOf(addonsDir))
          || filename.indexOf("node_modules") !== -1
      ) {
        return oldRequireExt(module, filename);
      }
      const compiler = new (require(`@vizality/compilers/${ext.substring(1).toUpperCase()}`))(filename);
      const compiled = compiler.compile();
      module._compile(compiled, filename);
    };
  });
})();

const Vizality = require("../renderer/src");

(window as any).vizality = new Vizality();

exposeGlobal("vizality", true);
exposeGlobal("$vz", true);
