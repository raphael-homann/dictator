export interface TranscriptFrame {
  committed: string;
  interim: string;
}

function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function findOverlapSuffixPrefix(previous: string, current: string): number {
  const max = Math.min(previous.length, current.length, 240);
  for (let size = max; size >= 1; size -= 1) {
    if (previous.slice(-size) === current.slice(0, size)) {
      return size;
    }
  }
  return 0;
}

export class TranscriptStream {
  private lastCommittedSnapshot = "";

  reset(snapshot = ""): void {
    this.lastCommittedSnapshot = normalizeSpaces(snapshot);
  }

  ingest(frame: TranscriptFrame): { delta: string; preview: string; committedSnapshot: string } {
    const committedSnapshot = normalizeSpaces(frame.committed);
    const preview = normalizeSpaces([frame.committed, frame.interim].filter(Boolean).join(" "));
    const previous = this.lastCommittedSnapshot;

    if (!committedSnapshot) {
      this.lastCommittedSnapshot = committedSnapshot;
      return { delta: "", preview, committedSnapshot };
    }

    if (!previous) {
      this.lastCommittedSnapshot = committedSnapshot;
      return { delta: committedSnapshot, preview, committedSnapshot };
    }

    if (committedSnapshot.startsWith(previous)) {
      this.lastCommittedSnapshot = committedSnapshot;
      return { delta: committedSnapshot.slice(previous.length), preview, committedSnapshot };
    }

    if (previous.endsWith(committedSnapshot)) {
      this.lastCommittedSnapshot = committedSnapshot;
      return { delta: "", preview, committedSnapshot };
    }

    const overlap = findOverlapSuffixPrefix(previous, committedSnapshot);
    if (overlap > 0) {
      this.lastCommittedSnapshot = committedSnapshot;
      return { delta: committedSnapshot.slice(overlap), preview, committedSnapshot };
    }

    this.lastCommittedSnapshot = committedSnapshot;
    return { delta: "", preview, committedSnapshot };
  }
}
