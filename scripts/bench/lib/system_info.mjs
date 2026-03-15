import os from 'node:os';

export function getSystemInfo() {
  const cpus = os.cpus() || [];
  return {
    hostname: os.hostname(),
    platform: process.platform,
    arch: process.arch,
    release: os.release(),
    node: process.version,
    cpuModel: cpus[0]?.model || 'unknown',
    cpuCount: cpus.length,
    totalMemBytes: os.totalmem()
  };
}
