/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, afterEach } from 'vitest';
import { getStartupWarnings, WARNINGS_FILE_PATH } from './startupWarnings.js';
import fs from 'node:fs';
import path from 'node:path';

describe('startupWarnings', () => {
  afterEach(() => {
    // Robust cleanup to ensure atomicity
    if (fs.existsSync(WARNINGS_FILE_PATH)) {
      try {
        // Ensure file is writable before deleting
        fs.chmodSync(WARNINGS_FILE_PATH, 0o600);
      } catch {
        // Ignore errors if chmod fails (e.g., file owned by another user)
      }
      // Ensure parent dir is writable before deleting
      const dir = path.dirname(WARNINGS_FILE_PATH);
      try {
        fs.chmodSync(dir, 0o700);
      } catch {
        // Ignore errors
      }
      fs.rmSync(WARNINGS_FILE_PATH, { force: true });
    }
  });

  it('should return warnings from the file and delete it', async () => {
    const mockWarnings = 'Warning 1\nWarning 2';
    fs.writeFileSync(WARNINGS_FILE_PATH, mockWarnings);

    const warnings = await getStartupWarnings();

    expect(warnings).toEqual(['Warning 1', 'Warning 2']);
    expect(fs.existsSync(WARNINGS_FILE_PATH)).toBe(false);
  });

  it('should return an empty array if the file does not exist', async () => {
    const warnings = await getStartupWarnings();
    expect(warnings).toEqual([]);
  });

  it('should return an error message if reading the file fails', async () => {
    fs.writeFileSync(WARNINGS_FILE_PATH, 'Warnings');
    fs.chmodSync(WARNINGS_FILE_PATH, 0o000); // Make file unreadable

    const warnings = await getStartupWarnings();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(
      'Error checking/reading warnings file: EACCES: permission denied',
    );
  });

  it('should return a warning if deleting the file fails', async () => {
    const mockWarnings = 'Warning 1';
    fs.writeFileSync(WARNINGS_FILE_PATH, mockWarnings);
    const dir = path.dirname(WARNINGS_FILE_PATH);

    try {
      fs.chmodSync(dir, 0o500); // Make directory read-only to prevent deletion

      const warnings = await getStartupWarnings();

      expect(warnings).toEqual([
        'Warning 1',
        'Warning: Could not delete temporary warnings file.',
      ]);
      // File should still exist because the deletion failed
      expect(fs.existsSync(WARNINGS_FILE_PATH)).toBe(true);
    } finally {
      // Restore permissions immediately to ensure atomicity
      fs.chmodSync(dir, 0o700);
    }
  });
});
