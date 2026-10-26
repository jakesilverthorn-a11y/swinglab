import { describe, expect, it } from 'vitest';
import { explainError } from './errors';

const MEDIAPIPE_TIMESTAMP =
  'Encountered multiple errors: INVALID_ARGUMENT: Graph has errors: Packet timestamp mismatch on a calculator receiving from stream "norm_rect". Current minimum expected timestamp is 5133001 but received 1000. === Source Location Trace: === third_party/mediapipe/framework/input_stream_manager.cc:159';

describe('explainError', () => {
  it('passes messages written by the app through unchanged', () => {
    expect(explainError(new Error('The video could not be loaded. Try an .mp4 or .mov file.'))).toEqual({
      message: 'The video could not be loaded. Try an .mp4 or .mov file.',
    });
  });

  it('replaces a MediaPipe timestamp error with advice and keeps the original as a detail', () => {
    const out = explainError(new Error(MEDIAPIPE_TIMESTAMP));
    expect(out.message).toMatch(/try again/i);
    expect(out.message).not.toMatch(/norm_rect|INVALID_ARGUMENT/);
    expect(out.detail).toContain('norm_rect');
  });

  it('recognizes running out of memory', () => {
    const out = explainError(new Error('RuntimeError: memory access out of bounds'));
    expect(out.message).toMatch(/memory/i);
    expect(out.detail).toBeDefined();
  });

  it('gives a generic recovery message for other runtime failures', () => {
    const out = explainError(new Error('RuntimeError: unreachable'));
    expect(out.message).toMatch(/reopen the app/i);
  });

  it('copes with values that are not errors', () => {
    expect(explainError(undefined).message).toMatch(/something went wrong/i);
    expect(explainError('plain text problem')).toEqual({ message: 'plain text problem' });
  });

  it('truncates a very long raw message in the detail', () => {
    const out = explainError(new Error(`CalculatorGraph ${'x'.repeat(3000)}`));
    expect(out.detail!.length).toBeLessThan(1300);
  });
});
