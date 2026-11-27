import { Skeleton, SkeletonCards } from './Skeleton';

/** Shown for the moment a page's file is loading for the first time. */
export default function PageLoading({ fullScreen = false }) {
  if (fullScreen) {
    return (
      <div role="status" aria-label="Loading page" className="flex min-h-dvh items-center justify-center bg-background p-4">
        <div className="w-full max-w-md space-y-3"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-4 w-full" /><Skeleton className="h-40 w-full" /></div>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <SkeletonCards count={3} cardClassName="h-28" label="Loading page" />
    </div>
  );
}
