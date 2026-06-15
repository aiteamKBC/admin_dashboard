import { useEffect, useState } from 'react';

type AssessmentResult = {
  overallScore: number | null;
  rating: string;
  interpretation: string;
  subScores: Record<string, number | null>;
  weakAreas: string[];
  strongAreas: string[];
  questions?: Array<Record<string, unknown>>;
  submittedAt?: string;
  updatedAt?: string;
};

type CareerRecommendation = {
  title: string;
  description: string;
  matchReason: string;
  relatedStrengths: string[];
  areasToImprove: string[];
  adminNote: string;
};

export type Learner = {
  id: string;
  name: string;
  email: string;
  profileStatus: string;
  assessmentCompletion: number;
  completedAssessments: number;
  totalAssessments: number;
  overallRisk: string;
  topStrengths: string[];
  weakestAreas: string[];
  recommendedCareer: string;
  lastUpdated: string;
  reviewStatus: string;
  reviewedBy: string;
  ticketStatus: string;
  flagged: boolean;
  adminNotes: string;
};

export type LearnerDataset = {
  learners: Learner[];
  behaviorsAssessment: Record<string, AssessmentResult>;
  careerAdaptability: Record<string, AssessmentResult>;
  careerInterests: Record<string, AssessmentResult>;
  careerRecommendations: Record<string, CareerRecommendation[]>;
  emotionalIntelligence: Record<string, AssessmentResult>;
  englishCognitive: Record<string, AssessmentResult>;
  knowledgeAssessment: Record<string, AssessmentResult>;
  learningStyle: Record<string, AssessmentResult>;
  mathLogical: Record<string, AssessmentResult>;
  personalityTraits: Record<string, AssessmentResult>;
  psychologicalCapital: Record<string, AssessmentResult>;
  skillsAssessment: Record<string, AssessmentResult>;
  wellbeingAssessment: Record<string, AssessmentResult>;
  workValues: Record<string, AssessmentResult>;
};

const emptyLearnerData: LearnerDataset = {
  learners: [],
  behaviorsAssessment: {},
  careerAdaptability: {},
  careerInterests: {},
  careerRecommendations: {},
  emotionalIntelligence: {},
  englishCognitive: {},
  knowledgeAssessment: {},
  learningStyle: {},
  mathLogical: {},
  personalityTraits: {},
  psychologicalCapital: {},
  skillsAssessment: {},
  wellbeingAssessment: {},
  workValues: {},
};

export function useLearnerData() {
  const [data, setData] = useState<LearnerDataset>(emptyLearnerData);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let isMounted = true;

    async function loadData() {
      try {
        const response = await fetch('/api/accounts/learner-result-tickets/', {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Django API returned ${response.status}`);
        }

        const apiData = (await response.json()) as LearnerDataset;

        if (isMounted) {
          setData(apiData);
          setError(null);
        }
      } catch (nextError) {
        if (!controller.signal.aborted && isMounted) {
          console.warn('Django learner data API unavailable.', nextError);
          setData(emptyLearnerData);
          setError('Live learner data unavailable');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadData();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, []);

  return { data, isLoading, error };
}
