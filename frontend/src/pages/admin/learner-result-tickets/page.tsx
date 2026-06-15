import { useMemo, useState } from 'react';
import StatsCards from './components/StatsCards';
import FilterBar from './components/FilterBar';
import TicketCard from './components/TicketCard';
import TableView from './components/TableView';
import TicketDetailDrawer from './components/TicketDetailDrawer';
import { useLearnerData, type Learner, type LearnerDataset } from './useLearnerData';
import dashboardAdvisor from '@/assets/dashboard-advisor.png';

const assessmentExportKeys = [
  ['wellbeingAssessment', 'Wellbeing Assessment'],
  ['psychologicalCapital', 'Psychological Capital'],
  ['personalityTraits', 'Personality Traits'],
  ['careerAdaptability', 'Career Adaptability'],
  ['careerInterests', 'Career Interests'],
  ['emotionalIntelligence', 'Emotional Intelligence'],
  ['workValues', 'Work Values'],
  ['englishCognitive', 'English & Cognitive Skills'],
  ['mathLogical', 'Mathematics & Logical Skills'],
  ['knowledgeAssessment', 'Knowledge Assessment'],
  ['skillsAssessment', 'Skills Assessment'],
  ['behaviorsAssessment', 'Behaviors Assessment'],
  ['learningStyle', 'Learning Style'],
] as const;

type PdfLine = {
  text: string;
  size?: number;
  bold?: boolean;
  gapBefore?: number;
};

function sanitizeFileName(value: string) {
  return value
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function cleanPdfText(value: unknown) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapePdfText(value: string) {
  return cleanPdfText(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function formatList(values: readonly string[]) {
  return values.length > 0 ? values.join(', ') : 'None';
}

function addWrappedLine(lines: PdfLine[], text: string, options: Omit<PdfLine, 'text'> = {}) {
  const size = options.size ?? 10;
  const maxChars = Math.max(36, Math.floor(500 / (size * 0.52)));
  const words = cleanPdfText(text).split(' ');
  let current = '';

  words.forEach(word => {
    const next = current ? `${current} ${word}` : word;

    if (next.length > maxChars && current) {
      lines.push({ ...options, text: current });
      current = word;
    } else {
      current = next;
    }
  });

  lines.push({ ...options, text: current || ' ' });
}

function createPdfBlob(lines: PdfLine[]) {
  const pageHeight = 842;
  const margin = 48;
  const pages: PdfLine[][] = [[]];
  let y = pageHeight - margin;

  lines.forEach(line => {
    const size = line.size ?? 10;
    const height = size + 4 + (line.gapBefore ?? 0);

    let currentPage = pages[pages.length - 1]!;

    if (y - height < margin && currentPage.length > 0) {
      currentPage = [];
      pages.push(currentPage);
      y = pageHeight - margin;
    }

    currentPage.push(line);
    y -= height;
  });

  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
  ];
  const pageObjectIds: number[] = [];

  pages.forEach(pageLines => {
    let lineY = 794;
    const streamLines = pageLines.map(line => {
      const size = line.size ?? 10;
      lineY -= line.gapBefore ?? 0;
      const command = `BT /${line.bold ? 'F2' : 'F1'} ${size} Tf 48 ${lineY} Td (${escapePdfText(line.text)}) Tj ET`;
      lineY -= size + 4;
      return command;
    });
    const stream = `${streamLines.join('\n')}\n`;
    const contentId = objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
    const pageId = objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    pageObjectIds.push(pageId);
  });

  objects[1] = `<< /Type /Pages /Kids [${pageObjectIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageObjectIds.length} >>`;

  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((object, index) => {
    const offset = pdf.length;
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xrefOffset = pdf.length;
  const xrefRows = offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');

  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${xrefRows}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Blob([pdf], { type: 'application/pdf' });
}

function buildLearnerPdfLines(learner: Learner, data: LearnerDataset) {
  const lines: PdfLine[] = [];
  const recommendations = ((data.careerRecommendations as Record<string, any[]>)[learner.id] ?? []);

  addWrappedLine(lines, 'Kent Business College', { size: 18, bold: true });
  addWrappedLine(lines, 'Learner Result Summary', { size: 14, bold: true });
  addWrappedLine(lines, `Exported: ${new Date().toLocaleString()}`, { gapBefore: 6 });
  addWrappedLine(lines, `Ticket ID: ${learner.id}`);
  addWrappedLine(lines, `Name: ${learner.name}`);
  addWrappedLine(lines, `Email: ${learner.email}`);
  addWrappedLine(lines, `Completion: ${learner.assessmentCompletion}% (${learner.completedAssessments}/${learner.totalAssessments})`);
  addWrappedLine(lines, `Ticket Status: ${learner.ticketStatus}`);
  addWrappedLine(lines, `Review Status: ${learner.reviewStatus}`);
  addWrappedLine(lines, `Reviewed By: ${learner.reviewedBy || 'Not reviewed'}`);
  addWrappedLine(lines, `Risk Level: ${learner.overallRisk}`);
  addWrappedLine(lines, `Recommended Career: ${learner.recommendedCareer}`);
  addWrappedLine(lines, `Top Strengths: ${formatList(learner.topStrengths)}`);
  addWrappedLine(lines, `Weakest Areas: ${formatList(learner.weakestAreas)}`);
  addWrappedLine(lines, `Admin Notes: ${learner.adminNotes || 'None'}`);

  addWrappedLine(lines, 'Assessment Results', { size: 14, bold: true, gapBefore: 12 });
  assessmentExportKeys.forEach(([key, label]) => {
    const source = data[key] as Record<string, any>;
    const assessment = source[learner.id];
    if (!assessment) return;

    addWrappedLine(lines, label, { size: 12, bold: true, gapBefore: 8 });
    addWrappedLine(lines, `Overall Score: ${assessment.overallScore ?? 'Not assessed'}`);
    addWrappedLine(lines, `Rating: ${assessment.rating ?? 'Not assessed'}`);
    addWrappedLine(lines, `Interpretation: ${assessment.interpretation ?? 'None'}`);
    addWrappedLine(lines, `Strong Areas: ${formatList(assessment.strongAreas ?? [])}`);
    addWrappedLine(lines, `Weak Areas: ${formatList(assessment.weakAreas ?? [])}`);
  });

  addWrappedLine(lines, 'Career Recommendations', { size: 14, bold: true, gapBefore: 12 });
  if (recommendations.length === 0) {
    addWrappedLine(lines, 'No career recommendations available.');
  } else {
    recommendations.forEach((career, index) => {
      addWrappedLine(lines, `${index + 1}. ${career.title ?? 'Untitled Recommendation'}`, { size: 12, bold: true, gapBefore: 8 });
      addWrappedLine(lines, `Description: ${career.description ?? 'None'}`);
      addWrappedLine(lines, `Match Reason: ${career.matchReason ?? 'None'}`);
      addWrappedLine(lines, `Related Strengths: ${formatList(career.relatedStrengths ?? [])}`);
      addWrappedLine(lines, `Areas To Improve: ${formatList(career.areasToImprove ?? [])}`);
      addWrappedLine(lines, `Admin Note: ${career.adminNote || 'None'}`);
    });
  }

  return lines;
}

function downloadLearnerSummaryPdf(learner: Learner, data: LearnerDataset) {
  const blob = createPdfBlob(buildLearnerPdfLines(learner, data));
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = `${sanitizeFileName(learner.id)}-${sanitizeFileName(learner.name)}-summary.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function AdminLearnerResultTickets() {
  const { data } = useLearnerData();
  const { learners: baseLearners } = data;
  const [searchName, setSearchName] = useState('');
  const [searchEmail, setSearchEmail] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [riskFilter, setRiskFilter] = useState('All');
  const [reviewFilter, setReviewFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [careerFilter, setCareerFilter] = useState('All');
  const [completionRange, setCompletionRange] = useState<[number, number]>([0, 100]);
  const [sortBy, setSortBy] = useState('newest');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [selectedLearnerId, setSelectedLearnerId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [ticketOverrides, setTicketOverrides] = useState<Record<string, Partial<Learner>>>({});
  const [showExportToast, setShowExportToast] = useState('');
  const [showReviewedToast, setShowReviewedToast] = useState('');

  const learners = useMemo(
    () => baseLearners.map(l => ({ ...l, ...ticketOverrides[l.id] })),
    [baseLearners, ticketOverrides],
  );

  const displayData = useMemo(() => ({ ...data, learners }), [data, learners]);

  const allCareerOptions = useMemo(() => {
    const careers = new Set<string>();
    learners.forEach(l => {
      if (l.recommendedCareer && l.recommendedCareer !== 'Pending Assessment') {
        careers.add(l.recommendedCareer);
      }
    });
    return Array.from(careers).sort();
  }, [learners]);

  const filteredTickets = useMemo(() => {
    let result = [...learners];

    if (searchName) result = result.filter(l => l.name.toLowerCase().includes(searchName.toLowerCase()));
    if (searchEmail) result = result.filter(l => l.email.toLowerCase().includes(searchEmail.toLowerCase()));
    if (statusFilter !== 'All') result = result.filter(l => l.ticketStatus === statusFilter);
    if (riskFilter !== 'All') result = result.filter(l => l.overallRisk === riskFilter);
    if (reviewFilter === 'Open') result = result.filter(l => l.reviewStatus !== 'Reviewed');
    if (reviewFilter === 'Reviewed') result = result.filter(l => l.reviewStatus === 'Reviewed');
    if (reviewFilter === 'Ready') result = result.filter(l => l.assessmentCompletion === 100 && l.reviewStatus !== 'Reviewed');
    if (reviewFilter === 'Needs Review') result = result.filter(l => l.ticketStatus === 'Needs Review' || l.reviewStatus === 'Needs Review');
    if (reviewFilter === 'Missing Recommendation') result = result.filter(l => l.recommendedCareer === 'Pending Assessment');
    if (categoryFilter !== 'All') {
      const selectedCategory = categoryFilter.toLowerCase();
      result = result.filter(l => [...l.topStrengths, ...l.weakestAreas].some(area => {
        const normalizedArea = area.toLowerCase();
        return normalizedArea.includes(selectedCategory) || selectedCategory.includes(normalizedArea);
      }));
    }
    if (careerFilter !== 'All') result = result.filter(l => l.recommendedCareer === careerFilter);
    result = result.filter(l => l.assessmentCompletion >= completionRange[0] && l.assessmentCompletion <= completionRange[1]);

    switch (sortBy) {
      case 'oldest':
        result.sort((a, b) => a.lastUpdated.localeCompare(b.lastUpdated));
        break;
      case 'highestCompletion':
        result.sort((a, b) => b.assessmentCompletion - a.assessmentCompletion);
        break;
      case 'lowestCompletion':
        result.sort((a, b) => a.assessmentCompletion - b.assessmentCompletion);
        break;
      case 'highestRisk': {
        const riskOrder: Record<string, number> = { High: 3, Moderate: 2, Low: 1 };
        result.sort((a, b) => (riskOrder[b.overallRisk] || 0) - (riskOrder[a.overallRisk] || 0));
        break;
      }
      case 'nameAZ':
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      default:
        result.sort((a, b) => b.lastUpdated.localeCompare(a.lastUpdated));
    }

    return result;
  }, [learners, searchName, searchEmail, statusFilter, riskFilter, reviewFilter, categoryFilter, careerFilter, completionRange, sortBy]);

  const stats = useMemo(() => {
    const careerCounts: Record<string, number> = {};
    const weakCounts: Record<string, number> = {};

    learners.forEach(l => {
      if (l.recommendedCareer && l.recommendedCareer !== 'Pending Assessment') {
        careerCounts[l.recommendedCareer] = (careerCounts[l.recommendedCareer] || 0) + 1;
      }
      l.weakestAreas.forEach(a => {
        if (a !== 'Not enough data') weakCounts[a] = (weakCounts[a] || 0) + 1;
      });
    });

    return {
      totalLearners: learners.length,
      totalTickets: learners.length,
      avgCompletion: learners.length > 0 ? Math.round(learners.reduce((sum, l) => sum + l.assessmentCompletion, 0) / learners.length) : 0,
      allCompleted: learners.filter(l => l.assessmentCompletion === 100).length,
      lowScoreAreas: learners.filter(l => l.overallRisk === 'High' || l.weakestAreas.length >= 2).length,
      needsReview: learners.filter(l => l.ticketStatus === 'Needs Review' || l.reviewStatus === 'Needs Review').length,
      mostCommonCareer: Object.entries(careerCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A',
      mostCommonWeakArea: Object.entries(weakCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A',
    };
  }, [learners]);

  const queueCounts = useMemo(() => ({
    all: learners.length,
    open: learners.filter(l => l.reviewStatus !== 'Reviewed').length,
    closed: learners.filter(l => l.reviewStatus === 'Reviewed').length,
    high: learners.filter(l => l.overallRisk === 'High').length,
    moderate: learners.filter(l => l.overallRisk === 'Moderate').length,
    low: learners.filter(l => l.overallRisk === 'Low').length,
    needsReview: learners.filter(l => l.ticketStatus === 'Needs Review' || l.reviewStatus === 'Needs Review').length,
    ready: learners.filter(l => l.assessmentCompletion === 100 && l.reviewStatus !== 'Reviewed').length,
    missingRecommendation: learners.filter(l => l.recommendedCareer === 'Pending Assessment').length,
  }), [learners]);

  const clearAllFilters = () => {
    setSearchName('');
    setSearchEmail('');
    setStatusFilter('All');
    setRiskFilter('All');
    setReviewFilter('All');
    setCategoryFilter('All');
    setCareerFilter('All');
    setCompletionRange([0, 100]);
    setSortBy('newest');
  };

  const handleStatusChange = (id: string, status: string) => {
    setTicketOverrides(prev => ({ ...prev, [id]: { ...prev[id], ticketStatus: status } }));
  };

  const handleMarkReviewed = (id: string) => {
    if (!learners.find(l => l.id === id)) return;
    setTicketOverrides(prev => ({ ...prev, [id]: { ...prev[id], reviewStatus: 'Reviewed', reviewedBy: 'Admin' } }));
    setShowReviewedToast(`Ticket ${id} marked as reviewed.`);
    setTimeout(() => setShowReviewedToast(''), 3000);
  };

  const handleExport = (id: string) => {
    const learner = learners.find(l => l.id === id);
    if (!learner) return;
    downloadLearnerSummaryPdf(learner, displayData);
    setShowExportToast(`PDF exported for ticket ${id}.`);
    setTimeout(() => setShowExportToast(''), 3000);
  };

  const totalTickets = filteredTickets.length;
  const completedTickets = filteredTickets.filter(t => t.ticketStatus === 'Completed').length;
  const incompleteTickets = filteredTickets.filter(t => t.ticketStatus === 'In Progress' || t.ticketStatus === 'Not Started').length;
  const highRiskLearners = filteredTickets.filter(t => t.overallRisk === 'High').length;
  const readyForReview = filteredTickets.filter(t => t.assessmentCompletion === 100 && t.reviewStatus !== 'Reviewed').length;

  return (
    <div className="min-h-screen">
      <div className="max-w-[100rem] mx-auto space-y-7">
        <div className="relative overflow-hidden rounded-3xl px-5 md:px-8 py-8 shadow-lg min-h-[14rem] xl:min-h-[15rem] bg-gradient-to-br from-[#241453] via-[#3B1F72] to-[#5B3AA6]">
          {/* decorative glow */}
          <div aria-hidden="true" className="pointer-events-none absolute -top-24 -right-10 h-72 w-72 rounded-full bg-white/10 blur-3xl"></div>
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-[#A56408]/20 blur-3xl"></div>

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5 lg:pr-72 xl:pr-[26rem]">
            <div className="max-w-3xl">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white/90 backdrop-blur-sm">
                <i className="ri-bar-chart-box-line"></i>Learner Results
              </span>
              <h2 className="mt-3 text-2xl md:text-3xl font-bold text-white">Learner Result Dashboard</h2>
              <p className="text-sm text-white/70 mt-1.5">Monitor assessment completion, risk patterns, review workload, and career recommendations.</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <a href="/coach-wellbeing" className="inline-flex items-center justify-center px-5 py-3 text-sm font-semibold bg-white text-[#241453] rounded-xl hover:bg-white/90 transition-colors cursor-pointer whitespace-nowrap shadow-sm">
                <i className="ri-arrow-left-line mr-1.5"></i>Back to Dashboard
              </a>
            </div>
          </div>

          <div className="relative z-10 flex flex-wrap gap-2 mt-5 lg:pr-72 xl:pr-[26rem]">
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-white/15 text-white backdrop-blur-sm whitespace-nowrap"><strong>{totalTickets}</strong> Total Tickets</span>
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-emerald-400/20 text-emerald-50 backdrop-blur-sm whitespace-nowrap"><strong>{completedTickets}</strong> Completed</span>
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-amber-400/20 text-amber-50 backdrop-blur-sm whitespace-nowrap"><strong>{incompleteTickets}</strong> Incomplete</span>
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-red-400/25 text-red-50 backdrop-blur-sm whitespace-nowrap"><strong>{highRiskLearners}</strong> High Risk</span>
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-white/15 text-white backdrop-blur-sm whitespace-nowrap"><strong>{readyForReview}</strong> Ready for Review</span>
          </div>
          <img
            src={dashboardAdvisor}
            alt=""
            aria-hidden="true"
            className="hidden lg:block pointer-events-none select-none absolute right-8 xl:right-12 bottom-0 h-52 xl:h-56 w-72 xl:w-80 object-contain object-bottom drop-shadow-2xl"
          />
        </div>

        <div className="bg-background-50 rounded-3xl border border-background-200/70 px-5 md:px-7 py-6 shadow-sm space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-foreground-900">Result Ticket Queue</h3>
              <p className="text-sm text-foreground-500 mt-1">Use the quick filters below to move through the review workload faster.</p>
            </div>
            <button onClick={clearAllFilters} className="self-start lg:self-auto px-4 py-2 text-sm font-medium bg-background-100 border border-background-200 text-foreground-700 rounded-lg hover:bg-background-200 transition-colors cursor-pointer whitespace-nowrap">
              <i className="ri-refresh-line mr-1.5"></i>Reset View
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { label: 'All Tickets', sub: 'Every learner result case', icon: 'ri-ticket-2-line', count: queueCounts.all, filter: 'All' },
              { label: 'Open Reviews', sub: 'Not yet marked reviewed', icon: 'ri-clipboard-line', count: queueCounts.open, filter: 'Open' },
              { label: 'Closed Reviews', sub: 'Reviewed result cases', icon: 'ri-check-double-line', count: queueCounts.closed, filter: 'Reviewed' },
            ].map(item => (
              <button
                key={item.label}
                onClick={() => setReviewFilter(item.filter)}
                className={`text-left rounded-2xl border p-4 transition-all cursor-pointer ${reviewFilter === item.filter ? 'border-primary-700 bg-primary-700 shadow-md' : 'border-background-200 bg-background-50 hover:border-primary-200 hover:shadow-sm'}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${reviewFilter === item.filter ? 'bg-white/20 text-white' : 'bg-primary-50 text-primary-700'}`}><i className={item.icon}></i></span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${reviewFilter === item.filter ? 'bg-white/20 text-white' : 'bg-background-100 text-primary-700'}`}>{item.count}</span>
                </div>
                <p className={`mt-3 text-sm font-semibold ${reviewFilter === item.filter ? 'text-white' : 'text-foreground-900'}`}>{item.label}</p>
                <p className={`text-xs mt-0.5 ${reviewFilter === item.filter ? 'text-white/70' : 'text-foreground-500'}`}>{item.sub}</p>
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-background-200/70 p-4 space-y-4">
            <div>
              <div className="flex items-center justify-between gap-3 mb-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-foreground-500">Risk Bands</p>
                <span className="text-xs text-foreground-500">{filteredTickets.length} shown</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  ['All Risk', 'All', queueCounts.all],
                  ['High', 'High', queueCounts.high],
                  ['Moderate', 'Moderate', queueCounts.moderate],
                  ['Low', 'Low', queueCounts.low],
                ].map(([label, value, count]) => (
                  <button key={value} onClick={() => setRiskFilter(String(value))} className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${riskFilter === value ? 'bg-primary-700 border-primary-700 text-background-50' : 'bg-background-50 border-background-200 text-foreground-700 hover:border-background-300'}`}>
                    {label}<span className={`ml-2 px-1.5 py-0.5 rounded-full ${riskFilter === value ? 'bg-background-50 text-primary-700' : 'bg-background-100 text-foreground-700'}`}>{count}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-background-200/70 pt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-foreground-500 mb-3">Review Signals</p>
              <div className="flex flex-wrap gap-2">
                {[
                  ['Needs Review', 'Needs Review', queueCounts.needsReview],
                  ['Ready for Review', 'Ready', queueCounts.ready],
                  ['Reviewed', 'Reviewed', queueCounts.closed],
                  ['Missing Recommendation', 'Missing Recommendation', queueCounts.missingRecommendation],
                ].map(([label, value, count]) => (
                  <button key={value} onClick={() => setReviewFilter(reviewFilter === value ? 'All' : String(value))} className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${reviewFilter === value ? 'bg-primary-700 border-primary-700 text-background-50' : 'bg-background-50 border-background-200 text-foreground-700 hover:border-background-300'}`}>
                    {label}<span className={`ml-2 px-1.5 py-0.5 rounded-full ${reviewFilter === value ? 'bg-background-50 text-primary-700' : 'bg-background-100 text-foreground-700'}`}>{count}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <StatsCards stats={stats} />

        <FilterBar
          searchName={searchName} setSearchName={setSearchName}
          searchEmail={searchEmail} setSearchEmail={setSearchEmail}
          statusFilter={statusFilter} setStatusFilter={setStatusFilter}
          riskFilter={riskFilter} setRiskFilter={setRiskFilter}
          categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter}
          careerFilter={careerFilter} setCareerFilter={setCareerFilter}
          completionRange={completionRange} setCompletionRange={setCompletionRange}
          sortBy={sortBy} setSortBy={setSortBy}
          careerOptions={allCareerOptions}
        />

        <div className="flex items-center justify-between">
          <p className="text-xs text-foreground-500">
            Showing <strong className="text-foreground-800">{filteredTickets.length}</strong> ticket{filteredTickets.length !== 1 ? 's' : ''}
            {filteredTickets.length !== learners.length && <span> of <strong className="text-foreground-800">{learners.length}</strong></span>}
          </p>
          <div className="flex items-center gap-1 bg-background-100 rounded-full p-1">
            <button onClick={() => setViewMode('cards')} className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${viewMode === 'cards' ? 'bg-background-50 text-foreground-900' : 'text-foreground-500 hover:text-foreground-700'}`}>
              <i className="ri-layout-grid-line mr-1"></i>Cards
            </button>
            <button onClick={() => setViewMode('table')} className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${viewMode === 'table' ? 'bg-background-50 text-foreground-900' : 'text-foreground-500 hover:text-foreground-700'}`}>
              <i className="ri-table-line mr-1"></i>Table
            </button>
          </div>
        </div>

        {filteredTickets.length === 0 ? (
          <div className="bg-background-50 rounded-lg border border-background-200/70 p-12 text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-background-100 flex items-center justify-center mb-3">
              <i className="ri-ticket-line text-2xl text-foreground-300"></i>
            </div>
            <h4 className="text-sm font-semibold text-foreground-800 mb-1">No Tickets Found</h4>
            <p className="text-xs text-foreground-500 mb-4">No learner tickets match your current filters.</p>
            <button onClick={clearAllFilters} className="px-4 py-2 text-xs font-medium bg-primary-500 text-background-50 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap">
              Clear All Filters
            </button>
          </div>
        ) : viewMode === 'cards' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
            {filteredTickets.map((ticket) => (
              <TicketCard key={ticket.id} ticket={ticket} onViewDetails={(id) => { setSelectedLearnerId(id); setIsDrawerOpen(true); }} onMarkReviewed={handleMarkReviewed} onExport={handleExport} />
            ))}
          </div>
        ) : (
          <TableView tickets={filteredTickets} onViewDetails={(id) => { setSelectedLearnerId(id); setIsDrawerOpen(true); }} onStatusChange={handleStatusChange} onMarkReviewed={handleMarkReviewed} onExport={handleExport} />
        )}
      </div>

      <TicketDetailDrawer
        learnerId={selectedLearnerId || ''}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        data={displayData}
        onMarkReviewed={handleMarkReviewed}
        onExport={handleExport}
      />

      {showExportToast && (
        <div className="fixed bottom-6 right-6 z-[70] bg-foreground-900 text-background-50 px-4 py-2.5 rounded-lg text-xs font-medium shadow-lg animate-bounce">
          <i className="ri-file-pdf-line mr-1.5"></i>{showExportToast}
        </div>
      )}
      {showReviewedToast && (
        <div className="fixed bottom-6 right-6 z-[70] bg-secondary-600 text-background-50 px-4 py-2.5 rounded-lg text-xs font-medium shadow-lg animate-bounce">
          <i className="ri-check-line mr-1.5"></i>{showReviewedToast}
        </div>
      )}
    </div>
  );
}
