/**
 * Tests for useOcrExtraction hook — exercises upload + extract flow with mocked copilotApi.
 */

vi.mock('../../copilotApi.js', () => ({
  uploadFile: vi.fn(),
  executeTool: vi.fn(),
  extractAnswerText: vi.fn((r) => r?.answer ?? ''),
}));

import { renderHook, act, waitFor } from '@testing-library/react';
import { useOcrExtraction } from '../useOcrExtraction.js';
import { uploadFile, executeTool, extractAnswerText } from '../../copilotApi.js';

const defaultParams = {
  token: 'test-token',
  toolName: 'SimpleOcrTool',
  question: 'Extract invoice data',
};

describe('useOcrExtraction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with idle status and null error', () => {
    const { result } = renderHook(() => useOcrExtraction(defaultParams));
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
    expect(typeof result.current.extract).toBe('function');
    expect(typeof result.current.reset).toBe('function');
  });

  it('extract rejects when no file is provided', async () => {
    const { result } = renderHook(() => useOcrExtraction(defaultParams));
    let error;
    await act(async () => {
      try {
        await result.current.extract(null);
      } catch (e) {
        error = e;
      }
    });
    expect(error.message).toBe('No file provided');
  });

  it('extract rejects when token is missing', async () => {
    const { result } = renderHook(() =>
      useOcrExtraction({ ...defaultParams, token: '' }),
    );
    const file = new File(['content'], 'invoice.pdf');
    let error;
    await act(async () => {
      try {
        await result.current.extract(file);
      } catch (e) {
        error = e;
      }
    });
    expect(error.message).toBe('Missing auth token');
  });

  it('transitions through uploading -> extracting -> done on success', async () => {
    uploadFile.mockResolvedValue({ file: '/tmp/uploaded.pdf' });
    executeTool.mockResolvedValue({ answer: JSON.stringify({ total: 100 }) });
    extractAnswerText.mockReturnValue(JSON.stringify({ total: 100 }));

    const { result } = renderHook(() => useOcrExtraction(defaultParams));
    const file = new File(['pdf'], 'test.pdf');

    let parsed;
    await act(async () => {
      parsed = await result.current.extract(file);
    });

    expect(result.current.status).toBe('done');
    expect(result.current.error).toBeNull();
    expect(parsed).toEqual({ total: 100 });
  });

  it('sets error status on upload failure', async () => {
    uploadFile.mockRejectedValue(new Error('Upload failed'));

    const { result } = renderHook(() => useOcrExtraction(defaultParams));
    const file = new File(['pdf'], 'test.pdf');

    let error;
    await act(async () => {
      try {
        await result.current.extract(file);
      } catch (e) {
        error = e;
      }
    });

    expect(error.message).toBe('Upload failed');
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Upload failed');
  });

  it('sets error when upload returns no file path', async () => {
    uploadFile.mockResolvedValue({});

    const { result } = renderHook(() => useOcrExtraction(defaultParams));
    const file = new File(['pdf'], 'test.pdf');

    let error;
    await act(async () => {
      try {
        await result.current.extract(file);
      } catch (e) {
        error = e;
      }
    });

    expect(error.message).toContain('Upload did not return a file path');
    expect(result.current.status).toBe('error');
  });

  it('extracts file path from fileId field', async () => {
    uploadFile.mockResolvedValue({ fileId: '/tmp/alt.pdf' });
    executeTool.mockResolvedValue({ answer: '{"items":[]}' });
    extractAnswerText.mockReturnValue('{"items":[]}');

    const { result } = renderHook(() => useOcrExtraction(defaultParams));
    const file = new File(['pdf'], 'test.pdf');

    await act(async () => {
      await result.current.extract(file);
    });

    expect(executeTool).toHaveBeenCalledWith('test-token', expect.objectContaining({
      params: expect.objectContaining({ path: '/tmp/alt.pdf' }),
    }));
  });

  it('extracts file path from first string value in upload response', async () => {
    uploadFile.mockResolvedValue({ someField: '/tmp/dynamic.pdf' });
    executeTool.mockResolvedValue({ answer: '{"data":"ok"}' });
    extractAnswerText.mockReturnValue('{"data":"ok"}');

    const { result } = renderHook(() => useOcrExtraction(defaultParams));
    const file = new File(['pdf'], 'test.pdf');

    await act(async () => {
      await result.current.extract(file);
    });

    expect(executeTool).toHaveBeenCalledWith('test-token', expect.objectContaining({
      params: expect.objectContaining({ path: '/tmp/dynamic.pdf' }),
    }));
  });

  it('sets error status on extraction failure', async () => {
    uploadFile.mockResolvedValue({ file: '/tmp/ok.pdf' });
    executeTool.mockRejectedValue(new Error('Tool error'));

    const { result } = renderHook(() => useOcrExtraction(defaultParams));
    const file = new File(['pdf'], 'test.pdf');

    let error;
    await act(async () => {
      try {
        await result.current.extract(file);
      } catch (e) {
        error = e;
      }
    });

    expect(error.message).toBe('Tool error');
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Tool error');
  });

  it('sets error when tool returns unparseable response', async () => {
    uploadFile.mockResolvedValue({ file: '/tmp/ok.pdf' });
    executeTool.mockResolvedValue({ answer: 'not json at all' });
    extractAnswerText.mockReturnValue('not json at all');

    const { result } = renderHook(() => useOcrExtraction(defaultParams));
    const file = new File(['pdf'], 'test.pdf');

    let error;
    await act(async () => {
      try {
        await result.current.extract(file);
      } catch (e) {
        error = e;
      }
    });

    expect(error.message).toContain('unparseable');
    expect(result.current.status).toBe('error');
  });

  it('passes structuredOutputSchema to tool params when provided', async () => {
    const schema = { type: 'object', properties: { total: { type: 'number' } } };
    uploadFile.mockResolvedValue({ file: '/tmp/ok.pdf' });
    executeTool.mockResolvedValue({ answer: '{"total":50}' });
    extractAnswerText.mockReturnValue('{"total":50}');

    const { result } = renderHook(() =>
      useOcrExtraction({ ...defaultParams, structuredOutputSchema: schema }),
    );
    const file = new File(['pdf'], 'test.pdf');

    await act(async () => {
      await result.current.extract(file);
    });

    expect(executeTool).toHaveBeenCalledWith('test-token', expect.objectContaining({
      params: expect.objectContaining({ structured_output_schema: schema }),
    }));
  });

  it('passes structuredOutput string when no schema provided', async () => {
    uploadFile.mockResolvedValue({ file: '/tmp/ok.pdf' });
    executeTool.mockResolvedValue({ answer: '{"x":1}' });
    extractAnswerText.mockReturnValue('{"x":1}');

    const { result } = renderHook(() =>
      useOcrExtraction({ ...defaultParams, structuredOutput: 'InvoiceSchema' }),
    );
    const file = new File(['pdf'], 'test.pdf');

    await act(async () => {
      await result.current.extract(file);
    });

    expect(executeTool).toHaveBeenCalledWith('test-token', expect.objectContaining({
      params: expect.objectContaining({ structured_output: 'InvoiceSchema' }),
    }));
  });

  it('reset restores idle status and clears error', async () => {
    uploadFile.mockRejectedValue(new Error('fail'));

    const { result } = renderHook(() => useOcrExtraction(defaultParams));
    const file = new File(['pdf'], 'test.pdf');

    await act(async () => {
      try {
        await result.current.extract(file);
      } catch {
        // expected
      }
    });
    expect(result.current.status).toBe('error');

    act(() => result.current.reset());
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
  });

  it('handles JSON wrapped in markdown code fences', async () => {
    uploadFile.mockResolvedValue({ file: '/tmp/ok.pdf' });
    const fenced = '```json\n{"items": [1,2,3]}\n```';
    executeTool.mockResolvedValue({ answer: fenced });
    extractAnswerText.mockReturnValue(fenced);

    const { result } = renderHook(() => useOcrExtraction(defaultParams));
    const file = new File(['pdf'], 'test.pdf');

    let parsed;
    await act(async () => {
      parsed = await result.current.extract(file);
    });

    expect(parsed).toEqual({ items: [1, 2, 3] });
    expect(result.current.status).toBe('done');
  });

  it('handles JSON embedded in prose text', async () => {
    uploadFile.mockResolvedValue({ file: '/tmp/ok.pdf' });
    const prose = 'Here is the result: {"total": 42} hope that helps';
    executeTool.mockResolvedValue({ answer: prose });
    extractAnswerText.mockReturnValue(prose);

    const { result } = renderHook(() => useOcrExtraction(defaultParams));
    const file = new File(['pdf'], 'test.pdf');

    let parsed;
    await act(async () => {
      parsed = await result.current.extract(file);
    });

    expect(parsed).toEqual({ total: 42 });
  });

  it('handles answer that is already an object', async () => {
    uploadFile.mockResolvedValue({ file: '/tmp/ok.pdf' });
    const objAnswer = { data: 'parsed' };
    executeTool.mockResolvedValue({ answer: objAnswer });
    extractAnswerText.mockReturnValue(objAnswer);

    const { result } = renderHook(() => useOcrExtraction(defaultParams));
    const file = new File(['pdf'], 'test.pdf');

    let parsed;
    await act(async () => {
      parsed = await result.current.extract(file);
    });

    expect(parsed).toEqual({ data: 'parsed' });
  });
});
