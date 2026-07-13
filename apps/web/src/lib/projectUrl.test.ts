import { describe, it, expect } from 'vitest';
import { normalizeProjectUrl, isValidProjectUrlInput } from './projectUrl.js';

describe('projectUrl', () => {
  it('accepts bare domain', () => {
    expect(normalizeProjectUrl('example.com')).toBe('https://example.com/');
  });
  it('accepts https URL', () => {
    expect(normalizeProjectUrl('https://example.com/path')).toBe('https://example.com/path');
  });
  it('accepts http URL', () => {
    expect(normalizeProjectUrl('http://example.com')).toBe('http://example.com/');
  });
  it('rejects empty / garbage', () => {
    expect(isValidProjectUrlInput('')).toBe(false);
    expect(isValidProjectUrlInput('not a url')).toBe(false);
  });
  it('accepts bare domain as valid input', () => {
    expect(isValidProjectUrlInput('example.com')).toBe(true);
    expect(isValidProjectUrlInput('https://example.com')).toBe(true);
  });
  it('rejects ftp scheme', () => {
    expect(isValidProjectUrlInput('ftp://example.com')).toBe(false);
  });
});
