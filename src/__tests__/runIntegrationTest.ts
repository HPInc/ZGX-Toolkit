/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import * as path from 'path';
import { readFileSync } from 'fs';
import semver from 'semver';
import {
  downloadAndUnzipVSCode,
  resolveCliArgsFromVSCodeExecutablePath,
  runTests
} from '@vscode/test-electron';
import { spawnSync } from 'child_process';

async function run() {

    const pkg = JSON.parse(
            readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8')
    );
    const engineRange: string | undefined = pkg.engines?.vscode;
    const minEngine = engineRange ? semver.minVersion(engineRange)?.version : undefined;
    const version = minEngine;
        
    const vscodeExecutablePath = await downloadAndUnzipVSCode(version);

    // Install required dependency before launching tests
    const [cli, ...baseArgs] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);
    spawnSync(cli, [...baseArgs, '--install-extension', 'ms-vscode-remote.remote-ssh'], { stdio: 'inherit' });

    // Shows installed extensions for debugging
    const [cliList, ...baseArgsList] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);
    spawnSync(cliList, [...baseArgsList, '--list-extensions'], { stdio: 'inherit' });

    await runTests({
        version,
        vscodeExecutablePath,
        extensionDevelopmentPath: path.resolve(__dirname, '../..'),
        extensionTestsPath: path.resolve(__dirname, 'integrationSuite/index'),
        launchArgs: [
        '--disable-workspace-trust',
        '--disable-telemetry',
        '--disable-updates',
        '--enable-proposed-api', 'hpinc.zgx-toolkit',
        '--log', 'trace'
        ]
  });
}

run().catch(err => {
  console.error('Failed to run tests', err);
  process.exit(1);
});