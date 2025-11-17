/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, it, describe, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  ConversationRecord,
  ToolCallRecord,
} from './chatRecordingService.js';
import { ChatRecordingService } from './chatRecordingService.js';
import type { Config } from '../config/config.js';
import { getProjectHash } from '../utils/paths.js';

vi.mock('node:crypto', () => ({
  randomUUID: vi.fn(),
  createHash: vi.fn(() => ({
    update: vi.fn(() => ({
      digest: vi.fn(() => 'mocked-hash'),
    })),
  })),
}));
vi.mock('../utils/paths.js');

describe('ChatRecordingService', () => {
  let chatRecordingService: ChatRecordingService;
  let mockConfig: Config;
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'chatRecordingService-test-'),
    );
    mockConfig = {
      getSessionId: vi.fn().mockReturnValue('test-session-id'),
      getProjectRoot: vi.fn().mockReturnValue(tempDir),
      storage: {
        getProjectTempDir: vi
          .fn()
          .mockReturnValue(path.join(tempDir, '.gemini/tmp')),
      },
      getModel: vi.fn().mockReturnValue('gemini-pro'),
      getDebugMode: vi.fn().mockReturnValue(false),
      getToolRegistry: vi.fn().mockReturnValue({
        getTool: vi.fn().mockReturnValue({
          displayName: 'Test Tool',
          description: 'A test tool',
          isOutputMarkdown: false,
        }),
      }),
    } as unknown as Config;

    vi.mocked(getProjectHash).mockReturnValue('test-project-hash');
    vi.mocked(randomUUID).mockReturnValue('this-is-a-test-uuid');

    chatRecordingService = new ChatRecordingService(mockConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('initialize', () => {
    it('should create a new session if none is provided', () => {
      chatRecordingService.initialize();

      const chatDir = path.join(tempDir, '.gemini/tmp/chats');
      expect(fs.existsSync(chatDir)).toBe(true);
    });

    it('should resume from an existing session if provided', () => {
      const chatDir = path.join(tempDir, '.gemini/tmp/chats');
      fs.mkdirSync(chatDir, { recursive: true });
      const sessionPath = path.join(chatDir, 'session.json');
      fs.writeFileSync(
        sessionPath,
        JSON.stringify({
          sessionId: 'old-session-id',
          projectHash: 'test-project-hash',
          messages: [],
        }),
      );

      chatRecordingService.initialize({
        filePath: sessionPath,
        conversation: {
          sessionId: 'old-session-id',
        } as ConversationRecord,
      });

      expect(fs.existsSync(sessionPath)).toBe(true);
    });
  });

  describe('recordMessage', () => {
    beforeEach(() => {
      chatRecordingService.initialize();
    });

    it('should record a new message', () => {
      chatRecordingService.recordMessage({
        type: 'user',
        content: 'Hello',
        model: 'gemini-pro',
      });
      const conversation = JSON.parse(
        fs.readFileSync(chatRecordingService['conversationFile']!, 'utf-8'),
      ) as ConversationRecord;

      expect(conversation.messages).toHaveLength(1);
      expect(conversation.messages[0].content).toBe('Hello');
      expect(conversation.messages[0].type).toBe('user');
    });

    it('should create separate messages when recording multiple messages', () => {
      chatRecordingService.recordMessage({
        type: 'user',
        content: 'Hello',
        model: 'gemini-pro',
      });
      chatRecordingService.recordMessage({
        type: 'user',
        content: 'World',
        model: 'gemini-pro',
      });

      const conversation = JSON.parse(
        fs.readFileSync(chatRecordingService['conversationFile']!, 'utf-8'),
      ) as ConversationRecord;
      expect(conversation.messages).toHaveLength(2);
      expect(conversation.messages[0].content).toBe('Hello');
      expect(conversation.messages[1].content).toBe('World');
    });
  });

  describe('recordThought', () => {
    it('should queue a thought', () => {
      chatRecordingService.initialize();
      chatRecordingService.recordThought({
        subject: 'Thinking',
        description: 'Thinking...',
      });
      // @ts-expect-error private property
      expect(chatRecordingService.queuedThoughts).toHaveLength(1);
      // @ts-expect-error private property
      expect(chatRecordingService.queuedThoughts[0].subject).toBe('Thinking');
      // @ts-expect-error private property
      expect(chatRecordingService.queuedThoughts[0].description).toBe(
        'Thinking...',
      );
    });
  });

  describe('recordMessageTokens', () => {
    it('should update the last message with token info', () => {
      const initialConversation = {
        sessionId: 'test-session-id',
        projectHash: 'test-project-hash',
        messages: [
          {
            id: '1',
            type: 'gemini',
            content: 'Response',
            timestamp: new Date().toISOString(),
          },
        ],
      };
      const sessionPath = path.join(
        tempDir,
        '.gemini/tmp/chats/test-session-id.json',
      );
      fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
      fs.writeFileSync(sessionPath, JSON.stringify(initialConversation));

      chatRecordingService.initialize({
        filePath: sessionPath,
        conversation: initialConversation as ConversationRecord,
      });

      chatRecordingService.recordMessageTokens({
        promptTokenCount: 1,
        candidatesTokenCount: 2,
        totalTokenCount: 3,
        cachedContentTokenCount: 0,
      });

      const conversation = JSON.parse(
        fs.readFileSync(chatRecordingService['conversationFile']!, 'utf-8'),
      ) as ConversationRecord;

      expect(conversation.messages[0]).toEqual({
        ...initialConversation.messages[0],
        tokens: {
          input: 1,
          output: 2,
          total: 3,
          cached: 0,
          thoughts: 0,
          tool: 0,
        },
      });
    });

    it('should queue token info if the last message already has tokens', () => {
      const initialConversation = {
        sessionId: 'test-session-id',
        projectHash: 'test-project-hash',
        messages: [
          {
            id: '1',
            type: 'gemini',
            content: 'Response',
            timestamp: new Date().toISOString(),
            tokens: { input: 1, output: 1, total: 2, cached: 0 },
          },
        ],
      };

      const sessionPath = path.join(
        tempDir,
        '.gemini/tmp/chats/test-session-id.json',
      );
      fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
      fs.writeFileSync(sessionPath, JSON.stringify(initialConversation));
      chatRecordingService.initialize({
        filePath: sessionPath,
        conversation: initialConversation as ConversationRecord,
      });

      chatRecordingService.recordMessageTokens({
        promptTokenCount: 2,
        candidatesTokenCount: 2,
        totalTokenCount: 4,
        cachedContentTokenCount: 0,
      });

      // @ts-expect-error private property
      expect(chatRecordingService.queuedTokens).toEqual({
        input: 2,
        output: 2,
        total: 4,
        cached: 0,
        thoughts: 0,
        tool: 0,
      });
    });
  });

  describe('recordToolCalls', () => {
    it('should add new tool calls to the last message', () => {
      const initialConversation = {
        sessionId: 'test-session-id',
        projectHash: 'test-project-hash',
        messages: [
          {
            id: '1',
            type: 'gemini',
            content: '',
            timestamp: new Date().toISOString(),
          },
        ],
      };
      const sessionPath = path.join(
        tempDir,
        '.gemini/tmp/chats/test-session-id.json',
      );
      fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
      fs.writeFileSync(sessionPath, JSON.stringify(initialConversation));

      chatRecordingService.initialize({
        filePath: sessionPath,
        conversation: initialConversation as ConversationRecord,
      });

      const toolCall: ToolCallRecord = {
        id: 'tool-1',
        name: 'testTool',
        args: {},
        status: 'awaiting_approval',
        timestamp: new Date().toISOString(),
      };
      chatRecordingService.recordToolCalls('gemini-pro', [toolCall]);

      const conversation = JSON.parse(
        fs.readFileSync(chatRecordingService['conversationFile']!, 'utf-8'),
      ) as ConversationRecord;

      expect(conversation.messages[0]).toEqual({
        ...initialConversation.messages[0],
        toolCalls: [
          {
            ...toolCall,
            displayName: 'Test Tool',
            description: 'A test tool',
            renderOutputAsMarkdown: false,
          },
        ],
      });
    });

    it('should create a new message if the last message is not from gemini', () => {
      const sessionPath = path.join(
        tempDir,
        '.gemini/tmp/chats/test-session-id.json',
      );
      const initialConversation = {
        sessionId: 'test-session-id',
        projectHash: 'test-project-hash',
        messages: [
          {
            id: 'a-uuid',
            type: 'user',
            content: 'call a tool',
            timestamp: new Date().toISOString(),
          },
        ],
      };
      fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
      fs.writeFileSync(sessionPath, JSON.stringify(initialConversation));
      chatRecordingService.initialize({
        filePath: sessionPath,
        conversation: initialConversation as ConversationRecord,
      });

      const toolCall: ToolCallRecord = {
        id: 'tool-1',
        name: 'testTool',
        args: {},
        status: 'awaiting_approval',
        timestamp: new Date().toISOString(),
      };
      chatRecordingService.recordToolCalls('gemini-pro', [toolCall]);

      const conversation = JSON.parse(
        fs.readFileSync(sessionPath, 'utf-8'),
      ) as ConversationRecord;

      expect(conversation.messages).toHaveLength(2);
      expect(conversation.messages[1]).toEqual({
        ...conversation.messages[1],
        id: 'this-is-a-test-uuid',
        model: 'gemini-pro',
        type: 'gemini',
        thoughts: [],
        content: '',
        toolCalls: [
          {
            ...toolCall,
            displayName: 'Test Tool',
            description: 'A test tool',
            renderOutputAsMarkdown: false,
          },
        ],
      });
    });
  });

  describe('deleteSession', () => {
    it('should delete the session file', () => {
      const sessionPath = path.join(
        tempDir,
        '.gemini/tmp/chats/test-session-id.json',
      );
      fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
      fs.writeFileSync(sessionPath, 'test');
      chatRecordingService.deleteSession('test-session-id');
      expect(fs.existsSync(sessionPath)).toBe(false);
    });
  });
});
