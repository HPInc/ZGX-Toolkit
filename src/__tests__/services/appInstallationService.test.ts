/*
 * Copyright ©2025-2026 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { AppInstallationService } from '../../services/appInstallationService';
import { Device } from '../../types/devices';
import { Client as SSHClient } from 'ssh2';
import { getSSHConfig } from '../../utils/sshConfig';

jest.mock('ssh2');
jest.mock('fs');
jest.mock('../../utils/logger');

/**
 * Tests for AppInstallationService password authentication functionality.
 * 
 * This test suite validates:
 * 1. SSH config parsing handles missing/undefined fields gracefully
 * 2. Password validation occurs before install/uninstall operations
 * 3. Passwords are correctly passed to sudo commands via stdin
 */
describe('AppInstallationService - Password Authentication', () => {
    let service: AppInstallationService;
    let mockDevice: Device;
    let mockSSHClient: jest.Mocked<SSHClient>;

    beforeEach(() => {
        service = new AppInstallationService();
        
        mockDevice = {
            id: 'test-device-1',
            name: 'Test ZGX Device',
            host: '192.168.1.100',
            username: 'zgx',
            port: 22,
            isSetup: true,
            useKeyAuth: false, // Password auth
            keySetup: {
                keyGenerated: false,
                keyCopied: false,
                connectionTested: false
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        // Mock SSH Client
        mockSSHClient = new SSHClient() as jest.Mocked<SSHClient>;
        (SSHClient as jest.MockedClass<typeof SSHClient>).mockImplementation(() => mockSSHClient);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('SSH Config Parsing', () => {
        it('should handle undefined IdentitiesOnly without crashing', () => {
            const fs = require('fs');
            
            // Mock SSH config without IdentitiesOnly
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(`
Host test-host
    HostName 192.168.1.100
    User zgx
    Port 22
`);

            // This should not throw "Cannot read properties of undefined (reading '0')"
            expect(() => {
                getSSHConfig(mockDevice);
            }).not.toThrow();
        });

        it('should handle IdentitiesOnly as undefined gracefully', () => {
            const fs = require('fs');
            
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(`
Host 192.168.1.100
    HostName 192.168.1.100
    User zgx
`);

            const config = getSSHConfig(mockDevice);
            
            // Should not crash and should return valid config
            expect(config).toBeDefined();
            expect(config.host).toBe('192.168.1.100');
            expect(config.username).toBe('zgx');
        });

        it('should handle missing SSH config file', () => {
            const fs = require('fs');
            fs.existsSync.mockReturnValue(false);

            const config = getSSHConfig(mockDevice);
            
            expect(config).toBeDefined();
            expect(config.host).toBe(mockDevice.host);
            expect(config.username).toBe(mockDevice.username);
        });
    });

    describe('Password Validation', () => {
        it('should require password for apps with sudo commands during uninstall', async () => {
            const result = await service.uninstallApplications(
                mockDevice,
                ['podman'],
                undefined,
                undefined
            );

            expect(result.success).toBe(false);
            expect(result.errorType).toBe('sudo_password_required');
            expect(result.message).toContain('password required');
        });

        it('should require password for apps with sudo commands during install', async () => {
            const result = await service.installApplications(
                mockDevice,
                ['podman'],
                jest.fn(),
                undefined
            );

            expect(result.success).toBe(false);
            expect(result.errorType).toBe('sudo_password_required');
            expect(result.message).toContain('password required');
        });

        it('should validate password before attempting uninstall', async () => {
            const fs = require('fs');
            fs.existsSync.mockReturnValue(false);

            (mockSSHClient.on as any) = jest.fn((event: string, callback: any) => {
                if (event === 'ready') {
                    setTimeout(() => callback(), 0);
                }
                return mockSSHClient;
            });

            (mockSSHClient.exec as any) = jest.fn((command: string, callback: any) => {
                const mockStream: any = {
                    on: jest.fn((event: string, cb: any) => {
                        if (event === 'close') {
                            setTimeout(() => cb(0), 0);
                        }
                        return mockStream;
                    }),
                    stderr: {
                        on: jest.fn().mockReturnThis()
                    },
                    write: jest.fn(),
                    end: jest.fn()
                };
                callback(undefined, mockStream);
            });

            mockSSHClient.end = jest.fn() as any;

            const validatePasswordSpy = jest.spyOn(service as any, 'validatePassword');

            await service.uninstallApplications(
                mockDevice,
                ['curl'],
                undefined,
                'test-password'
            );

            expect(validatePasswordSpy).toHaveBeenCalled();
        });

        it('should validate password before attempting install', async () => {
            const fs = require('fs');
            fs.existsSync.mockReturnValue(false);

            (mockSSHClient.on as any) = jest.fn((event: string, callback: any) => {
                if (event === 'ready') {
                    setTimeout(() => callback(), 0);
                }
                return mockSSHClient;
            });

            (mockSSHClient.exec as any) = jest.fn((command: string, callback: any) => {
                const mockStream: any = {
                    on: jest.fn((event: string, cb: any) => {
                        if (event === 'close') {
                            setTimeout(() => cb(0), 0);
                        }
                        return mockStream;
                    }),
                    stderr: {
                        on: jest.fn().mockReturnThis()
                    },
                    write: jest.fn(),
                    end: jest.fn()
                };
                callback(undefined, mockStream);
            });

            mockSSHClient.end = jest.fn() as any;

            const validatePasswordSpy = jest.spyOn(service as any, 'validatePassword');

            await service.installApplications(
                mockDevice,
                ['curl'],
                jest.fn(),
                'test-password'
            );

            expect(validatePasswordSpy).toHaveBeenCalled();
        });
    });

    describe('Password Handling in SSH Commands', () => {
        it('should pass password to sudo commands via stdin', async () => {
            const mockWrite = jest.fn((data: string, callback: any) => {
                callback(undefined);
            });
            const mockStream: any = {
                on: jest.fn((event: string, cb: any) => {
                    if (event === 'close') {
                        setTimeout(() => cb(0), 0);
                    }
                    return mockStream;
                }),
                stderr: {
                    on: jest.fn().mockReturnThis()
                },
                write: mockWrite,
                end: jest.fn()
            };

            (mockSSHClient.on as any) = jest.fn((event: string, callback: any) => {
                if (event === 'ready') {
                    setTimeout(() => callback(), 0);
                }
                return mockSSHClient;
            });

            (mockSSHClient.exec as any) = jest.fn((command: string, callback: any) => {
                callback(undefined, mockStream);
            });

            mockSSHClient.end = jest.fn() as any;

            const password = 'test-password';
            const result = await service.validatePassword(mockDevice, password);

            // Verify password was written to stdin
            expect(mockWrite).toHaveBeenCalledWith(
                password + '\n',
                expect.any(Function)
            );
            expect(result).toBe(true);
        });
    });

    describe('sortAppsForUninstallation - Model Serving / other-category apps', () => {
        it('should not drop apps whose category is neither system-stack, python-tools, nor miniforge', () => {
            const zrt: any = {
                id: 'zrt',
                name: 'HP Z Runtime',
                icon: '⚡',
                description: 'Model serving runtime',
                features: [],
                category: 'model-serving',
                installCommand: 'sudo snap install --classic zrt',
                verifyCommand: 'zrt version',
                uninstallCommand: 'sudo snap remove zrt',
                dependencies: ['snapd']
            };
            const snapd: any = {
                id: 'snapd',
                name: 'snapd',
                icon: '🧩',
                description: 'Snap package management service',
                features: [],
                category: 'system-stack',
                installCommand: 'sudo apt install -y snapd',
                verifyCommand: 'snap --version',
                uninstallCommand: 'sudo apt remove -y snapd'
            };

            const sorted = service.sortAppsForUninstallation([zrt, snapd]);
            const sortedIds = sorted.map(a => a.id);

            expect(sortedIds).toContain('zrt');
            expect(sortedIds).toContain('snapd');
            expect(sortedIds.length).toBe(2);
        });

        it('should order apps that depend on another selected app before that dependency', () => {
            const zrt: any = {
                id: 'zrt',
                name: 'HP Z Runtime',
                icon: '⚡',
                description: 'Model serving runtime',
                features: [],
                category: 'model-serving',
                installCommand: 'sudo snap install --classic zrt',
                verifyCommand: 'zrt version',
                uninstallCommand: 'sudo snap remove zrt',
                dependencies: ['snapd']
            };
            const snapd: any = {
                id: 'snapd',
                name: 'snapd',
                icon: '🧩',
                description: 'Snap package management service',
                features: [],
                category: 'system-stack',
                installCommand: 'sudo apt install -y snapd',
                verifyCommand: 'snap --version',
                uninstallCommand: 'sudo apt remove -y snapd'
            };

            const sorted = service.sortAppsForUninstallation([snapd, zrt]);
            const zrtIndex = sorted.findIndex(a => a.id === 'zrt');
            const snapdIndex = sorted.findIndex(a => a.id === 'snapd');

            expect(zrtIndex).toBeLessThan(snapdIndex);
        });

        it('should still uninstall a single app that is neither python-tools, miniforge, nor system-stack', () => {
            const zrt: any = {
                id: 'zrt',
                name: 'HP Z Runtime',
                icon: '⚡',
                description: 'Model serving runtime',
                features: [],
                category: 'model-serving',
                installCommand: 'sudo snap install --classic zrt',
                verifyCommand: 'zrt version',
                uninstallCommand: 'sudo snap remove zrt',
                dependencies: ['snapd']
            };

            const sorted = service.sortAppsForUninstallation([zrt]);

            expect(sorted.map(a => a.id)).toEqual(['zrt']);
        });

        it('includes miniforge (added directly, not via reverseDependencySort) when selected', () => {
            const baseSystem: any = {
                id: 'base-system',
                name: 'Base System',
                icon: '🔧',
                description: 'Base system',
                features: [],
                category: 'system-stack',
                installCommand: 'sudo apt install -y base',
                verifyCommand: 'gcc --version',
                uninstallCommand: undefined
            };
            const miniforge: any = {
                id: 'miniforge',
                name: 'Miniforge',
                icon: '🐍',
                description: 'Conda distribution',
                features: [],
                category: 'system-stack',
                installCommand: 'install miniforge',
                verifyCommand: 'conda --version',
                uninstallCommand: 'rm -rf ~/miniforge3'
            };

            const sorted = service.sortAppsForUninstallation([baseSystem, miniforge]);
            const sortedIds = sorted.map(a => a.id);

            expect(sortedIds).toContain('miniforge');
            expect(sortedIds.indexOf('miniforge')).toBeLessThan(sortedIds.indexOf('base-system'));
        });
    });

    describe('sortAppsByDependencies', () => {
        it('visits a shared dependency only once when multiple apps depend on it', () => {
            const miniforge: any = { id: 'miniforge', name: 'Miniforge', icon: '', description: '', features: [], category: 'system-stack', installCommand: 'install miniforge', verifyCommand: 'conda --version' };
            const zgxPythonEnv: any = { id: 'zgx-python-env', name: 'ZGX Python Env', icon: '', description: '', features: [], category: 'python-tools', installCommand: 'create env', verifyCommand: 'conda env list', dependencies: ['miniforge'] };
            const jupyterLab: any = { id: 'jupyter-lab', name: 'Jupyter Lab', icon: '', description: '', features: [], category: 'python-tools', installCommand: 'install jupyter', verifyCommand: 'jupyter --version', dependencies: ['zgx-python-env'] };
            const streamlit: any = { id: 'streamlit', name: 'Streamlit', icon: '', description: '', features: [], category: 'python-tools', installCommand: 'install streamlit', verifyCommand: 'streamlit version', dependencies: ['zgx-python-env'] };

            const sorted = service.sortAppsByDependencies([jupyterLab, streamlit, zgxPythonEnv, miniforge]);
            const sortedIds = sorted.map(a => a.id);

            expect(sortedIds).toHaveLength(4);
            expect(sortedIds.indexOf('miniforge')).toBeLessThan(sortedIds.indexOf('zgx-python-env'));
            expect(sortedIds.indexOf('zgx-python-env')).toBeLessThan(sortedIds.indexOf('jupyter-lab'));
            expect(sortedIds.indexOf('zgx-python-env')).toBeLessThan(sortedIds.indexOf('streamlit'));
        });
    });

    describe('reverseDependencySort (private, invoked directly)', () => {
        it('visits dependents before their dependency and does not re-visit an already-visited node', () => {
            const dep: any = { id: 'dep', name: 'Dep', icon: '', description: '', features: [], category: 'system-stack', installCommand: '', verifyCommand: '' };
            const depA: any = { id: 'depA', name: 'DepA', icon: '', description: '', features: [], category: 'system-stack', installCommand: '', verifyCommand: '', dependencies: ['dep'] };
            const depB: any = { id: 'depB', name: 'DepB', icon: '', description: '', features: [], category: 'system-stack', installCommand: '', verifyCommand: '', dependencies: ['dep'] };

            // 'dep' listed first so its dependents (depA, depB) are recursively visited
            // from within its own visit() call; the later outer-loop visits of depA/depB
            // then hit the already-visited guard.
            const sorted = (service as any).reverseDependencySort([dep, depA, depB]);
            const sortedIds = sorted.map((a: any) => a.id);

            expect(sortedIds).toHaveLength(3);
            expect(sortedIds.indexOf('depA')).toBeLessThan(sortedIds.indexOf('dep'));
            expect(sortedIds.indexOf('depB')).toBeLessThan(sortedIds.indexOf('dep'));
        });
    });

});
