/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

export const APP_INSIGHTS_CONNS = {
    DEV: 'InstrumentationKey=c0c4fbc3-449e-4dac-9eed-3b9f5ee4bd42;IngestionEndpoint=https://eastus-8.in.applicationinsights.azure.com/;LiveEndpoint=https://eastus.livediagnostics.monitor.azure.com/;ApplicationId=e147694f-8ea1-49b1-94bd-7c6bccf6256d',
    QA: 'InstrumentationKey=e9ad2c05-1712-43e2-88fd-a65a39b83d95;IngestionEndpoint=https://eastus-8.in.applicationinsights.azure.com/;LiveEndpoint=https://eastus.livediagnostics.monitor.azure.com/;ApplicationId=a2d70ea0-e1cc-4c6b-a596-880333820970',
    HPER: 'InstrumentationKey=b469ac64-9ea7-48ef-9d01-5099b24f0c8b;IngestionEndpoint=https://eastus-8.in.applicationinsights.azure.com/;LiveEndpoint=https://eastus.livediagnostics.monitor.azure.com/;ApplicationId=239a0dcb-a6e0-4338-97b2-3f3ac841d1e1',
    PROD: 'InstrumentationKey=5a9d8f8e-31d0-40d0-bee0-29c8e73073b4;IngestionEndpoint=https://eastus-8.in.applicationinsights.azure.com/;LiveEndpoint=https://eastus.livediagnostics.monitor.azure.com/;ApplicationId=269f21ab-4b01-4f91-a9c2-efd53cfabd11',
} as const;
