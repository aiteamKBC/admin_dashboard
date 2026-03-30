export type Meeting = {
  date: string;
  timeFrom: string;
  timeTo: string;
  serviceName: string;
  customerName: string;
  
  meetingId?: string;
  
  joinWebUrl?: string | null;

  coachId?: number;
  coachName?: string;
};
