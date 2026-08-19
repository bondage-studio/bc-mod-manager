import {LogService} from "@/service/LogService.ts";
import {ModalStore} from "@/ui/store/ModalStore.ts";
import {FusamStateService} from "@/service/FusamStateService.ts";

const BMM_FUSAM = Symbol.for("bmm.fusam");

type BrandedFusam = FUSAMPublicAPI & { [BMM_FUSAM]?: true };

const fusam: BrandedFusam = {
  present: true,
  addons: {},
  registerDebugMethod: (name: string, method: () => string | Promise<string>) => {
    LogService.registerDebugMethod(name, method);
  },
  modals: {
    open: (options: ModalOptions) => {
      ModalStore.open(options);
    },
    openAsync: async (options: Omit<ModalOptions, "callback">) => {
      return new Promise((resolve) => {
        ModalStore.open({
          ...options,
          callback: (action, inputValue) => {
            resolve([action, inputValue === undefined ? null : inputValue]);
          },
        });
      });
    },
  },
}
Object.defineProperty(fusam, BMM_FUSAM, {value: true, enumerable: false});

function isForeignFusam(value: unknown): boolean {
  return !!value
    && typeof value === "object"
    && (value as FUSAMPublicAPI).present === true
    && !(value as BrandedFusam)[BMM_FUSAM];
}

// A genuine FUSAM may already own the global if it loaded before us...
if (isForeignFusam(window.FUSAM)) {
  FusamStateService.markConflict();
}

window.FUSAM = fusam;

// ...or it may overwrite our shim later (it boots on the window "load" event),
// so keep watching for the global being replaced during startup.
const conflictGuard = window.setInterval(() => {
  if (isForeignFusam(window.FUSAM)) {
    FusamStateService.markConflict();
    window.clearInterval(conflictGuard);
  }
}, 1000);
window.setTimeout(() => window.clearInterval(conflictGuard), 60000);