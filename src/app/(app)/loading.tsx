import { Bar } from "@/components/ui";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse motion-reduce:animate-none">
      <Bar className="mb-2 h-7 w-56" />
      <Bar className="mb-6 h-4 w-40" />
      <div className="card space-y-4 p-4">
        <Bar className="h-4 w-1/3" />
        <Bar className="h-4 w-full" />
        <Bar className="h-4 w-5/6" />
        <Bar className="h-4 w-2/3" />
      </div>
    </div>
  );
}
