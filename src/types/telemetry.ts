/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Telemetry event types for the ZGX Toolkit extension.
 */

/**
 * Predefined telemetry event types.
 * Used for consistent event naming and categorization.
 */
export enum TelemetryEventType {
    /** Extension events */
    Extension = 'extension',
    /** View events */
    View = 'view',
    /** Command events */
    Command = 'command',
    /** Error events */
    Error = 'error',
    /** Device events */
    Device = 'device',
}

/**
 * Base telemetry event structure. Not to be used directly.
 */
interface BaseEvent {
    /** Event type identifier */
    eventType: TelemetryEventType;
}

/**
 * Telemetry event data. Not to be used directly.
 */
interface TelemetryEvent extends BaseEvent {
    /** Action associated with the event */
    action: string;
    /** Custom properties for the event */
    properties?: Record<string, string>;
    /** Numeric measurements for the event */
    measurements?: Record<string, number>;
}

/**
 * Telemetry error event data. Not to be used directly.
 */
export interface TelemetryErrorEvent extends BaseEvent {
    eventType: TelemetryEventType.Error;
    error: Error;
}

/**
 * Error event data.
 */
export interface ErrorEvent extends TelemetryErrorEvent {
    eventType: TelemetryEventType.Error;
    error: Error;
    /**
     * Additional context information about the error (e.g., operation or state when the error occurred).
     * Should be populated when extra details can help diagnose the error.
     */
    context?: string;
}

/**
 * Extension event data.
 */
export interface ExtensionEvent extends TelemetryEvent {
    eventType: TelemetryEventType.Extension;
    action: 'activate' | 'deactivate' | 'firstActivation';
}

/**
 * View navigation event data.
 */
export interface ViewNavigationEvent extends TelemetryEvent {
    eventType: TelemetryEventType.View;
    action: 'navigate';
    properties: {
        /** View identifier */
        toView: string;
        /** Additional properties */
        [key: string]: string;
    };
}

/**
 * Command execution event data.
 */
export interface CommandExecutionEvent extends TelemetryEvent {
    eventType: TelemetryEventType.Command;
    action: 'execute';
    properties: {
        /** Command identifier */
        commandId: string;
        /** Additional properties */
        [key: string]: string;
    };
}

/**
 * device lifecycle event data.
 */
export interface DeviceLifecycleEvent extends TelemetryEvent {
    eventType: TelemetryEventType.Device;
    action: 'create' | 'update' | 'delete' | 'connect' | 'disconnect' | 'discover';
}

/**
 * Device discovery event data.
 */
export interface DeviceDiscoveryEvent extends TelemetryEvent {
    eventType: TelemetryEventType.Device;
    action: 'discover' | 'rediscover';
    properties: {
        /** Discovery method used */
        method: 'dns-sd';
        /** Result of the discovery process. Finding 0 devices is considered a discovery success. */
        result: 'success' | 'no-interfaces';
        [key: string]: string;
    };
    measurements: {
        /** Number of devices found */
        deviceCount: number;
        [key: string]: number;
    };
}

/**
 * Union type of all telemetry events.
 */
export type AnyTelemetryEvent =
    | ExtensionEvent
    | ViewNavigationEvent
    | CommandExecutionEvent
    | DeviceLifecycleEvent
    | DeviceDiscoveryEvent;

/**
 * Union type for telemetry error events.
 */
export type AnyTelemetryErrorEvent =
    | ErrorEvent;

/**
 * Interface for telemetry service implementations.
 */
export interface ITelemetryService {
    
    /**
     * Track a telemetry event.
     * 
     * @param event Telemetry event to track
     */
    trackEvent(event: AnyTelemetryEvent): void;

    /**
     * Track an error event.
     * @param event Error event to track
     */
    trackError(event: AnyTelemetryErrorEvent): void;

    /**
     * Check if telemetry is enabled.
     * @returns True if telemetry is enabled
     */
    isEnabled(): boolean;

    /**
     * Set whether telemetry is enabled.
     * @param enabled Whether to enable telemetry
     */
    setEnabled(enabled: boolean): void;

    /**
     * Dispose the telemetry service.
     */
    dispose(): Promise<void>;
}
