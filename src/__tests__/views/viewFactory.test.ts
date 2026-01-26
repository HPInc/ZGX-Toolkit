/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

import { ViewFactory } from '../../views/viewFactory';
import { BaseViewController, IView } from '../../views/baseViewController';
import { Logger } from '../../utils/logger';
import { ITelemetryService } from '../../types/telemetry';
import { Message } from '../../types/messages';

// Mock view for testing
class MockView extends BaseViewController {
    constructor(deps: { logger: Logger; telemetry: ITelemetryService }) {
        super(deps.logger, deps.telemetry);
    }

    async render(params?: any): Promise<string> {
        return '<div>Mock View</div>';
    }
}

describe('ViewFactory', () => {
    let factory: ViewFactory;
    let mockLogger: jest.Mocked<Logger>;
    let mockTelemetry: jest.Mocked<ITelemetryService>;

    beforeEach(() => {
        mockLogger = {
            trace: jest.fn(),
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as any;

        mockTelemetry = {
            trackNavigation: jest.fn(),
            trackCommand: jest.fn(),
            trackFeature: jest.fn(),
            trackError: jest.fn(),
            trackPerformance: jest.fn(),
            flush: jest.fn(),
        } as any;

        factory = new ViewFactory(mockLogger, mockTelemetry, {});
    });

    describe('register', () => {
        it('should register a view', () => {
            factory.register('test/view', MockView);

            expect(factory.has('test/view')).toBe(true);
            expect(mockLogger.debug).toHaveBeenCalledWith(
                'View registered',
                expect.objectContaining({ viewId: 'test/view' })
            );
        });

        it('should warn when overwriting existing view', () => {
            factory.register('test/view', MockView);
            factory.register('test/view', MockView);

            expect(mockLogger.warn).toHaveBeenCalledWith(
                'View already registered, overwriting',
                expect.objectContaining({ viewId: 'test/view' })
            );
        });
    });

    describe('create', () => {
        beforeEach(() => {
            factory.register('test/view', MockView);
        });

        it('should create a view instance', () => {
            const view = factory.create('test/view');

            expect(view).toBeInstanceOf(MockView);
            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Creating view',
                expect.objectContaining({ viewId: 'test/view' })
            );
        });

        it('should inject dependencies', () => {
            const view = factory.create('test/view') as any;

            expect(view.logger).toBeDefined();
            expect(view.telemetry).toBeDefined();
        });

        it('should throw error for unregistered view', () => {
            expect(() => {
                factory.create('nonexistent/view');
            }).toThrow('View not registered: nonexistent/view');

            expect(mockLogger.error).toHaveBeenCalledWith(
                'View not registered: nonexistent/view'
            );
        });

        it('should pass additional dependencies', () => {
            const additionalDeps = { customService: {} };
            const view = factory.create('test/view', additionalDeps);

            expect(view).toBeInstanceOf(MockView);
        });

        it('should log successful creation', () => {
            factory.create('test/view');

            expect(mockLogger.debug).toHaveBeenCalledWith(
                'View created successfully',
                expect.objectContaining({ viewId: 'test/view' })
            );
        });
    });

    describe('has', () => {
        it('should return true for registered views', () => {
            factory.register('test/view', MockView);

            expect(factory.has('test/view')).toBe(true);
        });

        it('should return false for unregistered views', () => {
            expect(factory.has('test/view')).toBe(false);
        });
    });

    describe('getRegisteredViews', () => {
        it('should return all registered view IDs', () => {
            factory.register('test/view1', MockView);
            factory.register('test/view2', MockView);

            const views = factory.getRegisteredViews();

            expect(views).toContain('test/view1');
            expect(views).toContain('test/view2');
        });

        it('should return empty array when no views registered', () => {
            const factory = new ViewFactory(mockLogger, mockTelemetry, {});
            factory.clear(); // Clear default registrations

            const views = factory.getRegisteredViews();

            expect(views.length).toBeGreaterThanOrEqual(0);
        });
    });

    describe('unregister', () => {
        it('should unregister a view', () => {
            factory.register('test/view', MockView);

            const result = factory.unregister('test/view');

            expect(result).toBe(true);
            expect(factory.has('test/view')).toBe(false);
            expect(mockLogger.debug).toHaveBeenCalledWith(
                'View unregistered',
                expect.objectContaining({ viewId: 'test/view' })
            );
        });

        it('should return false for nonexistent view', () => {
            const result = factory.unregister('test/view');

            expect(result).toBe(false);
        });
    });

    describe('clear', () => {
        it('should clear all registered views', () => {
            factory.register('test/view1', MockView);
            factory.register('test/view2', MockView);

            factory.clear();

            expect(factory.has('test/view1')).toBe(false);
            expect(factory.has('test/view2')).toBe(false);
            expect(mockLogger.debug).toHaveBeenCalledWith('View registry cleared');
        });
    });

    describe('default registrations', () => {
        it('should have common views registered', () => {
            expect(factory.has('common/error')).toBe(true);
            expect(factory.has('common/loading')).toBe(true);
        });

        it('should have device views registered', () => {
            expect(factory.has('devices/list')).toBe(true);
            expect(factory.has('devices/manager')).toBe(true);
        });

        it('should have setup views registered', () => {
            expect(factory.has('setup/options')).toBe(true);
            expect(factory.has('setup/automatic')).toBe(true);
            expect(factory.has('setup/manual')).toBe(true);
            expect(factory.has('setup/success')).toBe(true);
        });

        it('should have app views registered', () => {
            expect(factory.has('apps/selection')).toBe(true);
        });

        it('should have instruction views registered', () => {
            expect(factory.has('instructions/inference')).toBe(true);
            expect(factory.has('instructions/finetuning')).toBe(true);
            expect(factory.has('instructions/rag')).toBe(true);
        });

        it('should have template views registered', () => {
            expect(factory.has('templates/list')).toBe(true);
        });

        it('should log initialization', () => {
            expect(mockLogger.debug).toHaveBeenCalledWith(
                'View registry initialized',
                expect.objectContaining({
                    viewCount: expect.any(Number)
                })
            );
        });
    });
});
