/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * View configuration and interface types for the ZGX Toolkit extension.
 * Defines the structure for webview-based UI components.
 */

import { Message } from './messages';

/**
 * Interface that all views must implement.
 */
export interface IView {
  /**
   * Render the view with optional parameters.
   * @param params Optional parameters for rendering
   * @returns HTML string for the view
   */
  render(params?: any): Promise<string>;

  /**
   * Handle a message from the webview.
   * @param message The message to handle
   */
  handleMessage(message: Message): Promise<void>;

  /**
   * Clean up resources when the view is disposed.
   */
  dispose(): void;
}

/**
 * View identifiers for navigation.
 */
export const ViewIds = {
  /** device list view showing all devices */
  MACHINE_LIST: 'devices/list',
  /** device details view for a specific device */
  MACHINE_DETAILS: 'devices/details',
  /** Create new device view */
  MACHINE_CREATE: 'devices/create',
  /** Edit device view */
  MACHINE_EDIT: 'devices/edit',
  /** device apps management view */
  MACHINE_APPS: 'devices/apps',
  /** SSH key setup view */
  SSH_KEY_SETUP: 'ssh/setup',
  /** Discovery view for finding devices */
  DISCOVERY: 'discovery',
  /** Common error view */
  ERROR: 'common/error',
  /** Common loading view */
  LOADING: 'common/loading',
} as const;

/**
 * View identifier type derived from ViewIds.
 */
export type ViewId = typeof ViewIds[keyof typeof ViewIds];

/**
 * Configuration for a view.
 */
export interface ViewConfig {
  /** Unique identifier for the view */
  id: ViewId;
  /** Display title for the view */
  title: string;
  /** Optional description */
  description?: string;
  /** Whether the view requires authentication */
  requiresAuth?: boolean;
}

/**
 * Context provided to views during rendering.
 */
export interface ViewContext {
  /** Parameters passed to the view */
  params?: Record<string, any>;
  /** Current device being viewed/edited (if applicable) */
  currentDevice?: string;
  /** Whether the view is in the sidebar or editor */
  location: 'sidebar' | 'editor';
}

/**
 * Result of rendering a view.
 */
export interface ViewRenderResult {
  /** Rendered HTML content */
  html: string;
  /** Optional CSS to inject */
  css?: string;
  /** Optional JavaScript to inject */
  scripts?: string;
}

/**
 * View template data interface.
 */
export interface ViewTemplateData {
  /** Template data as key-value pairs */
  [key: string]: any;
}

/**
 * Navigation parameters for view transitions.
 */
export interface NavigationParams {
  /** Target view to navigate to */
  targetView: ViewId;
  /** Parameters to pass to the target view */
  params?: Record<string, any>;
  /** Whether to replace current view in history */
  replace?: boolean;
}
