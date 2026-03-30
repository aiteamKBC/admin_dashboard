import { useMemo, useState } from "react";

export default function StudentSearch({
  students,
  onSelect,
}: {
  students: string[];
  onSelect: (name: string) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    return students
      .filter((name) => name.toLowerCase().includes(term))
      .slice(0, 8);
  }, [q, students]);

  return (
    <div className="relative">
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search student..."
        className="
          h-9 w-44 sm:w-56 lg:w-64
          rounded-lg border border-[#241453]/20
          bg-white px-3 text-sm
          focus:outline-none focus:ring-2 focus:ring-[#241453]/20
        "
      />

      {open && results.length > 0 && (
        <div
          className="absolute right-0 mt-2 w-full rounded-xl border bg-white shadow-lg overflow-hidden z-50"
          onMouseDown={(e) => e.preventDefault()}
        >
          {results.map((name) => (
            <button
              key={name}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
              onClick={() => {
                onSelect(name);
                setQ(name);
                setOpen(false);
              }}
            >
              <div className="font-medium text-gray-900">{name}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
