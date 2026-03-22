import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
      <h1 className="font-display text-4xl font-bold text-foreground mb-2">404</h1>
      <p className="text-muted-foreground mb-6">This page doesn't exist in any musical era.</p>
      <Link
        href="/"
        className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
      >
        Back to Timeline
      </Link>
    </div>
  );
}
