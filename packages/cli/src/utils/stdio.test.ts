/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { patchStdio, createInkStdio } from './stdio.js';

describe('stdio utils', () => {
  let originalStdoutWrite: typeof process.stdout.write;
  let originalStderrWrite: typeof process.stderr.write;

  beforeEach(() => {
    originalStdoutWrite = process.stdout.write;
    originalStderrWrite = process.stderr.write;
  });

  afterEach(() => {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    vi.restoreAllMocks();
  });

  it('patchStdio redirects stdout and stderr to logger', () => {
    const logger = {
      log: vi.fn(),
      warn: vi.fn(),
    };

    const cleanup = patchStdio(logger);

    process.stdout.write('test stdout');
    expect(logger.log).toHaveBeenCalledWith('test stdout');

    process.stderr.write('test stderr');
    expect(logger.warn).toHaveBeenCalledWith('test stderr');

    cleanup();

    // Verify cleanup
    expect(process.stdout.write).toBe(originalStdoutWrite);
    expect(process.stderr.write).toBe(originalStderrWrite);
  });

  it('createInkStdio writes to real stdout/stderr bypassing patch', () => {
    const logger = {
      log: vi.fn(),
      warn: vi.fn(),
    };

    const cleanup = patchStdio(logger);
    const { stdout: inkStdout, stderr: inkStderr } = createInkStdio();

    inkStdout.write('ink stdout');
    expect(logger.log).not.toHaveBeenCalled();

    inkStderr.write('ink stderr');
    expect(logger.warn).not.toHaveBeenCalled();

    cleanup();
  });
});
