export interface MenuItem {
  label: string;
  danger?: boolean;
  action: () => void;
}

export interface PermissionItem {
  handle: any;
  name: string;
  type: 'folder' | 'file';
  granted: boolean;
}

class UIState {
  saveMenuOpen = $state(false);
  videoMenuOpen = $state(false);
  settingsOpen = $state(false);
  syncOpen = $state(false);
  syncGid = $state<number | null>(null);
  syncVid = $state<number | null>(null);
  addLinkOpen = $state(false);
  colorPickerOpen = $state(false);
  colorPickerGid = $state<number | null>(null);
  contextMenu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);
  aiStatus = $state<string | null>(null);
  aiStartTime = $state(0);
  aiError = $state<string | null>(null);
  aiCancelRequested = $state(false);
  aiRunId = 0;
  permissionOpen = $state(false);
  permissionItems = $state<PermissionItem[]>([]);
  private confirmOpen = $state(false);
  private confirmMessage = $state('');
  private confirmText = $state('Delete');
  private confirmType = $state<'danger' | 'primary'>('danger');
  private confirmResolve: ((v: boolean) => void) | null = null;
  private pendingPermissionResolver: (() => void) | null = null;

  get confirm() {
    return {
      open: this.confirmOpen,
      message: this.confirmMessage,
      text: this.confirmText,
      type: this.confirmType,
    };
  }

  showConfirmModal(message: string, confirmText = 'Delete', type: 'danger' | 'primary' = 'danger'): Promise<boolean> {
    return new Promise((resolve) => {
      this.confirmMessage = message;
      this.confirmText = confirmText;
      this.confirmType = type;
      this.confirmOpen = true;
      this.confirmResolve = resolve;
    });
  }

  resolveConfirm(answer: boolean) {
    this.confirmOpen = false;
    if (this.confirmResolve) {
      this.confirmResolve(answer);
      this.confirmResolve = null;
    }
  }

  showAI(status: string) {
    this.aiStatus = status;
    this.aiStartTime = performance.now();
    this.aiError = null;
    this.aiCancelRequested = false;
    this.aiRunId++;
  }

  updateAI(status: string) {
    this.aiStatus = status;
  }

  hideAI() {
    this.aiStatus = null;
    this.aiError = null;
  }

  cancelAI() {
    this.aiCancelRequested = true;
    this.aiStatus = null;
    this.aiError = null;
  }

  failAI(message: string) {
    this.aiError = message;
  }

  dismissAI() {
    this.aiStatus = null;
    this.aiError = null;
  }

  openPermissionDialog(items: PermissionItem[]): Promise<void> {
    this.permissionItems = items;
    this.permissionOpen = true;
    return new Promise(resolve => {
      this.pendingPermissionResolver = resolve;
    });
  }

  closePermissionDialog() {
    this.permissionOpen = false;
    if (this.pendingPermissionResolver) {
      this.pendingPermissionResolver();
      this.pendingPermissionResolver = null;
    }
  }

  get allPermissionsGranted() {
    return this.permissionItems.every(i => i.granted);
  }

  get pendingPermissionCount() {
    return this.permissionItems.filter(i => !i.granted).length;
  }
}

export const uiState = new UIState();
