/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

// Global test setup
import { jest } from '@jest/globals';

// Mock CSS content for codicons used in tests
const MOCK_CODICON_CSS = `@font-face {
  font-family: "codicon";
  font-display: block;
  src: url("./codicon.ttf") format("truetype");
}
.codicon[class*='codicon-'] {
  font: normal normal normal 16px/1 codicon;
  display: inline-block;
}`;

// Mock node modules that might cause issues in testing
jest.mock('fs', () => {
  // Get the actual fs module for reading template files
  const actualFs = jest.requireActual('fs') as any;
  
  return {
    existsSync: jest.fn((path: string) => {
      // Return true for codicon resource files during tests
      if (path && (path.includes('codicon.css') || path.includes('codicon.ttf'))) {
        return true;
      }
      // For template files (HTML/CSS/JS), use actual fs
      if (path && (path.endsWith('.html') || path.endsWith('.css') || path.endsWith('.js'))) {
        return actualFs.existsSync(path);
      }
      return false;
    }),
    readFileSync: jest.fn((path: string, encoding?: string) => {
      // Return mock CSS content for codicon.css
      if (path && path.includes('codicon.css')) {
        return MOCK_CODICON_CSS;
      }
      // Return empty buffer for font file
      if (path && path.includes('codicon.ttf')) {
        return Buffer.from('');
      }
      // For template files (HTML/CSS/JS), use actual fs to read them
      if (path && (path.endsWith('.html') || path.endsWith('.css') || path.endsWith('.js'))) {
        try {
          return actualFs.readFileSync(path, encoding || 'utf8');
        } catch (error) {
          console.error(`Failed to read template file: ${path}`, error);
          return '';
        }
      }
      return '';
    }),
    writeFileSync: jest.fn(),
    mkdirSync: jest.fn(),
    readdirSync: jest.fn(),
    statSync: jest.fn(() => ({ size: 0 })),
    renameSync: jest.fn(),
    unlinkSync: jest.fn(),
    createWriteStream: jest.fn(() => ({
      write: jest.fn(),
      end: jest.fn(),
      on: jest.fn(),
    })),
  };
});

jest.mock('os', () => ({
  homedir: jest.fn().mockReturnValue('/mock/home'),
  platform: jest.fn().mockReturnValue('linux'),
}));

// Mock console.error to suppress expected logger initialization errors during tests
const originalConsoleError = console.error;
console.error = jest.fn().mockImplementation((...args) => {
  // Only suppress the specific logger initialization error
  if (args[0] && typeof args[0] === 'string' && args[0].includes('Failed to initialize file logging')) {
    return; // Suppress this specific error
  }
  // Allow other console.error calls through
  originalConsoleError.apply(console, args);
});

jest.mock('path', () => {
  // Use actual path module for proper path resolution in tests
  const actualPath = jest.requireActual('path') as any;
  return {
    ...actualPath,
    join: jest.fn((...args) => actualPath.join(...args)),
    basename: jest.fn((path: string) => actualPath.basename(path)),
    dirname: jest.fn((path: string) => actualPath.dirname(path)),
    resolve: jest.fn((...args) => actualPath.resolve(...args)),
  };
});

const ssh2Mock = (() => {
  const { EventEmitter } = require('events');

  type ExecBehavior = {
    exitCode: number;
    stderr: string;
    error: Error | null;
  };

  let execBehavior: ExecBehavior = {
    exitCode: 0,
    stderr: '',
    error: null
  };

  class MockClient extends EventEmitter {
    public connect = jest.fn(() => {
      process.nextTick(() => {
        if (execBehavior.error) {
          this.emit('error', execBehavior.error);
        } else {
          this.emit('ready');
        }
      });
    });

    public exec = jest.fn((command: string, _options: any, callback: (err: Error | undefined, stream: any) => void) => {
      const stream = new EventEmitter() as any;
      stream.write = jest.fn();
      stream.end = jest.fn();
      stream.stderr = new EventEmitter();

      process.nextTick(() => {
        if (execBehavior.stderr) {
          stream.stderr.emit('data', Buffer.from(execBehavior.stderr));
        }
        stream.emit('close', execBehavior.exitCode, null);
      });

      callback(undefined, stream);
    });

    public end = jest.fn();

    public on(event: string, listener: (...args: unknown[]) => void): this {
      super.on(event, listener);
      return this;
    }
  }

  const Client = jest.fn(() => new MockClient());

  return {
    Client,
    ClientChannel: class {},
    __setExecBehavior: (behavior: Partial<ExecBehavior>) => {
      execBehavior = { ...execBehavior, ...behavior };
    },
    __resetExecBehavior: () => {
      execBehavior = { exitCode: 0, stderr: '', error: null };
    }
  };
})();

jest.mock('ssh2', () => ssh2Mock);

beforeEach(() => {
  ssh2Mock.__resetExecBehavior();
  ssh2Mock.Client.mockClear();
});

// Global test timeout
jest.setTimeout(10000);