export interface InterviewSample {
  id: string;
  label: string;
  userMessage: string;
  coachContext: Record<string, string>;
}

export const interviewSamples: InterviewSample[] = [
  {
    id: 'stalled-opportunity-rescue',
    label: 'Stalled opportunity rescue',
    userMessage: 'Coach me for the call and give me a concrete talk track to unblock finance.',
    coachContext: {
      opportunity_name: 'ACME Global Expansion Platform',
      opportunity_stage: 'Proposal/Price Quote',
      key_stakeholders: 'VP Sales Ops, CFO, Procurement Lead',
      top_objections: 'Price and implementation timeline',
      key_risks: 'No confirmed executive sponsor',
      desired_outcome: 'Secure exec alignment call this week',
      meeting_type: 'Re-engagement call',
      transcript_summary: 'Customer likes capabilities but fears migration burden and budget overruns',
      sales_method: 'MEDDICC',
    },
  },
  {
    id: 'pricing-objection-procurement',
    label: 'Pricing objection handling',
    userMessage: 'How do I defend value without sounding rigid?',
    coachContext: {
      opportunity_name: 'NorthBridge Service Cloud Rollout',
      opportunity_stage: 'Negotiation/Review',
      key_stakeholders: 'Head of Support, Procurement Manager',
      top_objections: 'Competitor discount and legal redlines',
      key_risks: 'Procurement demands 30 percent reduction',
      desired_outcome: 'Protect value and keep discount under 12 percent',
      meeting_type: 'Commercial negotiation',
      transcript_summary: 'Champion says support ROI is clear but procurement sees software as interchangeable',
      sales_method: 'Challenger',
    },
  },
  {
    id: 'discovery-call-qualification',
    label: 'Discovery qualification',
    userMessage: 'What should I ask next to qualify this properly?',
    coachContext: {
      opportunity_name: 'HelioTech Sales Automation',
      opportunity_stage: 'Discovery',
      key_stakeholders: 'RevOps Director, IT Architect',
      top_objections: 'Need to evaluate more vendors first',
      key_risks: 'No quantified pain, no decision process mapped',
      desired_outcome: 'Leave call with clear pain, owner, timeline',
      meeting_type: 'Initial discovery',
      transcript_summary: 'Prospect is interested but answers are vague and broad',
      sales_method: 'BANT',
    },
  },
];
