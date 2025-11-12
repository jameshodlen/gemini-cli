/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type * as osActual from 'node:os';
import { FatalConfigError, ideContextStore } from '@google/gemini-cli-core';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  loadTrustedFolders,
  getTrustedFoldersPath,
  TrustLevel,
  isWorkspaceTrusted,
  resetTrustedFoldersForTesting,
} from './trustedFolders.js';
import type { Settings } from './settings.js';

vi.mock('os', async (importOriginal) => {
  const actualOs = await importOriginal<typeof osActual>();
  return {
    ...actualOs,
    platform: vi.fn(() => 'linux'),
  };
});

describe('trustedFolders module tests', () => {
  let tempHomeDir: string;
  const mockSettings: Settings = {
    security: {
      folderTrust: {
        enabled: true,
      },
    },
  };

  function writeTrustedFolders(config: Record<string, TrustLevel>) {
    const trustedFoldersPath = getTrustedFoldersPath();
    fs.mkdirSync(path.dirname(trustedFoldersPath), { recursive: true });
    fs.writeFileSync(trustedFoldersPath, JSON.stringify(config));
  }

  beforeEach(() => {
    resetTrustedFoldersForTesting();
    vi.resetAllMocks();
    tempHomeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-home-'),
    );
    vi.spyOn(os, 'homedir').mockReturnValue(tempHomeDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tempHomeDir, { recursive: true, force: true });
  });

  describe('loadTrustedFolders', () => {
    it('should load empty rules if no files exist', () => {
      const { rules, errors } = loadTrustedFolders();
      expect(rules).toEqual([]);
      expect(errors).toEqual([]);
    });

    it('should load user rules if only user file exists', () => {
      const userPath = getTrustedFoldersPath();
      fs.mkdirSync(path.dirname(userPath), { recursive: true });
      const userContent = {
        '/user/folder': TrustLevel.TRUST_FOLDER,
      };
      fs.writeFileSync(userPath, JSON.stringify(userContent));

      const { rules, errors } = loadTrustedFolders();
      expect(rules).toEqual([
        { path: '/user/folder', trustLevel: TrustLevel.TRUST_FOLDER },
      ]);
      expect(errors).toEqual([]);
    });

    it('should handle JSON parsing errors gracefully', () => {
      const userPath = getTrustedFoldersPath();
      fs.mkdirSync(path.dirname(userPath), { recursive: true });
      fs.writeFileSync(userPath, 'invalid json');

      const { rules, errors } = loadTrustedFolders();
      expect(rules).toEqual([]);
      expect(errors.length).toBe(1);
      expect(errors[0].path).toBe(userPath);
      expect(errors[0].message).toContain('Unexpected token');
    });

    it('setValue should update the user config and save it', () => {
      const loadedFolders = loadTrustedFolders();
      loadedFolders.setValue('/new/path', TrustLevel.TRUST_FOLDER);

      expect(loadedFolders.user.config['/new/path']).toBe(
        TrustLevel.TRUST_FOLDER,
      );
      const content = fs.readFileSync(getTrustedFoldersPath(), 'utf-8');
      expect(JSON.parse(content)).toEqual({
        '/new/path': TrustLevel.TRUST_FOLDER,
      });
    });
  });

  describe('isPathTrusted', () => {
    function setup({ config = {} as Record<string, TrustLevel> } = {}) {
      const trustedFoldersPath = getTrustedFoldersPath();
      fs.mkdirSync(path.dirname(trustedFoldersPath), { recursive: true });
      fs.writeFileSync(trustedFoldersPath, JSON.stringify(config));
      const folders = loadTrustedFolders();
      return { folders };
    }

    it('provides a method to determine if a path is trusted', () => {
      const { folders } = setup({
        config: {
          './myfolder': TrustLevel.TRUST_FOLDER,
          '/trustedparent/trustme': TrustLevel.TRUST_PARENT,
          '/user/folder': TrustLevel.TRUST_FOLDER,
          '/secret': TrustLevel.DO_NOT_TRUST,
          '/secret/publickeys': TrustLevel.TRUST_FOLDER,
        },
      });
      expect(folders.isPathTrusted('/secret')).toBe(false);
      expect(folders.isPathTrusted('/user/folder')).toBe(true);
      expect(folders.isPathTrusted('/secret/publickeys/public.pem')).toBe(true);
      expect(folders.isPathTrusted('/user/folder/harhar')).toBe(true);
      expect(folders.isPathTrusted('myfolder/somefile.jpg')).toBe(true);
      expect(folders.isPathTrusted('/trustedparent/someotherfolder')).toBe(
        true,
      );
      expect(folders.isPathTrusted('/trustedparent/trustme')).toBe(true);

      // No explicit rule covers this file
      expect(folders.isPathTrusted('/secret/bankaccounts.json')).toBe(
        undefined,
      );
      expect(folders.isPathTrusted('/secret/mine/privatekey.pem')).toBe(
        undefined,
      );
      expect(folders.isPathTrusted('/user/someotherfolder')).toBe(undefined);
    });
  });

  describe('isWorkspaceTrusted', () => {
    let mockCwd: string;

    beforeEach(() => {
      vi.spyOn(process, 'cwd').mockImplementation(() => mockCwd);
    });

    it('should throw a fatal error if the config is malformed', () => {
      mockCwd = '/home/user/projectA';
      const trustedFoldersPath = getTrustedFoldersPath();
      fs.mkdirSync(path.dirname(trustedFoldersPath), { recursive: true });
      fs.writeFileSync(trustedFoldersPath, '{"foo": "bar",}'); // Malformed JSON
      expect(() => isWorkspaceTrusted(mockSettings)).toThrow(FatalConfigError);
    });

    it('should return true for a directly trusted folder', () => {
      mockCwd = '/home/user/projectA';
      writeTrustedFolders({
        '/home/user/projectA': TrustLevel.TRUST_FOLDER,
      });
      expect(isWorkspaceTrusted(mockSettings)).toEqual({
        isTrusted: true,
        source: 'file',
      });
    });

    it('should return true for a child of a trusted folder', () => {
      mockCwd = '/home/user/projectA/src';
      writeTrustedFolders({
        '/home/user/projectA': TrustLevel.TRUST_FOLDER,
      });
      expect(isWorkspaceTrusted(mockSettings)).toEqual({
        isTrusted: true,
        source: 'file',
      });
    });

    it('should return false for a directly untrusted folder', () => {
      mockCwd = '/home/user/untrusted';
      writeTrustedFolders({
        '/home/user/untrusted': TrustLevel.DO_NOT_TRUST,
      });
      expect(isWorkspaceTrusted(mockSettings)).toEqual({
        isTrusted: false,
        source: 'file',
      });
    });
  });

  describe('isWorkspaceTrusted with IDE override', () => {
    afterEach(() => {
      ideContextStore.clear();
    });

    it('should return true when ideTrust is true, ignoring config', () => {
      ideContextStore.set({ workspaceState: { isTrusted: true } });
      // Even if config says don't trust, ideTrust should win.
      writeTrustedFolders({ [process.cwd()]: TrustLevel.DO_NOT_TRUST });
      expect(isWorkspaceTrusted(mockSettings)).toEqual({
        isTrusted: true,
        source: 'ide',
      });
    });

    it('should return false when ideTrust is false, ignoring config', () => {
      ideContextStore.set({ workspaceState: { isTrusted: false } });
      // Even if config says trust, ideTrust should win.
      writeTrustedFolders({ [process.cwd()]: TrustLevel.TRUST_FOLDER });
      expect(isWorkspaceTrusted(mockSettings)).toEqual({
        isTrusted: false,
        source: 'ide',
      });
    });

    it('should fall back to config when ideTrust is undefined', () => {
      writeTrustedFolders({ [process.cwd()]: TrustLevel.TRUST_FOLDER });
      expect(isWorkspaceTrusted(mockSettings)).toEqual({
        isTrusted: true,
        source: 'file',
      });
    });

    it('should always return true if folderTrust setting is disabled', () => {
      const settings: Settings = {
        security: {
          folderTrust: {
            enabled: false,
          },
        },
      };
      ideContextStore.set({ workspaceState: { isTrusted: false } });
      expect(isWorkspaceTrusted(settings)).toEqual({
        isTrusted: true,
        source: undefined,
      });
    });
  });
});
