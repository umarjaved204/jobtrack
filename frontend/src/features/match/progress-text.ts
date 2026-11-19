import type { MatchProgress } from './run-match';

const megabytes = (bytes: number) => (bytes / 1e6).toFixed(1);

/** The step in words, and how far along it is (null: no measurable progress). */
export function describeProgress(progress: MatchProgress): {
  label: string;
  detail: string | null;
  fraction: number | null;
} {
  switch (progress.phase) {
    case 'preparing':
      return { label: 'Reading the job description and your resume', detail: null, fraction: null }; // prettier-ignore
    case 'loading-model':
      if (progress.total > 0 && progress.loaded < progress.total) {
        return {
          label: 'Downloading the match model',
          detail: `${megabytes(progress.loaded)} of ${megabytes(progress.total)} MB`,
          fraction: progress.loaded / progress.total,
        };
      }
      return { label: 'Starting the match model', detail: null, fraction: null };
    case 'embedding':
      return {
        label: 'Comparing them on your device',
        detail: `${progress.done} of ${progress.total} lines`,
        fraction: progress.total > 0 ? progress.done / progress.total : null,
      };
    case 'scoring':
      return { label: 'Scoring the match', detail: null, fraction: null };
  }
}
