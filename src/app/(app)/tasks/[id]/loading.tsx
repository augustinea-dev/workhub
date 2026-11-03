import { Bar } from "@/components/ui";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading task" className="animate-pulse motion-reduce:animate-none">
      <Bar className="mb-3 h-4 w-64" />
      <Bar className="mb-2 h-7 w-80" />
      <Bar className="mb-6 h-4 w-56" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <div className="card space-y-3 p-4">
            <Bar className="h-4 w-28" />
            <Bar className="h-4 w-full" />
            <Bar className="h-4 w-4/5" />
          </div>
          <div className="card space-y-3 p-4">
            <Bar className="h-4 w-24" />
            <Bar className="h-16 w-full" />
            <Bar className="h-9 w-28" />
          </div>
        </div>
        <div className="space-y-6">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card grid grid-cols-2 gap-3 p-4">
              <Bar className="col-span-2 h-4 w-20" />
              <Bar className="h-8" />
              <Bar className="h-8" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
