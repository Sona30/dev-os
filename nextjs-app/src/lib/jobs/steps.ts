import type { JobType } from './types'

// Progress steps per job type. `percent` is the value reported when the step starts.
// Labels are the parent-facing text (PRD Flow 2: reading profile → choosing skills → writing problems →
// verifying answers → building PDF).

export interface JobStep {
  id: string
  label: string
  percent: number
}

export const JOB_STEPS: Record<JobType, readonly JobStep[]> = {
  parse_report: [
    { id: 'reading_pages', label: 'Reading your report', percent: 20 },
    { id: 'extracting', label: 'Finding the scores', percent: 60 },
    { id: 'validating', label: 'Checking what we found', percent: 90 },
  ],
  diagnose: [
    { id: 'reading_profile', label: 'Reading your results', percent: 15 },
    { id: 'matching_skills', label: 'Matching to skills', percent: 55 },
    { id: 'ranking', label: 'Finding the next steps', percent: 85 },
  ],
  generate_worksheet: [
    { id: 'reading_profile', label: 'Reading the profile', percent: 10 },
    { id: 'choosing_skills', label: 'Choosing skills', percent: 25 },
    { id: 'writing_problems', label: 'Writing problems', percent: 55 },
    { id: 'verifying_answers', label: 'Verifying answers', percent: 75 },
    { id: 'building_pdf', label: 'Building the PDF', percent: 90 },
  ],
  rerender_pdf: [
    { id: 'loading', label: 'Loading the worksheet', percent: 20 },
    { id: 'building_pdf', label: 'Building the PDF', percent: 70 },
  ],
  grade_sheet: [
    { id: 'checking_photo', label: 'Checking the photo', percent: 15 },
    { id: 'reading_answers', label: 'Reading the answers', percent: 65 },
    { id: 'checking_answers', label: 'Checking the answers', percent: 90 },
  ],
  recalibrate: [
    { id: 'rules', label: 'Counting up what your child showed', percent: 40 },
    { id: 'explaining', label: 'Writing it up', percent: 70 },
    { id: 'saving', label: 'Saving the next worksheet’s level', percent: 90 },
  ],
  delete_child: [
    { id: 'removing_files', label: 'Removing photos and worksheets', percent: 30 },
    { id: 'removing_data', label: 'Removing the profile and progress', percent: 80 },
  ],
}

/** Percent reported when a step starts; unknown ids fall back to 0 so a typo never crashes a job. */
export function percentForStep(type: JobType, stepId: string): number {
  return JOB_STEPS[type].find((step) => step.id === stepId)?.percent ?? 0
}
