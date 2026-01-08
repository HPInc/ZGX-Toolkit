/*
 * Copyright ©2025 HP Development Company, L.P.
 * Licensed under the X11 License. See LICENSE file in the project root for details.
 */

/**
 * Network protocols supported for DNS-SD discovery.
 */
export const NET_PROTOCOLS = {
    TCP: 'tcp',
    UDP: 'udp'
} as const;

/**
 * DNS-SD service types used for device discovery.
 */
export const NET_DNSSD_SERVICES = {
    SSH: '_ssh',
    HPZGX: '_hpzgx'
} as const;

export type NetProtocol = typeof NET_PROTOCOLS[keyof typeof NET_PROTOCOLS];
export type DnssdService = typeof NET_DNSSD_SERVICES[keyof typeof NET_DNSSD_SERVICES];
