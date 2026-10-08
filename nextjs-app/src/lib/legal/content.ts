import { NON_AFFILIATION } from '@/lib/constants'

// Plain-language privacy, terms and trust content (docs/specs/13 §5). These describe what the product actually
// does. The privacy policy and terms are drafts until legal review is complete (a launch gate in the PRD).

export const LEGAL_LAST_UPDATED = 'October 7, 2026'

export interface LegalSection {
  heading: string
  paragraphs?: string[]
  bullets?: string[]
}

export interface LegalDoc {
  title: string
  intro: string
  /** True while the text still needs legal review before public launch. */
  draft: boolean
  sections: LegalSection[]
}

export const PRIVACY: LegalDoc = {
  title: 'Privacy',
  intro:
    'This explains in plain language what TestReady collects, why, how long we keep it, and the choices you have. TestReady is for parents and guardians. Children never create accounts or use the app.',
  draft: true,
  sections: [
    {
      heading: 'What we collect',
      bullets: [
        'Your account: your email address and a password. The password is handled by our sign-in provider and is never visible to us.',
        'Your child’s profile: a first name or nickname and their grade. Please don’t use a surname.',
        'The result you enter: i-Ready scores, placement and domain results, and a Lexile score if you add one, either typed in or read from a report you upload.',
        'Photos you upload: pages of an i-Ready report and photos of finished worksheets. We also keep small cut-outs of handwriting that we ask you to check.',
        'What we create for you: gap analyses, worksheets, answer keys, results and progress.',
        'Basic usage information, such as when a worksheet was made and what it cost us to make, so we can run the service.',
      ],
      paragraphs: [
        'We don’t ask for surnames, schools, birthdates, home addresses or photos of your child, and the app has nowhere to enter them. If a name is visible on a report or worksheet, please cover or crop it before you upload.',
      ],
    },
    {
      heading: 'How we use it',
      bullets: [
        'To turn an i-Ready result into a list of skills to practise, and to make worksheets for those skills.',
        'To read photos of finished worksheets, check the answers with you, and set the level of the next worksheet.',
        'To show progress over time, and to keep the service secure and working.',
      ],
      paragraphs: [
        'We use an AI service (Microsoft Azure AI Foundry) to read reports and handwriting, write problems and explain results. We send it your child’s nickname, grade, scores and the images you upload. We don’t use your or your child’s information to train AI models.',
        'We don’t sell your information and we don’t use it for advertising.',
      ],
    },
    {
      heading: 'How long we keep it',
      bullets: [
        'Photos and handwriting cut-outs: deleted automatically after 30 days, or sooner if you delete them.',
        'Your child’s profile, worksheets, results and progress: kept until you delete the profile.',
        'Your account: kept until you ask us to delete it.',
        'Technical logs: kept for about 30 days. They don’t contain names, answers, email addresses or links to your files.',
        'Cost and usage records: kept without any link to a child once a profile has been deleted.',
      ],
      paragraphs: ['Our database provider may keep backups for a short time after something is deleted.'],
    },
    {
      heading: 'Your choices',
      bullets: [
        'Delete one photo, or all of a child’s photos, in that child’s Settings.',
        'Delete a child’s profile in Settings. This permanently removes the profile, worksheets, photos, results and progress.',
        'Ask us to delete your account (see the contact details below).',
      ],
    },
    {
      heading: 'Keeping it safe',
      bullets: [
        'Connections to TestReady are encrypted, and our providers encrypt stored data.',
        'Each account’s data is kept separate from every other account.',
        'Photos and PDFs are private. They open only through short-lived links that expire.',
      ],
    },
    {
      heading: 'Children',
      paragraphs: [
        'TestReady is for parents and guardians. Children don’t have accounts and don’t use the app; they complete worksheets on paper.',
      ],
    },
    {
      heading: 'Where we operate',
      paragraphs: [
        'TestReady is currently built for families in the United States. If you’re elsewhere, some protections may differ, and we aren’t yet set up for the data rules that apply in the EU or UK.',
      ],
    },
  ],
}

export const TERMS: LegalDoc = {
  title: 'Terms of use',
  intro:
    'These are the ground rules for using TestReady, written in plain language. By creating an account you agree to them.',
  draft: true,
  sections: [
    {
      heading: 'Using TestReady',
      bullets: [
        'You must be an adult creating an account for your own child or a child in your care.',
        'You’re responsible for your account and for keeping your password private.',
      ],
    },
    {
      heading: 'What TestReady is, and isn’t',
      bullets: [
        'TestReady is practice support, not an official assessment. It doesn’t diagnose learning difficulties.',
        'It doesn’t predict i-Ready or any other test score, and it doesn’t change one.',
        'AI can make mistakes. Please check the answers we flag, and tell us if an answer key looks wrong.',
        'Your child’s teacher has the full picture.',
      ],
    },
    {
      heading: 'No affiliation',
      paragraphs: [
        NON_AFFILIATION,
        'i-Ready is a trademark of its owner. We use the name only to describe the reports we help you read.',
      ],
    },
    {
      heading: 'Your content',
      bullets: [
        'You confirm you have the right to upload the reports and photos you add, and that they are your own child’s.',
        'You keep ownership of what you upload. You let us process it to provide the service, as described in the privacy policy.',
        'Please cover or crop names before you upload.',
      ],
    },
    {
      heading: 'Our content',
      paragraphs: [
        'Worksheets and answer keys are for your family’s personal, non-commercial use. Please don’t resell them or post them publicly.',
      ],
    },
    {
      heading: 'Acceptable use',
      bullets: [
        'No unlawful use, and no uploading other people’s children’s work.',
        'No attempts to break, overload or scrape the service.',
      ],
    },
    {
      heading: 'Plans and payments',
      paragraphs: [
        'The free diagnostic includes one worksheet. Paid plans aren’t available yet. If they launch, prices and terms will be shown clearly before you pay.',
      ],
    },
    {
      heading: 'Availability and changes',
      paragraphs: [
        'We work to keep TestReady running, but it’s provided as it is and may change or be unavailable at times. There are daily limits on worksheets to keep the service fair.',
      ],
    },
    {
      heading: 'Ending your use',
      paragraphs: [
        'You can delete a child’s profile at any time, and ask us to delete your account. We may suspend accounts that misuse the service.',
      ],
    },
  ],
}

export const TRUST: LegalDoc = {
  title: 'How we check our work',
  intro:
    'TestReady uses AI, and AI can be wrong. This page explains the checks that sit around it, and what you can do if something looks off.',
  draft: false,
  sections: [
    {
      heading: 'Answers are checked twice',
      paragraphs: [
        'Before you see a worksheet, every answer is checked by the AI tool that wrote the problem and then again by our own calculation. If either check fails, the question is rewritten or left out. A worksheet that can’t be fully checked isn’t shown.',
      ],
    },
    {
      heading: 'You confirm what we read',
      bullets: [
        'You check the values we read from a report before we use them.',
        'When we’re unsure what your child wrote, the answer comes to you with a picture of the handwriting. Nothing we’re unsure about counts until you confirm it.',
        'If an answer key looks wrong, tell us on the worksheet page. We leave that question out of your child’s results.',
      ],
    },
    {
      heading: 'Levels change by fixed rules',
      bullets: [
        'A skill moves at most one level at a time, and only after enough evidence. One question is never enough.',
        'The reading level changes only when the evidence points to reading, never because of a maths mistake, and not for sheets you read aloud.',
        'The AI helps put the result into words. It doesn’t decide any level.',
      ],
    },
    {
      heading: 'Fresh questions',
      paragraphs: ['Questions, number sets and scenarios aren’t repeated within a child’s last four worksheets.'],
    },
    {
      heading: 'What we’ll publish',
      paragraphs: [
        'After our testing with families, we plan to publish how often our reading of handwriting matches yours and how often answer keys pass their checks. We haven’t published numbers yet.',
      ],
    },
    {
      heading: 'Limits',
      paragraphs: [
        'Practice support, not an official assessment. Worksheet results don’t change an i-Ready score. Ask your child’s teacher for the full picture.',
      ],
    },
  ],
}
