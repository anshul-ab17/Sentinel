import Link from "next/link";

export default function NotFound() {
  return (
    <main className="route-not-found">
      <p>404 · Route unavailable</p>
      <h1>This page could not be found.</h1>
      <Link href="/">Return to Sentinel</Link>
    </main>
  );
}
