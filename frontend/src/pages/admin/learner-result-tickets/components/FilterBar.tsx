import { useEffect, useRef, useState } from 'react';

interface FilterBarProps {
  searchName: string;
  setSearchName: (v: string) => void;
  searchEmail: string;
  setSearchEmail: (v: string) => void;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  riskFilter: string;
  setRiskFilter: (v: string) => void;
  categoryFilter: string;
  setCategoryFilter: (v: string) => void;
  careerFilter: string;
  setCareerFilter: (v: string) => void;
  completionRange: [number, number];
  setCompletionRange: (v: [number, number]) => void;
  sortBy: string;
  setSortBy: (v: string) => void;
  careerOptions: string[];
}

export default function FilterBar({
  searchName, setSearchName, searchEmail, setSearchEmail,
  statusFilter, setStatusFilter, riskFilter, setRiskFilter,
  categoryFilter, setCategoryFilter, careerFilter, setCareerFilter,
  completionRange, setCompletionRange, sortBy, setSortBy, careerOptions,
}: FilterBarProps) {
  const [showFilters, setShowFilters] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setShowFilters(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const hasActiveFilters = statusFilter !== 'All' || riskFilter !== 'All' || categoryFilter !== 'All' || careerFilter !== 'All' || completionRange[0] > 0 || completionRange[1] < 100;

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-foreground-400 text-sm"></i>
            <input
              type="text"
              placeholder="Search by learner name..."
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 text-sm bg-background-50 border border-background-200 rounded-xl text-foreground-800 placeholder:text-foreground-400 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 transition-all shadow-sm"
            />
          </div>
          <div className="relative flex-1">
            <i className="ri-mail-line absolute left-3 top-1/2 -translate-y-1/2 text-foreground-400 text-sm"></i>
            <input
              type="text"
              placeholder="Search by email..."
              value={searchEmail}
              onChange={(e) => setSearchEmail(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 text-sm bg-background-50 border border-background-200 rounded-xl text-foreground-800 placeholder:text-foreground-400 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 transition-all shadow-sm"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2.5 text-sm bg-background-50 border border-background-200 rounded-xl text-foreground-700 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 cursor-pointer whitespace-nowrap transition-all shadow-sm"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="highestCompletion">Highest Completion</option>
              <option value="lowestCompletion">Lowest Completion</option>
              <option value="highestRisk">Highest Risk</option>
              <option value="nameAZ">Name A-Z</option>
            </select>
            <i className="ri-arrow-down-s-line absolute right-2 top-1/2 -translate-y-1/2 text-foreground-400 text-sm pointer-events-none"></i>
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-3.5 py-2.5 text-sm rounded-xl border transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer shadow-sm ${
              hasActiveFilters
                ? 'bg-primary-700 border-primary-700 text-white hover:bg-primary-800'
                : 'bg-background-50 border-background-200 text-foreground-600 hover:border-background-300'
            }`}
          >
            <i className="ri-filter-3-line text-sm"></i>
            Filters
            {hasActiveFilters && <span className="w-1.5 h-1.5 rounded-full bg-white"></span>}
          </button>
        </div>
      </div>

      {showFilters && (
        <div ref={filterRef} className="bg-background-50 rounded-2xl border border-background-200/70 p-4 shadow-sm">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground-600 mb-1">Status</label>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full px-2.5 py-1.5 text-xs bg-background-100 border border-background-200 rounded-md text-foreground-700 focus:outline-none focus:border-primary-300 cursor-pointer">
                <option>All</option><option>Completed</option><option>In Progress</option><option>Not Started</option><option>Needs Review</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground-600 mb-1">Risk Level</label>
              <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)} className="w-full px-2.5 py-1.5 text-xs bg-background-100 border border-background-200 rounded-md text-foreground-700 focus:outline-none focus:border-primary-300 cursor-pointer">
                <option>All</option><option>Low</option><option>Moderate</option><option>High</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground-600 mb-1">Category</label>
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="w-full px-2.5 py-1.5 text-xs bg-background-100 border border-background-200 rounded-md text-foreground-700 focus:outline-none focus:border-primary-300 cursor-pointer">
                <option>All</option>
                <option>Wellbeing Assessment</option>
                <option>Psychological Capital</option>
                <option>Personality Traits</option>
                <option>Career Adaptability</option>
                <option>Career Interests (RIASEC)</option>
                <option>Emotional Intelligence</option>
                <option>Work Values</option>
                <option>English & Cognitive</option>
                <option>Mathematics & Logical</option>
                <option>Knowledge Assessment</option>
                <option>Skills Assessment</option>
                <option>Behaviors Assessment</option>
                <option>Learning Style</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground-600 mb-1">Career Path</label>
              <select value={careerFilter} onChange={(e) => setCareerFilter(e.target.value)} className="w-full px-2.5 py-1.5 text-xs bg-background-100 border border-background-200 rounded-md text-foreground-700 focus:outline-none focus:border-primary-300 cursor-pointer">
                <option>All</option>
                {careerOptions.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="col-span-2 md:col-span-1">
              <label className="block text-xs font-medium text-foreground-600 mb-1">
                Completion: {completionRange[0]}% - {completionRange[1]}%
              </label>
              <div className="flex gap-2">
                <input type="range" min="0" max="100" value={completionRange[0]} onChange={(e) => setCompletionRange([Number(e.target.value), completionRange[1]])} className="flex-1 accent-primary-500 cursor-pointer" />
                <input type="range" min="0" max="100" value={completionRange[1]} onChange={(e) => setCompletionRange([completionRange[0], Number(e.target.value)])} className="flex-1 accent-primary-500 cursor-pointer" />
              </div>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => { setStatusFilter('All'); setRiskFilter('All'); setCategoryFilter('All'); setCareerFilter('All'); setCompletionRange([0, 100]); }}
                className="w-full px-3 py-1.5 text-xs bg-background-100 border border-background-200 rounded-md text-foreground-600 hover:bg-background-200 transition-colors cursor-pointer whitespace-nowrap"
              >
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
