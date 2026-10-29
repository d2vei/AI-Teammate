# Optional local attachment preparation

`MediaPipeline.ingestAttachment` composes the existing scoped media pipeline with a fixed FFmpeg/ffprobe normalizer. It accepts supplied bytes, never a URL, filename or command. It checks actor/project/room/source permission and private-handling eligibility before conversion, then rechecks configuration, cancellation and source availability before derivation. No attachment acquisition, live launcher or Discord connection is added.

The normalizer converts OGG/Opus or WAV to canonical mono PCM16 WAV at 24 kHz, up to ten minutes. It actually decodes PNG/JPEG images, bounded to 2 MB, 4096 pixels per dimension and 8,294,400 total pixels. MP4 is bounded to 8 MB, one video stream, at most one audio stream, 60 fps and 30 seconds. Both container duration and decoded progress are checked; caller-supplied duration is not trusted. Audio metadata is removed by constructing a new canonical WAV. Image/video bytes and their metadata are preserved after validation.

One job per normalizer runs with fixed arguments, one thread, bounded output, allocation limits and a 30-second timeout per native process. The only input protocol is `fd`, reading an application-owned file descriptor. Child processes receive only OS environment variables; provider/vault credentials and Node preload options are excluded. This is a codec invocation, not a product shell or a model tool. Protocol restrictions are not an OS sandbox or a process-wide memory limit.

Unlike the in-memory canonical path, this optional path stages one raw input under ignored `.local/media-jobs/job-*`. It deletes that job before the provider is called, on normal success, failure or cancellation, after checking the resolved cleanup target stays inside its own root. Caller buffers are unchanged and application-owned copies are cleared where practical. Files inherit local filesystem protection; this is logical deletion, not encryption or guaranteed secure erasure. A host crash can leave a job behind. Inspect only the app's known job directory after stopping it; no automatic broad cleanup is provided. Never place unrelated files or keys there.

## Windows tool setup

The checked installation is a project-linked Gyan Windows build, not a binary distributed or signed by the FFmpeg project. [FFmpeg's download page](https://ffmpeg.org/download.html) links the [Gyan Windows builds](https://www.gyan.dev/ffmpeg/builds/). This optional local tool is GPL-3.0; binaries and its archive/license stay ignored and are not redistributed by this repository.

The manual setup used for this check was:

1. Create `.local/tools/ffmpeg-9.0.2` inside this workspace. Download `https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-9.0.2-essentials_build.zip` and its `.sha256` sidecar there. No global PATH change or alternate executable search is used.
2. Before extraction or execution, compare `Get-FileHash -Algorithm SHA256` with the published sidecar and the pinned archive SHA below. Stop if either differs.
3. Extract only `ffmpeg-9.0.2-essentials_build/bin/ffmpeg.exe`, `ffmpeg-9.0.2-essentials_build/bin/ffprobe.exe` and `ffmpeg-9.0.2-essentials_build/LICENSE` into that directory as `ffmpeg.exe`, `ffprobe.exe` and `LICENSE.txt`. Do not copy an arbitrary system installation.
4. Verify both executable hashes below and their `-version` output (`9.0.2-essentials_build-www.gyan.dev`). Write the following public metadata as `.local/tools/ffmpeg-9.0.2/toolchain.json`. The loader rechecks the executable hashes on use; a missing/changed installation blocks the optional check.

```json
{
  "version": "9.0.2",
  "source": "https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-9.0.2-essentials_build.zip",
  "archiveSha256": "60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba",
  "verified": true,
  "license": "GPL-3.0",
  "ffmpegSha256": "3256173f3f8bffd7df12227c68adf68025edb1832273a9530688a7bb1ed8edec",
  "ffprobeSha256": "f0d36ecbbdd3bcfac3efa078c96c7271c2e68b3810595552ac3b7f17e9a65c52"
}
```

This pinned version is a reproducibility choice, not an automatic update service. FFmpeg documentation informed the fixed arguments: [ffmpeg](https://ffmpeg.org/ffmpeg.html), [ffprobe](https://ffmpeg.org/ffprobe.html), [protocols](https://ffmpeg.org/ffmpeg-protocols.html). No external codec source or example implementation is copied into the application.

## Verification

```powershell
npm.cmd run test:codec
```

This builds the app and uses the verified tools over newly generated synthetic fixtures: one-second stereo OGG/Opus with a metadata marker, PNG, JPEG and a one-second MP4 with audio. It measures conversion/duration, passes each through scoped ingestion with a supplied MOCK description, rejects a 31-second clip and malformed PNG, checks unchanged caller bytes, and deletes only its new temporary fixture directory. The report is `evidence/media-codec-v1.json`; raw media is not published. Actual transcription, visual understanding and the separate five-case Meta quality gate remain NOT_RUN. Requests, external posts and cost are zero.

Ordinary `npm test` injects fake codec runners and needs neither native binaries nor vault access. The optional native check is separate from offline CI. The conversation harness continues to use its clearly labelled silent/one-pixel fixtures; it does not claim to transcribe files.
