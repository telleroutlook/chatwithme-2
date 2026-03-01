interface LoadingDotsProps {
  className?: string;
}

export function LoadingDots({ className = "" }: LoadingDotsProps) {
  return (
    <span className={`live-feed-dots ${className}`} aria-label="loading" role="status">
      <i />
      <i />
      <i />
    </span>
  );
}
