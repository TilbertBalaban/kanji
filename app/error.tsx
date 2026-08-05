"use client";

// App-wide error boundary: a render/runtime error anywhere below the layout
// shows this recoverable card instead of Next.js's raw error screen.

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-md rounded-xl bg-white p-10 text-center shadow">
      <p className="text-2xl">Something went wrong 😵</p>
      <p className="mt-2 break-words text-sm text-slate-500">{error.message}</p>
      <button
        onClick={reset}
        className="mt-6 rounded-lg bg-sky-600 px-6 py-3 text-white hover:bg-sky-700"
      >
        Try again
      </button>
    </div>
  );
}
