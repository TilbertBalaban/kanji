import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md rounded-xl bg-white p-10 text-center shadow">
      <p className="text-2xl">Page not found</p>
      <p className="mt-2 text-slate-500">That page doesn’t exist (or moved).</p>
      <Link
        href="/"
        className="mt-6 inline-block rounded-lg bg-sky-600 px-6 py-3 text-white hover:bg-sky-700"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
