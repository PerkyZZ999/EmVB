/** Inputs for the resolveEmbedUrl golden (W-086 L7): hosts × path shapes × ids, plus refusals. */
const ids = ["dQw4w9WgXcQ", "abc-_12", "short", "a b c d e f", "123456789", "12345", ""];
const ytHosts = [
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "YouTube.COM",
  "youtu.be",
  "www.youtu.be",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
  "evil-youtube.com",
];
const vimeoHosts = ["vimeo.com", "www.vimeo.com", "player.vimeo.com", "Vimeo.com", "vimeo.co"];
const paths = (id: string) => [
  `/${id}`,
  `/${id}/extra`,
  `//${id}`,
  `/watch?v=${id}`,
  `/watch?v=${id}&autoplay=1`,
  `/watch?autoplay=1&v=${id}`,
  `/embed/${id}`,
  `/embed/${id}?autoplay=1`,
  `/embed//${id}`,
  `/shorts/${id}`,
  `/shorts/${id}/x`,
  `/video/${id}`,
  `/channel/video/${id}`,
  `/video/`,
];

export function embedUrlCases(): string[] {
  const out: string[] = [];
  for (const scheme of ["https://", "http://", "ftp://", "HTTPS://"])
    for (const host of [...ytHosts, ...vimeoHosts])
      for (const id of ids) for (const path of paths(id)) out.push(`${scheme}${host}${path}`);
  out.push(
    "",
    "   ",
    "x".repeat(2001),
    `https://youtu.be/${"a".repeat(1990)}`,
    "  https://youtu.be/dQw4w9WgXcQ  ",
    "https://you tu.be/dQw4w9WgXcQ",
    "javascript:alert(1)",
    "data:video/mp4;base64,AAAA",
    "/_emdash/api/media/file/01VID.mp4",
    "/_emdash/api/media/file/01VID",
    "media/clip.webm",
    "//cdn.example/clip.mp4",
    "https://cdn.example/clip.webm",
    "https://cdn.example/clip.MP4?x=1",
    "https://cdn.example/clip.ogg#t",
    "https://cdn.example/clip.mov",
    "https://cdn.example/_emdash/api/media/file/01VID",
    "https://cdn.example/clip.mp4.html",
    "https://[::1]/clip.mp4",
    "https://user:pass@cdn.example/clip.mp4",
    "http://",
  );
  return out;
}
