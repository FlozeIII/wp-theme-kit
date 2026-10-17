/**
 * Error types shared by every command.
 *
 * Exit code convention:
 *   0  success
 *   1  a check or acceptance gate failed
 *   2  usage error or missing environment
 */
export class WptkError extends Error {
  constructor(message, { exitCode = 2, hint = '', cause } = {}) {
    super(message, { cause });
    this.name = 'WptkError';
    this.exitCode = exitCode;
    this.hint = hint;
  }
}

export class UsageError extends WptkError {
  constructor(message, hint = '') {
    super(message, { exitCode: 2, hint });
    this.name = 'UsageError';
  }
}

export class EnvError extends WptkError {
  constructor(message, hint = '') {
    super(message, { exitCode: 2, hint });
    this.name = 'EnvError';
  }
}

export class GateError extends WptkError {
  constructor(message, hint = '') {
    super(message, { exitCode: 1, hint });
    this.name = 'GateError';
  }
}
