import './LoadingSpinner.css';

// Announces an API load once while keeping the decorative spinner hidden from assistive technology.
export default function LoadingSpinner({ label }: { label: string }) {
  return (
    <p className="loading-status" role="status">
      <span className="loading-spinner" aria-hidden="true" />
      {label}
    </p>
  );
}
