/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Message type definitions for webview communication.
 * Uses discriminated unions for type-safe message handling.
 */

import { Device, DeviceConfig, DeviceApp } from './devices';

/**
 * Navigation message to switch between views.
 */
export interface NavigateMessage {
  type: 'navigate';
  /** Target view identifier */
  targetView: string;
  /** Optional parameters to pass to the view */
  params?: Record<string, any>;
  /** Where to display the view: 'sidebar' or 'editor' */
  panel?: 'sidebar' | 'editor';
}

/**
 * Refresh message to reload current view data.
 */
export interface RefreshMessage {
  type: 'refresh';
}

/**
 * Create device message with configuration data.
 */
export interface CreateDeviceMessage {
  type: 'create-device';
  /** device configuration */
  data: DeviceConfig;
}

/**
 * Update device message with partial updates.
 */
export interface UpdateDeviceMessage {
  type: 'update-device';
  /** device identifier */
  id: string;
  /** Partial device updates */
  updates: Partial<Device>;
}

/**
 * Delete device message.
 */
export interface DeleteDeviceMessage {
  type: 'delete-device';
  /** device identifier */
  id: string;
}

/**
 * Connect to device message.
 */
export interface ConnectDeviceMessage {
  type: 'connect-device';
  /** device identifier */
  id: string;
  /** Whether to open in a new window */
  newWindow?: boolean;
}

/**
 * Setup device message - navigate to SSH setup flow.
 */
export interface SetupDeviceMessage {
  type: 'setup-device';
  /** device identifier */
  id: string;
}

/**
 * Disconnect from device message.
 */
export interface DisconnectDeviceMessage {
  type: 'disconnect-device';
  /** device identifier */
  id: string;
}

/**
 * Discover devices message to start network discovery.
 */
export interface DiscoverDevicesMessage {
  type: 'discover-devices';
  /** Optional discovery options */
  options?: {
    timeout?: number;
    useMdns?: boolean;
  };
}

/**
 * Select device message when clicking on a device in the list.
 */
export interface SelectDeviceMessage {
  type: 'select-device';
  /** device identifier */
  id: string;
}

/**
 * Manage apps message to view/modify device applications.
 */
export interface ManageAppsMessage {
  type: 'manage-apps';
  /** device identifier */
  id: string;
}

/**
 * Update apps message to modify installed applications.
 */
export interface UpdateAppsMessage {
  type: 'update-apps';
  /** device identifier */
  id: string;
  /** Updated applications list */
  apps: DeviceApp[];
}

/**
 * Setup SSH key message to initiate key setup workflow.
 */
export interface SetupSshKeyMessage {
  type: 'setup-ssh-key';
  /** device identifier */
  id: string;
}

/**
 * Test connection message to verify SSH connectivity.
 */
export interface TestConnectionMessage {
  type: 'test-connection';
  /** device identifier */
  id: string;
}

/**
 * Show error message in the UI.
 */
export interface ShowErrorMessage {
  type: 'show-error';
  /** Error message text */
  message: string;
  /** Optional error details */
  details?: string;
}

/**
 * Show log message to display log output.
 */
export interface ShowLogMessage {
  type: 'show-log';
}

/**
 * Retry message to retry a failed operation.
 */
export interface RetryMessage {
  type: 'retry';
}

/**
 * Navigate back message to go to the previous view.
 */
export interface NavigateBackMessage {
  type: 'navigate-back';
}

/**
 * Quick links message - user clicked a quick links entry.
 */
export interface QuickLinksMessage {
  type: 'quick-links';
  /** link identifier, e.g. 'docs', 'templates' */
  link: string;
}

/**
 * Template select message - user selected a template.
 */
export interface TemplateSelectMessage {
  type: 'template-select';
  /** template identifier, e.g. 'inference', 'fine-tuning' */
  id: string;
}

/**
 * Automatic SSH setup run message - starts automated setup process.
 */
export interface AutomaticRunMessage {
  type: 'automaticRun';
}

/**
 * Automatic SSH setup complete message - verifies setup completion.
 */
export interface AutomaticCompleteMessage {
  type: 'automaticComplete';
}

/**
 * Manual SSH setup copy command message - copies command to clipboard.
 */
export interface ManualCopyCommandMessage {
  type: 'manualCopyCommand';
  /** Command to copy */
  command: string;
}

/**
 * Manual SSH setup complete message - verifies manual setup.
 */
export interface ManualCompleteMessage {
  type: 'manualComplete';
}

/**
 * Test connection message - verifies SSH connectivity (setup screens).
 */
export interface TestConnectionSetupMessage {
  type: 'testConnection';
}

/**
 * Password setup continue message - skip SSH key setup and use password authentication.
 */
export interface DefaultContinueMessage {
  type: 'defaultContinue';
}

/**
 * Back navigation message - go to previous view.
 */
export interface BackMessage {
  type: 'back';
}

/**
 * Setup option selected message - user chose a setup method.
 */
export interface SetupOptionSelectedMessage {
  type: 'setup-option-selected';
  /** The selected option: 'automatic', 'manual', or 'password' */
  option: 'automatic' | 'manual' | 'default';
}

/**
 * Setup SSH key complete message - user completed SSH key setup instructions.
 */
export interface SetupSshKeyCompleteMessage {
  type: 'setup-ssh-key-complete';
}

/**
 * Setup complete message - user completed the setup success screen.
 */
export interface SetupCompleteMessage {
  type: 'setup-complete';
}

/**
 * Cancel message - user cancelled an operation.
 */
export interface CancelMessage {
  type: 'cancel';
}

/**
 * Continue to inference instructions message - from app installation complete.
 */
export interface ContinueToInferenceMessage {
  type: 'continue-to-inference';
  /** device identifier */
  deviceId: string;
}

/**
 * Retry failed app installation message - go back to app selection.
 */
export interface RetryFailedMessage {
  type: 'retry-failed';
  /** device identifier */
  deviceId: string;
  /** install or uninstall */
  operation: 'install' | 'uninstall';
  /** Apps that failed to install */
  failedApps: string[];
}

/**
 * Install apps message - proceed with installing selected apps.
 */
export interface InstallAppsMessage {
  type: 'install-apps';
  /** device identifier */
  deviceId: string;
  /** Selected app IDs to install */
  selectedApps: string[];
}

/**
 * Uninstall apps message - proceed with uninstalling selected apps.
 */
export interface UninstallAppsMessage {
  type: 'uninstall-apps';
  /** device identifier */
  deviceId: string;
  /** Selected app IDs to uninstall */
  selectedApps: string[];
}

/**
 * Continue to inference message - skip app installation and go to inference instructions.
 */
export interface ContinueToInferenceAppSelectionMessage {
  type: 'continue-to-inference';
  /** device identifier */
  deviceId: string;
}

/**
 * Check ollama installation message - verify if ollama is installed.
 */
export interface CheckOllamaMessage {
  type: 'check-ollama';
  /** device identifier */
  deviceId: string;
}

/**
 * Ollama status response message - sent from backend to frontend.
 */
export interface OllamaStatusMessage {
  type: 'ollama-status';
  /** device identifier */
  deviceId: string;
  /** Whether ollama is installed */
  isInstalled: boolean;
}

/**
 * Uninstall all apps message - remove all installed apps.
 */
export interface UninstallAllMessage {
  type: 'uninstall-all';
  /** device identifier */
  deviceId: string;
}

/**
 * Continue to finetuning message - proceed to finetuning instructions screen.
 */
export interface ContinueToFinetuning {
  type: 'continue-to-finetuning';
  /** device identifier */
  deviceId: string;
}

/**
 * Check zgx-python-env installation message - verify if zgx-python-env is installed.
 */
export interface CheckZgxPythonEnvMessage {
  type: 'check-zgx-python-env';
  /** device identifier */
  deviceId: string;
}

/**
 * Zgx-python-env status response message - sent from backend to frontend.
 */
export interface ZgxPythonEnvStatusMessage {
  type: 'zgx-python-env-status';
  /** device identifier */
  deviceId: string;
  /** Whether zgx-python-env is installed */
  isInstalled: boolean;
}

/**
 * Verify installations message - check installation status of all apps.
 */
export interface VerifyInstallationsMessage {
  type: 'verify-installations';
  /** device identifier */
  deviceId: string;
  /** App IDs to verify */
  appIds: string[];
}

/**
 * Validate password message - validate sudo password for app installation.
 */
export interface ValidatePasswordMessage {
  type: 'validatePassword';
  /** Password to validate */
  password: string;
}

/**
 * Discriminated union of all possible messages.
 * Use pattern matching to handle messages type-safely.
 */
export type Message =
  | NavigateMessage
  | RefreshMessage
  | CreateDeviceMessage
  | UpdateDeviceMessage
  | DeleteDeviceMessage
  | ConnectDeviceMessage
  | SetupDeviceMessage
  | DisconnectDeviceMessage
  | DiscoverDevicesMessage
  | SelectDeviceMessage
  | ManageAppsMessage
  | UpdateAppsMessage
  | SetupSshKeyMessage
  | TestConnectionMessage
  | ShowErrorMessage
  | ShowLogMessage
  | RetryMessage
  | NavigateBackMessage
  | QuickLinksMessage
  | TemplateSelectMessage
  | AutomaticRunMessage
  | AutomaticCompleteMessage
  | ManualCopyCommandMessage
  | ManualCompleteMessage
  | TestConnectionSetupMessage
  | DefaultContinueMessage
  | BackMessage
  | SetupOptionSelectedMessage
  | SetupSshKeyCompleteMessage
  | SetupCompleteMessage
  | CancelMessage
  | ContinueToInferenceMessage
  | RetryFailedMessage
  | InstallAppsMessage
  | UninstallAppsMessage
  | ContinueToInferenceAppSelectionMessage
  | CheckOllamaMessage
  | OllamaStatusMessage
  | UninstallAllMessage
  | ContinueToFinetuning
  | CheckZgxPythonEnvMessage
  | ZgxPythonEnvStatusMessage
  | VerifyInstallationsMessage
  | ValidatePasswordMessage;

/**
 * Helper type to extract message payload by type.
 * Usage: MessagePayload<'create-device'> => CreateDeviceMessage
 */
export type MessagePayload<T extends Message['type']> = Extract<Message, { type: T }>;
