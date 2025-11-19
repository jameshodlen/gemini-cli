/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { format } from 'node:util';
import { debugLogger } from './debugLogger.js';
import { coreEvents } from './events.js';

describe('DebugLogger', () => {
  // Spy on coreEvents.emitConsoleLog before each test
  beforeEach(() => {
    vi.spyOn(coreEvents, 'emitConsoleLog').mockImplementation(() => {});
  });

  // Restore mocks after each test
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should call emitConsoleLog("log", ...) with the correct arguments', () => {
    const message = 'This is a log message';
    const data = { key: 'value' };
    debugLogger.log(message, data);
    expect(coreEvents.emitConsoleLog).toHaveBeenCalledWith(
      'log',
      format(message, data),
    );
    expect(coreEvents.emitConsoleLog).toHaveBeenCalledTimes(1);
  });

  it('should call emitConsoleLog("warn", ...) with the correct arguments', () => {
    const message = 'This is a warning message';
    const data = [1, 2, 3];
    debugLogger.warn(message, data);
    expect(coreEvents.emitConsoleLog).toHaveBeenCalledWith(
      'warn',
      format(message, data),
    );
    expect(coreEvents.emitConsoleLog).toHaveBeenCalledTimes(1);
  });

  it('should call emitConsoleLog("error", ...) with the correct arguments', () => {
    const message = 'This is an error message';
    const error = new Error('Something went wrong');
    debugLogger.error(message, error);
    // format(error) produces the stack trace or error message string
    expect(coreEvents.emitConsoleLog).toHaveBeenCalledWith(
      'error',
      format(message, error),
    );
    expect(coreEvents.emitConsoleLog).toHaveBeenCalledTimes(1);
  });

  it('should call emitConsoleLog("debug", ...) with the correct arguments', () => {
    const message = 'This is a debug message';
    const obj = { a: { b: 'c' } };
    debugLogger.debug(message, obj);
    expect(coreEvents.emitConsoleLog).toHaveBeenCalledWith(
      'debug',
      format(message, obj),
    );
    expect(coreEvents.emitConsoleLog).toHaveBeenCalledTimes(1);
  });

  it('should handle multiple arguments correctly for all methods', () => {
    debugLogger.log('one', 2, true);
    expect(coreEvents.emitConsoleLog).toHaveBeenCalledWith(
      'log',
      format('one', 2, true),
    );

    debugLogger.warn('one', 2, false);
    expect(coreEvents.emitConsoleLog).toHaveBeenCalledWith(
      'warn',
      format('one', 2, false),
    );

    debugLogger.error('one', 2, null);
    expect(coreEvents.emitConsoleLog).toHaveBeenCalledWith(
      'error',
      format('one', 2, null),
    );

    debugLogger.debug('one', 2, undefined);
    expect(coreEvents.emitConsoleLog).toHaveBeenCalledWith(
      'debug',
      format('one', 2, undefined),
    );
  });

  it('should handle calls with no arguments', () => {
    debugLogger.log();
    expect(coreEvents.emitConsoleLog).toHaveBeenCalledWith('log', format());
    expect(coreEvents.emitConsoleLog).toHaveBeenCalledTimes(1);

    vi.mocked(coreEvents.emitConsoleLog).mockClear();

    debugLogger.warn();
    expect(coreEvents.emitConsoleLog).toHaveBeenCalledWith('warn', format());
    expect(coreEvents.emitConsoleLog).toHaveBeenCalledTimes(1);
  });
});
