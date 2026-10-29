import { closeSync, fstatSync, lstatSync, openSync, readSync, realpathSync, type Stats } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import type { AttachmentPayload } from './media-codec.js';

const formats = { wav: ['voice', 'audio/wav'], ogg: ['voice', 'audio/ogg'], png: ['image', 'image/png'], jpg: ['image', 'image/jpeg'], jpeg: ['image', 'image/jpeg'], mp4: ['video', 'video/mp4'] } as const;
const inside = (root: string, path: string) => { const r = relative(root, path); return !!r && !r.startsWith('..') && !isAbsolute(r); };
const stamp = (s: Stats) => [s.dev, s.ino, s.size, s.mtimeMs, s.ctimeMs].join(':');

// The inbox contains operator-supplied originals, not an application media cache.
// Read one bounded file; never delete or modify the operator's original.
export class LocalMediaInbox {
  constructor(readonly root = resolve('.local/media-inbox')) {}
  load(name: string, kind: AttachmentPayload['kind'], audioMatters = false) {
    if (!/^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,95}\.(?:wav|ogg|png|jpe?g|mp4)$/iu.test(name) || name.includes('..')) throw new Error('Use a supported inbox filename, without a path or URL');
    const extension = name.split('.').at(-1)!.toLowerCase() as keyof typeof formats; const format = formats[extension];
    if (!format || format[0] !== kind || (audioMatters && kind !== 'video')) throw new Error('Attachment kind/extension or audio flag mismatch');
    let fd: number | undefined;
    try {
      const workspace = realpathSync('.'); const root = realpathSync(this.root); const path = join(root, name);
      if (!inside(workspace, root) || lstatSync(this.root).isSymbolicLink() || lstatSync(path).isSymbolicLink() || !inside(root, realpathSync(path))) throw new Error('Outside inbox');
      const before = lstatSync(path); const maximum = kind === 'image' ? 2_000_000 : kind === 'video' ? 8_000_000 : 29_000_000;
      if (!before.isFile() || before.size <= 0 || before.size > maximum) throw new Error('Input size/type');
      fd = openSync(path, 'r'); if (stamp(fstatSync(fd)) !== stamp(before)) throw new Error('Input changed');
      const bytes = Buffer.alloc(before.size); let offset = 0;
      try {
        while (offset < bytes.length) { const n = readSync(fd, bytes, offset, bytes.length - offset, offset); if (!n) throw new Error('Input truncated'); offset += n; }
        if (stamp(fstatSync(fd)) !== stamp(before)) throw new Error('Input changed');
      } catch { bytes.fill(0); throw new Error('Input changed'); }
      let disposed = false;
      const current = () => { try { return !disposed && realpathSync(this.root) === root && !lstatSync(path).isSymbolicLink() && inside(root, realpathSync(path)) && stamp(lstatSync(path)) === stamp(before); } catch { return false; } };
      return { payload: { kind, mime: format[1], bytes, synthetic: true, ...(kind === 'video' ? { audioMatters } : {}) } as AttachmentPayload, current, dispose: () => { disposed = true; bytes.fill(0); } };
    } catch { throw new Error('Attachment unavailable, changed, outside inbox or beyond size limits'); }
    finally { if (fd !== undefined) closeSync(fd); }
  }
}
