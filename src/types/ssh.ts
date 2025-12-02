/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Result of executing an SSH command.
 */
export interface SSHCommandResult {
    /**
     * Whether the command executed successfully (exit code 0).
     */
    success: boolean;

    /**
     * The exit code returned by the command.
     */
    exitCode: number;

    /**
     * Standard output from the command.
     */
    stdout: string;

    /**
     * Standard error from the command.
     */
    stderr: string;

    /**
     * Error that occurred during SSH connection itself.
     * This is only set if the SSH connection failed, not if the command
     * returned a non-zero exit code.
     */
    error?: Error;
}
