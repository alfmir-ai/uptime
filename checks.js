import { execFile as execFileCallback } from 'node:child_process';

export function checkTcpPortFromRemote(host, port, {
  sshHost = process.env.IPFS_UPTIME_SSH_HOST,
  keyPem = process.env.IPFS_UPTIME_SSH_KEY_PEM,
  timeoutMs = 10_000,
  execFile = execFileCallback
} = {}) {
  return new Promise((resolve, reject) => {
    if (!sshHost) {
      reject(new Error('IPFS_UPTIME_SSH_HOST must be set to the SSH host used for the remote TCP check.'));
      return;
    }
    if (!keyPem) {
      reject(new Error('IPFS_UPTIME_SSH_KEY_PEM must point to the PEM private key used to authenticate to the uptime VPS.'));
      return;
    }
    const startedAt = Date.now();
    const timeoutSeconds = Math.max(1, Math.ceil(timeoutMs / 1000));
    const sshArguments = ['-o', 'BatchMode=yes', '-o', `ConnectTimeout=${timeoutSeconds}`, '-i', keyPem];
    sshArguments.push(sshHost, 'nc', '-zv', '-w', String(timeoutSeconds), host, String(port));
    execFile('ssh', sshArguments, { timeout: timeoutMs + 1_000 }, (error, stdout, stderr) => {
      if (error) {
        error.message = `Remote TCP check failed on ${sshHost}: ${String(stderr || stdout || error.message).trim()}`;
        reject(error);
        return;
      }
      resolve({ host, port, sshHost, latencyMs: Date.now() - startedAt });
    });
  });
}
