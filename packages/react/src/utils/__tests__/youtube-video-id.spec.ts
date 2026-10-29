import { describe, expect, it } from 'vitest';
import { getYouTubeVideoId } from '../youtube-video-id';

describe('getYouTubeVideoId', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
    ['https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s'],
    ['https://m.youtube.com/watch?feature=share&v=dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?si=abc'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ'],
    ['https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'],
  ])('reads the id from %s', (href) => {
    expect(getYouTubeVideoId(href)).toBe('dQw4w9WgXcQ');
  });

  it.each([
    [
      'a look-alike host',
      'https://youtube.com.example.com/watch?v=dQw4w9WgXcQ',
    ],
    ['a channel page', 'https://www.youtube.com/@opencx'],
    ['a playlist', 'https://www.youtube.com/playlist?list=PL1234567890'],
    ['a malformed id', 'https://www.youtube.com/watch?v=dQw4w9"><x1'],
    ['a relative link', '/watch?v=dQw4w9WgXcQ'],
    ['a javascript: URL', 'javascript:alert(1)//youtu.be/dQw4w9WgXcQ'],
  ])('ignores %s', (_case, href) => {
    expect(getYouTubeVideoId(href)).toBeNull();
  });
});
