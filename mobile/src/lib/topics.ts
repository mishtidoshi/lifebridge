// The topics LifeBridge covers. Each one is a pathway pack on the server (packs/<id>.json);
// this file only adds what the app shows around it: a photo, an icon, and short tips.
// To add a topic: add its pack file, then add an entry here.

import {
  BriefcaseBusiness,
  CalendarClock,
  FileText,
  Flame,
  GraduationCap,
  HeartPulse,
  House,
  MailOpen,
  MapPin,
  Phone,
  ShieldAlert,
  ShieldCheck,
  Sprout,
  Umbrella,
  type LucideIcon,
} from 'lucide-react-native';
import type { ImageSourcePropType } from 'react-native';

import type { Tip } from '@/components/TipList';

export interface Topic {
  id: string; // the pack id
  short: string; // a few words, for buttons and headers
  image: ImageSourcePropType;
  alt: string;
  icon: LucideIcon;
  placeholder: string; // example text in the "What's happening?" box
  tips: Tip[];
}

export const TOPICS: Topic[] = [
  {
    id: 'financial_aid',
    short: 'College financial aid',
    image: require('../../assets/images/topic-financial-aid.jpg'),
    alt: 'Two college graduates in caps and gowns hugging on graduation day',
    icon: GraduationCap,
    placeholder: "I'm a senior in Texas, my parents are self-employed, and I'm applying to state universities…",
    tips: [
      {
        icon: Sprout,
        question: 'Undocumented or have DACA?',
        answer:
          "Some states, like California, Texas, Washington, and New York, have their own aid application for students who can't file the FAFSA. Tell LifeBridge your state and it shows yours if there is one.",
      },
      {
        icon: MapPin,
        question: 'Does my state matter?',
        answer:
          'Yes. Every student can apply for federal aid with the FAFSA, but each state has its own grants and deadlines. Some are as early as January, and some give money out until it runs out, so applying early helps.',
      },
      {
        icon: BriefcaseBusiness,
        question: 'Are your parents self-employed?',
        answer: "You'll need their business records too. LifeBridge adds them to your checklist.",
      },
      {
        icon: FileText,
        question: 'Do I gather documents for every form?',
        answer: 'No. One checklist covers every form, so you collect things like tax returns just once.',
      },
    ],
  },
  {
    id: 'medicaid',
    short: 'Medicaid',
    image: require('../../assets/images/topic-medicaid.jpg'),
    alt: 'A pharmacist helping a woman choose a medicine',
    icon: HeartPulse,
    placeholder: 'I got a letter saying I need to renew my Medicaid, and I just started a new job…',
    tips: [
      {
        icon: MailOpen,
        question: 'Why does my address matter so much?',
        answer:
          "Renewal forms and other important letters come by mail, text, or email. If they go to an old address, you can lose coverage without knowing. Keep your contact information up to date.",
      },
      {
        icon: CalendarClock,
        question: 'Do the new work rules apply to me?',
        answer:
          'Starting in 2027, many adults ages 19 to 64 who got Medicaid through the Affordable Care Act expansion need 80 hours a month of work, school, training, or volunteering. Many people are exempt, like pregnant people and parents of children 13 or younger. Your Medicaid office will send a letter if the rules apply to you.',
      },
      {
        icon: ShieldCheck,
        question: 'My coverage already ended. Is it too late?',
        answer:
          "Often not. Call your state Medicaid office right away and ask how to get it back. Tell LifeBridge your state and your plan shows your state's steps, like how long you have to turn in missing information.",
      },
    ],
  },
  {
    id: 'disaster',
    short: 'Natural disasters',
    image: require('../../assets/images/topic-disaster-flood.jpg'),
    alt: 'A coastal neighborhood street flooded with water',
    icon: Flame,
    placeholder: "Our apartment flooded in the storm. We have renters insurance, and my mom can't get to work…",
    tips: [
      {
        icon: Phone,
        question: 'In danger right now?',
        answer: 'Call 911. If officials tell you to evacuate, leave right away. LifeBridge is for planning, not emergencies.',
      },
      {
        icon: ShieldAlert,
        question: 'Does FEMA charge to help?',
        answer:
          "No. FEMA never charges for help, inspections, or applications. If someone asks you to pay, it's a scam. Call FEMA at 1-800-621-3362 to check.",
      },
      {
        icon: Umbrella,
        question: 'Insurance or FEMA first?',
        answer: 'If you have insurance, file your claim first. FEMA can help with losses insurance doesn\'t cover.',
      },
      {
        icon: House,
        question: 'Does homeowners insurance cover floods and earthquakes?',
        answer:
          'Usually not. Flood and earthquake insurance are separate policies, and flood insurance usually takes up to 30 days to start.',
      },
    ],
  },
];

export const TOPIC_IDS = TOPICS.map((t) => t.id);

export function topicFor(id: string | undefined): Topic | undefined {
  return TOPICS.find((t) => t.id === id);
}
