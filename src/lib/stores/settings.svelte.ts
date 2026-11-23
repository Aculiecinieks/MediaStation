import { MODELS, PRECISIONS, type Precision } from '../constants';

const STORAGE_KEY = 'mediastation_settings';
const DEFAULT_MODEL = 'onnx-community/whisper-tiny.en';
const DEFAULT_PRECISION: Precision = 'fp32';

interface PersistedSettings {
  currentModel?: string;
  currentPrecision?: Precision;
  useGPU?: boolean;
}

function readPersisted(): PersistedSettings {
  try {
    if (typeof localStorage === 'undefined') return {};
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as PersistedSettings;
  } catch {
    return {};
  }
}

const persisted = readPersisted();
const allModels = [...MODELS.standard, ...MODELS.distilled];
const validModel = persisted.currentModel && allModels.some(m => m.id === persisted.currentModel)
  ? persisted.currentModel
  : DEFAULT_MODEL;
const validPrecision = persisted.currentPrecision && PRECISIONS.some(p => p.id === persisted.currentPrecision)
  ? persisted.currentPrecision
  : DEFAULT_PRECISION;

class SettingsState {
  currentModel = $state(validModel);
  currentPrecision = $state<Precision>(validPrecision);
  useGPU = $state(persisted.useGPU === true);
  lastGenDuration = $state<string | null>(null);
  transcriber: any = null;

  persist() {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        currentModel: this.currentModel,
        currentPrecision: this.currentPrecision,
        useGPU: this.useGPU,
      }));
    } catch {
      /* storage unavailable */
    }
  }

  resetDefaults() {
    this.currentModel = DEFAULT_MODEL;
    this.currentPrecision = DEFAULT_PRECISION;
    this.useGPU = false;
    this.persist();
  }
}

export const settingsState = new SettingsState();
