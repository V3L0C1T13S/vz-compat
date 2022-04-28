const { ipcRenderer, webFrame } = require('electron');
const { join } = require('path');
const { registerCallback } = require("../../../../dist/Rikka/modules/util/preloadTils");
require('module-alias/register');

function exposeGlobal (name, toMainWorld = false) {
  Object.defineProperty(toMainWorld ? webFrame.top.context : window, name, {
    get: () => (toMainWorld ? window : webFrame.top.context)[name],
    set: (v) => (toMainWorld ? window : webFrame.top.context)[name] = v
  });
}

function fixDocument () {
  let getI = 0;
  let setI = 0;

  /**
   * Allow accessing React root container.
   */
  Object.defineProperty(HTMLElement.prototype, '_reactRootContainer', {
    get () {
      getI++;
      
      return elem?._reactRootContainer;
    },
    set (prop, value) {
      setI++;
      this.setAttribute('vz-react-root-set', setI);
      const elem = realDoc.querySelector(`[vz-react-root-set='${setI}']`);
      elem?.removeAttribute('vz-react-root-set');
      return elem && (elem[prop] = value);
    }
  });
}

registerCallback({
  getDoc: (element, getI) => {
    const realDoc = webFrame.top.context.document;

    element.setAttribute('vz-react-root-get', getI);
    const elem = realDoc.querySelector(`[vz-react-root-get='${getI}']`);
    elem?.removeAttribute('vz-react-root-get');
  },
  setDoc: (element, prop, value, getI, setI) => {
    const realDoc = webFrame.top.context.document;

    elem.setAttribute('vz-react-root-set', setI);
    const elem = realDoc.querySelector(`[vz-react-root-set='${setI}']`);
    elem?.removeAttribute('vz-react-root-set');
  }
});

//fixDocument();

require('@vizality/compilers');
require('./renderer');

(() => {
  const { Module } = require('module');
  const extensions = [ '.jsx', '.js', '.ts', '.tsx' ];
  for (const ext of extensions) {
    const oldRequireExt = Module._extensions[ext];
    Module._extensions[ext] = (module, filename) => {
      const srcDir = join(__dirname, '..', 'renderer', 'src');
      const addonsDir = join(__dirname, '..', 'addons');
      if ((filename.indexOf(srcDir) &&
          filename.indexOf(addonsDir)) ||
          filename.indexOf('node_modules') !== -1
      ) {
        return oldRequireExt(module, filename);
      }
      const compiler = new (require(`@vizality/compilers/${ext.substring(1).toUpperCase()}`))(filename);
      const compiled = compiler.compile();
      module._compile(compiled, filename);
    };
  }
})();

/**
 * Instantiate Vizality.
 */
const Vizality = require('../renderer/src');
window.vizality = new Vizality();

/**
 * Expose some global objects
 */
exposeGlobal('vizality', true);
exposeGlobal('$vz', true);

/**
 * Discord's preload.
 */
const preload = ipcRenderer.sendSync('VIZALITY_GET_PRELOAD');
if (preload) {
  /**
   * Restore original preload for future windows.
   */
  process._linkedBinding('electron_common_command_line').appendSwitch('preload', preload);
  // i hate this so much, but if it's not here, it'll crash
  require(preload);
}

/* @todo Add debug logging. */
